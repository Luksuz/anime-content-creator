// Crop an image by removing 200px from both sides (left and right)
// Install with: npm install sharp

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

// Function to crop an image
async function cropImage(inputPath, outputPath, cropFromSides = 200) {
  try {
    // Get the metadata of the image to determine original dimensions
    const metadata = await sharp(inputPath).metadata();
    
    // Calculate new width after cropping from both sides
    const newWidth = Math.max(metadata.width - (cropFromSides * 2), 1);
    
    // Only proceed if the image is wide enough to crop
    if (metadata.width <= cropFromSides * 2) {
      console.error(`Image ${inputPath} is too narrow to crop ${cropFromSides}px from each side (width: ${metadata.width}px)`);
      return false;
    }
    
    // Calculate the left position to start the crop
    const left = cropFromSides;
    
    // Crop the image
    await sharp(inputPath)
      .extract({ left, top: 0, width: newWidth, height: metadata.height })
      .toFile(outputPath);
    
    console.log(`Successfully cropped image: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`Error cropping image ${inputPath}:`, error);
    return false;
  }
}

// Function to process a directory of images
async function processDirectory(inputDir, outputDir, cropFromSides = 200) {
  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Get all files in the input directory
    const files = fs.readdirSync(inputDir);
    
    // Filter for image files (add more extensions if needed)
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const imageFiles = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return imageExtensions.includes(ext);
    });
    
    console.log(`Found ${imageFiles.length} images to process...`);
    
    // Process each image
    let successCount = 0;
    for (const file of imageFiles) {
      const inputPath = path.join(inputDir, file);
      const outputPath = path.join(outputDir, file);
      const success = await cropImage(inputPath, outputPath, cropFromSides);
      if (success) successCount++;
    }
    
    console.log(`Completed cropping. Successfully processed ${successCount}/${imageFiles.length} images.`);
  } catch (error) {
    console.error('Error processing directory:', error);
  }
}

// ====================================================================
// CONFIGURATION - MODIFY THESE VALUES
// ====================================================================

// MODE: Set to 'single' for processing a single image or 'directory' for processing an entire folder
const MODE = 'directory';

// SINGLE IMAGE SETTINGS (used when MODE is 'single')
const SINGLE_INPUT_IMAGE = '/Users/lukamindek/Desktop/abu-sahid/mixed-content-generator-rezu/natomanga/image.png';
const SINGLE_OUTPUT_IMAGE = '/Users/lukamindek/Desktop/abu-sahid/mixed-content-generator-rezu/natomanga/cropped_image.png';

// DIRECTORY SETTINGS (used when MODE is 'directory')
const INPUT_DIRECTORY = '/Users/lukamindek/Desktop/abu-sahid/mixed-content-generator-rezu/natomanga';
const OUTPUT_DIRECTORY = '/Users/lukamindek/Desktop/abu-sahid/mixed-content-generator-rezu/natomanga/cropped_images';

// CROP SETTINGS
const CROP_FROM_SIDES = 600; // Amount of pixels to crop from left and right sides

// ====================================================================
// END CONFIGURATION
// ====================================================================

// Main function - uses the configuration values above
async function main() {
  if (MODE === 'single') {
    console.log(`Processing single image: ${SINGLE_INPUT_IMAGE}`);
    const success = await cropImage(SINGLE_INPUT_IMAGE, SINGLE_OUTPUT_IMAGE, CROP_FROM_SIDES);
    if (success) {
      console.log('Crop completed successfully!');
    } else {
      console.error('Crop failed.');
    }
  } else if (MODE === 'directory') {
    console.log(`Processing directory: ${INPUT_DIRECTORY}`);
    await processDirectory(INPUT_DIRECTORY, OUTPUT_DIRECTORY, CROP_FROM_SIDES);
  } else {
    console.error(`Invalid mode: ${MODE}. Must be 'single' or 'directory'.`);
  }
}

// Run the main function
main().catch(console.error);
