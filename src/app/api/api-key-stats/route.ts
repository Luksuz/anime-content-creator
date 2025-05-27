import { NextRequest, NextResponse } from 'next/server';
import { getApiKeyStatistics } from '@/utils/supabase-utils';

export async function GET(request: NextRequest) {
  try {
    console.log('📊 Fetching API key statistics for admin dashboard');

    const stats = await getApiKeyStatistics();

    if (!stats.success) {
      return NextResponse.json(
        { error: stats.error || 'Failed to fetch API key statistics' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      statistics: {
        validCount: stats.validCount,
        invalidCount: stats.invalidCount,
        totalCount: stats.totalCount
      }
    });

  } catch (error: any) {
    console.error('Error in api-key-stats API:', error);
    return NextResponse.json(
      { error: 'Internal server error while fetching API key statistics' },
      { status: 500 }
    );
  }
} 