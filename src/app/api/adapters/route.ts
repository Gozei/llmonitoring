/**
 * GET /api/adapters - 获取可用适配器列表
 */

import { NextResponse } from 'next/server';
import { adapterRegistry } from '@/lib/monitoring/registry';

export async function GET() {
  try {
    const adapters = adapterRegistry.getAllAdaptersInfo();
    return NextResponse.json({ success: true, adapters });
  } catch (error) {
    console.error('Error fetching adapters:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to fetch adapters' },
      { status: 500 }
    );
  }
}
