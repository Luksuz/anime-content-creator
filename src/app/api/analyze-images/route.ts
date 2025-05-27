import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { images, prompt, userId = 'unknown_user' } = await request.json();

    if (!images || !Array.isArray(images) || images.length === 0) {
      return NextResponse.json({ 
        error: 'Images array is required' 
      }, { status: 400 });
    }

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ 
        error: 'Prompt is required' 
      }, { status: 400 });
    }

    console.log(`🚀 Processing ${images.length} images asynchronously for user ${userId}`);

    // Process all images in parallel for maximum performance
    const imagePromises = images.map(async (image, index) => {
      console.log(`📸 Starting analysis for image ${index + 1}/${images.length}: ${image.url}`);

      try {
        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{
            role: "user",
            content: [
              { 
                type: "text", 
                text: `${prompt}` 
              },
              {
                type: "image_url",
                image_url: {
                  url: image.url,
                },
              },
            ],
          }],
          max_tokens: 300,
        });

        const narration = response.choices[0]?.message?.content?.trim();
        
        if (narration) {
          console.log(`✅ Generated narration for image ${index + 1}`);
          return {
            success: true,
            data: {
              imageUrl: image.url,
              imageIndex: index,
              narration: narration,
              startY: image.startY,
              endY: image.endY,
              height: image.height
            }
          };
        } else {
          console.error(`❌ No narration generated for image ${index + 1}`);
          return {
            success: false,
            error: {
              imageIndex: index,
              imageUrl: image.url,
              error: 'No content generated'
            }
          };
        }

      } catch (error: any) {
        console.error(`❌ Error analyzing image ${index + 1}:`, error);
        return {
          success: false,
          error: {
            imageIndex: index,
            imageUrl: image.url,
            error: error.message || 'Failed to analyze image'
          }
        };
      }
    });

    // Wait for all images to be processed
    console.log(`⏳ Waiting for all ${images.length} images to complete processing...`);
    const results = await Promise.all(imagePromises);

    // Separate successful narrations from errors
    const narrations = [];
    const errors = [];

    for (const result of results) {
      if (result.success) {
        narrations.push(result.data);
      } else {
        errors.push(result.error);
      }
    }

    console.log(`🎉 Async processing complete: ${narrations.length} successful, ${errors.length} failed`);

    return NextResponse.json({
      success: true,
      narrations,
      totalProcessed: images.length,
      totalSuccess: narrations.length,
      totalErrors: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully generated ${narrations.length} narrations out of ${images.length} images using async processing`
    });

  } catch (error: any) {
    console.error('❌ Error in async image analysis:', error);
    return NextResponse.json({ 
      error: 'Failed to analyze images',
      details: error.message 
    }, { status: 500 });
  }
} 