import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToSupabase } from '@/utils/supabase-utils';

const FIRECRAWL_API_URL = 'https://api.firecrawl.dev/v1/scrape';
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

export async function POST(request: NextRequest) {
  try {
    const { url, userId = 'unknown_user' } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    console.log(`🚀 Taking screenshot using Firecrawl API: ${url}`);

    // Use Firecrawl API to capture screenshot
    const firecrawlResponse = await fetch(FIRECRAWL_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${FIRECRAWL_API_KEY}`
      },
      body: JSON.stringify({
        url: url,
        formats: ['screenshot@fullPage'],
        onlyMainContent: false,
        waitFor: 20000,
        timeout: 600000,
        proxy: "stealth",
      })
    });

    if (!firecrawlResponse.ok) {
      const errorText = await firecrawlResponse.text();
      console.error(`❌ Firecrawl API error:`, errorText);
      throw new Error(`Firecrawl API error: ${firecrawlResponse.status} ${firecrawlResponse.statusText}`);
    }

    const firecrawlData = await firecrawlResponse.json();
    console.log('📊 Firecrawl response:', {
      success: firecrawlData.success,
      hasScreenshot: !!firecrawlData.data?.screenshot,
      screenshotUrl: firecrawlData.data?.screenshot?.substring(0, 100) + '...',
      metadata: firecrawlData.data?.metadata
    });

    // Check if screenshot was successful
    if (!firecrawlData.success || !firecrawlData.data?.screenshot) {
      console.error('❌ Firecrawl API did not return a valid screenshot:', firecrawlData);
      throw new Error('Failed to capture screenshot with Firecrawl API');
    }

    const screenshotUrl = firecrawlData.data.screenshot;
    console.log(`📸 Screenshot captured: ${screenshotUrl}`);

    // Download the screenshot from Firecrawl's URL with retry logic
    let imageBuffer: ArrayBuffer;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`📥 Downloading screenshot (attempt ${retryCount + 1}/${maxRetries})...`);
        
        // Create timeout controller for environments that don't support AbortSignal.timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        try {
          const imageResponse = await fetch(screenshotUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            signal: controller.signal
          });
          
          clearTimeout(timeoutId); // Clear timeout on success
          
          if (!imageResponse.ok) {
            throw new Error(`HTTP ${imageResponse.status}: ${imageResponse.statusText}`);
          }
          
          imageBuffer = await imageResponse.arrayBuffer();
          console.log(`✅ Screenshot downloaded successfully: ${imageBuffer.byteLength} bytes`);
          break; // Success, exit retry loop
          
        } catch (fetchError: any) {
          clearTimeout(timeoutId); // Clear timeout on error
          throw fetchError;
        }
        
      } catch (downloadError: any) {
        retryCount++;
        const errorMessage = downloadError.name === 'AbortError' 
          ? 'Download timed out after 30 seconds'
          : downloadError.message;
        console.error(`❌ Download attempt ${retryCount} failed:`, errorMessage);
        
        if (retryCount >= maxRetries) {
          // If all retries failed, provide the original Firecrawl URL as fallback
          console.log(`⚠️ All download attempts failed. Returning original Firecrawl URL as fallback.`);
          console.log(`🔗 Original Firecrawl URL: ${screenshotUrl}`);
          
          return NextResponse.json({
            success: true,
            screenshotUrl: screenshotUrl, // Return the original Firecrawl URL
            originalFirecrawlUrl: screenshotUrl,
            message: 'Screenshot captured successfully (using external URL)',
            metadata: {
              fileSize: 0,
              timestamp: Date.now(),
              firecrawlMetadata: firecrawlData.data?.metadata || {},
              note: 'Screenshot is hosted on Firecrawl servers due to download issues',
              lastError: errorMessage
            }
          });
        }
        
        // Wait before retrying (exponential backoff)
        const waitTime = Math.min(1000 * Math.pow(2, retryCount - 1), 5000); // Max 5 seconds
        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    const screenshotBuffer = Buffer.from(imageBuffer!);

    console.log(`📊 Screenshot downloaded: ${screenshotBuffer.length} bytes`);

    // Upload to Supabase
        const timestamp = Date.now();
    const fileName = `firecrawl_${timestamp}.png`;
        const destinationPath = `${userId}/screenshots/${fileName}`;
        
        console.log('☁️ Uploading to Supabase...');
        const publicUrl = await uploadFileToSupabase(
          screenshotBuffer,
          destinationPath,
      'image/png'
        );

        if (!publicUrl) {
          throw new Error('Failed to upload screenshot to Supabase');
        }

    console.log('✅ Firecrawl screenshot completed:', publicUrl);

        return NextResponse.json({
          success: true,
          screenshotUrl: publicUrl,
      originalFirecrawlUrl: screenshotUrl,
      message: 'Screenshot captured successfully using Firecrawl API',
          metadata: {
            fileSize: screenshotBuffer.length,
            timestamp: timestamp,
        firecrawlMetadata: firecrawlData.data?.metadata || {}
      }
    });

  } catch (error: any) {
    console.error('❌ Error in Firecrawl image scraping:', error);
    return NextResponse.json({ 
      error: 'Failed to capture screenshot',
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic'; 