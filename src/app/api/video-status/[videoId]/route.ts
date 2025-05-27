import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { updateVideoStatusFromShotstack } from '@/utils/supabase-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: { videoId: string } }
) {
  const videoId = params.videoId;
  
  if (!videoId) {
    return NextResponse.json({ error: 'Video ID is required' }, { status: 400 });
  }

  try {
    // Get the video record from the database
    const supabase = createClient();
    const { data: videoRecord, error } = await supabase
      .from('video_records_rezu')
      .select('*')
      .eq('id', videoId)
      .single();

    if (error || !videoRecord) {
      console.error('Error retrieving video record:', error);
      return NextResponse.json({ error: 'Video record not found' }, { status: 404 });
    }

    // If the video is already completed or failed, just return the current status
    if (videoRecord.status === 'completed' || videoRecord.status === 'failed') {
      return NextResponse.json({
        id: videoRecord.id,
        status: videoRecord.status,
        videoUrl: videoRecord.final_video_url,
        errorMessage: videoRecord.error_message,
        updatedAt: videoRecord.updated_at,
      });
    }

    // If we have a Shotstack ID, check its status
    if (videoRecord.shotstack_id) {
      const updatedStatus = await updateVideoStatusFromShotstack(videoId, videoRecord.shotstack_id);
      
      if (updatedStatus) {
        // Fetch the updated record
        const { data: updatedRecord } = await supabase
          .from('video_records_rezu')
          .select('*')
          .eq('id', videoId)
          .single();

        if (updatedRecord) {
          return NextResponse.json({
            id: updatedRecord.id,
            status: updatedRecord.status,
            videoUrl: updatedRecord.final_video_url,
            errorMessage: updatedRecord.error_message,
            updatedAt: updatedRecord.updated_at,
          });
        }
      }
    }

    // If we couldn't update the status or don't have a Shotstack ID, return the current record
    return NextResponse.json({
      id: videoRecord.id,
      status: videoRecord.status,
      videoUrl: videoRecord.final_video_url,
      errorMessage: videoRecord.error_message,
      updatedAt: videoRecord.updated_at,
    });

  } catch (error: any) {
    console.error('Error checking video status:', error);
    return NextResponse.json(
      { error: 'Failed to check video status', details: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic'; 