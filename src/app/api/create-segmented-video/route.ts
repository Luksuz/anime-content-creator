import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/client';

// Interface for segment timing
interface SegmentTiming {
  imageUrl: string;
  duration: number; // in seconds
}

// Interface for the request body
interface CreateSegmentedVideoRequest {
  imageUrls: string[];
  audioUrl: string;
  subtitlesUrl: string;
  segmentTimings: SegmentTiming[];
  userId: string;
  thumbnailUrl?: string;
}

export async function POST(request: NextRequest) {
  console.log('🎬 [CREATE-SEGMENTED-VIDEO] Starting segmented video creation request');
  
  try {
    const requestBody = await request.json();
    console.log('📥 [CREATE-SEGMENTED-VIDEO] Request body received:', {
      imageUrlsCount: requestBody.imageUrls?.length || 0,
      hasAudioUrl: !!requestBody.audioUrl,
      hasSubtitlesUrl: !!requestBody.subtitlesUrl,
      segmentTimingsCount: requestBody.segmentTimings?.length || 0,
      userId: requestBody.userId,
      hasThumbnailUrl: !!requestBody.thumbnailUrl
    });

    const {
      imageUrls,
      audioUrl,
      subtitlesUrl,
      segmentTimings,
      userId,
      thumbnailUrl
    }: CreateSegmentedVideoRequest = requestBody;

    // Validation
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      console.error('❌ [CREATE-SEGMENTED-VIDEO] Validation failed: Invalid imageUrls', { imageUrls });
      return NextResponse.json({ 
        error: 'Image URLs array is required and cannot be empty' 
      }, { status: 400 });
    }

    if (!audioUrl || !userId) {
      console.error('❌ [CREATE-SEGMENTED-VIDEO] Validation failed: Missing audioUrl or userId', { 
        hasAudioUrl: !!audioUrl, 
        hasUserId: !!userId 
      });
      return NextResponse.json({ 
        error: 'Audio URL and userId are required' 
      }, { status: 400 });
    }

    if (!segmentTimings || !Array.isArray(segmentTimings) || segmentTimings.length === 0) {
      console.error('❌ [CREATE-SEGMENTED-VIDEO] Validation failed: Invalid segmentTimings', { segmentTimings });
      return NextResponse.json({ 
        error: 'Segment timings array is required and cannot be empty' 
      }, { status: 400 });
    }

    if (imageUrls.length !== segmentTimings.length) {
      console.error('❌ [CREATE-SEGMENTED-VIDEO] Validation failed: Mismatch between images and timings', {
        imageUrlsLength: imageUrls.length,
        segmentTimingsLength: segmentTimings.length
      });
      return NextResponse.json({ 
        error: 'Number of images must match number of segment timings' 
      }, { status: 400 });
    }

    if (imageUrls.length > 20) {
      console.error('❌ [CREATE-SEGMENTED-VIDEO] Validation failed: Too many images', {
        imageUrlsLength: imageUrls.length
      });
      return NextResponse.json({ 
        error: 'Cannot create video with more than 20 images' 
      }, { status: 400 });
    }

    console.log(`✅ [CREATE-SEGMENTED-VIDEO] Validation passed - Creating segmented video with ${imageUrls.length} images for user ${userId}`);

    // Calculate total duration
    const totalDuration = segmentTimings.reduce((sum, timing) => sum + timing.duration, 0);
    console.log(`Total video duration will be: ${totalDuration.toFixed(2)} seconds`);

    // Log timing details
    segmentTimings.forEach((timing, index) => {
      console.log(`Scene ${index + 1}: ${timing.duration.toFixed(2)}s`);
    });

    // Initialize Supabase client
    const supabase = createClient();
    console.log('🗄️ [CREATE-SEGMENTED-VIDEO] Supabase client initialized');

    // Store segment timings and extra data as JSON in the error_message field
    // (We'll use this field to store metadata for segmented videos)
    const segmentedVideoMetadata = {
      type: 'segmented',
      segment_timings: segmentTimings,
      total_duration: totalDuration,
      scenes_count: imageUrls.length
    };

    console.log('📊 [CREATE-SEGMENTED-VIDEO] Prepared metadata:', segmentedVideoMetadata);

    // Insert video job record into database
    console.log('💾 [CREATE-SEGMENTED-VIDEO] Inserting video record into database...');
    const { data: videoRecord, error: insertError } = await supabase
      .from('video_records_rezu')
      .insert({
        user_id: userId,
        status: 'pending',
        image_urls: imageUrls,
        audio_url: audioUrl,
        subtitles_url: subtitlesUrl || null,
        thumbnail_url: thumbnailUrl || null,
        error_message: JSON.stringify(segmentedVideoMetadata), // Store metadata as JSON
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('❌ [CREATE-SEGMENTED-VIDEO] Error inserting video record:', {
        error: insertError,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        code: insertError.code
      });
      return NextResponse.json({ 
        error: 'Failed to create video record',
        details: insertError.message 
      }, { status: 500 });
    }

    if (!videoRecord) {
      console.error('❌ [CREATE-SEGMENTED-VIDEO] No video record returned from database');
      return NextResponse.json({ 
        error: 'Failed to create video record - no data returned' 
      }, { status: 500 });
    }

    console.log(`✅ [CREATE-SEGMENTED-VIDEO] Video record created successfully:`, {
      id: videoRecord.id,
      status: videoRecord.status,
      userId: videoRecord.user_id
    });

    // Queue the video processing job
    try {
      console.log('🚀 [CREATE-SEGMENTED-VIDEO] Queuing video processing job...');
      const jobQueueResponse = await fetch(`http://localhost:3000/api/queue-segmented-video-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: videoRecord.id,
          imageUrls,
          audioUrl,
          subtitlesUrl,
          segmentTimings,
          thumbnailUrl,
        }),
      });

      console.log(`📡 [CREATE-SEGMENTED-VIDEO] Job queue response status: ${jobQueueResponse.status}`);

      if (!jobQueueResponse.ok) {
        const errorText = await jobQueueResponse.text();
        console.warn('⚠️ [CREATE-SEGMENTED-VIDEO] Failed to queue video processing job:', {
          status: jobQueueResponse.status,
          statusText: jobQueueResponse.statusText,
          responseText: errorText.substring(0, 500)
        });
        // Don't fail the request - the job can be picked up by the worker
      } else {
        const queueResult = await jobQueueResponse.json();
        console.log('✅ [CREATE-SEGMENTED-VIDEO] Video processing job queued successfully:', queueResult);
      }
    } catch (queueError: any) {
      console.warn('⚠️ [CREATE-SEGMENTED-VIDEO] Error queuing video job:', {
        error: queueError.message,
        stack: queueError.stack
      });
      // Don't fail the request - the job can be picked up by the worker
    }

    console.log('🎉 [CREATE-SEGMENTED-VIDEO] Segmented video creation completed successfully:', {
      videoId: videoRecord.id,
      totalDuration,
      scenesCount: imageUrls.length
    });

    return NextResponse.json({
      success: true,
      video_id: videoRecord.id,
      status: 'pending',
      message: `Segmented video creation job started with ${imageUrls.length} scenes (${totalDuration.toFixed(2)}s total)`,
      total_duration: totalDuration,
      scenes_count: imageUrls.length
    });

  } catch (error: any) {
    console.error('❌ [CREATE-SEGMENTED-VIDEO] Critical error in segmented video creation:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    return NextResponse.json({ 
      error: 'Failed to create segmented video',
      details: error.message 
    }, { status: 500 });
  }
} 