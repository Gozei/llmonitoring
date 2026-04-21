import type { Metadata } from 'next';
import { MonitoringDashboard } from '@/components/monitoring';

export const metadata: Metadata = {
  title: 'LLM 模型评测台 - 三方平台综合评分',
  description: '面向第三方大模型平台的综合质量评估、延迟观测与模型管理工作台',
};

export default function Home() {
  return (
    <div className="mx-auto max-w-[1480px] px-4 py-8 md:px-6 md:py-10">
      <div className="mb-8 max-w-3xl">
        <h1 className="text-4xl font-semibold tracking-tight">LLM 模型评测台</h1>
        <p className="mt-3 text-base text-muted-foreground">
          以综合评分为主视角观察三方平台模型表现，同时保留延迟与稳定性基线数据。
        </p>
      </div>
      <MonitoringDashboard autoRefresh refreshInterval={60000} />
    </div>
  );
}
