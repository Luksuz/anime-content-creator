import { NextRequest, NextResponse } from 'next/server';
import { getValidApiKey, markApiKeyAsInvalid, uploadFileToSupabase, incrementApiKeyUsage } from '@/utils/supabase-utils';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
    const { text, speaker_id = 3 } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { error: 'Text is required for audio generation' },
        { status: 400 }
      );
    }

    console.log(`🎵 Generating WellSaid Labs audio for text length: ${text.length} characters`);

    // Split text into manageable chunks
    const textChunks = splitTextIntoChunks(text);
    console.log(`📝 Split text into ${textChunks.length} chunks (max 950 chars each)`);

    // Get a valid API key from the database
    const apiKey = await getValidApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { error: 'No valid WellSaid Labs API keys available. Please upload API keys first.' },
        { status: 400 }
      );
    }

    console.log(`🔑 Using WellSaid Labs API key for generation`);

    const tempDir = '/tmp';
    const tempAudioFiles: string[] = [];

    // Generate audio for each chunk
    for (let i = 0; i < textChunks.length; i++) {
      const chunk = textChunks[i];
      console.log(`🎤 [Chunk ${i + 1}/${textChunks.length}] Generating audio for: "${chunk.substring(0, 50)}..." (${chunk.length} chars)`);

      try {
        // Call WellSaid Labs API for this chunk
        const wellSaidResponse = await fetch('https://api.wellsaidlabs.com/v1/tts/stream', {
          method: 'POST',
          headers: {
            'accept': '*/*',
            'content-type': 'application/json',
            'X-Api-Key': apiKey
          },
          body: JSON.stringify({
            text: chunk,
            speaker_id: speaker_id
          })
        });

        if (!wellSaidResponse.ok) {
          const errorText = await wellSaidResponse.text();
          console.error(`WellSaid Labs API error for chunk ${i + 1}: ${wellSaidResponse.status} ${wellSaidResponse.statusText}`);
          console.error(`Error details: ${errorText}`);
          
          // If API key is invalid (401/403), mark it as invalid
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

        // Get the audio data as buffer
        const audioBuffer = await wellSaidResponse.arrayBuffer();
        const audioData = new Uint8Array(audioBuffer);

        console.log(`✅ [Chunk ${i + 1}] Audio generated successfully, size: ${audioData.length} bytes`);

        // Save chunk to temporary file
        const chunkFileName = `wellsaid-chunk-${i + 1}-${Date.now()}.mp3`;
        const chunkFilePath = path.join(tempDir, chunkFileName);
        
        await fs.writeFile(chunkFilePath, audioData);
        tempAudioFiles.push(chunkFilePath);
        
        console.log(`💾 [Chunk ${i + 1}] Audio saved to: ${chunkFilePath}`);

      } catch (error: any) {
        console.error(`❌ [Chunk ${i + 1}] Error generating audio:`, error);
        
        // Clean up any temporary files created so far
        for (const tempFile of tempAudioFiles) {
          try {
            await fs.unlink(tempFile);
          } catch (cleanupError) {
            console.warn(`Warning: Failed to clean up temp file ${tempFile}`, cleanupError);
          }
        }
        
        return NextResponse.json(
          { error: `Failed to generate audio for chunk ${i + 1}: ${error.message}` },
          { status: 500 }
        );
      }
    }

    // If only one chunk, no need to concatenate
    if (textChunks.length === 1) {
      console.log(`📤 Single chunk - uploading directly to Supabase`);
      
      const supabaseDestination = `audio/wellsaid/${Date.now()}-single.mp3`;
      const publicUrl = await uploadFileToSupabase(
        tempAudioFiles[0],
        supabaseDestination,
        'audio/mpeg'
      );

      // Clean up temporary file
      await fs.unlink(tempAudioFiles[0]);

      if (!publicUrl) {
        return NextResponse.json(
          { error: 'Failed to upload audio to storage' },
          { status: 500 }
        );
      }

      console.log(`☁️ Single chunk audio uploaded to Supabase: ${publicUrl}`);
      
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
      
      return NextResponse.json({
        success: true,
        audioUrl: publicUrl,
        message: 'Audio generated successfully with WellSaid Labs (single chunk)'
      });
    }

    // Concatenate multiple chunks
    console.log(`🔗 Concatenating ${textChunks.length} audio chunks`);
    
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
      const supabaseDestination = `audio/wellsaid/${Date.now()}-concatenated.mp3`;
      const publicUrl = await uploadFileToSupabase(
        finalFilePath,
        supabaseDestination,
        'audio/mpeg'
      );

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

      if (!publicUrl) {
        return NextResponse.json(
          { error: 'Failed to upload audio to storage' },
          { status: 500 }
        );
      }

      console.log(`☁️ Concatenated audio uploaded to Supabase: ${publicUrl}`);
      
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
      
      return NextResponse.json({
        success: true,
        audioUrl: publicUrl,
        message: `Audio generated successfully with WellSaid Labs (${textChunks.length} chunks concatenated)`
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
        { error: `Failed to concatenate audio chunks: ${error.message}` },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error in WellSaid Labs audio generation:', error);
    return NextResponse.json(
      { error: 'Internal server error during audio generation' },
      { status: 500 }
    );
  }
} 