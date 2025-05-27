import { NextRequest, NextResponse } from 'next/server';

// Shotstack API settings
const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || 'ovtvkcufDaBDRJnsTLHkMB3eLG6ytwlRoUAPAHPq';
const SHOTSTACK_ENDPOINT = process.env.SHOTSTACK_ENDPOINT || 'https://api.shotstack.io/edit/stage';

// Interface for segment timing
interface SegmentTiming {
  imageUrl: string;
  duration: number; // in seconds
}

// Interface for the processing request
interface ProcessSegmentedVideoRequest {
  videoId: string;
  imageUrls: string[];
  audioUrl: string;
  subtitlesUrl?: string;
  segmentTimings: SegmentTiming[];
  thumbnailUrl?: string;
}

export async function POST(request: NextRequest) {
  console.log('🎬 [PROCESS-SEGMENTED-VIDEO] Starting video processing request');
  
  try {
    const requestBody = await request.json();
    console.log('📥 [PROCESS-SEGMENTED-VIDEO] Request body received:', {
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
    }: ProcessSegmentedVideoRequest = requestBody;

    console.log(`🎬 [PROCESS-SEGMENTED-VIDEO] Processing segmented video ${videoId} with ${imageUrls.length} scenes`);
    console.log(`📊 [PROCESS-SEGMENTED-VIDEO] Using precise ffprobe durations for image timing:`);

    // Validation
    if (!videoId || !imageUrls || !audioUrl || !segmentTimings) {
      console.error('❌ [PROCESS-SEGMENTED-VIDEO] Validation failed: Missing required parameters', {
        hasVideoId: !!videoId,
        hasImageUrls: !!imageUrls,
        hasAudioUrl: !!audioUrl,
        hasSegmentTimings: !!segmentTimings
      });
      return NextResponse.json({ 
        error: 'Missing required parameters for video processing' 
      }, { status: 400 });
    }

    if (imageUrls.length !== segmentTimings.length) {
      console.error('❌ [PROCESS-SEGMENTED-VIDEO] Validation failed: Mismatch between images and timings', {
        imageUrlsLength: imageUrls.length,
        segmentTimingsLength: segmentTimings.length
      });
      return NextResponse.json({ 
        error: 'Number of images must match number of segment timings' 
      }, { status: 400 });
    }

    console.log('✅ [PROCESS-SEGMENTED-VIDEO] Validation passed');

    // Calculate total duration and log each segment
    const totalDuration = segmentTimings.reduce((sum, timing) => sum + timing.duration, 0);
    console.log(`🎯 [PROCESS-SEGMENTED-VIDEO] Total video duration: ${totalDuration.toFixed(2)} seconds`);

    // Log detailed timing information for each image
    console.log(`\n📋 [PROCESS-SEGMENTED-VIDEO] Image-to-Duration Mapping (from ffprobe):`);
    segmentTimings.forEach((timing, index) => {
      const imageName = timing.imageUrl.split('/').pop();
      console.log(`   Scene ${index + 1}: ${timing.duration.toFixed(2)}s → ${imageName}`);
    });
    console.log(`   Total: ${totalDuration.toFixed(2)}s across ${segmentTimings.length} scenes\n`);

    // Create the video using Shotstack with precise timing
    console.log(`🎬 [PROCESS-SEGMENTED-VIDEO] Starting Shotstack video creation with precise segment timing...`);
    const videoUrl = await createSegmentedVideoWithShotstack({
      imageUrls,
      audioUrl,
      subtitlesUrl,
      segmentTimings,
      thumbnailUrl
    });

    console.log(`✅ [PROCESS-SEGMENTED-VIDEO] Shotstack processing completed, video URL: ${videoUrl}`);

    return NextResponse.json({
      success: true,
      videoUrl: videoUrl,
      totalDuration: totalDuration,
      scenesCount: imageUrls.length,
      message: `Segmented video created with ${imageUrls.length} scenes (${totalDuration.toFixed(2)}s)`
    });

  } catch (error: any) {
    console.error('❌ [PROCESS-SEGMENTED-VIDEO] Critical error processing segmented video:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    return NextResponse.json({ 
      error: 'Failed to process segmented video',
      details: error.message 
    }, { status: 500 });
  }
}

// Function to create video using Shotstack with precise timing
async function createSegmentedVideoWithShotstack({
  imageUrls,
  audioUrl,
  subtitlesUrl,
  segmentTimings,
  thumbnailUrl
}: Omit<ProcessSegmentedVideoRequest, 'videoId'>): Promise<string> {
  console.log('🎨 [SHOTSTACK] Starting Shotstack segmented video creation with precise timing...');
  console.log(`📊 [SHOTSTACK] Processing ${imageUrls.length} images with individual durations from ffprobe`);

  try {
    // Build Shotstack timeline with precise segment timing
    console.log(`\n🔧 [SHOTSTACK] Building timeline with precise segment durations:`);
    
    const tracks = [];
    
    // Track for subtitles (captions) - Add this first if it exists
    if (subtitlesUrl) {
      console.log(`📝 [SHOTSTACK] Adding subtitles track: ${subtitlesUrl.split('/').pop()}`);
      const captionTrack = {
        clips: [
          {
            asset: {
              type: "caption",
              src: subtitlesUrl,
              font: {
                size: 70,
              },
              background: {
                padding: 15,
              },
            },
            start: 0,
            length: segmentTimings.reduce((sum, timing) => sum + timing.duration, 0),
            position: "bottom",
          }
        ]
      };
      tracks.push(captionTrack);
    }

    // Track for images with precise timing
    console.log(`🖼️ [SHOTSTACK] Creating image track with ${imageUrls.length} segments:`);
    let currentTime = 0;
    const imageClips = [];
    
    for (let i = 0; i < imageUrls.length; i++) {
      const imageUrl = imageUrls[i];
      const duration = segmentTimings[i].duration;
      
      console.log(`   Scene ${i + 1}: ${duration.toFixed(2)}s at ${currentTime.toFixed(2)}s → ${imageUrl.split('/').pop()}`);
      
      imageClips.push({
        asset: {
          type: "image",
          src: imageUrl
        },
        start: currentTime,
        length: duration,
        effect: "zoomIn", // Add some visual interest
        fit: "cover"
      });
      
      currentTime += duration;
    }
    
    const imageTrack = {
      clips: imageClips
    };
    tracks.push(imageTrack);

    // Track for audio
    if (audioUrl) {
      console.log(`🎵 [SHOTSTACK] Adding audio track: ${audioUrl.split('/').pop()}`);
      const audioTrack = {
        clips: [{
          asset: {
            type: "audio",
            src: audioUrl,
            volume: 1
          },
          start: 0,
          length: segmentTimings.reduce((sum, timing) => sum + timing.duration, 0)
        }]
      };
      tracks.push(audioTrack);
    }

    const timeline = {
      tracks: tracks
    };

    const shotstackPayload = {
      timeline: timeline,
      output: {
        format: "mp4",
        size: {
          width: 1920,
          height: 1080
        }
      }
    };

    console.log(`\n📤 [SHOTSTACK] Sending request to Shotstack API:`);
    console.log(`   - Total tracks: ${tracks.length}`);
    console.log(`   - Image segments: ${imageUrls.length}`);
    console.log(`   - Total duration: ${segmentTimings.reduce((sum, timing) => sum + timing.duration, 0).toFixed(2)}s`);
    console.log(`   - Audio: ${audioUrl ? 'YES' : 'NO'}`);
    console.log(`   - Subtitles: ${subtitlesUrl ? 'YES' : 'NO'}`);

    // Make Shotstack API call
    const shotstackResponse = await fetch(`${SHOTSTACK_ENDPOINT}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SHOTSTACK_API_KEY
      },
      body: JSON.stringify(shotstackPayload),
    });

    if (!shotstackResponse.ok) {
      const errorData = await shotstackResponse.json();
      console.error('❌ [SHOTSTACK] API error:', errorData);
      throw new Error(`Shotstack API error: ${shotstackResponse.status} ${shotstackResponse.statusText}. Details: ${JSON.stringify(errorData)}`);
    }

    const responseData = await shotstackResponse.json();
    const shotstackId = responseData.response.id;
    console.log(`✅ [SHOTSTACK] Render job submitted successfully. Job ID: ${shotstackId}`);

    // Poll for completion
    console.log(`⏳ [SHOTSTACK] Waiting for video rendering to complete...`);
    const videoUrl = await pollShotstackJob(shotstackId);
    
    console.log(`✅ [SHOTSTACK] Segmented video created successfully: ${videoUrl}`);
    return videoUrl;

  } catch (error: any) {
    console.error('❌ [SHOTSTACK] Error in Shotstack video creation:', {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    throw error;
  }
}

// Function to poll Shotstack job status until completion
async function pollShotstackJob(jobId: string): Promise<string> {
  const maxAttempts = 120; // 10 minutes max (120 * 5 seconds)
  let attempts = 0;
  
  console.log(`🔄 [SHOTSTACK] Polling job status for: ${jobId}`);
  
  while (attempts < maxAttempts) {
    try {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;

      const statusResponse = await fetch(`${SHOTSTACK_ENDPOINT}/render/${jobId}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": SHOTSTACK_API_KEY
        }
      });

      if (!statusResponse.ok) {
        console.warn(`⚠️ [SHOTSTACK] Status check failed (attempt ${attempts}): ${statusResponse.status}`);
        continue;
      }

      const statusData = await statusResponse.json();
      const status = statusData.response.status;
      const progress = statusData.response.progress || 0;
      
      console.log(`📊 [SHOTSTACK] Status check ${attempts}: ${status} (${progress}% complete)`);
      
      if (status === 'done' || status === 'processed') {
        const videoUrl = statusData.response.url;
        console.log(`✅ [SHOTSTACK] Rendering completed! Video URL: ${videoUrl}`);
        return videoUrl;
      } else if (status === 'failed') {
        const error = statusData.response.error || 'Unknown error';
        throw new Error(`Shotstack rendering failed: ${error}`);
      }
      
    } catch (error: any) {
      console.error(`❌ [SHOTSTACK] Error polling job status (attempt ${attempts}):`, error.message);
      if (attempts >= maxAttempts) {
        throw error;
      }
    }
  }
  
  throw new Error(`Shotstack job timed out after ${maxAttempts} attempts (${maxAttempts * 5 / 60} minutes)`);
} 