import { NextRequest, NextResponse } from 'next/server';
import { getValidApiKey, markApiKeyAsInvalid, uploadFileToSupabase } from "@/utils/supabase-utils";

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

    // Retry mechanism: try all available valid API keys
    let attemptCount = 0;
    let rateLimitRetries = 0;
    const maxAttempts = 10; // Safety limit to prevent infinite loops
    const maxRateLimitRetries = 5; // Maximum retries for rate limiting
    
    while (attemptCount < maxAttempts) {
      attemptCount++;
      
      // Get a valid API key from the database
    //   const apiKey = await getValidApiKey();
    //   if (!apiKey) {
    //     console.log(`❌ No valid API keys available after ${attemptCount} attempts`);
    //     return NextResponse.json(
    //       { error: 'No valid WellSaid Labs API keys available. Please upload API keys first.' },
    //       { status: 400 }
    //     );
    //   }
      const apiKey = "3ae0d806-3e6a-4ba5-a0d8-063e6a6ba50c"

      console.log(`🔑 Attempt ${attemptCount}: Using WellSaid Labs API key for chunk ${chunkIndex} generation`);

      try {
        // Generate audio using WellSaid Labs
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
          console.error(`❌ WellSaid API error for chunk ${chunkIndex} (attempt ${attemptCount}):`, errorText);
          
          // Check if this is a rate limit error
          if (isRateLimitError(wellsaidResponse.status, errorText)) {
            rateLimitRetries++;
            console.log(`⏱️ Rate limit detected for chunk ${chunkIndex} (retry ${rateLimitRetries}/${maxRateLimitRetries})`);
            
            if (rateLimitRetries <= maxRateLimitRetries) {
              // Calculate delay: exponential backoff starting at 2 seconds
              const delayMs = Math.min(2000 * Math.pow(2, rateLimitRetries - 1), 30000); // Max 30 seconds
              console.log(`⏳ Waiting ${delayMs}ms before retrying due to rate limit...`);
              
              await delay(delayMs);
              
              // Don't increment attemptCount for rate limit retries, just retry with same key
              attemptCount--;
              continue;
            } else {
              console.log(`❌ Exceeded maximum rate limit retries (${maxRateLimitRetries}) for chunk ${chunkIndex}`);
              return NextResponse.json(
                { error: `Rate limit exceeded. Maximum retries (${maxRateLimitRetries}) reached. Please try again later.` },
                { status: 429 }
              );
            }
          }
          
          // If API key is invalid (401/403), mark it as invalid and try next key
          if (wellsaidResponse.status === 401 || wellsaidResponse.status === 403) {
            console.log(`🚫 Marking API key as invalid due to ${wellsaidResponse.status} error (attempt ${attemptCount})`);
            await markApiKeyAsInvalid(apiKey);
            
            // Reset rate limit retries when switching to a new key
            rateLimitRetries = 0;
            
            // Continue to next iteration to try another key
            console.log(`🔄 Trying next available API key...`);
            continue;
          }
          
          // For other errors (not auth-related or rate limit), don't retry with different keys
          throw new Error(`WellSaid API error: ${wellsaidResponse.status} ${wellsaidResponse.statusText}`);
        }

        // Success! Get audio data as buffer
        const audioBuffer = await wellsaidResponse.arrayBuffer();
        const audioBufferNode = Buffer.from(audioBuffer);

        // Upload to Supabase
        const timestamp = Date.now();
        const fileName = `audio_chunk_${chunkIndex}_${timestamp}.mp3`;
        const destinationPath = `${userId}/audio_chunks/${fileName}`;

        const audioUrl = await uploadFileToSupabase(audioBufferNode, destinationPath, 'audio/mpeg');

        if (!audioUrl) {
          throw new Error('Failed to upload audio chunk to Supabase');
        }

        console.log(`✅ Audio chunk ${chunkIndex} generated and uploaded successfully on attempt ${attemptCount}: ${audioUrl}`);

        return NextResponse.json({
          success: true,
          chunkIndex: chunkIndex,
          audioUrl: audioUrl,
          text: text,
          message: `Audio chunk ${chunkIndex} generated successfully on attempt ${attemptCount}`
        });

      } catch (apiError: any) {
        // If this is an auth error, we already handled it above
        // For other errors, log and rethrow
        if (apiError.message.includes('WellSaid API error')) {
          throw apiError;
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