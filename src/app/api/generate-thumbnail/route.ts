import { NextResponse } from 'next/server';
// Remove direct Supabase client initialization from here
// import { createClient } from '@supabase/supabase-js'; 
import { uploadFileToSupabase } from '@/utils/supabase-utils'; // Corrected path
import { Buffer } from 'buffer'; // Ensure Buffer is imported for conversion

const LEONARDO_API_KEY = process.env.LEONARDO_API_KEY;
const LEONARDO_API_URL = 'https://cloud.leonardo.ai/api/rest/v1';

interface LeonardoGenerationResponse {
  sdGenerationJob: {
    generationId: string;
    apiCreditCost?: number;
  };
}

interface LeonardoImage {
  id: string;
  url: string;
  nsfw: boolean;
  likeCount: number;
  motionMP4URL?: string | null;
  prompt_id?: string;
}

interface LeonardoGenerationStatus {
  generations_by_pk: {
    generated_images: LeonardoImage[];
    modelId: string;
    prompt: string;
    status: 'PENDING' | 'COMPLETE' | 'FAILED' | 'CONTENT_FILTERED';
    id?: string; // generationId might also be here
  } | null;
}

async function pollForGenerationCompletion(generationId: string): Promise<LeonardoGenerationStatus> {
  let attempts = 0;
  const maxAttempts = 20; // Poll for up to 100 seconds (20 * 5s)
  const pollInterval = 5000; // 5 seconds

  while (attempts < maxAttempts) {
    try {
      const response = await fetch(`${LEONARDO_API_URL}/generations/${generationId}`, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'authorization': `Bearer ${LEONARDO_API_KEY}`,
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Leonardo API error while polling:', errorData);
        throw new Error(`Leonardo API error while polling: ${response.statusText}`);
      }

      const data: LeonardoGenerationStatus = await response.json();

      if (data.generations_by_pk && (data.generations_by_pk.status === 'COMPLETE' || data.generations_by_pk.status === 'FAILED' || data.generations_by_pk.status === 'CONTENT_FILTERED')) {
        return data;
      }
      
      attempts++;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('Polling error:', error);
      // If a single poll fails, we might want to retry a few times before giving up
      // For simplicity, we'll continue polling up to maxAttempts
      attempts++;
      await new Promise(resolve => setTimeout(resolve, pollInterval));
      if (attempts >= maxAttempts) throw error; // Rethrow if max attempts reached after error
    }
  }
  throw new Error('Image generation timed out or polling failed.');
}

export async function POST(request: Request) {
  if (!LEONARDO_API_KEY) {
    return NextResponse.json({ error: 'Leonardo API key not configured' }, { status: 500 });
  }

  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Prompt is required and must be a string' }, { status: 400 });
    }

    // 1. Generate Image with Leonardo.ai
    const generationPayload = {
      modelId: "de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3", // As per your example
      prompt: prompt,
      num_images: 1, // Typically one thumbnail
      width: 1280,   // Standard thumbnail width
      height: 720,   // Standard thumbnail height
      alchemy: true,
      // contrast: 3.5, // Optional, can be added if needed
      styleUUID: "111dc692-d470-4eec-b791-3475abac4c46", // As per your example
      enhancePrompt: false, // As per your example
      // sd_version: "v2" // Example, ensure compatibility with model
      // "public": false, // if you want images to be private to your account
    };

    const generationResponse = await fetch(`${LEONARDO_API_URL}/generations`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'authorization': `Bearer ${LEONARDO_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(generationPayload),
    });

    if (!generationResponse.ok) {
      const errorData = await generationResponse.json();
      console.error('Leonardo API error (generation):', errorData);
      return NextResponse.json({ error: 'Failed to start image generation', details: errorData }, { status: 500 });
    }

    const generationResult: LeonardoGenerationResponse = await generationResponse.json();
    const generationId = generationResult.sdGenerationJob?.generationId;

    if (!generationId) {
      return NextResponse.json({ error: 'Failed to get generation ID from Leonardo.ai' }, { status: 500 });
    }

    // 2. Poll for generation completion
    const finalStatus = await pollForGenerationCompletion(generationId);

    if (!finalStatus.generations_by_pk || finalStatus.generations_by_pk.status !== 'COMPLETE') {
      let errorDetail = 'Image generation did not complete successfully.';
      if (finalStatus.generations_by_pk?.status === 'FAILED') errorDetail = 'Image generation failed on Leonardo.ai.';
      if (finalStatus.generations_by_pk?.status === 'CONTENT_FILTERED') errorDetail = 'Image generation was filtered by Leonardo.ai due to content policy.';
      return NextResponse.json({ error: errorDetail, details: finalStatus.generations_by_pk }, { status: 500 });
    }

    const generatedImages = finalStatus.generations_by_pk.generated_images;
    if (!generatedImages || generatedImages.length === 0 || !generatedImages[0].url) {
      return NextResponse.json({ error: 'No image URL found in Leonardo.ai response' }, { status: 500 });
    }

    const imageUrl = generatedImages[0].url;

    // 3. Download the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return NextResponse.json({ error: 'Failed to download image from Leonardo.ai' }, { status: 500 });
    }
    const imageBlob = await imageResponse.blob();

    // 4. Upload to Supabase using the utility function
    const fileName = `thumbnails/${Date.now()}_${Math.random().toString(36).substring(2, 15)}.png`;
    
    // Convert Blob to Node.js Buffer
    const imageNodeBuffer = Buffer.from(await imageBlob.arrayBuffer());

    const publicUrl = await uploadFileToSupabase(
      imageNodeBuffer,
      fileName,
      imageBlob.type || 'image/png',
      'video-generator' // Using the video-generator bucket for consistency
    );

    if (!publicUrl) {
      // uploadFileToSupabase will log specific errors, but we might want a general one here
      return NextResponse.json({ error: 'Failed to upload image to Supabase or get public URL' }, { status: 500 });
    }

    return NextResponse.json({ thumbnailUrl: publicUrl, path: fileName });

  } catch (error) {
    console.error('Thumbnail generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ error: 'Internal server error in thumbnail generation', details: errorMessage }, { status: 500 });
  }
}
