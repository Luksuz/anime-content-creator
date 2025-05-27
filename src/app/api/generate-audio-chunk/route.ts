import { NextRequest, NextResponse } from 'next/server';
import { getValidApiKey, markApiKeyAsInvalid, uploadFileToSupabase, incrementApiKeyUsage } from "@/utils/supabase-utils";
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const WELLSAID_API_URL = 'https://api.wellsaidlabs.com/v1/tts/stream';

interface GenerateAudioChunkRequestBody {
  text: string;
  speaker_id: number;
  model: string;
  chunkIndex: number;
  userId: string;
}

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to check if error is rate limit related
const isRateLimitError = (status: number, errorText: string): boolean => {
  return status === 429 || 
         errorText.toLowerCase().includes('rate limit') ||
         errorText.toLowerCase().includes('too many requests');
};

// Helper function to split text into chunks under specified character limit while preserving word boundaries
function splitTextIntoSubChunks(text: string, maxLength: number = 950): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentChunk = '';
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    const testChunk = currentChunk ? `${currentChunk}. ${trimmedSentence}` : trimmedSentence;
    
    if (testChunk.length <= maxLength) {
      currentChunk = testChunk;
    } else {
      // If current chunk is not empty, save it and start a new one
      if (currentChunk) {
        chunks.push(currentChunk + '.');
        currentChunk = trimmedSentence;
      } else {
        // If a single sentence is longer than maxLength, split by words
        const words = trimmedSentence.split(' ');
        let wordChunk = '';
        
        for (const word of words) {
          const testWordChunk = wordChunk ? `${wordChunk} ${word}` : word;
          
          if (testWordChunk.length <= maxLength) {
            wordChunk = testWordChunk;
          } else {
            if (wordChunk) {
              chunks.push(wordChunk);
              wordChunk = word;
            } else {
              // Single word is too long, we have to include it anyway
              chunks.push(word);
              wordChunk = '';
            }
          }
        }
        
        if (wordChunk) {
          currentChunk = wordChunk;
        }
      }
    }
  }

  // Add the last chunk if it's not empty
  if (currentChunk) {
    chunks.push(currentChunk + (currentChunk.endsWith('.') ? '' : '.'));
  }

  return chunks.length > 0 ? chunks : [text];
}

// Helper function to generate audio for a single sub-chunk
async function generateSubChunkAudio(
  text: string, 
  speaker_id: number, 
  model: string, 
  apiKey: string
): Promise<Buffer> {
  const wellsaidResponse = await fetch(WELLSAID_API_URL, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: text,
      speaker_id: speaker_id,
      model: model
    })
  });

  if (!wellsaidResponse.ok) {
    const errorText = await wellsaidResponse.text();
    throw new Error(`WellSaid API error: ${wellsaidResponse.status} ${wellsaidResponse.statusText} - ${errorText}`);
  }

  const audioBuffer = await wellsaidResponse.arrayBuffer();
  return Buffer.from(audioBuffer);
}

// Helper function to concatenate audio buffers using ffmpeg
async function concatenateAudioBuffers(audioBuffers: Buffer[], chunkIndex: number): Promise<Buffer> {
  if (audioBuffers.length === 1) {
    return audioBuffers[0];
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `audio-chunk-${chunkIndex}-`));
  const tempFiles: string[] = [];
  
  try {
    // Write each audio buffer to a temporary file
    for (let i = 0; i < audioBuffers.length; i++) {
      const tempFile = path.join(tempDir, `subchunk_${i}.mp3`);
      await fs.writeFile(tempFile, new Uint8Array(audioBuffers[i]));
      tempFiles.push(tempFile);
    }

    // Create ffmpeg concat file
    const concatFile = path.join(tempDir, 'concat_list.txt');
    const concatContent = tempFiles.map(file => `file '${file}'`).join('\n');
    await fs.writeFile(concatFile, concatContent);

    // Run ffmpeg concatenation
    const outputFile = path.join(tempDir, 'concatenated.mp3');
    const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${outputFile}"`;
    
    await execAsync(ffmpegCommand);

    // Read the concatenated audio
    const concatenatedBuffer = await fs.readFile(outputFile);
    
    return concatenatedBuffer;
  } finally {
    // Clean up temporary files
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn(`⚠️ Failed to clean up temp directory ${tempDir}:`, cleanupError);
    }
  }
}

// Helper function to get audio duration using ffprobe
async function getAudioDuration(audioUrl: string): Promise<number> {
  try {
    console.log(`📏 Extracting duration for audio chunk: ${audioUrl.split('/').pop()}`);
    
    const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioUrl}"`);
    const duration = parseFloat(stdout.trim());
    
    if (isNaN(duration) || duration <= 0) {
      console.warn(`⚠️ Invalid duration detected (${stdout.trim()}), using fallback`);
      return 3.0; // Fallback duration
    }
    
    console.log(`⏱️ Duration extracted: ${duration.toFixed(2)}s`);
    return duration;
  } catch (error) {
    console.warn('⚠️ ffprobe failed, using fallback duration:', error);
    return 3.0; // Fallback duration
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateAudioChunkRequestBody = await request.json();
    const { text, speaker_id, model, chunkIndex, userId } = body;

    if (!text || !text.trim()) {
      return NextResponse.json({ error: 'Text is required.' }, { status: 400 });
    }
    if (!speaker_id) {
      return NextResponse.json({ error: 'Speaker ID is required.' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    console.log(`🎵 Generating audio chunk ${chunkIndex} for user: ${userId}`);
    console.log(`📝 Text length: ${text.length} characters`);

    // Defensive text splitting - split into sub-chunks if text is too long
    const textSubChunks = splitTextIntoSubChunks(text, 950); // Use 950 to be safe under 1000 limit
    console.log(`📝 Split into ${textSubChunks.length} sub-chunks for chunk ${chunkIndex}`);

    // Retry mechanism: try all available valid API keys
    let attemptCount = 0;
    let rateLimitRetries = 0;
    const maxAttempts = 10; // Safety limit to prevent infinite loops
    const maxRateLimitRetries = 5; // Maximum retries for rate limiting
    
    while (attemptCount < maxAttempts) {
      attemptCount++;
      
      // Get a valid API key from the database
      const apiKey = await getValidApiKey();
      if (!apiKey) {
        console.log(`❌ No valid API keys available after ${attemptCount} attempts`);
        return NextResponse.json(
          { error: 'No valid WellSaid Labs API keys available. Please upload API keys first.' },
          { status: 400 }
        );
      }

      console.log(`🔑 Attempt ${attemptCount}: Using WellSaid Labs API key for chunk ${chunkIndex} generation`);

      try {
        const audioBuffers: Buffer[] = [];

        // Generate audio for each sub-chunk
        for (let i = 0; i < textSubChunks.length; i++) {
          const subChunkText = textSubChunks[i];
          console.log(`🎵 Generating sub-chunk ${i + 1}/${textSubChunks.length} for chunk ${chunkIndex}: "${subChunkText.substring(0, 50)}..." (${subChunkText.length} chars)`);

          try {
            const audioBuffer = await generateSubChunkAudio(subChunkText, speaker_id, model, apiKey);
            audioBuffers.push(audioBuffer);
            console.log(`✅ Sub-chunk ${i + 1}/${textSubChunks.length} generated successfully for chunk ${chunkIndex}`);

            // Add small delay between sub-chunk requests to avoid rate limiting
            if (i < textSubChunks.length - 1) {
              await delay(500); // 500ms delay between sub-chunks
            }
          } catch (subChunkError: any) {
            console.error(`❌ Error generating sub-chunk ${i + 1} for chunk ${chunkIndex}:`, subChunkError.message);
            
            // Check if this is a rate limit error
            if (subChunkError.message.includes('429') || isRateLimitError(429, subChunkError.message)) {
              rateLimitRetries++;
              console.log(`⏱️ Rate limit detected for chunk ${chunkIndex} sub-chunk ${i + 1} (retry ${rateLimitRetries}/${maxRateLimitRetries})`);
              
              if (rateLimitRetries <= maxRateLimitRetries) {
                // Calculate delay: exponential backoff starting at 2 seconds
                const delayMs = Math.min(2000 * Math.pow(2, rateLimitRetries - 1), 30000); // Max 30 seconds
                console.log(`⏳ Waiting ${delayMs}ms before retrying due to rate limit...`);
                
                await delay(delayMs);
                
                // Retry the same sub-chunk
                i--;
                continue;
              } else {
                console.log(`❌ Exceeded maximum rate limit retries (${maxRateLimitRetries}) for chunk ${chunkIndex}`);
                return NextResponse.json(
                  { error: `Rate limit exceeded. Maximum retries (${maxRateLimitRetries}) reached. Please try again later.` },
                  { status: 429 }
                );
              }
            }
            
            // Check if API key is invalid
            if (subChunkError.message.includes('401') || subChunkError.message.includes('403')) {
              console.log(`🚫 Marking API key as invalid due to auth error (attempt ${attemptCount})`);
              const markResult = await markApiKeyAsInvalid(apiKey);
              if (markResult) {
                console.log(`✅ Successfully marked API key as invalid in database`);
              } else {
                console.warn(`⚠️ Failed to mark API key as invalid in database`);
              }
              
              // Reset rate limit retries when switching to a new key
              rateLimitRetries = 0;
              
              // Break out of sub-chunk loop to try next API key
              throw new Error('API key invalid, trying next key');
            }
            
            // For other errors, rethrow
            throw subChunkError;
          }
        }

        // Concatenate all sub-chunk audio buffers
        console.log(`🔗 Concatenating ${audioBuffers.length} sub-chunks for chunk ${chunkIndex}`);
        const finalAudioBuffer = await concatenateAudioBuffers(audioBuffers, chunkIndex);

        // Upload to Supabase
        const timestamp = Date.now();
        const fileName = `audio_chunk_${chunkIndex}_${timestamp}.mp3`;
        const destinationPath = `${userId}/audio_chunks/${fileName}`;

        const audioUrl = await uploadFileToSupabase(finalAudioBuffer, destinationPath, 'audio/mpeg');

        if (!audioUrl) {
          throw new Error('Failed to upload audio chunk to Supabase');
        }

        console.log(`✅ Audio chunk ${chunkIndex} generated and uploaded successfully on attempt ${attemptCount}: ${audioUrl}`);

        // Extract duration using ffprobe
        const duration = await getAudioDuration(audioUrl);

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
          chunkIndex: chunkIndex,
          audioUrl: audioUrl,
          duration: duration,
          text: text,
          subChunksCount: textSubChunks.length,
          message: `Audio chunk ${chunkIndex} generated successfully on attempt ${attemptCount} (${duration.toFixed(2)}s, ${textSubChunks.length} sub-chunks)`
        });

      } catch (apiError: any) {
        // If this is an auth error, we already handled it above
        // For other errors, log and rethrow
        if (apiError.message === 'API key invalid, trying next key') {
          console.log(`🔄 Trying next available API key...`);
          continue;
        }
        
        console.error(`❌ Unexpected error during API call (attempt ${attemptCount}):`, apiError);
        throw apiError;
      }
    }

    // If we've exhausted all attempts
    console.error(`❌ Exhausted all retry attempts (${maxAttempts}) for chunk ${chunkIndex}`);
    return NextResponse.json(
      { error: 'All available API keys have been exhausted. Please upload new valid API keys.' },
      { status: 503 }
    );

  } catch (error: any) {
    console.error(`❌ Error generating audio chunk:`, error);
    return NextResponse.json({ 
      error: 'Failed to generate audio chunk',
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic'; 