import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GenerateImageRequestBody, GenerateImageResponse } from '@/types/image-generation';
import { uploadFileToSupabase } from "@/utils/supabase-utils";
// import { createClient } from '@/utils/supabase/client'; // Use client if needed, but likely not for API route
import { v4 as uuidv4 } from 'uuid';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const BATCH_SIZE = 5; // Process 5 images at a time
const BATCH_INTERVAL_MS = 5000; // 5 seconds between batches

// Helper function for retrying an async operation
async function retryAsync<T>(
    fn: () => Promise<T>,
    retries: number = 5,
    delayMs: number = 1000, // Optional delay between retries
    attempt: number = 1
): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        if (attempt > retries) {
            console.error(`Failed after ${retries} retries. Last error:`, error);
            throw error; // Rethrow the last error after all retries fail
        }
        console.warn(`Attempt ${attempt} failed. Retrying in ${delayMs / 1000}s... Error:`, error);
        await new Promise(resolve => setTimeout(resolve, delayMs * attempt)); // Exponential backoff can be considered
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
    // const supabase = createClient(); // Initialize Supabase client if needed for other operations

    try {
        const body = (await request.json()) as GenerateImageRequestBody;
        const {
            provider,
            prompt,
            numberOfImages = 1,
            outputFormat = "url", // Keep outputFormat, default to url
            minimaxAspectRatio = "16:9", // Default to landscape
            userId = "unknown_user"
        } = body;

        console.log(`🖼️ Received image generation request: provider=${provider}, userId=${userId}, prompt=${prompt.substring(0, 50)}...`);

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }
        if (provider !== 'openai' && provider !== 'minimax') {
            return NextResponse.json({ error: 'Invalid provider specified' }, { status: 400 });
        }
        // Consider if userId validation is needed here
        // if (!userId || userId === "unknown_user") {
        //     console.warn("Received image generation request without a valid userId.");
        //     return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        // }

        // API key checks
        if (provider === "minimax" && !MINIMAX_API_KEY) {
            return NextResponse.json({ error: 'Minimax API key is not configured.' }, { status: 500 });
        }
        if (provider === "openai" && !process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 500 });
        }

        let supabaseImageUrls: string[] = [];

        // --- OpenAI Logic ---
        if (provider === 'openai') {
            console.log(`Generating ${numberOfImages} image(s) with OpenAI DALL-E 3...`);
            
            // Helper function for a single OpenAI generation + upload
            const generateAndUploadSingleOpenAIImage = async (promptVariation: string = prompt): Promise<string | null> => {
                const attemptGeneration = async (): Promise<string | null> => {
                    try {
                        const response = await openai.images.generate({
                            model: "gpt-image-1",
                            prompt: promptVariation,
                            n: 1, // DALL-E 3 supports only 1
                            size: "1536x1024",
                        });

                        console.log(`OpenAI response received. Response data length: ${JSON.stringify(response, null, 2)}`);

                        if (response.data?.[0]?.b64_json) {
                            const imageBuffer = Buffer.from(response.data[0].b64_json, 'base64');
                            const destinationPath = `user_${userId}/images/${uuidv4()}.png`;
                            const supabaseUrl = await uploadFileToSupabase(imageBuffer, destinationPath, 'image/png');
                            
                            if (!supabaseUrl) {
                                console.warn("Failed to upload an OpenAI generated image to Supabase.");
                                return null;
                            }
                            return supabaseUrl;
                        } else {
                            throw new Error('OpenAI response did not contain expected image data.');
                        }
                    } catch (error) {
                        console.error('Error during single OpenAI image generation/upload attempt:', error);
                        throw error;
                    }
                };
                
                // Wrap the attemptGeneration with retryAsync
                return retryAsync(attemptGeneration);
            };

            // Create slight variations of the prompt for multiple images to avoid duplicates
            const promptVariations = Array(numberOfImages).fill(0).map((_, i) => {
                if (i === 0) return prompt; // First image with original prompt
                return `${prompt} (variation ${i})`; // Add subtle variation
            });

            // Create generation functions (not promises yet)
            const imageGenerationFunctions = promptVariations.map(
                promptVar => () => generateAndUploadSingleOpenAIImage(promptVar)
            );

            console.log(`Starting batch processing for ${imageGenerationFunctions.length} OpenAI image generations...`);
            
            // Process in batches with rate limiting
            const settledResults = await processBatches(imageGenerationFunctions);

            settledResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    supabaseImageUrls.push(result.value);
                } else if (result.status === 'rejected') {
                    console.error(`Failed to generate/upload OpenAI image ${index + 1}:`, result.reason);
                } else if (result.status === 'fulfilled' && result.value === null) {
                    console.warn(`OpenAI image ${index + 1} generation completed but upload failed.`);
                }
            });
        }
        // --- MiniMax Logic ---
        else if (provider === 'minimax') {
            console.log(`Generating ${numberOfImages} image(s) with MiniMax...`);
            const minimaxApiUrl = "https://api.minimaxi.chat/v1/image_generation";

            // Helper function for a single MiniMax generation + upload
            const generateAndUploadSingleMinimaxImage = async (): Promise<string | null> => {
                const attemptGeneration = async (): Promise<string | null> => {
                    const payload = {
                        model: "image-01",
                        prompt: prompt,
                        aspect_ratio: minimaxAspectRatio,
                        response_format: "base64", // Always get base64
                        width: 1536,
                        height: 1024, 
                        n: 1, // Generate one at a time
                        prompt_optimizer: true,
                    };
                    const headers = {
                        'Authorization': `Bearer ${MINIMAX_API_KEY}`,
                        'Content-Type': 'application/json',
                    };

                    try {
                        const minimaxResponse = await fetch(minimaxApiUrl, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
                        if (!minimaxResponse.ok) {
                            const errorData = await minimaxResponse.json().catch(() => ({}));
                            console.error('Minimax API error:', minimaxResponse.status, errorData);
                            throw new Error(`Minimax API request failed with status ${minimaxResponse.status}`);
                        }
                        const data = await minimaxResponse.json();

                        if (data.data?.image_base64?.[0]) {
                            const base64String = data.data.image_base64[0];
                            const imageBuffer = Buffer.from(base64String, 'base64');
                            const destinationPath = `user_${userId}/images/${uuidv4()}.png`;
                            const supabaseUrl = await uploadFileToSupabase(imageBuffer, destinationPath, 'image/png');
                            if (!supabaseUrl) {
                                console.warn("Failed to upload a MiniMax generated image to Supabase.");
                                return null; // Indicate failure for this specific image
                            }
                            return supabaseUrl;
                        }
                        if (data.base?.status_code !== 0) {
                            console.error('Minimax API returned an error status:', data.base);
                            throw new Error(`Minimax API error: ${data.base.status_msg || 'Unknown error'}`);
                        }
                        console.warn('Minimax response format unexpected:', data);
                        return null; // Indicate failure
                    } catch (error) {
                        console.error('Error during single MiniMax image generation/upload attempt:', error);
                        // Let Promise.allSettled handle this rejection after retries
                        throw error;
                    }
                };
                
                // Wrap the attemptGeneration with retryAsync
                return retryAsync(attemptGeneration);
            };

            // Create generation functions (not promises yet)
            const imageGenerationFunctions = Array(numberOfImages).fill(0).map(() => 
                () => generateAndUploadSingleMinimaxImage()
            );

            console.log(`Starting batch processing for ${imageGenerationFunctions.length} MiniMax image generations...`);
            
            // Process in batches with rate limiting
            const settledResults = await processBatches(imageGenerationFunctions);

            settledResults.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value) {
                    supabaseImageUrls.push(result.value);
                } else if (result.status === 'rejected') {
                    console.error(`Failed to generate/upload MiniMax image ${index + 1}:`, result.reason);
                    // Decide how to handle partial failures - currently, we just log and continue
                } else if (result.status === 'fulfilled' && result.value === null) {
                    console.warn(`MiniMax image ${index + 1} generation/upload completed but resulted in null (e.g., upload failed).`);
                }
            });
        }

        // --- Final Response ---
        if (supabaseImageUrls.length === 0) {
             // This could happen if all requests failed or if 0 images were requested (though prompt is required)
             console.error("No images were successfully generated and uploaded.");
             // Return an error if images were expected but none succeeded
             if (numberOfImages > 0) {
                  return NextResponse.json({ error: 'Image generation failed. No images were successfully created or uploaded. Check provider status and API keys.' }, { status: 500 });
             }
        }

        console.log(`✅ Image generation complete. Returning ${supabaseImageUrls.length} Supabase URL(s).`);
        const responsePayload: GenerateImageResponse = { imageUrls: supabaseImageUrls };
        return NextResponse.json(responsePayload, { status: 200 });

    } catch (error: any) {
        console.error('Error generating image:', error);
        // Catch errors thrown from OpenAI/MiniMax sections or general request processing errors
        return NextResponse.json({ error: error.message || 'Failed to generate image' }, { status: 500 });
    }
}

// Keep existing env var checks
if (process.env.NODE_ENV !== 'test') {
    if (!process.env.OPENAI_API_KEY) {
        console.warn("Warning: OPENAI_API_KEY environment variable is not set. OpenAI image generation will fail.");
    }
    if (!MINIMAX_API_KEY) {
        console.warn("Warning: MINIMAX_API_KEY environment variable is not set. Minimax image generation will fail.");
    }
} 