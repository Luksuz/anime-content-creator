import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToSupabase } from "@/utils/supabase-utils";
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || 'YOLjjcSvBxo4mesgvuYqcJOp4SR6iBT6dtK9cteS';
const SHOTSTACK_BASE_URL = 'https://api.shotstack.io/ingest/stage';

interface AudioChunk {
  chunkIndex: number;
  audioUrl: string;
  text: string;
}

interface ConcatenateAudioChunksRequestBody {
  audioChunks: AudioChunk[];
  userId: string;
  generateSubtitles?: boolean;
}

export async function POST(request: NextRequest) {
  let tempFiles: string[] = [];
  
  try {
    const body: ConcatenateAudioChunksRequestBody = await request.json();
    const { audioChunks, userId, generateSubtitles = false } = body;

    if (!audioChunks || audioChunks.length === 0) {
      return NextResponse.json({ error: 'Audio chunks are required.' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    console.log(`🔗 Starting concatenation of ${audioChunks.length} audio chunks for user: ${userId}`);

    // Sort chunks by index to ensure correct order
    const sortedChunks = audioChunks.sort((a, b) => a.chunkIndex - b.chunkIndex);

    // Create temporary directory
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audio-concat-'));
    const inputListFile = path.join(tempDir, 'input_list.txt');
    const outputFile = path.join(tempDir, 'concatenated_audio.mp3');
    
    tempFiles.push(tempDir, inputListFile, outputFile);

    // Download all audio chunks
    console.log(`📥 Downloading ${sortedChunks.length} audio chunks...`);
    const chunkFiles: string[] = [];
    
    for (let i = 0; i < sortedChunks.length; i++) {
      const chunk = sortedChunks[i];
      const chunkFile = path.join(tempDir, `chunk_${chunk.chunkIndex}.mp3`);
      
      console.log(`   Downloading chunk ${chunk.chunkIndex}: ${chunk.audioUrl}`);
      
      const response = await fetch(chunk.audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to download chunk ${chunk.chunkIndex}: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      await fs.writeFile(chunkFile, new Uint8Array(arrayBuffer));
      chunkFiles.push(chunkFile);
      tempFiles.push(chunkFile);
    }

    // Create input list file for ffmpeg
    const inputListContent = chunkFiles.map(file => `file '${file}'`).join('\n');
    await fs.writeFile(inputListFile, inputListContent);

    // Concatenate audio files using ffmpeg
    console.log(`🔗 Concatenating audio files using ffmpeg...`);
    const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${inputListFile}" -c copy "${outputFile}"`;
    
    try {
      await execAsync(ffmpegCommand);
      console.log(`✅ Audio concatenation completed`);
    } catch (ffmpegError: any) {
      console.error(`❌ FFmpeg error:`, ffmpegError);
      throw new Error(`Audio concatenation failed: ${ffmpegError.message}`);
    }

    // Upload concatenated audio to Supabase
    console.log(`📤 Uploading concatenated audio to Supabase...`);
    const timestamp = Date.now();
    const fileName = `concatenated_audio_${timestamp}.mp3`;
    const destinationPath = `${userId}/final_audio/${fileName}`;

    const audioBuffer = await fs.readFile(outputFile);
    const finalAudioUrl = await uploadFileToSupabase(audioBuffer, destinationPath, 'audio/mpeg');

    if (!finalAudioUrl) {
      throw new Error('Failed to upload concatenated audio to Supabase');
    }

    console.log(`✅ Concatenated audio uploaded: ${finalAudioUrl}`);

    let transcriptionJobId = null;

    // Start Shotstack transcription if requested
    if (generateSubtitles) {
      console.log(`🔤 Starting Shotstack transcription...`);
      
      const ingestResponse = await fetch(`${SHOTSTACK_BASE_URL}/sources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": SHOTSTACK_API_KEY
        },
        body: JSON.stringify({
          url: finalAudioUrl,
          outputs: {
            transcription: {
              format: "srt"
            }
          }
        })
      });

      if (!ingestResponse.ok) {
        const errorData = await ingestResponse.json();
        console.error("❌ Error submitting Shotstack transcription request:", errorData);
        console.warn("⚠️ Continuing without transcription");
      } else {
        const ingestData = await ingestResponse.json();
        transcriptionJobId = ingestData.data?.id;
        console.log(`📝 Shotstack transcription job started: ${transcriptionJobId}`);
      }
    }

    // Calculate total duration and create segment info
    const totalText = sortedChunks.map(chunk => chunk.text).join(' ');
    
    return NextResponse.json({
      success: true,
      finalAudioUrl: finalAudioUrl,
      transcriptionJobId: transcriptionJobId,
      audioSegments: sortedChunks.map(chunk => ({
        segmentIndex: chunk.chunkIndex,
        audioUrl: chunk.audioUrl,
        text: chunk.text,
        duration: 0 // Will be calculated later if needed
      })),
      totalSegments: sortedChunks.length,
      message: `Successfully concatenated ${sortedChunks.length} audio chunks${generateSubtitles ? ' and started transcription' : ''}`
    });

  } catch (error: any) {
    console.error('❌ Error in audio concatenation:', error);
    return NextResponse.json({ 
      error: 'Failed to concatenate audio chunks',
      details: error.message 
    }, { status: 500 });
  } finally {
    // Clean up temporary files
    for (const tempFile of tempFiles) {
      try {
        // Check if file/directory exists before trying to delete it
        try {
          await fs.access(tempFile);
        } catch (accessError) {
          // File doesn't exist, skip cleanup for this file
          console.log(`🧹 Skipping cleanup for non-existent file: ${tempFile}`);
          continue;
        }

        // File exists, now check if it's a directory or file
        const stats = await fs.stat(tempFile);
        if (stats.isDirectory()) {
          await fs.rmdir(tempFile, { recursive: true });
          console.log(`🧹 Cleaned up directory: ${tempFile}`);
        } else {
          await fs.unlink(tempFile);
          console.log(`🧹 Cleaned up file: ${tempFile}`);
        }
      } catch (cleanupError: any) {
        // Only log as warning if it's not a "file not found" error
        if (cleanupError.code === 'ENOENT') {
          console.log(`🧹 File already removed: ${tempFile}`);
        } else {
          console.warn(`⚠️ Failed to clean up ${tempFile}:`, cleanupError.message);
        }
      }
    }
  }
}

export const dynamic = 'force-dynamic'; 