import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToSupabase } from '@/utils/supabase-utils';
import sharp from 'sharp';

export async function POST(request: NextRequest) {
  try {
    const { imageUrl, cutPositions, userId = 'unknown_user' } = await request.json();

    if (!imageUrl || !cutPositions || !Array.isArray(cutPositions)) {
      return NextResponse.json({ 
        error: 'Image URL and cut positions array are required' 
      }, { status: 400 });
    }

    console.log(`Cutting image: ${imageUrl} at positions:`, cutPositions);

    // Download the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error('Failed to download image');
    }

    const imageBuffer = Buffer.from(await response.arrayBuffer());
    
    // Get image metadata
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Could not determine image dimensions');
    }

    console.log(`Image dimensions: ${metadata.width}x${metadata.height}`);

    // Validate and clamp cut positions to image bounds
    const validCutPositions = cutPositions
      .map((pos: number) => Math.max(0, Math.min(pos, metadata.height! - 10))) // Leave 10px margin from bottom
      .filter((pos: number, index: number, arr: number[]) => {
        // Remove duplicates and positions too close to each other (minimum 20px apart)
        return index === 0 || Math.abs(pos - arr[index - 1]) >= 20;
      });

    console.log(`Original cut positions:`, cutPositions);
    console.log(`Valid cut positions:`, validCutPositions);

    // Sort cut positions and add start and end points
    const sortedPositions = [0, ...validCutPositions.sort((a: number, b: number) => a - b), metadata.height! - 5]; // Leave 5px margin from bottom
    
    // Remove duplicate positions
    const uniquePositions = Array.from(new Set(sortedPositions));
    
    console.log(`Final positions for cutting:`, uniquePositions);
    
    const cutImages: { url: string; startY: number; endY: number; height: number }[] = [];

    // Cut the image into pieces
    for (let i = 0; i < uniquePositions.length - 1; i++) {
      const startY = Math.floor(uniquePositions[i]);
      const endY = Math.floor(uniquePositions[i + 1]);
      const height = endY - startY;

      // Skip pieces that are too small (less than 20px height)
      if (height < 20) {
        console.log(`Skipping piece ${i + 1}: too small (height: ${height}px)`);
        continue;
      }

      // More conservative bounds checking
      const maxAllowedHeight = metadata.height! - startY - 5; // Always leave 5px margin
      const safeHeight = Math.min(height, maxAllowedHeight);
      
      if (safeHeight < 10) {
        console.log(`Skipping piece ${i + 1}: safe height too small (${safeHeight}px)`);
        continue;
      }

      const extractParams = {
        left: 0,
        top: startY,
        width: metadata.width!,
        height: safeHeight
      };

      // Final validation before extraction
      if (extractParams.top < 0 || 
          extractParams.left < 0 || 
          extractParams.width <= 0 || 
          extractParams.height <= 0 ||
          extractParams.top + extractParams.height >= metadata.height! ||
          extractParams.left + extractParams.width > metadata.width!) {
        console.log(`Skipping piece ${i + 1}: invalid extract parameters`, extractParams);
        continue;
      }

      console.log(`Cutting piece ${i + 1}: Y ${startY} to ${endY} (height: ${height})`);
      console.log(`Extract params:`, extractParams);
      console.log(`Image dimensions: ${metadata.width}x${metadata.height}`);
      console.log(`Validation: top + height = ${extractParams.top + extractParams.height} <= ${metadata.height!}`);

      try {
        // Create a fresh Sharp instance for each extraction to avoid any state issues
        const freshImage = sharp(imageBuffer);
        
        // Use a different approach: crop instead of extract
        // First, we'll create a region that starts from our desired Y position
        const piece = await freshImage
          .extract({
            left: 0,
            top: extractParams.top,
            width: extractParams.width,
            height: extractParams.height
          })
          .png()
          .toBuffer();

        // Upload to Supabase
        const timestamp = Date.now();
        const fileName = `cut_${i + 1}_${timestamp}.png`;
        const destinationPath = `${userId}/cut_images/${fileName}`;
        
        const publicUrl = await uploadFileToSupabase(
          piece,
          destinationPath,
          'image/png'
        );

        if (publicUrl) {
          cutImages.push({
            url: publicUrl,
            startY,
            endY,
            height: extractParams.height // Use actual extracted height
          });
          console.log(`✅ Piece ${i + 1} uploaded successfully:`, publicUrl);
        } else {
          console.error(`❌ Failed to upload piece ${i + 1}`);
        }
      } catch (extractError: any) {
        console.error(`❌ Error extracting piece ${i + 1}:`, extractError.message);
        console.error(`Failed extract params:`, extractParams);
        console.error(`Image metadata:`, { width: metadata.width, height: metadata.height });
        
        // Skip this piece and continue with the next one
        console.log(`⏭️ Skipping piece ${i + 1} and continuing with next piece`);
        continue;
      }
    }

    return NextResponse.json({
      success: true,
      cutImages,
      totalPieces: cutImages.length,
      message: `Successfully cut image into ${cutImages.length} pieces`
    });

  } catch (error: any) {
    console.error('Error cutting image:', error);
    return NextResponse.json({ 
      error: 'Failed to cut image',
      details: error.message 
    }, { status: 500 });
  }
} 