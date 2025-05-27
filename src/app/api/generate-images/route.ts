import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { uploadFileToSupabase } from "@/utils/supabase-utils";
import { v4 as uuidv4 } from 'uuid';

type ImageProvider = "openai" | "minimax";

interface MultiImageRequestBody {
  provider: ImageProvider;
  prompts: string[];
  minimaxAspectRatio?: "16:9" | "1:1" | "9:16";
  userId?: string;
  numberOfImagesPerPrompt?: number;
}

interface MultiImageResponse {
  imageUrls: string[];
  failedPrompts: {
    index: number;
    prompt: string;
    error?: string;
  }[];
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const BATCH_SIZE = 5; // Process 5 images at a time
const BATCH_INTERVAL_MS = 5000; // 5 seconds between batches

// Helper function for retrying an async operation
async function retryAsync<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delayMs: number = 1000,
  attempt: number = 1
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (attempt > retries) {
      console.error(`Failed after ${retries} retries. Last error:`, error);
      throw error;
    }
    console.warn(`Attempt ${attempt} failed. Retrying in ${delayMs / 1000}s...`);
    await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
    return retryAsync(fn, retries, delayMs, attempt + 1);
  }
}

// Helper function to process images in batches with rate limiting
async function processBatches<T>(
  items: (() => Promise<T>)[],
  batchSize: number = BATCH_SIZE,
  intervalMs: number = BATCH_INTERVAL_MS
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  
  // Process items in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batchEnd = Math.min(i + batchSize, items.length);
    console.log(`Processing batch ${i/batchSize + 1}: items ${i+1} to ${batchEnd} of ${items.length}`);
    
    // Create a batch of promises
    const batch = items.slice(i, batchEnd).map(fn => fn());
    
    // Wait for the current batch to complete
    const batchResults = await Promise.allSettled(batch);
    results.push(...batchResults);
    
    // If not the last batch, wait before processing the next batch
    if (batchEnd < items.length) {
      console.log(`Rate limiting: waiting ${intervalMs/1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
  }
  
  return results;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as MultiImageRequestBody;
    const {
      provider,
      prompts,
      minimaxAspectRatio = "16:9",
      userId = "unknown_user",
      numberOfImagesPerPrompt = 1
    } = body;

    console.log(`🖼️ Received multi-image generation request: provider=${provider}, userId=${userId}, prompts=${prompts.length}, images per prompt=${numberOfImagesPerPrompt}`);

    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
      return NextResponse.json({ error: 'At least one prompt is required' }, { status: 400 });
    }

    if (provider !== 'openai' && provider !== 'minimax') {
      return NextResponse.json({ error: 'Invalid provider specified' }, { status: 400 });
    }

    // Validate number of images
    if (numberOfImagesPerPrompt < 1 || numberOfImagesPerPrompt > 5) {
      return NextResponse.json({ error: 'Number of images per prompt must be between 1 and 5' }, { status: 400 });
    }

    // API key checks
    if (provider === "minimax" && !MINIMAX_API_KEY) {
      return NextResponse.json({ error: 'Minimax API key is not configured.' }, { status: 500 });
    }
    if (provider === "openai" && !process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 500 });
    }

    let supabaseImageUrls: string[] = [];
    let failedPrompts: { index: number; prompt: string; error?: string }[] = [];

    const generateImageFunctions: (() => Promise<{ url: string | null; index: number; prompt: string; error?: string }>)[] = [];
    
    // --- OpenAI Logic ---
    if (provider === 'openai') {
      // Create image generation functions for each prompt, repeated by numberOfImagesPerPrompt
      prompts.forEach((prompt, promptIndex) => {
        // Generate multiple images for each prompt
        for (let imageIndex = 0; imageIndex < numberOfImagesPerPrompt; imageIndex++) {
          generateImageFunctions.push(async () => {
            try {
              console.log(`Generating OpenAI image ${imageIndex + 1}/${numberOfImagesPerPrompt} for prompt ${promptIndex + 1}`);
              
              const response = await openai.images.generate({
                model: "gpt-image-1",
                prompt: prompt,
                n: 1,
                size: "1536x1024",
              });

              if (response.data?.[0]?.b64_json) {
                const imageBuffer = Buffer.from(response.data[0].b64_json, 'base64');
                const destinationPath = `user_${userId}/images/${uuidv4()}.png`;
                const supabaseUrl = await uploadFileToSupabase(imageBuffer, destinationPath, 'image/png');
                
                if (!supabaseUrl) {
                  return { url: null, index: promptIndex, prompt, error: 'Failed to upload to Supabase' };
                }
                return { url: supabaseUrl, index: promptIndex, prompt };
              } else {
                return { url: null, index: promptIndex, prompt, error: 'No image data in OpenAI response' };
              }
            } catch (error: any) {
              return { url: null, index: promptIndex, prompt, error: error.message || 'Unknown error during OpenAI generation' };
            }
          });
        }
      });
    }
    // --- MiniMax Logic ---
    else if (provider === 'minimax') {
      const minimaxApiUrl = "https://api.minimaxi.chat/v1/image_generation";
      
      // Create image generation functions for each prompt, repeated by numberOfImagesPerPrompt
      prompts.forEach((prompt, promptIndex) => {
        // Generate multiple images for each prompt
        for (let imageIndex = 0; imageIndex < numberOfImagesPerPrompt; imageIndex++) {
          generateImageFunctions.push(async () => {
            try {
              console.log(`Generating MiniMax image ${imageIndex + 1}/${numberOfImagesPerPrompt} for prompt ${promptIndex + 1}`);
              
              const payload = {
                model: "image-01",
                prompt: prompt,
                aspect_ratio: minimaxAspectRatio,
                response_format: "base64",
                width: 1536,
                height: 1024,
                n: 1,
                prompt_optimizer: true,
              };
              
              const headers = {
                'Authorization': `Bearer ${MINIMAX_API_KEY}`,
                'Content-Type': 'application/json',
              };

              const minimaxResponse = await fetch(minimaxApiUrl, { 
                method: 'POST', 
                headers: headers, 
                body: JSON.stringify(payload) 
              });
              
              if (!minimaxResponse.ok) {
                const errorData = await minimaxResponse.json().catch(() => ({}));
                console.error('Minimax API error:', minimaxResponse.status, errorData);
                return { 
                  url: null, 
                  index: promptIndex, 
                  prompt, 
                  error: `Minimax API request failed with status ${minimaxResponse.status}` 
                };
              }
              
              const data = await minimaxResponse.json();

              if (data.data?.image_base64?.[0]) {
                const base64String = data.data.image_base64[0];
                const imageBuffer = Buffer.from(base64String, 'base64');
                const destinationPath = `user_${userId}/images/${uuidv4()}.png`;
                const supabaseUrl = await uploadFileToSupabase(imageBuffer, destinationPath, 'image/png');
                
                if (!supabaseUrl) {
                  return { url: null, index: promptIndex, prompt, error: 'Failed to upload to Supabase' };
                }
                return { url: supabaseUrl, index: promptIndex, prompt };
              }
              
              if (data.base?.status_code !== 0) {
                return { 
                  url: null, 
                  index: promptIndex, 
                  prompt, 
                  error: `Minimax API error: ${data.base.status_msg || 'Unknown error'}` 
                };
              }
              
              return { url: null, index: promptIndex, prompt, error: 'Unexpected Minimax response format' };
            } catch (error: any) {
              return { url: null, index: promptIndex, prompt, error: error.message || 'Unknown error during Minimax generation' };
            }
          });
        }
      });
    }

    console.log(`Starting batch processing for ${generateImageFunctions.length} image generations...`);
    
    // Wrap each function with retryAsync
    const retryWrappedFunctions = generateImageFunctions.map(fn => () => retryAsync(fn));
    
    // Process in batches with rate limiting
    const settledResults = await processBatches(retryWrappedFunctions);

    settledResults.forEach((result) => {
      if (result.status === 'fulfilled') {
        if (result.value.url) {
          supabaseImageUrls.push(result.value.url);
        } else {
          failedPrompts.push({
            index: result.value.index,
            prompt: result.value.prompt,
            error: result.value.error
          });
        }
      } else if (result.status === 'rejected') {
        console.error(`Failed to generate/upload image:`, result.reason);
        // We can't directly identify which prompt failed here
        // This is a limitation of the current implementation
      }
    });

    // --- Final Response ---
    console.log(`✅ Multi-image generation complete. Success: ${supabaseImageUrls.length}, Failed: ${failedPrompts.length}`);
    
    const responsePayload: MultiImageResponse = { 
      imageUrls: supabaseImageUrls,
      failedPrompts: failedPrompts
    };
    
    return NextResponse.json(responsePayload, { status: 200 });

  } catch (error: any) {
    console.error('Error in multi-image generation:', error);
    return NextResponse.json({ error: error.message || 'Failed to generate images' }, { status: 500 });
  }
} 