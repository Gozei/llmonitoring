/**
 * 历史记录 API
 * GET /api/history/[modelId] - 获取模型的历史记录
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPingRecordsHistory, getModelById, getPlatformById } from '@/lib/monitoring/database';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ modelId: string }> }
) {
  try {
    const { modelId } = await params;
    const id = parseInt(modelId, 10);

    if (isNaN(id)) {
      return NextResponse.json(
        { success: false, error: 'Invalid model ID' },
        { status: 400 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 1000);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const model = await getModelById(id);
    if (!model) {
      return NextResponse.json(
        { success: false, error: 'Model not found' },
        { status: 404 }
      );
    }

    const platform = await getPlatformById(model.platform_id);
    const history = await getPingRecordsHistory(id, limit, offset);

    return NextResponse.json({
      success: true,
      data: {
        model,
        platform,
        records: history,
        pagination: {
          limit,
          offset,
          has_more: history.length === limit,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching history:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch history' },
      { status: 500 }
    );
  }
}
