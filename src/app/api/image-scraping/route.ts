import { NextRequest, NextResponse } from 'next/server';
import { chromium } from 'playwright';
import { uploadFileToSupabase } from '@/utils/supabase-utils';

export async function POST(request: NextRequest) {
  try {
    const { url, userId = 'unknown_user' } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    console.log(`🚀 Taking ultra-fast screenshot of: ${url}`);

    // Launch browser with maximum performance optimizations
    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // Use single process for faster startup
        '--disable-gpu',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-features=IsolateOrigins',
        '--disable-site-isolation-trials',
        '--disable-features=BlockInsecurePrivateNetworkRequests',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-extensions',
        '--disable-plugins',
        '--disable-default-apps',
        '--disable-sync',
        '--disable-translate',
        '--hide-scrollbars',
        '--mute-audio',
        '--no-default-browser-check',
        '--no-pings',
        '--disable-logging',
        '--disable-permissions-api',
        '--disable-notifications',
        '--disable-speech-api'
      ]
    });

    try {
      // Create optimized context with minimal features
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        javaScriptEnabled: true,
        bypassCSP: true,
        ignoreHTTPSErrors: true,
        acceptDownloads: false,
        hasTouch: false,
        isMobile: false,
        locale: 'en-US',
        timezoneId: 'America/New_York',
        extraHTTPHeaders: {
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/avif,*/*;q=0.8',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      // Block unnecessary resources for maximum speed
      await context.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        const url = route.request().url();
        
        // Block heavy resources that aren't needed for screenshots
        if (
          resourceType === 'font' ||
          resourceType === 'media' ||
          resourceType === 'websocket' ||
          resourceType === 'manifest' ||
          resourceType === 'other' ||
          url.includes('analytics') ||
          url.includes('tracking') ||
          url.includes('ads') ||
          url.includes('facebook') ||
          url.includes('twitter') ||
          url.includes('google-analytics') ||
          url.includes('googletagmanager') ||
          url.includes('doubleclick') ||
          url.includes('adsystem') ||
          url.includes('amazon-adsystem') ||
          url.includes('googlesyndication') ||
          url.includes('youtube.com/embed') ||
          url.includes('vimeo.com/video') ||
          url.includes('.mp4') ||
          url.includes('.mp3') ||
          url.includes('.wav') ||
          url.includes('.ogg') ||
          url.includes('.webm')
        ) {
          route.abort();
        } else {
          route.continue();
        }
      });

      const page = await context.newPage();

      // Set aggressive timeouts for faster loading
      page.setDefaultTimeout(15000);
      page.setDefaultNavigationTimeout(20000);

      // Disable images loading initially for faster DOM load
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      });

      try {
        console.log('⚡ Navigating with speed optimizations...');
        
        // Navigate with minimal wait requirements
        await page.goto(url, {
          waitUntil: 'domcontentloaded', // Don't wait for all resources
          timeout: 20000
        });

        console.log('📄 DOM loaded, enabling images and optimizing content...');

        // Re-enable images after DOM is loaded
        await page.setExtraHTTPHeaders({
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/avif,*/*;q=0.8'
        });

        // Inject performance optimizations directly into the page
        await page.addInitScript(() => {
          // Disable smooth scrolling for faster scrolling
          document.documentElement.style.scrollBehavior = 'auto';
          
          // Disable animations and transitions
          const style = document.createElement('style');
          style.textContent = `
            *, *::before, *::after {
              animation-duration: 0.01ms !important;
              animation-delay: -0.01ms !important;
              transition-duration: 0.01ms !important;
              transition-delay: -0.01ms !important;
            }
          `;
          document.head.appendChild(style);
        });

        // Smart content loading with parallel operations
        console.log('🔄 Performing intelligent content loading...');
        
        // Run multiple optimizations in parallel
        await Promise.all([
          // Fast scroll to trigger lazy loading
          ultraFastScroll(page),
          // Wait for critical images with short timeout
          page.waitForSelector('img', { timeout: 5000 }).catch(() => {
            console.log('No images found quickly, continuing...');
          }),
          // Brief wait for any dynamic content
          page.waitForTimeout(2000)
        ]);

        // Quick scroll back to top
        await page.evaluate(() => {
          window.scrollTo({ top: 0, behavior: 'auto' });
        });
        
        // Minimal wait for scroll completion
        await page.waitForTimeout(300);

        // Take optimized screenshot with best settings for speed vs quality
        console.log('📸 Capturing optimized screenshot...');
        const screenshotBuffer = await page.screenshot({ 
          fullPage: true,
          type: 'jpeg',
          quality: 60, // Balanced quality for good compression
          animations: 'disabled' // Disable animations during screenshot
        });

        console.log(`📊 Screenshot captured: ${screenshotBuffer.length} bytes`);

        // Upload to Supabase with optimized path
        const timestamp = Date.now();
        const fileName = `fast_${timestamp}.jpg`;
        const destinationPath = `${userId}/screenshots/${fileName}`;
        
        console.log('☁️ Uploading to Supabase...');
        const publicUrl = await uploadFileToSupabase(
          screenshotBuffer,
          destinationPath,
          'image/jpeg'
        );

        if (!publicUrl) {
          throw new Error('Failed to upload screenshot to Supabase');
        }

        console.log('✅ Ultra-fast screenshot completed:', publicUrl);

        return NextResponse.json({
          success: true,
          screenshotUrl: publicUrl,
          message: 'Ultra-fast screenshot captured successfully',
          metadata: {
            fileSize: screenshotBuffer.length,
            timestamp: timestamp,
            processingTime: Date.now() - timestamp
          }
        });

      } catch (navigationError: any) {
        console.error(`❌ Navigation error: ${navigationError.message}`);
        return NextResponse.json({ 
          error: 'Failed to navigate to URL or capture screenshot',
          details: navigationError.message 
        }, { status: 500 });
      }

    } finally {
      await browser.close();
    }

  } catch (error: any) {
    console.error('❌ Error in ultra-fast image scraping:', error);
    return NextResponse.json({ 
      error: 'Failed to capture screenshot',
      details: error.message 
    }, { status: 500 });
  }
}

// Ultra-optimized scrolling function
async function ultraFastScroll(page: any) {
  await page.evaluate(async () => {
    return new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 3000; // Large scroll distance for speed
      const maxScrolls = 10; // Limit number of scrolls
      let scrollCount = 0;
      
      const scrollInterval = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        scrollCount++;
        
        // Stop if we've reached the bottom or hit max scrolls
        if (totalHeight >= scrollHeight || scrollCount >= maxScrolls) {
          clearInterval(scrollInterval);
          resolve();
        }
      }, 30); // Very fast scroll interval
    });
  });
  
  // Minimal wait after scrolling
  await page.waitForTimeout(500);
} 