import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToSupabase } from "@/utils/supabase-utils";

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || 'YOLjjcSvBxo4mesgvuYqcJOp4SR6iBT6dtK9cteS';
const SHOTSTACK_BASE_URL = 'https://api.shotstack.io/ingest/stage';

interface GenerateShotstackSubtitlesRequestBody {
  audioUrl: string;
  userId: string;
}

/**
 * Generates SRT subtitles from an audio file using Shotstack's ingest API
 * @param audioUrl URL of the audio file to generate subtitles from
 * @param userId User ID for file organization
 * @returns URL of the generated SRT file stored in Supabase
 */
async function generateShotstackSubtitles(audioUrl: string, userId: string): Promise<string> {
  console.log(`🔤 Generating Shotstack subtitles for audio: ${audioUrl}`);
  
  // Step 1: Submit the request to generate transcription
  const ingestResponse = await fetch(`${SHOTSTACK_BASE_URL}/sources`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": SHOTSTACK_API_KEY
    },
    body: JSON.stringify({
      url: audioUrl,
      outputs: {
        transcription: {
          format: "srt"
        }
      }
    })
  });

  if (!ingestResponse.ok) {
    const errorData = await ingestResponse.json();
    console.error("❌ Error submitting Shotstack transcription request:", errorData);
    throw new Error(`Failed to submit transcription request: ${ingestResponse.status} ${ingestResponse.statusText}`);
  }

  const ingestData = await ingestResponse.json();
  console.log("📝 Shotstack transcription job submitted:", ingestData);
  
  if (!ingestData.data || !ingestData.data.id) {
    throw new Error("No job ID received from Shotstack transcription request");
  }
  
  const jobId = ingestData.data.id;
  console.log(`🆔 Shotstack transcription job ID: ${jobId}`);
  
  // Step 2: Poll for completion
  let isComplete = false;
  let subtitlesUrl = null;
  let attempts = 0;
  const maxAttempts = 60; // Maximum 60 attempts (5 minutes at 5-second intervals)
  
  console.log("⏳ Waiting for Shotstack transcription to complete...");
  
  while (!isComplete && attempts < maxAttempts) {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between checks
    
    const statusResponse = await fetch(`${SHOTSTACK_BASE_URL}/sources/${jobId}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "x-api-key": SHOTSTACK_API_KEY
      }
    });
    
    if (!statusResponse.ok) {
      console.error(`❌ Error checking Shotstack status (attempt ${attempts}):`, await statusResponse.text());
      continue;
    }
    
    const statusData = await statusResponse.json();
    console.log(`🔍 Shotstack status check ${attempts}:`, statusData.data.attributes.status);
    
    if (statusData.data.attributes.status === "ready" && 
        statusData.data.attributes.outputs.transcription.status === "ready") {
      isComplete = true;
      subtitlesUrl = statusData.data.attributes.outputs.transcription.url;
      console.log("✅ Shotstack transcription complete!");
      console.log(`🔗 Shotstack subtitles URL: ${subtitlesUrl}`);
    } else if (statusData.data.attributes.status === "failed" || 
               statusData.data.attributes.outputs.transcription.status === "failed") {
      throw new Error("Shotstack transcription job failed");
    }
  }
  
  if (!isComplete) {
    throw new Error(`Shotstack transcription not completed after ${maxAttempts} attempts`);
  }

  // Step 3: Download and re-upload SRT content to our Supabase storage
  console.log(`📥 Downloading Shotstack transcription content...`);
  const srtResponse = await fetch(subtitlesUrl);
  if (!srtResponse.ok) {
    throw new Error(`Failed to download SRT content from Shotstack: ${srtResponse.status}`);
  }

  const srtContent = await srtResponse.text();

  // Upload to our Supabase storage
  const timestamp = Date.now();
  const fileName = `shotstack_subtitles_${timestamp}.srt`;
  const destinationPath = `${userId}/subtitles/${fileName}`;

  const srtBuffer = Buffer.from(srtContent, 'utf-8');
  const supabaseUrl = await uploadFileToSupabase(srtBuffer, destinationPath, 'text/srt');

  if (!supabaseUrl) {
    throw new Error("Failed to upload SRT to Supabase storage");
  }

  console.log(`✅ Shotstack subtitles uploaded to Supabase: ${supabaseUrl}`);
  return supabaseUrl;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateShotstackSubtitlesRequestBody = await request.json();
    const { audioUrl, userId } = body;

    if (!audioUrl) {
      return NextResponse.json({ error: 'Audio URL is required.' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    console.log(`🎯 Starting Shotstack subtitle generation for user: ${userId}`);
    console.log(`🎵 Audio URL: ${audioUrl}`);

    const subtitlesUrl = await generateShotstackSubtitles(audioUrl, userId);

    return NextResponse.json({
      success: true,
      subtitlesUrl: subtitlesUrl,
      message: 'Subtitles generated successfully using Shotstack transcription'
    });

  } catch (error: any) {
    console.error('Error in Shotstack subtitle generation:', error);
    return NextResponse.json({ 
      error: 'Failed to generate subtitles using Shotstack',
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic'; 