import type { Metadata } from 'next';
import { MonitoringDashboard } from '@/components/monitoring';

export const metadata: Metadata = {
  title: 'LLM 延迟监控 - 第三方大模型服务状态监控',
  description: '实时监控智谱AI、京东等第三方大模型服务的延迟和可用性',
};

export default function Home() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">LLM 延迟监控</h1>
        <p className="text-muted-foreground mt-2">
          实时监控第三方大模型服务的响应延迟和可用性状态
        </p>
      </div>
      <MonitoringDashboard autoRefresh refreshInterval={60000} />
    </div>
  );
}
