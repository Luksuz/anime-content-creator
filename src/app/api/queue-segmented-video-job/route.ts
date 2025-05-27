import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/client';

// Interface for segment timing
interface SegmentTiming {
  imageUrl: string;
  duration: number; // in seconds
}

// Interface for the job request
interface QueueSegmentedVideoJobRequest {
  videoId: string;
  imageUrls: string[];
  audioUrl: string;
  subtitlesUrl?: string;
  segmentTimings: SegmentTiming[];
  thumbnailUrl?: string;
}

export async function POST(request: NextRequest) {
  console.log('🎬 [QUEUE-SEGMENTED-VIDEO] Starting video job queuing');
  
  try {
    const requestBody = await request.json();
    console.log('📥 [QUEUE-SEGMENTED-VIDEO] Request body received:', {
      videoId: requestBody.videoId,
      imageUrlsCount: requestBody.imageUrls?.length || 0,
      hasAudioUrl: !!requestBody.audioUrl,
      hasSubtitlesUrl: !!requestBody.subtitlesUrl,
      segmentTimingsCount: requestBody.segmentTimings?.length || 0,
      hasThumbnailUrl: !!requestBody.thumbnailUrl
    });

    const {
      videoId,
      imageUrls,
      audioUrl,
      subtitlesUrl,
      segmentTimings,
      thumbnailUrl
    }: QueueSegmentedVideoJobRequest = requestBody;

    // Validation
    if (!videoId || !imageUrls || !audioUrl || !segmentTimings) {
      console.error('❌ [QUEUE-SEGMENTED-VIDEO] Validation failed: Missing required parameters', {
        hasVideoId: !!videoId,
        hasImageUrls: !!imageUrls,
        hasAudioUrl: !!audioUrl,
        hasSegmentTimings: !!segmentTimings
      });
      return NextResponse.json({ 
        error: 'Missing required parameters for video job' 
      }, { status: 400 });
    }

    if (imageUrls.length !== segmentTimings.length) {
      console.error('❌ [QUEUE-SEGMENTED-VIDEO] Validation failed: Mismatch between images and timings', {
        imageUrlsLength: imageUrls.length,
        segmentTimingsLength: segmentTimings.length
      });
      return NextResponse.json({ 
        error: 'Number of images must match number of segment timings' 
      }, { status: 400 });
    }

    console.log(`✅ [QUEUE-SEGMENTED-VIDEO] Validation passed - Queuing segmented video job ${videoId} with ${imageUrls.length} scenes`);

    // Process the video with precise timing
    console.log('🚀 [QUEUE-SEGMENTED-VIDEO] Starting video processing...');
    const result = await processSegmentedVideo({
      videoId,
      imageUrls,
      audioUrl,
      subtitlesUrl,
      segmentTimings,
      thumbnailUrl
    });

    console.log('✅ [QUEUE-SEGMENTED-VIDEO] Video processing completed successfully');

    return NextResponse.json({
      success: true,
      jobId: videoId,
      message: 'Segmented video processing queued successfully'
    });

  } catch (error: any) {
    console.error('❌ [QUEUE-SEGMENTED-VIDEO] Critical error queuing segmented video job:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    return NextResponse.json({ 
      error: 'Failed to queue segmented video job',
      details: error.message 
    }, { status: 500 });
  }
}

// Function to process segmented video with precise timing
async function processSegmentedVideo({
  videoId,
  imageUrls,
  audioUrl,
  subtitlesUrl,
  segmentTimings,
  thumbnailUrl
}: QueueSegmentedVideoJobRequest): Promise<void> {
  console.log(`🎬 [PROCESS-SEGMENTED-VIDEO] Starting processing for video ${videoId}`);
  
  const supabase = createClient();
  console.log('🗄️ [PROCESS-SEGMENTED-VIDEO] Supabase client initialized');

  try {
    // Update status to processing
    console.log(`📝 [PROCESS-SEGMENTED-VIDEO] Updating status to processing for video ${videoId}`);
    const updateResult = await supabase
      .from('video_records_rezu')
      .update({ 
        status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId);

    if (updateResult.error) {
      console.error('❌ [PROCESS-SEGMENTED-VIDEO] Failed to update status to processing:', updateResult.error);
      throw new Error(`Failed to update status: ${updateResult.error.message}`);
    }

    console.log(`✅ [PROCESS-SEGMENTED-VIDEO] Status updated to processing for video ${videoId}`);

    console.log(`🎬 [PROCESS-SEGMENTED-VIDEO] Starting segmented video processing for job ${videoId}`);

    // Create the video processing request with timing data
    const processingUrl = `http://localhost:3000/api/process-segmented-video`;
    console.log(`📡 [PROCESS-SEGMENTED-VIDEO] Making request to: ${processingUrl}`);
    
    const requestPayload = {
      videoId,
      imageUrls,
      audioUrl,
      subtitlesUrl,
      segmentTimings,
      thumbnailUrl,
    };
    
    console.log(`📦 [PROCESS-SEGMENTED-VIDEO] Request payload:`, {
      videoId,
      imageUrlsCount: imageUrls.length,
      hasAudioUrl: !!audioUrl,
      hasSubtitlesUrl: !!subtitlesUrl,
      segmentTimingsCount: segmentTimings.length,
      hasThumbnailUrl: !!thumbnailUrl
    });

    const videoProcessingResponse = await fetch(processingUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestPayload),
    });

    console.log(`📡 [PROCESS-SEGMENTED-VIDEO] Processing response status: ${videoProcessingResponse.status}`);

    if (!videoProcessingResponse.ok) {
      const errorText = await videoProcessingResponse.text();
      console.error('❌ [PROCESS-SEGMENTED-VIDEO] Video processing failed:', {
        status: videoProcessingResponse.status,
        statusText: videoProcessingResponse.statusText,
        responseText: errorText.substring(0, 1000)
      });
      throw new Error(`Video processing failed: ${videoProcessingResponse.status} ${videoProcessingResponse.statusText}. Response: ${errorText.substring(0, 200)}`);
    }

    let processingResult;
    try {
      processingResult = await videoProcessingResponse.json();
      console.log('📊 [PROCESS-SEGMENTED-VIDEO] Processing result received:', {
        hasVideoUrl: !!processingResult.videoUrl,
        success: processingResult.success,
        message: processingResult.message
      });
    } catch (jsonError: any) {
      console.error('❌ [PROCESS-SEGMENTED-VIDEO] Failed to parse processing response as JSON:', jsonError.message);
      throw new Error(`Invalid JSON response from video processing: ${jsonError.message}`);
    }
    
    if (processingResult.videoUrl) {
      // Update record with success and clear the metadata from error_message
      console.log(`💾 [PROCESS-SEGMENTED-VIDEO] Updating record with success for video ${videoId}`);
      const successUpdateResult = await supabase
        .from('video_records_rezu')
        .update({ 
          status: 'completed',
          final_video_url: processingResult.videoUrl,
          error_message: null, // Clear metadata on success
          updated_at: new Date().toISOString()
        })
        .eq('id', videoId);

      if (successUpdateResult.error) {
        console.error('❌ [PROCESS-SEGMENTED-VIDEO] Failed to update record with success:', successUpdateResult.error);
        throw new Error(`Failed to update record with success: ${successUpdateResult.error.message}`);
      }

      console.log(`✅ [PROCESS-SEGMENTED-VIDEO] Segmented video processing completed for job ${videoId}: ${processingResult.videoUrl}`);
    } else {
      console.error('❌ [PROCESS-SEGMENTED-VIDEO] No video URL returned from processing');
      throw new Error('No video URL returned from processing');
    }

  } catch (error: any) {
    console.error(`❌ [PROCESS-SEGMENTED-VIDEO] Segmented video processing failed for job ${videoId}:`, {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // Update record with actual error message (preserving metadata)
    console.log(`💾 [PROCESS-SEGMENTED-VIDEO] Updating record with error for video ${videoId}`);
    const errorUpdateResult = await supabase
      .from('video_records_rezu')
      .update({ 
        status: 'failed',
        error_message: error.message, // Replace metadata with actual error
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId);

    if (errorUpdateResult.error) {
      console.error('❌ [PROCESS-SEGMENTED-VIDEO] Failed to update record with error:', errorUpdateResult.error);
    }

    throw error;
  }
} 