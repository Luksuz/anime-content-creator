import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToSupabase } from '@/utils/supabase-utils';

export async function POST(request: NextRequest) {
  try {
    const { cutImages, userId = 'unknown_user' } = await request.json();

    if (!cutImages || !Array.isArray(cutImages)) {
      return NextResponse.json({ 
        error: 'Cut images array is required' 
      }, { status: 400 });
    }

    console.log(`Saving ${cutImages.length} cut images for user: ${userId}`);

    const savedImages: { 
      url: string; 
      startY: number; 
      endY: number; 
      startX: number;
      endX: number;
      height: number;
      width: number;
    }[] = [];

    // Upload each cut image to Supabase
    for (let i = 0; i < cutImages.length; i++) {
      const cutImage = cutImages[i];
      
      if (!cutImage.buffer) {
        console.error(`❌ Missing buffer for piece ${i + 1}`);
        continue;
      }

      try {
        // Convert base64 back to buffer
        const imageBuffer = Buffer.from(cutImage.buffer, 'base64');

        // Upload to Supabase
        const timestamp = Date.now();
        const fileName = `cut_${i + 1}_${timestamp}.png`;
        const destinationPath = `${userId}/cut_images/${fileName}`;
        
        const publicUrl = await uploadFileToSupabase(
          imageBuffer,
          destinationPath,
          'image/png'
        );

        if (publicUrl) {
          savedImages.push({
            url: publicUrl,
            startY: cutImage.startY,
            endY: cutImage.endY,
            startX: cutImage.startX || 0,
            endX: cutImage.endX || cutImage.width || 0,
            height: cutImage.height,
            width: cutImage.width || 0
          });
          console.log(`✅ Piece ${i + 1} saved successfully: ${publicUrl}`);
        } else {
          console.error(`❌ Failed to save piece ${i + 1}`);
        }
      } catch (uploadError: any) {
        console.error(`❌ Error saving piece ${i + 1}:`, uploadError.message);
        continue;
      }
    }

    return NextResponse.json({
      success: true,
      savedImages,
      totalSaved: savedImages.length,
      message: `Successfully saved ${savedImages.length} cut images to Supabase`
    });

  } catch (error: any) {
    console.error('Error saving cut images:', error);
    return NextResponse.json({ 
      error: 'Failed to save cut images',
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic'; 