import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToSupabase } from '@/utils/supabase-utils';

// Interface for narration chunks
interface NarrationChunk {
  imageUrl: string;
  imageIndex: number;
  narration: string;
  startY: number;
  endY: number;
  height: number;
}

// Interface for audio segment result
interface AudioSegment {
  segmentIndex: number;
  audioUrl: string;
  duration: number; // in seconds
  text: string;
}

// Interface for the request body
interface GenerateSegmentedAudioRequest {
  narrationChunks: NarrationChunk[];
  provider: string;
  voice: string;
  userId: string;
  // Provider-specific options
  model?: string;
  fishAudioVoiceId?: string;
  fishAudioModel?: string;
  elevenLabsVoiceId?: string;
  elevenLabsModelId?: string;
  languageCode?: string;
}

export async function POST(request: NextRequest) {
  try {
    const {
      narrationChunks,
      provider,
      voice,
      userId,
      model,
      fishAudioVoiceId,
      fishAudioModel,
      elevenLabsVoiceId,
      elevenLabsModelId,
      languageCode
    }: GenerateSegmentedAudioRequest = await request.json();

    if (!narrationChunks || !Array.isArray(narrationChunks) || narrationChunks.length === 0) {
      return NextResponse.json({ 
        error: 'Narration chunks array is required' 
      }, { status: 400 });
    }

    if (!provider || !userId) {
      return NextResponse.json({ 
        error: 'Provider and userId are required' 
      }, { status: 400 });
    }

    console.log(`🎵 Starting segmented audio generation for ${narrationChunks.length} segments`);
    console.log(`📋 NEW Workflow: Generate Chunks → Extract Durations (ffprobe) → Join Audio → Create ONE Transcription`);

    const audioSegments: AudioSegment[] = [];
    const errors: any[] = [];

    // Step 1: Generate audio for each segment
    console.log(`\n🎤 STEP 1: Generating audio chunks for ${narrationChunks.length} segments...`);
    for (let i = 0; i < narrationChunks.length; i++) {
      const chunk = narrationChunks[i];
      console.log(`\n🔄 Processing segment ${i + 1}/${narrationChunks.length}:`);
      console.log(`   📝 Text: "${chunk.narration.substring(0, 50)}..."`);
      console.log(`   🖼️ Image: ${chunk.imageUrl.split('/').pop()}`);

      try {
        // Prepare request body for individual audio generation
        const audioRequestBody: any = {
          text: chunk.narration,
          provider,
          voice,
          userId,
          skipSubtitles: true // Disable subtitle generation for individual chunks
        };

        // Add provider-specific fields
        if (provider === 'minimax') {
          audioRequestBody.model = model;
        } else if (provider === 'fish-audio') {
          audioRequestBody.fishAudioVoiceId = fishAudioVoiceId;
          audioRequestBody.fishAudioModel = fishAudioModel;
        } else if (provider === 'elevenlabs') {
          audioRequestBody.elevenLabsVoiceId = elevenLabsVoiceId;
          audioRequestBody.elevenLabsModelId = elevenLabsModelId;
          if (elevenLabsModelId === "eleven_flash_v2_5") {
            audioRequestBody.languageCode = languageCode;
          }
        }

        console.log(`   🎤 Generating audio using ${provider}...`);

        // Call the existing audio generation API
        const baseUrl = "http://localhost:3000"
          
        console.log(`   🔗 Making request to: ${baseUrl}/api/generate-audio`);
        
        const audioResponse = await fetch(`${baseUrl}/api/generate-audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(audioRequestBody),
        });

        if (!audioResponse.ok) {
          const errorText = await audioResponse.text();
          console.error(`   ❌ Audio API error (${audioResponse.status}):`, errorText);
          throw new Error(`Failed to generate audio for segment: ${audioResponse.status} ${audioResponse.statusText}. Response: ${errorText.substring(0, 200)}`);
        }

        let audioData;
        try {
          audioData = await audioResponse.json();
        } catch (jsonError: any) {
          console.error(`   ❌ Failed to parse JSON response:`, jsonError.message);
          throw new Error(`Invalid JSON response from audio API: ${jsonError.message}`);
        }

        if (!audioData.audioUrl) {
          throw new Error('No audio URL returned from generation');
        }

        console.log(`   ✅ Audio generated: ${audioData.audioUrl.split('/').pop()}`);

        // Step 2: Get audio duration using ffprobe
        console.log(`   📏 Extracting duration using ffprobe...`);
        const duration = await getAudioDuration(audioData.audioUrl);
        console.log(`   ⏱️ Duration extracted: ${duration.toFixed(2)}s`);

        audioSegments.push({
          segmentIndex: i,
          audioUrl: audioData.audioUrl,
          duration: duration,
          text: chunk.narration
        });

        console.log(`   ✅ Segment ${i + 1} completed successfully (${duration.toFixed(2)}s)`);

        // Add delay between requests to avoid rate limiting
        if (i < narrationChunks.length - 1) {
          console.log(`   ⏳ Waiting 1s before next segment...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error: any) {
        console.error(`   ❌ Error processing segment ${i + 1}:`, error.message);
        errors.push({
          segmentIndex: i,
          text: chunk.narration.substring(0, 100) + '...',
          error: error.message
        });
      }
    }

    if (audioSegments.length === 0) {
      return NextResponse.json({
        error: 'Failed to generate any audio segments',
        details: errors
      }, { status: 500 });
    }

    // Step 3: Join all audio chunks into one final audio file
    console.log(`\n🔗 STEP 2: Joining ${audioSegments.length} audio chunks into final audio...`);
    const finalAudioUrl = await concatenateAudioFilesWithFFmpeg(audioSegments, userId);
    console.log(`✅ Final audio created: ${finalAudioUrl}`);

    // Step 4: Create ONE transcription for the final joined audio (not per segment)
    console.log(`\n📝 STEP 3: Creating transcription for final joined audio...`);
    const transcriptionUrl = await generateTranscriptionForFinalAudio(finalAudioUrl, userId);
    console.log(`✅ Transcription created: ${transcriptionUrl}`);

    // Calculate total duration
    const totalDuration = audioSegments.reduce((sum, segment) => sum + segment.duration, 0);

    console.log(`\n🎉 SUCCESS: Segmented audio generation completed!`);
    console.log(`📊 Summary:`);
    console.log(`   - Segments processed: ${audioSegments.length}/${narrationChunks.length}`);
    console.log(`   - Total duration: ${totalDuration.toFixed(2)}s`);
    console.log(`   - Final audio: ${finalAudioUrl.split('/').pop()}`);
    console.log(`   - Transcription: ${transcriptionUrl.split('/').pop()}`);
    console.log(`   - Individual durations preserved for video timing`);

    return NextResponse.json({
      success: true,
      finalAudioUrl: finalAudioUrl,
      subtitlesUrl: transcriptionUrl, // This is now the transcription of the final audio
      audioSegments: audioSegments.map(segment => ({
        segmentIndex: segment.segmentIndex,
        audioUrl: segment.audioUrl,
        duration: segment.duration, // These durations will be used for video timing
        text: segment.text
      })),
      totalDuration: totalDuration,
      totalSegments: audioSegments.length,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully generated final audio from ${audioSegments.length} segments with unified transcription`
    });

  } catch (error: any) {
    console.error('Error in segmented audio generation:', error);
    return NextResponse.json({ 
      error: 'Failed to generate segmented audio',
      details: error.message 
    }, { status: 500 });
  }
}

// Helper function to get audio duration using ffprobe
async function getAudioDuration(audioUrl: string): Promise<number> {
  try {
    const { spawn } = require('child_process');
    
    const duration = await new Promise<number>((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        audioUrl
      ]);

      let output = '';
      ffprobe.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      ffprobe.on('close', (code: number) => {
        if (code === 0 && output.trim()) {
          const duration = parseFloat(output.trim());
          if (!isNaN(duration) && duration > 0) {
            resolve(duration);
          } else {
            reject(new Error('Invalid duration from ffprobe'));
          }
        } else {
          reject(new Error(`ffprobe failed with code ${code}`));
        }
      });

      ffprobe.on('error', reject);
    });

    return duration;
  } catch (error) {
    console.warn('ffprobe failed, using fallback duration:', error);
    return 8; // Fallback duration
  }
}

// Helper function to concatenate audio files using FFmpeg (proper audio joining)
async function concatenateAudioFilesWithFFmpeg(audioSegments: AudioSegment[], userId: string): Promise<string> {
  try {
    const path = require('path');
    const fs = require('fs').promises;
    const { spawn } = require('child_process');

    console.log(`🔗 Concatenating ${audioSegments.length} audio files using FFmpeg...`);

    // Create temporary directory
    const tempDir = path.join(process.cwd(), 'temp', `audio_concat_${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Download all audio files
    const localAudioFiles: string[] = [];
    for (let i = 0; i < audioSegments.length; i++) {
      const segment = audioSegments[i];
      const localPath = path.join(tempDir, `segment_${i.toString().padStart(3, '0')}.mp3`);
      
      console.log(`   📥 Downloading segment ${i + 1}: ${segment.audioUrl.split('/').pop()}`);
      
      const response = await fetch(segment.audioUrl);
      if (!response.ok) {
        throw new Error(`Failed to download segment ${i + 1}: ${response.statusText}`);
      }
      
      const audioBuffer = await response.arrayBuffer();
      await fs.writeFile(localPath, Buffer.from(audioBuffer));
      localAudioFiles.push(localPath);
    }

    // Create FFmpeg concat file
    const concatFilePath = path.join(tempDir, 'concat_list.txt');
    const concatContent = localAudioFiles.map(file => `file '${file}'`).join('\n');
    await fs.writeFile(concatFilePath, concatContent);

    // Run FFmpeg concatenation
    const outputPath = path.join(tempDir, 'final_audio.mp3');
    
    console.log(`🎵 Running FFmpeg concatenation...`);
    
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatFilePath,
        '-c', 'copy',
        '-y',
        outputPath
      ]);

      ffmpeg.stderr.on('data', (data: Buffer) => {
        // Log FFmpeg progress if needed
        const output = data.toString();
        if (output.includes('time=')) {
          const timeMatch = output.match(/time=(\d{2}:\d{2}:\d{2}\.\d{2})/);
          if (timeMatch) {
            console.log(`   🎵 FFmpeg progress: ${timeMatch[1]}`);
          }
        }
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          console.log(`✅ FFmpeg concatenation completed successfully`);
          resolve();
        } else {
          reject(new Error(`FFmpeg failed with code ${code}`));
        }
      });

      ffmpeg.on('error', reject);
    });

    // Read the final audio file
    const finalAudioBuffer = await fs.readFile(outputPath);

    // Upload to Supabase
    const timestamp = Date.now();
    const fileName = `final_audio_${timestamp}.mp3`;
    const destinationPath = `${userId}/final_audio/${fileName}`;

    const publicUrl = await uploadFileToSupabase(
      finalAudioBuffer,
      destinationPath,
      'audio/mpeg'
    );

    if (!publicUrl) {
      throw new Error('Failed to upload final audio to Supabase');
    }

    // Clean up temporary files
    await fs.rm(tempDir, { recursive: true, force: true });

    console.log(`✅ Final audio uploaded: ${publicUrl}`);
    return publicUrl;

  } catch (error) {
    console.error('Error concatenating audio files:', error);
    throw error;
  }
}

// Helper function to generate transcription for the final joined audio
async function generateTranscriptionForFinalAudio(audioUrl: string, userId: string): Promise<string> {
  try {
    console.log(`📝 Generating transcription for final audio: ${audioUrl.split('/').pop()}`);

    // Use Shotstack API for transcription
    const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || 'YOLjjcSvBxo4mesgvuYqcJOp4SR6iBT6dtK9cteS';
    const SHOTSTACK_BASE_URL = 'https://api.shotstack.io/ingest/stage';

    // Step 1: Submit transcription request
    console.log(`   📤 Submitting transcription request to Shotstack...`);
    const response = await fetch(`${SHOTSTACK_BASE_URL}/sources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SHOTSTACK_API_KEY
      },
      body: JSON.stringify({
        url: audioUrl,
        outputs: {
          transcription: {
            format: "srt"
          }
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Transcription request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const jobId = data.data?.id;

    if (!jobId) {
      throw new Error('No job ID returned from transcription request');
    }

    console.log(`   🆔 Transcription job ID: ${jobId}`);

    // Step 2: Poll for completion
    console.log(`   ⏳ Waiting for transcription to complete...`);
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max
    let transcriptionUrl = null;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;

      const statusResponse = await fetch(`${SHOTSTACK_BASE_URL}/sources/${jobId}`, {
        method: "GET",
        headers: {
          "x-api-key": SHOTSTACK_API_KEY
        }
      });

      if (!statusResponse.ok) {
        console.warn(`   ⚠️ Status check failed (attempt ${attempts}): ${statusResponse.status}`);
        continue;
      }

      const statusData = await statusResponse.json();
      const status = statusData.data?.attributes?.status;
      const transcriptionStatus = statusData.data?.attributes?.outputs?.transcription?.status;

      console.log(`   📊 Status check ${attempts}: ${status} / transcription: ${transcriptionStatus}`);

      if (status === 'ready' && transcriptionStatus === 'ready') {
        transcriptionUrl = statusData.data.attributes.outputs.transcription.url;
        console.log(`   ✅ Transcription completed!`);
        break;
      } else if (status === 'failed' || transcriptionStatus === 'failed') {
        throw new Error('Transcription job failed');
      }
    }

    if (!transcriptionUrl) {
      throw new Error(`Transcription not completed after ${maxAttempts} attempts`);
    }

    // Step 3: Download and re-upload SRT content to our storage
    console.log(`   📥 Downloading transcription content...`);
    const srtResponse = await fetch(transcriptionUrl);
    if (!srtResponse.ok) {
      throw new Error(`Failed to download SRT content: ${srtResponse.status}`);
    }

    const srtContent = await srtResponse.text();

    // Upload to our Supabase storage
    const timestamp = Date.now();
    const fileName = `final_transcription_${timestamp}.srt`;
    const destinationPath = `${userId}/transcriptions/${fileName}`;

    const srtBuffer = Buffer.from(srtContent, 'utf-8');
    const publicUrl = await uploadFileToSupabase(
      srtBuffer,
      destinationPath,
      'text/plain'
    );

    if (!publicUrl) {
      throw new Error('Failed to upload transcription to Supabase');
    }

    console.log(`   ✅ Transcription uploaded: ${publicUrl}`);
    return publicUrl;

  } catch (error) {
    console.error('Error generating transcription for final audio:', error);
    throw error;
  }
} 