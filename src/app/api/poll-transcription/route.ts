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
    const progress = statusData.data?.attributes?.progress || 0;

    console.log(`📊 Transcription status: ${status} / transcription: ${transcriptionStatus} (${progress}% complete)`);

    // Determine detailed status and user-friendly message
    let detailedStatus = 'processing';
    let userMessage = 'Processing transcription...';
    let stage = 'analyzing';
    let estimatedProgress = progress;

    if (status === 'uploading' || status === 'uploaded') {
      stage = 'uploading';
      userMessage = 'Uploading audio file to transcription service...';
      estimatedProgress = Math.max(progress, 10); // At least 10% for upload
    } else if (status === 'processing') {
      if (transcriptionStatus === 'processing') {
        stage = 'transcribing';
        userMessage = 'AI is analyzing audio and generating transcript...';
        estimatedProgress = Math.max(progress, 40); // At least 40% when actively transcribing
      } else if (transcriptionStatus === 'uploaded' || !transcriptionStatus) {
        stage = 'preparing';
        userMessage = 'Preparing audio for AI analysis...';
        estimatedProgress = Math.max(progress, 20); // At least 20% when preparing
      } else {
        stage = 'analyzing';
        userMessage = 'Analyzing audio format and quality...';
        estimatedProgress = Math.max(progress, 15); // At least 15% when analyzing
      }
    } else if (status === 'ready' && transcriptionStatus === 'processing') {
      stage = 'transcribing';
      userMessage = 'Finalizing transcript generation...';
      estimatedProgress = Math.max(progress, 80); // At least 80% when finalizing
    } else if (status === 'ready' && !transcriptionStatus) {
      stage = 'preparing';
      userMessage = 'Audio uploaded successfully, starting transcription...';
      estimatedProgress = Math.max(progress, 30); // At least 30% when ready but not started
    }

    // Add more specific progress estimation based on stage
    if (stage === 'uploading') {
      estimatedProgress = Math.min(estimatedProgress, 25);
    } else if (stage === 'preparing') {
      estimatedProgress = Math.min(Math.max(estimatedProgress, 25), 40);
    } else if (stage === 'analyzing') {
      estimatedProgress = Math.min(Math.max(estimatedProgress, 40), 60);
    } else if (stage === 'transcribing') {
      estimatedProgress = Math.min(Math.max(estimatedProgress, 60), 90);
    }

    // If transcription is complete, download and save the SRT file
    if (status === 'ready' && transcriptionStatus === 'ready') {
      const transcriptionUrl = statusData.data.attributes.outputs.transcription.url;
      
      console.log(`📥 Downloading transcription from: ${transcriptionUrl}`);
      
      try {
        // Update status to indicate we're downloading
        detailedStatus = 'downloading';
        userMessage = 'Downloading and saving transcript...';
        
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
          message: 'Transcription completed successfully!',
          stage: 'completed',
          progress: 100,
          details: {
            originalUrl: transcriptionUrl,
            fileName: fileName,
            uploadedAt: new Date().toISOString()
          }
        });
      } catch (downloadError: any) {
        console.error(`❌ Error downloading/uploading transcription:`, downloadError);
        return NextResponse.json({
          status: 'failed',
          error: 'Failed to download and save transcription',
          message: 'Transcription was generated but failed to save to our storage',
          details: downloadError.message
        });
      }
    } else if (status === 'failed' || transcriptionStatus === 'failed') {
      console.error(`❌ Transcription job failed`);
      return NextResponse.json({
        status: 'failed',
        error: 'Transcription job failed',
        message: 'The transcription service encountered an error',
        stage: 'failed',
        progress: 0
      });
    } else {
      // Still processing - return detailed status
      return NextResponse.json({
        status: 'processing',
        message: userMessage,
        stage: stage,
        progress: Math.min(estimatedProgress, 95), // Cap at 95% until actually complete
        details: {
          shotstackStatus: status,
          transcriptionStatus: transcriptionStatus,
          jobId: transcriptionJobId
        }
      });
    }

  } catch (error: any) {
    console.error('❌ Error polling transcription:', error);
    return NextResponse.json({ 
      error: 'Failed to poll transcription status',
      details: error.message,
      message: 'Unable to check transcription progress. Please try again.',
      status: 'error'
    }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic'; 