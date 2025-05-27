import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GenerateImageRequestBody, GenerateImageResponse } from '@/types/image-generation';
import { uploadFileToSupabase } from "@/utils/supabase-utils";
import { v4 as uuidv4 } from 'uuid';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// MiniMax API key from environment
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;

// Interface for regeneration request
interface RegenerateImageRequestBody {
    provider: 'openai' | 'minimax';
    prompts: string[];
    minimaxAspectRatio?: "16:9" | "1:1" | "9:16";
    userId?: string;
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json() as RegenerateImageRequestBody;
        const {
            provider,
            prompts,
            minimaxAspectRatio = "16:9",
            userId = "unknown_user"
        } = body;

        console.log(`🔄 Received image regeneration request: provider=${provider}, userId=${userId}, prompts=${prompts.length}`);

        if (!prompts || prompts.length === 0) {
            return NextResponse.json({ error: 'No prompts provided for regeneration' }, { status: 400 });
        }

        if (prompts.length > 5) {
            return NextResponse.json({ 
                error: 'Maximum 5 images can be regenerated at once', 
                message: 'Please select fewer images to regenerate.'
            }, { status: 400 });
        }

        // API key checks
        if (provider === "minimax" && !MINIMAX_API_KEY) {
            return NextResponse.json({ error: 'Minimax API key is not configured.' }, { status: 500 });
        }
        if (provider === "openai" && !process.env.OPENAI_API_KEY) {
            return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 500 });
        }

        const results: { imageUrl: string; originalPrompt: string; }[] = [];
        const errors: { prompt: string; error: string; }[] = [];

        // Process each prompt
        for (let index = 0; index < prompts.length; index++) {
            const prompt = prompts[index];
            try {
                console.log(`Processing regeneration ${index + 1}/${prompts.length}: "${prompt.substring(0, 50)}..."`);
                let imageUrl: string | null = null;

                // OpenAI generation
                if (provider === 'openai') {
                    const response = await openai.images.generate({
                        model: "gpt-image-1",
                        prompt: prompt,
                        n: 1,
                        size: "1536x1024",
                    });

                    if (response.data?.[0]?.b64_json) {
                        const imageBuffer = Buffer.from(response.data[0].b64_json, 'base64');
                        const destinationPath = `user_${userId}/images/${uuidv4()}.png`;
                        imageUrl = await uploadFileToSupabase(imageBuffer, destinationPath, 'image/png');
                    }
                }
                // MiniMax generation
                else if (provider === 'minimax') {
                    const minimaxApiUrl = "https://api.minimaxi.chat/v1/image_generation";
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
                        throw new Error(`Minimax API request failed with status ${minimaxResponse.status}`);
                    }
                    
                    const data = await minimaxResponse.json();
                    if (data.data?.image_base64?.[0]) {
                        const base64String = data.data.image_base64[0];
                        const imageBuffer = Buffer.from(base64String, 'base64');
                        const destinationPath = `user_${userId}/images/${uuidv4()}.png`;
                        imageUrl = await uploadFileToSupabase(imageBuffer, destinationPath, 'image/png');
                    } else {
                        throw new Error('MiniMax response did not contain expected image data');
                    }
                }

                if (imageUrl) {
                    results.push({ imageUrl, originalPrompt: prompt });
                    console.log(`✅ Successfully regenerated image ${index + 1}/${prompts.length}`);
                } else {
                    throw new Error('Failed to generate or upload image');
                }
            } catch (error: any) {
                console.error(`❌ Error regenerating image for prompt ${index + 1}:`, error);
                errors.push({ 
                    prompt: prompt, 
                    error: error.message || 'Unknown error during regeneration' 
                });
            }

            // Add a small delay between requests to avoid rate limiting
            if (index < prompts.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        return NextResponse.json({
            success: true,
            regeneratedImages: results,
            totalSuccessful: results.length,
            totalFailed: errors.length,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error: any) {
        console.error('General error in regenerate-image route:', error);
        return NextResponse.json({ 
            error: 'Failed to process image regeneration request', 
            details: error.message 
        }, { status: 500 });
    }
} 