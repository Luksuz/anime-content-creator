import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: NextRequest) {
  // Verify Shotstack signature if needed for production
  // const signature = request.headers.get('shotstack-signature');
  
  try {
    const body = await request.json();
    console.log('Received Shotstack callback:', body);
    
    // Check if this is a valid callback with required fields
    if (!body.id || !body.status) {
      return NextResponse.json({ error: 'Invalid callback data' }, { status: 400 });
    }
    
    const shotstackId = body.id;
    const status = body.status;
    const videoUrl = body.url || null;
    const errorMessage = body.error || null;
    
    // Find the video record with this Shotstack ID
    const supabase = createClient();
    const { data: videoRecords, error: findError } = await supabase
      .from('video_records_rezu')
      .select('*')
      .eq('shotstack_id', shotstackId);
    
    if (findError || !videoRecords || videoRecords.length === 0) {
      console.error('Could not find video record with Shotstack ID:', shotstackId, findError);
      return NextResponse.json({ error: 'Video record not found' }, { status: 404 });
    }
    
    // Map Shotstack status to our status
    let newStatus = 'processing';
    if (status === 'done' || status === 'processed') {
      newStatus = 'completed';
    } else if (status === 'failed') {
      newStatus = 'failed';
    }
    
    // Update the video record
    const { error: updateError } = await supabase
      .from('video_records_rezu')
      .update({
        status: newStatus,
        final_video_url: videoUrl,
        error_message: errorMessage,
        updated_at: new Date().toISOString()
      })
      .eq('shotstack_id', shotstackId);
    
    if (updateError) {
      console.error('Error updating video record:', updateError);
      return NextResponse.json({ error: 'Failed to update video record' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error: any) {
    console.error('Error handling Shotstack callback:', error);
    return NextResponse.json(
      { error: 'Failed to process callback', details: error.message || 'Unknown error' },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic'; 