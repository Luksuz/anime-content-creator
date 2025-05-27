import { NextRequest, NextResponse } from 'next/server';
import { uploadFileToSupabase } from "@/utils/supabase-utils";

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || 'YOLjjcSvBxo4mesgvuYqcJOp4SR6iBT6dtK9cteS';
const SHOTSTACK_BASE_URL = 'https://api.shotstack.io/ingest/stage';

interface PollTranscriptionRequestBody {
  transcriptionJobId: string;
  userId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: PollTranscriptionRequestBody = await request.json();
    const { transcriptionJobId, userId } = body;

    if (!transcriptionJobId) {
      return NextResponse.json({ error: 'Transcription job ID is required.' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required.' }, { status: 400 });
    }

    console.log(`🔍 Polling transcription status for job: ${transcriptionJobId}`);

    // Check transcription status
    const statusResponse = await fetch(`${SHOTSTACK_BASE_URL}/sources/${transcriptionJobId}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "x-api-key": SHOTSTACK_API_KEY
      }
    });

    if (!statusResponse.ok) {
      const errorText = await statusResponse.text();
      console.error(`❌ Error checking Shotstack status:`, errorText);
      return NextResponse.json({ 
        error: 'Failed to check transcription status',
        details: errorText 
      }, { status: statusResponse.status });
    }

    const statusData = await statusResponse.json();
    const status = statusData.data?.attributes?.status;
    const transcriptionStatus = statusData.data?.attributes?.outputs?.transcription?.status;

    console.log(`📊 Transcription status: ${status} / transcription: ${transcriptionStatus}`);

    // If transcription is complete, download and save the SRT file
    if (status === 'ready' && transcriptionStatus === 'ready') {
      const transcriptionUrl = statusData.data.attributes.outputs.transcription.url;
      
      console.log(`📥 Downloading transcription from: ${transcriptionUrl}`);
      
      // Download SRT content
      const srtResponse = await fetch(transcriptionUrl);
      if (!srtResponse.ok) {
        throw new Error(`Failed to download SRT content: ${srtResponse.status}`);
      }

      const srtContent = await srtResponse.text();

      // Upload to our Supabase storage
      const timestamp = Date.now();
      const fileName = `transcription_${timestamp}.srt`;
      const destinationPath = `${userId}/subtitles/${fileName}`;

      const srtBuffer = Buffer.from(srtContent, 'utf-8');
      const supabaseUrl = await uploadFileToSupabase(srtBuffer, destinationPath, 'text/srt');

      if (!supabaseUrl) {
        throw new Error("Failed to upload SRT to Supabase storage");
      }

      console.log(`✅ Transcription completed and uploaded: ${supabaseUrl}`);

      return NextResponse.json({
        status: 'completed',
        subtitlesUrl: supabaseUrl,
        message: 'Transcription completed successfully'
      });
    } else if (status === 'failed' || transcriptionStatus === 'failed') {
      console.error(`❌ Transcription job failed`);
      return NextResponse.json({
        status: 'failed',
        error: 'Transcription job failed'
      });
    } else {
      // Still processing
      return NextResponse.json({
        status: 'processing',
        message: `Transcription in progress: ${status} / ${transcriptionStatus}`
      });
    }

  } catch (error: any) {
    console.error('❌ Error polling transcription:', error);
    return NextResponse.json({ 
      error: 'Failed to poll transcription status',
      details: error.message 
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic'; 