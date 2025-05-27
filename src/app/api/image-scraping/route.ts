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
    console.log('📊 Firecrawl response:', firecrawlData);

    // Check if screenshot was successful
    if (!firecrawlData.success || !firecrawlData.data?.screenshot) {
      throw new Error('Failed to capture screenshot with Firecrawl API');
    }

    const screenshotUrl = firecrawlData.data.screenshot;
    console.log(`📸 Screenshot captured: ${screenshotUrl}`);

    // Download the screenshot from Firecrawl's URL
    const imageResponse = await fetch(screenshotUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to download screenshot from Firecrawl');
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const screenshotBuffer = Buffer.from(imageBuffer);

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