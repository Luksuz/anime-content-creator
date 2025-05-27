import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export async function POST(request: NextRequest) {
  try {
    const { 
      imageUrl, 
      cutPositions, 
      xCutPositions = [], 
      userId = 'unknown_user' 
    } = await request.json();

    if (!imageUrl || (!cutPositions && !xCutPositions)) {
      return NextResponse.json({ 
        error: 'Image URL and at least one type of cut positions are required' 
      }, { status: 400 });
    }

    // Validate X-axis cuts (maximum 2 allowed)
    if (xCutPositions && Array.isArray(xCutPositions) && xCutPositions.length > 2) {
      return NextResponse.json({ 
        error: 'Maximum 2 X-axis cuts allowed' 
      }, { status: 400 });
    }

    console.log(`Cutting image: ${imageUrl}`);
    console.log(`Y-axis positions:`, cutPositions || []);
    console.log(`X-axis positions:`, xCutPositions || []);

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

    // Process Y-axis cuts (vertical cuts)
    let validYCutPositions: number[] = [];
    if (cutPositions && Array.isArray(cutPositions)) {
      validYCutPositions = cutPositions
        .map((pos: number) => Math.max(0, Math.min(pos, metadata.height! - 10)))
        .filter((pos: number, index: number, arr: number[]) => {
          return index === 0 || Math.abs(pos - arr[index - 1]) >= 20;
        });
    }

    // Process X-axis cuts (horizontal cuts)
    let validXCutPositions: number[] = [];
    if (xCutPositions && Array.isArray(xCutPositions)) {
      validXCutPositions = xCutPositions
        .map((pos: number) => Math.max(0, Math.min(pos, metadata.width! - 10)))
        .filter((pos: number, index: number, arr: number[]) => {
          return index === 0 || Math.abs(pos - arr[index - 1]) >= 20;
        })
        .sort((a: number, b: number) => a - b);
      
      // For X-axis cuts, we require exactly 2 cuts to extract the middle section
      if (validXCutPositions.length > 0 && validXCutPositions.length !== 2) {
        return NextResponse.json({ 
          error: 'X-axis cutting requires exactly 2 cuts to extract the middle section. Please add exactly 2 horizontal cuts.' 
        }, { status: 400 });
      }
    }

    console.log(`Valid Y-axis positions:`, validYCutPositions);
    console.log(`Valid X-axis positions:`, validXCutPositions);

    // Determine cutting strategy
    const hasYCuts = validYCutPositions.length > 0;
    const hasXCuts = validXCutPositions.length > 0;

    const cutImages: { 
      dataUrl: string; 
      startY: number; 
      endY: number; 
      startX: number;
      endX: number;
      height: number;
      width: number;
      buffer: string;
    }[] = [];

    if (hasXCuts && hasYCuts) {
      // Both X and Y cuts - create a grid
      await processGridCuts(imageBuffer, metadata, validXCutPositions, validYCutPositions, cutImages);
    } else if (hasXCuts) {
      // Only X cuts - horizontal strips
      await processXAxisCuts(imageBuffer, metadata, validXCutPositions, cutImages);
    } else if (hasYCuts) {
      // Only Y cuts - vertical strips (original behavior)
      await processYAxisCuts(imageBuffer, metadata, validYCutPositions, cutImages);
    } else {
      return NextResponse.json({ 
        error: 'No valid cut positions provided' 
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      cutImages,
      totalPieces: cutImages.length,
      message: `Successfully cut image into ${cutImages.length} pieces (ready for preview)`
    });

  } catch (error: any) {
    console.error('Error cutting image:', error);
    return NextResponse.json({ 
      error: 'Failed to cut image',
      details: error.message 
    }, { status: 500 });
  }
}

// Process Y-axis cuts (original vertical cutting)
async function processYAxisCuts(
  imageBuffer: Buffer, 
  metadata: any, 
  validYCutPositions: number[], 
  cutImages: any[]
) {
  const sortedPositions = [0, ...validYCutPositions.sort((a: number, b: number) => a - b), metadata.height! - 5];
  const uniquePositions = Array.from(new Set(sortedPositions));
  
  // Skip first and last pieces - start from index 1 and end before last
  const startIndex = 1;
  const endIndex = uniquePositions.length - 2;
  
  if (endIndex <= startIndex) {
    console.log('Not enough pieces to exclude first and last - need at least 3 pieces');
    return;
  }
  
  for (let i = startIndex; i < endIndex; i++) {
    const startY = Math.floor(uniquePositions[i]);
    const endY = Math.floor(uniquePositions[i + 1]);
    const height = endY - startY;

    if (height < 20) continue;

    const maxAllowedHeight = metadata.height! - startY - 5;
    const safeHeight = Math.min(height, maxAllowedHeight);
    
    if (safeHeight < 10) continue;

    const extractParams = {
      left: 0,
      top: startY,
      width: metadata.width!,
      height: safeHeight
    };

    if (extractParams.top < 0 || extractParams.left < 0 || 
        extractParams.width <= 0 || extractParams.height <= 0 ||
        extractParams.top + extractParams.height >= metadata.height! ||
        extractParams.left + extractParams.width > metadata.width!) {
      continue;
    }

    try {
      const freshImage = sharp(imageBuffer);
      const piece = await freshImage
        .extract(extractParams)
        .png()
        .toBuffer();

      const base64 = piece.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      cutImages.push({
        dataUrl: dataUrl,
        startY,
        endY,
        startX: 0,
        endX: metadata.width!,
        height: extractParams.height,
        width: extractParams.width,
        buffer: base64
      });
      
      console.log(`✅ Y-axis piece extracted (excluding first/last): Y ${startY}-${endY} (piece ${i - startIndex + 1})`);
    } catch (extractError: any) {
      console.error(`Error extracting Y-axis piece:`, extractError.message);
      continue;
    }
  }
}

// Process X-axis cuts (horizontal cutting)
async function processXAxisCuts(
  imageBuffer: Buffer, 
  metadata: any, 
  validXCutPositions: number[], 
  cutImages: any[]
) {
  // For X-axis cuts, we require exactly 2 cuts to extract the middle section
  if (validXCutPositions.length !== 2) {
    throw new Error('X-axis cutting requires exactly 2 cuts to extract the middle section');
  }

  const sortedPositions = validXCutPositions.sort((a: number, b: number) => a - b);
  
  // Only extract the middle section (between the two cuts)
  const startX = Math.floor(sortedPositions[0]);
  const endX = Math.floor(sortedPositions[1]);
  const width = endX - startX;

  if (width < 20) {
    throw new Error('Middle section is too narrow (less than 20px)');
  }

  const maxAllowedWidth = metadata.width! - startX - 5;
  const safeWidth = Math.min(width, maxAllowedWidth);
  
  if (safeWidth < 10) {
    throw new Error('Middle section width is too small');
  }

  const extractParams = {
    left: startX,
    top: 0,
    width: safeWidth,
    height: metadata.height!
  };

  if (extractParams.top < 0 || extractParams.left < 0 || 
      extractParams.width <= 0 || extractParams.height <= 0 ||
      extractParams.top + extractParams.height > metadata.height! ||
      extractParams.left + extractParams.width >= metadata.width!) {
    throw new Error('Invalid extraction parameters for middle section');
  }

  try {
    const freshImage = sharp(imageBuffer);
    const piece = await freshImage
      .extract(extractParams)
      .png()
      .toBuffer();

    const base64 = piece.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    cutImages.push({
      dataUrl: dataUrl,
      startY: 0,
      endY: metadata.height!,
      startX,
      endX,
      height: extractParams.height,
      width: extractParams.width,
      buffer: base64
    });

    console.log(`✅ Middle section extracted: X ${startX} to ${endX} (width: ${extractParams.width}px)`);
  } catch (extractError: any) {
    console.error(`Error extracting middle section:`, extractError.message);
    throw new Error(`Failed to extract middle section: ${extractError.message}`);
  }
}

// Process both X and Y cuts (grid cutting)
async function processGridCuts(
  imageBuffer: Buffer, 
  metadata: any, 
  validXCutPositions: number[], 
  validYCutPositions: number[], 
  cutImages: any[]
) {
  // For X-axis cuts, we require exactly 2 cuts to extract the middle section
  if (validXCutPositions.length !== 2) {
    throw new Error('X-axis cutting requires exactly 2 cuts to extract the middle section');
  }

  // For X-axis: only use the middle section (between the two cuts)
  const sortedXPositions = validXCutPositions.sort((a: number, b: number) => a - b);
  const middleStartX = Math.floor(sortedXPositions[0]);
  const middleEndX = Math.floor(sortedXPositions[1]);
  
  // For Y-axis: use all cuts to create horizontal strips
  const sortedYPositions = [0, ...validYCutPositions.sort((a: number, b: number) => a - b), metadata.height! - 5];
  const uniqueYPositions = Array.from(new Set(sortedYPositions));
  
  // Skip first and last pieces - start from index 1 and end before last
  const startIndex = 1;
  const endIndex = uniqueYPositions.length - 2;
  
  if (endIndex <= startIndex) {
    console.log('Not enough pieces to exclude first and last in grid - need at least 3 Y-axis pieces');
    return;
  }
  
  // Create pieces only from the middle X section, but exclude first and last Y sections
  for (let j = startIndex; j < endIndex; j++) {
    const startY = Math.floor(uniqueYPositions[j]);
    const endY = Math.floor(uniqueYPositions[j + 1]);
    
    const width = middleEndX - middleStartX;
    const height = endY - startY;

    if (width < 20 || height < 20) continue;

    const extractParams = {
      left: middleStartX,
      top: startY,
      width: Math.min(width, metadata.width! - middleStartX - 5),
      height: Math.min(height, metadata.height! - startY - 5)
    };

    if (extractParams.top < 0 || extractParams.left < 0 || 
        extractParams.width <= 0 || extractParams.height <= 0 ||
        extractParams.top + extractParams.height >= metadata.height! ||
        extractParams.left + extractParams.width >= metadata.width!) {
      continue;
    }

    try {
      const freshImage = sharp(imageBuffer);
      const piece = await freshImage
        .extract(extractParams)
        .png()
        .toBuffer();

      const base64 = piece.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      cutImages.push({
        dataUrl: dataUrl,
        startY,
        endY,
        startX: middleStartX,
        endX: middleEndX,
        height: extractParams.height,
        width: extractParams.width,
        buffer: base64
      });

      console.log(`✅ Grid piece extracted (excluding first/last): X ${middleStartX}-${middleEndX}, Y ${startY}-${endY} (piece ${j - startIndex + 1})`);
    } catch (extractError: any) {
      console.error(`Error extracting grid piece:`, extractError.message);
      continue;
    }
  }
}

export const dynamic = 'force-dynamic'; 