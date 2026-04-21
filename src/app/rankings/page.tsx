import type { Metadata } from 'next';
import { RankingsBoard } from '@/components/monitoring/rankings-board';

export const metadata: Metadata = {
  title: '评分榜 - LLM 模型评测台',
  description: '按评分、成功率、均值耗时和实时耗时查看模型排行榜。',
};

export default function RankingsPage() {
  return <RankingsBoard />;
}
