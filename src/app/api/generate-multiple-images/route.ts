import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GeneratedImageSet, GenerateImageResponse } from '@/types/image-generation';
import { uploadFileToSupabase } from "@/utils/supabase-utils";
import { v4 as uuidv4 } from 'uuid';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;

// Rate limit settings
const BATCH_SIZE = 5; // Process 5 images at a time
const BATCH_DELAY_MS = 60000; // Wait 1 minute between batches

// Helper function to process arrays in batches
async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  batchDelayMs: number,
  processFn: (item: T, index: number) => Promise<R>,
  onBatchComplete?: (batchResults: R[], batchIndex: number) => void
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchIndex = Math.floor(i / batchSize);
    
    console.log(`Processing batch ${batchIndex + 1} of ${Math.ceil(items.length / batchSize)} (${batch.length} items)`);
    
    // Process current batch in parallel
    const batchPromises = batch.map((item, idx) => processFn(item, i + idx));
    const batchResults = await Promise.all(batchPromises);
    
    results.push(...batchResults);
    
    if (onBatchComplete) {
      onBatchComplete(batchResults, batchIndex);
    }
    
    // If this isn't the last batch, apply delay before next batch
    const isLastBatch = i + batchSize >= items.length;
    if (!isLastBatch) {
      console.log(`Batch ${batchIndex + 1} complete. Waiting ${batchDelayMs / 1000} seconds before next batch...`);
      await new Promise(resolve => setTimeout(resolve, batchDelayMs));
    }
  }
  
  return results;
}

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      provider,
      prompts,
      numberOfImagesPerPrompt = 1,
      userId = "unknown_user"
    } = body;

    // Validate inputs
    if (!provider || provider !== 'openai' && provider !== 'minimax') {
      return NextResponse.json({ error: 'Invalid or missing provider' }, { status: 400 });
    }

    if (!prompts || !Array.isArray(prompts) || prompts.length === 0) {
      return NextResponse.json({ error: 'Prompts must be a non-empty array' }, { status: 400 });
    }

    // Calculate total number of images to be generated
    const totalImages = prompts.length * numberOfImagesPerPrompt;
    const estimatedTime = Math.ceil(totalImages / BATCH_SIZE) * (BATCH_DELAY_MS / 60000);
    
    console.log(`🖼️ Processing ${prompts.length} prompts with ${provider} (${totalImages} total images)`);
    console.log(`Using batch processing: ${BATCH_SIZE} images per batch, ~${estimatedTime} minutes estimated total time`);

    // Filter out empty prompts
    const validPrompts = prompts.filter(prompt => prompt && prompt.trim() !== '');
    
    if (validPrompts.length === 0) {
      return NextResponse.json({ error: 'No valid prompts provided' }, { status: 400 });
    }

    // Function to process a single prompt
    const processPrompt = async (prompt: string, index: number): Promise<GeneratedImageSet> => {
      console.log(`Processing prompt ${index + 1}/${validPrompts.length}: "${prompt.substring(0, 30)}..."`);
      
      try {
        let imageUrls: string[] = [];
        
        if (provider === 'openai') {
          // Process OpenAI image generation
          const generateOpenAIImages = async (): Promise<string[]> => {
            // Create variations of the prompt
            const promptVariations = Array(numberOfImagesPerPrompt).fill(0).map((_, i) => {
              return i === 0 ? prompt : `${prompt} (variation ${i+1})`;
            });
            
            // Process images in batches
            const urls = await processBatches<string, string | null>(
              promptVariations,
              BATCH_SIZE,
              BATCH_DELAY_MS,
              async (promptVariation, variationIndex) => {
                try {
                  console.log(`Generating image ${variationIndex + 1}/${promptVariations.length} for prompt ${index + 1}`);
                  
                  const response = await openai.images.generate({
                    model: "gpt-image-1",
                    prompt: promptVariation,
                    n: 1,
                    size: "1536x1024",
                  });
                  
                  if (response.data?.[0]?.b64_json) {
                    const imageBuffer = Buffer.from(response.data[0].b64_json, 'base64');
                    const destinationPath = `user_${userId}/images/${uuidv4()}.png`;
                    const supabaseUrl = await uploadFileToSupabase(imageBuffer, destinationPath, 'image/png');
                    if (supabaseUrl) {
                      console.log(`✓ Image ${variationIndex + 1} for prompt ${index + 1} generated successfully`);
                      return supabaseUrl;
                    }
                  }
                  console.warn(`✗ Failed to get image data for variation ${variationIndex + 1} of prompt ${index + 1}`);
                  return null;
                } catch (error) {
                  console.error(`Error generating OpenAI image variation ${variationIndex + 1} for prompt ${index + 1}:`, error);
                  return null;
                }
              },
              (batchResults, batchIndex) => {
                const successCount = batchResults.filter(Boolean).length;
                console.log(`Batch ${batchIndex + 1} for prompt ${index + 1}: ${successCount}/${batchResults.length} images successful`);
              }
            );
            
            // Filter out null values
            return urls.filter(Boolean) as string[];
          };
          
          // Use retryAsync for the entire process
          imageUrls = await retryAsync(generateOpenAIImages);
          
        } else if (provider === 'minimax') {
          // Process MiniMax image generation with batching
          const generateMinimaxImages = async (): Promise<string[]> => {
            // Create an array of the number of images to generate
            const imageIndices = Array(numberOfImagesPerPrompt).fill(0).map((_, i) => i);
            
            // Process images in batches
            const urls = await processBatches<number, string | null>(
              imageIndices,
              BATCH_SIZE, 
              BATCH_DELAY_MS,
              async (_, imgIndex) => {
                const minimaxApiUrl = "https://api.minimaxi.chat/v1/image_generation";
                
                try {
                  console.log(`Generating MiniMax image ${imgIndex + 1}/${numberOfImagesPerPrompt} for prompt ${index + 1}`);
                  
                  const payload = {
                    model: "image-01",
                    prompt: prompt,
                    aspect_ratio: "16:9",
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
                    throw new Error(`Minimax API request failed with status ${minimaxResponse.status}`);
                  }
                  
                  const data = await minimaxResponse.json();
                  
                  if (data.data?.image_base64?.[0]) {
                    const base64String = data.data.image_base64[0];
                    const imageBuffer = Buffer.from(base64String, 'base64');
                    const destinationPath = `user_${userId}/images/${uuidv4()}.png`;
                    const supabaseUrl = await uploadFileToSupabase(imageBuffer, destinationPath, 'image/png');
                    if (supabaseUrl) {
                      console.log(`✓ MiniMax image ${imgIndex + 1} for prompt ${index + 1} generated successfully`);
                      return supabaseUrl;
                    }
                  }
                  console.warn(`✗ Failed to get MiniMax image data for image ${imgIndex + 1} of prompt ${index + 1}`);
                  return null;
                } catch (error) {
                  console.error(`Error generating MiniMax image ${imgIndex + 1} for prompt ${index+1}:`, error);
                  return null;
                }
              },
              (batchResults, batchIndex) => {
                const successCount = batchResults.filter(Boolean).length;
                console.log(`MiniMax batch ${batchIndex + 1} for prompt ${index + 1}: ${successCount}/${batchResults.length} images successful`);
              }
            );
            
            // Filter out null values
            return urls.filter(Boolean) as string[];
          };
          
          imageUrls = await retryAsync(generateMinimaxImages);
        }
        
        console.log(`✅ Completed prompt ${index + 1}: Generated ${imageUrls.length}/${numberOfImagesPerPrompt} images`);
        
        return {
          originalPrompt: prompt,
          imageUrls: imageUrls,
          imageData: []
        };
      } catch (error: any) {
        console.error(`Error processing prompt ${index + 1}:`, error);
        return {
          originalPrompt: prompt,
          imageUrls: [],
          imageData: [],
          error: error.message || 'Unknown error'
        };
      }
    };

    // Process all prompts - we can process these in parallel since each prompt's images are already batched
    const promptPromises = validPrompts.map((prompt, index) => processPrompt(prompt, index));
    const results = await Promise.allSettled(promptPromises);
    
    // Process results
    const imageSets: GeneratedImageSet[] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      }
      
      // Return placeholder for rejected promises
      return {
        originalPrompt: validPrompts[index],
        imageUrls: [],
        imageData: [],
        error: result.reason?.message || 'Failed to generate images'
      };
    });
    
    // Include empty placeholders for any invalid prompts
    if (validPrompts.length < prompts.length) {
      prompts.forEach((prompt, index) => {
        if (!prompt || prompt.trim() === '') {
          imageSets.splice(index, 0, {
            originalPrompt: prompt || 'Empty prompt',
            imageUrls: [],
            imageData: []
          });
        }
      });
    }
    
    const totalImagesGenerated = imageSets.reduce((total, set) => total + (set.imageUrls?.length || 0), 0);
    console.log(`✅ Image generation complete. Generated ${totalImagesGenerated}/${totalImages} images across ${imageSets.length} prompts.`);
    
    return NextResponse.json({ imageSets });
    
  } catch (error: any) {
    console.error('Error in generate-multiple-images:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate images' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';