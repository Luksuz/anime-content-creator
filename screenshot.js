// Full-page screenshot script using Playwright
// Install with: npm install playwright

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

// Configuration
const URL_TO_SCREENSHOT = 'https://mangadex.org/chapter/491104e9-309b-45bd-8c6d-b56ac15b513b';
const OUTPUT_DIR = '/Users/lukamindek/Desktop/abu-sahid/mixed-content-generator-rezu/webtoon';
const FILENAME = 'fullpage_screenshot.png';
const WAIT_FOR_SECONDS = 30; // Increased wait time for problematic sites

async function takeFullPageScreenshot() {
  console.log(`Taking full-page screenshot of ${URL_TO_SCREENSHOT}`);
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Launch browser with anti-detection measures
  const browser = await chromium.launch({
    headless: true, // Set to false to see what's happening
    args: [
      '--disable-web-security',
      '--disable-features=IsolateOrigins',
      '--disable-site-isolation-trials',
      '--disable-features=BlockInsecurePrivateNetworkRequests'
    ]
  });
  
  try {
    // Create a new context with special settings for problematic sites
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36',
      javaScriptEnabled: true,
      bypassCSP: true,
      ignoreHTTPSErrors: true,
      extraHTTPHeaders: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8'
      }
    });
    
    const page = await context.newPage();
    
    // More reliable approach for navigation
    try {
      console.log('Navigating to page...');
      
      // Attempt navigation with domcontentloaded instead of networkidle
      await page.goto(URL_TO_SCREENSHOT, {
        waitUntil: 'domcontentloaded',
        timeout: 90000 // 90 second timeout
      });
      
      console.log('DOM content loaded, waiting for page to stabilize...');
      
      // Wait for any essential elements that indicate the content is loaded
      // If this fails, we'll still continue with the screenshot
      try {
        // Try to wait for images to appear
        await page.waitForSelector('img', { timeout: 30000 })
          .then(() => console.log('Images found on page'));
      } catch (waitError) {
        console.log('Could not find images, but continuing anyway');
      }
      
      // Perform multiple scrolls with waits to ensure content loads
      console.log('Performing gradual scrolling to load content...');
      await autoScroll(page);
      
      // Wait for final content to load
      console.log(`Waiting ${WAIT_FOR_SECONDS} seconds for content to fully load...`);
      await page.waitForTimeout(WAIT_FOR_SECONDS * 1000);
      
      // Scroll back to top before screenshot
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1000);
      
      // Take the screenshot
      console.log('Taking screenshot...');
      const screenshotPath = path.join(OUTPUT_DIR, FILENAME);
      await page.screenshot({ 
        path: screenshotPath,
        fullPage: true
      });
      
      console.log(`Screenshot saved to: ${screenshotPath}`);
    } catch (navigationError) {
      console.error(`Navigation error: ${navigationError.message}`);
      
      // Even if navigation times out, try to take a screenshot of whatever loaded
      console.log('Attempting to take screenshot despite navigation error...');
      const screenshotPath = path.join(OUTPUT_DIR, FILENAME);
      
      try {
        // Try to scroll first to load as much as possible
        await autoScroll(page);
        await page.waitForTimeout(5000);
        
        // Take the screenshot anyway
        await page.screenshot({ 
          path: screenshotPath,
          fullPage: true
        });
        console.log(`Screenshot saved to: ${screenshotPath} (after navigation error)`);
      } catch (screenshotError) {
        console.error(`Failed to take screenshot after navigation error: ${screenshotError.message}`);
      }
    }
  } catch (error) {
    console.error('Error taking screenshot:', error);
  } finally {
    // Wait a bit before closing to ensure all operations are complete
    await new Promise(resolve => setTimeout(resolve, 5000));
    // Close the browser
    await browser.close();
  }
}

// Auto-scroll function that scrolls smoothly from top to bottom
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 1000;
      const scrollInterval = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        if (totalHeight >= scrollHeight) {
          clearInterval(scrollInterval);
          resolve();
        }
      }, 100); // slower scrolling - 200ms between scrolls
    });
  });
  
  // Pause after full scroll
  await page.waitForTimeout(2000);
  
  // Now do it once more to ensure everything loaded
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 100;
      const scrollInterval = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        
        if (totalHeight >= scrollHeight) {
          clearInterval(scrollInterval);
          resolve();
        }
      }, 200);
    });
  });
}

// Function to handle URLs from command line or configuration
async function main() {
  try {
    await takeFullPageScreenshot();
    console.log('Screenshot process completed.');
  } catch (error) {
    console.error('Unhandled error in main process:', error);
  }
}

// Run the main function
main(); 