import type { Metadata } from 'next';
import { HistoryTable } from '@/components/monitoring';

export const metadata: Metadata = {
  title: '延迟历史 - LLM 监控',
  description: '查看大模型延迟测试的历史记录',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function HistoryPage({ params }: PageProps) {
  const { id } = await params;
  const modelId = parseInt(id, 10);

  if (isNaN(modelId)) {
    return (
      <div className="container mx-auto py-8 px-4">
        <p className="text-destructive">Invalid model ID</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">延迟历史</h1>
        <p className="text-muted-foreground mt-2">
          查看大模型延迟测试的详细历史记录
        </p>
      </div>
      <HistoryTable modelId={modelId} />
    </div>
  );
}
