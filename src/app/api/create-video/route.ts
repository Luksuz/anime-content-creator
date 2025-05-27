import { NextRequest, NextResponse } from 'next/server';
import { CreateVideoRequestBody, CreateVideoResponse } from '@/types/video-generation';
import { createClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';
import { getAudioDuration } from '@/utils/supabase-utils';

// Shotstack API settings from environment variables
const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || 'ovtvkcufDaBDRJnsTLHkMB3eLG6ytwlRoUAPAHPq';
const SHOTSTACK_ENDPOINT = process.env.SHOTSTACK_ENDPOINT || 'https://api.shotstack.io/edit/stage';

// Constant for dust overlay URL
const DUST_OVERLAY_URL = 'https://byktarizdjtreqwudqmv.supabase.co/storage/v1/object/public/video-generator//overlay.webm';

/**
 * Checks if a URL is accessible by making a HEAD request
 * @param url URL to check
 * @returns boolean indicating if the URL is accessible
 */
async function isUrlAccessible(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    return response.ok;
  } catch (error) {
    console.warn(`Failed to access URL: ${url}`, error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateVideoRequestBody = await request.json();
    const { imageUrls, audioUrl, subtitlesUrl, userId, thumbnailUrl } = body;
    
    console.log(`📋 Subtitle configuration:
      - Subtitles URL provided: ${subtitlesUrl ? 'YES' : 'NO'}
      - Subtitles URL: ${subtitlesUrl || 'None'}
    `);

    // Validate inputs
    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json<CreateVideoResponse>({ error: 'Image URLs are required.' }, { status: 400 });
    }
    if (!audioUrl) {
      return NextResponse.json<CreateVideoResponse>({ error: 'Audio URL is required.' }, { status: 400 });
    }
    if (!userId) {
      return NextResponse.json<CreateVideoResponse>({ error: 'User ID is required.' }, { status: 400 });
    }

    // Generate a unique ID for this video
    const videoId = uuidv4();
    console.log(`Starting video creation with ID: ${videoId} for user: ${userId}`);

    // Get audio duration to set video length
    console.log('Getting audio duration for timeline...');
    const audioDuration = await getAudioDuration(audioUrl);
    
    // Calculate timeline durations
    // If we can't get audio duration, default to 5 minutes
    const totalDuration = audioDuration || 300; 
    // Each image gets equal time in the slideshow
    const imageDuration = totalDuration / imageUrls.length;
    
    console.log(`Slideshow configuration:
      - Total duration: ${totalDuration.toFixed(1)} seconds
      - Number of images: ${imageUrls.length}
      - Duration per image: ${imageDuration.toFixed(1)} seconds`);
    
    // Check if the dust overlay is accessible
    const isOverlayAvailable = await isUrlAccessible(DUST_OVERLAY_URL);
    console.log(`Dust overlay availability check: ${isOverlayAvailable ? 'Available' : 'Not available'}`);

    // Initialize tracks array
    let tracks = [];

    // Track for subtitles (captions) - Add this first if it exists
    if (subtitlesUrl) {
      console.log(`Adding subtitles to video: ${subtitlesUrl}`);
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
            length: totalDuration,
            position: "bottom",
            
          }
        ]
      };
      tracks.push(captionTrack);
    }

    // Track for images - Create slideshow with alternating zoom effects
    console.log(`🎬 Creating slideshow with ${imageUrls.length} images:`);
    const imageClips = imageUrls.map((url, index) => {
      const startTime = index * imageDuration;
      // Alternate between zoom effects for visual interest
      const effects = ["zoomIn", "zoomOut"];
      const selectedEffect = effects[index % effects.length];
      
      console.log(`   Image ${index + 1}: ${selectedEffect} effect, ${imageDuration.toFixed(2)}s at ${startTime.toFixed(2)}s`);
      
      return {
        asset: {
          type: "image",
          src: url
        },
        start: startTime,
        length: imageDuration,
        effect: "slideDown",
        fit: "cover"
      };
    });

    const imageTrack = {
      clips: imageClips
    };
    tracks.push(imageTrack);

    // Track for main audio (if audioUrl is present)
    if (audioUrl) {
        const audioTrack = {
            clips: [{
                asset: {
                    type: "audio",
                    src: audioUrl,
                    volume: 1 // Ensure audio is audible
                },
                start: 0,
                length: totalDuration // Audio plays for the whole duration
            }]
        };
        tracks.push(audioTrack);
    }
    
    // Log the track structure for debugging
    console.log('📊 Final track structure:');
    tracks.forEach((track, index) => {
      const assetType = track.clips[0]?.asset?.type || 'unknown';
      console.log(`  Track ${index}: ${assetType}`);
    });

    const timeline: any = {
      tracks: tracks
    };

    const shotstackPayload = {
      timeline: timeline,
      output: {
        format: "mp4",
        size: {
          width: 1280,
          height: 720
        }
      },
      callback: process.env.SHOTSTACK_CALLBACK_URL
    };

    console.log(JSON.stringify(shotstackPayload, null, 2));

    console.log("📤 Sending Shotstack API request with payload summary:");
    console.log(`- Total tracks: ${tracks.length}`);
    console.log(`- Images: ${imageUrls.length}`);
    console.log(`- Audio: ${audioUrl ? 'YES' : 'NO'}`);
    console.log(`- Subtitles: ${subtitlesUrl ? 'Manual file' : 'Automatic'}`);
    
    // Make Shotstack API call BEFORE creating database record
    const shotstackResponse = await fetch(`${SHOTSTACK_ENDPOINT}/render`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": SHOTSTACK_API_KEY
      },
      body: JSON.stringify(shotstackPayload),
    });

    // If Shotstack returns an error, return it directly to user without saving any record
    if (!shotstackResponse.ok) {
      const errorData = await shotstackResponse.json();
      console.error('Shotstack API error:', errorData);
      
      return NextResponse.json<CreateVideoResponse>(
        { 
          error: 'Failed to create video with Shotstack API', 
          details: errorData.message || JSON.stringify(errorData) 
        },
        { status: shotstackResponse.status }
      );
    }

    const responseData = await shotstackResponse.json();
    const shotstackId = responseData.response.id;
    console.log("Response from Shotstack API:", responseData);
    console.log("Shotstack ID:", shotstackId);

    // Only create database record AFTER Shotstack successfully accepts the job
    const supabase = createClient();
    
    const { error: dbError } = await supabase
      .from('video_records_rezu')
      .insert({
        id: videoId,
        user_id: userId,
        status: 'processing',
        shotstack_id: shotstackId,
        image_urls: imageUrls,
        audio_url: audioUrl,
        subtitles_url: subtitlesUrl,
        // Use provided thumbnail URL if available, otherwise fall back to first image
        thumbnail_url: thumbnailUrl || imageUrls[0],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });

    if (dbError) {
      console.error('Error creating video record in database:', dbError);
      return NextResponse.json<CreateVideoResponse>(
        { error: 'Failed to create video record.', details: dbError.message },
        { status: 500 }
      );
    }

    console.log(`✅ Video record created successfully with Shotstack ID: ${shotstackId}`);

    // Return success response with video ID
    return NextResponse.json<CreateVideoResponse>({
      message: 'Video creation job started successfully',
      video_id: videoId
    }, { status: 202 });

  } catch (error: any) {
    console.error('Error in /api/create-video route:', error);
    return NextResponse.json<CreateVideoResponse>(
      { error: 'Failed to process video creation request', details: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
