import { NextRequest, NextResponse } from 'next/server';
import { getValidApiKey, markApiKeyAsInvalid, uploadFileToSupabase, incrementApiKeyUsage } from '@/utils/supabase-utils';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
  duration: number;
  text: string;
}

// Function to split text into chunks under 1000 characters while preserving word boundaries
function splitTextIntoChunks(text: string, maxLength: number = 950): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = '';
  const words = text.split(' ');

  for (const word of words) {
    // Check if adding this word would exceed the limit
    const testChunk = currentChunk ? `${currentChunk} ${word}` : word;
    
    if (testChunk.length <= maxLength) {
      currentChunk = testChunk;
    } else {
      // If current chunk is not empty, save it and start a new one
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = word;
      } else {
        // If a single word is longer than maxLength, we have to include it anyway
        chunks.push(word);
        currentChunk = '';
      }
    }
  }

  // Add the last chunk if it's not empty
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  return chunks;
}

export async function POST(request: NextRequest) {
  try {
    const { narrationChunks, speaker_id = 3, userId = 'unknown_user' } = await request.json();

    if (!narrationChunks || !Array.isArray(narrationChunks) || narrationChunks.length === 0) {
      return NextResponse.json(
        { error: 'Narration chunks are required for segmented audio generation' },
        { status: 400 }
      );
    }

    console.log(`🎵 Starting SEGMENTED WellSaid Labs audio generation for ${narrationChunks.length} segments`);
    console.log(`📋 Process: Generate → Extract Duration (ffprobe) → Concatenate`);

    // Get a valid API key from the database
    const apiKey = await getValidApiKey();
    console.log(`🔑 Using WellSaid Labs API key: ${apiKey}`);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'No valid WellSaid Labs API keys available. Please upload API keys first.' },
        { status: 400 }
      );
    }

    const tempDir = '/tmp';
    const audioSegments: AudioSegment[] = [];
    const tempAudioFiles: string[] = [];

    // Step 1: Generate audio for each segment
    console.log(`🔊 Step 1: Generating audio for ${narrationChunks.length} segments`);
    
    for (let i = 0; i < narrationChunks.length; i++) {
      const chunk = narrationChunks[i];
      console.log(`🎤 [Segment ${i + 1}/${narrationChunks.length}] Processing: "${chunk.narration.substring(0, 50)}..." (${chunk.narration.length} chars)`);

      // Split the narration text into chunks if it's too long
      const textChunks = splitTextIntoChunks(chunk.narration);
      console.log(`📝 [Segment ${i + 1}] Split into ${textChunks.length} text chunks`);

      const segmentAudioFiles: string[] = [];

      try {
        // Generate audio for each text chunk of this segment
        for (let j = 0; j < textChunks.length; j++) {
          const textChunk = textChunks[j];
          console.log(`🎵 [Segment ${i + 1}, Chunk ${j + 1}/${textChunks.length}] Generating audio for: "${textChunk.substring(0, 30)}..." (${textChunk.length} chars)`);

          // Call WellSaid Labs API for this text chunk
          const wellSaidResponse = await fetch('https://api.wellsaidlabs.com/v1/tts/stream', {
            method: 'POST',
            headers: {
              'accept': '*/*',
              'content-type': 'application/json',
              'X-Api-Key': apiKey
            },
            body: JSON.stringify({
              text: textChunk,
              speaker_id: speaker_id
            })
          });

          if (!wellSaidResponse.ok) {
            const errorText = await wellSaidResponse.text();
            console.error(`WellSaid Labs API error for segment ${i + 1}, chunk ${j + 1}: ${wellSaidResponse.status} ${wellSaidResponse.statusText}`);
            
            // If API key is invalid, mark it as invalid
            if (wellSaidResponse.status === 401 || wellSaidResponse.status === 403) {
              console.log(`🚫 Marking API key as invalid due to ${wellSaidResponse.status} error`);
              await markApiKeyAsInvalid(apiKey);
              
              return NextResponse.json(
                { error: 'API key is invalid. Please upload new API keys.' },
                { status: 401 }
              );
            }
            
            throw new Error(`WellSaid Labs API error: ${wellSaidResponse.statusText}`);
          }

          // Save audio chunk to temporary file
          const audioBuffer = await wellSaidResponse.arrayBuffer();
          const audioData = new Uint8Array(audioBuffer);
          
          const chunkFileName = `wellsaid-seg${i + 1}-chunk${j + 1}-${Date.now()}.mp3`;
          const chunkFilePath = path.join(tempDir, chunkFileName);
          
          await fs.writeFile(chunkFilePath, audioData);
          segmentAudioFiles.push(chunkFilePath);
          
          console.log(`✅ [Segment ${i + 1}, Chunk ${j + 1}] Audio generated and saved: ${chunkFilePath}`);
        }

        // If this segment has multiple text chunks, concatenate them
        let finalSegmentFilePath: string;
        
        if (textChunks.length === 1) {
          // Single chunk, use it directly
          finalSegmentFilePath = segmentAudioFiles[0];
          console.log(`📤 [Segment ${i + 1}] Single chunk, using directly`);
        } else {
          // Multiple chunks, concatenate them
          console.log(`🔗 [Segment ${i + 1}] Concatenating ${textChunks.length} text chunks`);
          
          const segmentFileName = `wellsaid-segment-${i + 1}-${Date.now()}.mp3`;
          finalSegmentFilePath = path.join(tempDir, segmentFileName);
          
          // Create ffmpeg concat file for this segment
          const segmentConcatFileName = `concat-seg${i + 1}-${Date.now()}.txt`;
          const segmentConcatFilePath = path.join(tempDir, segmentConcatFileName);
          
          const segmentConcatContent = segmentAudioFiles.map(file => `file '${file}'`).join('\n');
          await fs.writeFile(segmentConcatFilePath, segmentConcatContent);
          
          // Run ffmpeg concatenation for this segment
          const segmentFfmpegCommand = `ffmpeg -f concat -safe 0 -i "${segmentConcatFilePath}" -c copy "${finalSegmentFilePath}"`;
          console.log(`🎬 [Segment ${i + 1}] Running ffmpeg: ${segmentFfmpegCommand}`);
          
          await execAsync(segmentFfmpegCommand);
          
          // Clean up chunk files and concat file for this segment
          for (const chunkFile of segmentAudioFiles) {
            await fs.unlink(chunkFile);
          }
          await fs.unlink(segmentConcatFilePath);
          
          console.log(`✅ [Segment ${i + 1}] Text chunks concatenated successfully`);
        }

        // Add the final segment file to the list
        tempAudioFiles.push(finalSegmentFilePath);
        
        console.log(`✅ [Segment ${i + 1}] Complete segment audio ready: ${finalSegmentFilePath}`);

      } catch (error: any) {
        console.error(`❌ [Segment ${i + 1}] Error generating audio:`, error);
        
        // Clean up any temporary files created so far
        for (const tempFile of [...tempAudioFiles, ...segmentAudioFiles]) {
          try {
            await fs.unlink(tempFile);
          } catch (cleanupError) {
            console.warn(`Warning: Failed to clean up temp file ${tempFile}`, cleanupError);
          }
        }
        
        return NextResponse.json(
          { error: `Failed to generate audio for segment ${i + 1}: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // Step 2: Extract duration for each segment using ffprobe
    console.log(`⏱️ Step 2: Extracting durations using ffprobe`);
    
    for (let i = 0; i < tempAudioFiles.length; i++) {
      const filePath = tempAudioFiles[i];
      const chunk = narrationChunks[i];
      
      try {
        console.log(`📏 [Segment ${i + 1}] Getting duration for: ${filePath}`);
        
        const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`);
        const duration = parseFloat(stdout.trim());
        
        if (isNaN(duration) || duration <= 0) {
          throw new Error(`Invalid duration detected: ${stdout.trim()}`);
        }
        
        console.log(`✅ [Segment ${i + 1}] Duration: ${duration.toFixed(2)}s`);
        
        // Upload segment to Supabase
        const supabaseDestination = `audio/wellsaid/segments/${Date.now()}-segment-${i + 1}.mp3`;
        const publicUrl = await uploadFileToSupabase(
          filePath,
          supabaseDestination,
          'audio/mpeg'
        );
        
        if (!publicUrl) {
          throw new Error(`Failed to upload segment ${i + 1} to storage`);
        }
        
        audioSegments.push({
          segmentIndex: i,
          audioUrl: publicUrl,
          duration: duration,
          text: chunk.narration
        });
        
        console.log(`☁️ [Segment ${i + 1}] Uploaded to Supabase: ${publicUrl}`);
        
      } catch (error: any) {
        console.error(`❌ [Segment ${i + 1}] Error processing segment:`, error);
        
        // Clean up temporary files
        for (const tempFile of tempAudioFiles) {
          try {
            await fs.unlink(tempFile);
          } catch (cleanupError) {
            console.warn(`Warning: Failed to clean up temp file ${tempFile}`, cleanupError);
          }
        }
        
        return NextResponse.json(
          { error: `Failed to process segment ${i + 1}: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // Step 3: Concatenate all segments into final audio
    console.log(`🔗 Step 3: Concatenating ${audioSegments.length} segments into final audio`);
    
    try {
      const finalFileName = `wellsaid-final-${Date.now()}.mp3`;
      const finalFilePath = path.join(tempDir, finalFileName);
      
      // Create ffmpeg concat file
      const concatFileName = `concat-${Date.now()}.txt`;
      const concatFilePath = path.join(tempDir, concatFileName);
      
      const concatContent = tempAudioFiles.map(file => `file '${file}'`).join('\n');
      await fs.writeFile(concatFilePath, concatContent);
      
      console.log(`📝 Created concat file: ${concatFilePath}`);
      
      // Run ffmpeg concatenation
      const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${concatFilePath}" -c copy "${finalFilePath}"`;
      console.log(`🎬 Running ffmpeg: ${ffmpegCommand}`);
      
      await execAsync(ffmpegCommand);
      
      console.log(`✅ Final audio concatenated: ${finalFilePath}`);
      
      // Upload final audio to Supabase
      const finalSupabaseDestination = `audio/wellsaid/final/${Date.now()}-${finalFileName}`;
      const finalPublicUrl = await uploadFileToSupabase(
        finalFilePath,
        finalSupabaseDestination,
        'audio/mpeg'
      );
      
      if (!finalPublicUrl) {
        throw new Error('Failed to upload final audio to storage');
      }
      
      console.log(`☁️ Final audio uploaded to Supabase: ${finalPublicUrl}`);
      
      // Increment API key usage after successful generation
      const usageResult = await incrementApiKeyUsage(apiKey);
      if (usageResult.success) {
        if (usageResult.markedInvalid) {
          console.log(`🚫 API key reached usage limit (${usageResult.newCount} uses) and was marked invalid`);
        } else {
          console.log(`📊 API key usage updated: ${usageResult.newCount}/50 uses`);
        }
      } else {
        console.warn(`⚠️ Failed to update API key usage count, but audio generation was successful`);
      }
      
      // Calculate total duration
      const totalDuration = audioSegments.reduce((sum, segment) => sum + segment.duration, 0);
      
      // Generate subtitles for the final audio (optional)
      let subtitlesUrl = '';
      try {
        console.log(`📝 Generating subtitles for final audio`);
        const subtitlesResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/generate-subtitles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audioUrl: finalPublicUrl,
            userId: userId
          })
        });
        
        if (subtitlesResponse.ok) {
          const subtitlesData = await subtitlesResponse.json();
          if (subtitlesData.subtitlesUrl) {
            subtitlesUrl = subtitlesData.subtitlesUrl;
            console.log(`✅ Subtitles generated: ${subtitlesUrl}`);
          }
        } else {
          console.warn(`⚠️ Subtitles generation failed, continuing without subtitles`);
        }
      } catch (subtitlesError) {
        console.warn(`⚠️ Subtitles generation error:`, subtitlesError);
      }
      
      // Clean up temporary files
      const allTempFiles = [...tempAudioFiles, concatFilePath, finalFilePath];
      for (const tempFile of allTempFiles) {
        try {
          await fs.unlink(tempFile);
          console.log(`🧹 Cleaned up: ${tempFile}`);
        } catch (cleanupError) {
          console.warn(`Warning: Failed to clean up temp file ${tempFile}`, cleanupError);
        }
      }
      
      console.log(`🎉 SEGMENTED AUDIO GENERATION COMPLETED SUCCESSFULLY!`);
      console.log(`📊 Results: ${audioSegments.length} segments, ${totalDuration.toFixed(2)}s total duration`);
      
      return NextResponse.json({
        success: true,
        finalAudioUrl: finalPublicUrl,
        subtitlesUrl: subtitlesUrl,
        audioSegments: audioSegments,
        totalDuration: totalDuration,
        message: `Successfully generated segmented audio with ${audioSegments.length} segments`
      });
      
    } catch (error: any) {
      console.error(`❌ Error during concatenation:`, error);
      
      // Clean up temporary files
      for (const tempFile of tempAudioFiles) {
        try {
          await fs.unlink(tempFile);
        } catch (cleanupError) {
          console.warn(`Warning: Failed to clean up temp file ${tempFile}`, cleanupError);
        }
      }
      
      return NextResponse.json(
        { error: `Failed to concatenate audio segments: ${error.message}` },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error in segmented WellSaid Labs audio generation:', error);
    return NextResponse.json(
      { error: 'Internal server error during segmented audio generation' },
      { status: 500 }
    );
  }
}