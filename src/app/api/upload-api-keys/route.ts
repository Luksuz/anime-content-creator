import { NextRequest, NextResponse } from 'next/server';
import { uploadApiKeysToDatabase } from '@/utils/supabase-utils';

export async function POST(request: NextRequest) {
  try {
    const { apiKeysText, userId } = await request.json();

    if (!apiKeysText || typeof apiKeysText !== 'string') {
      return NextResponse.json(
        { error: 'API keys text is required' },
        { status: 400 }
      );
    }

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    console.log(`Processing API key upload for user: ${userId}`);

    const result = await uploadApiKeysToDatabase(apiKeysText, userId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully uploaded ${result.count} API keys`,
      count: result.count
    });

  } catch (error: any) {
    console.error('Error in upload-api-keys API:', error);
    return NextResponse.json(
      { error: 'Internal server error during API key upload' },
      { status: 500 }
    );
  }
} 