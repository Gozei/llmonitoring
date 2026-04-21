import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'LLM Monitoring',
    template: '%s | LLM Monitoring',
  },
  description:
    '实时监控第三方大模型服务的响应延迟、TTFT、成功率和可用性状态。',
  keywords: [
    'LLM Monitoring',
    'LLM 延迟监控',
    '大模型监控',
    'TTFT',
    'SQLite',
    'Next.js',
  ],
  generator: 'Next.js',
  openGraph: {
    title: 'LLM Monitoring',
    description:
      '实时监控第三方大模型服务的响应延迟、TTFT、成功率和可用性状态。',
    siteName: 'LLM Monitoring',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`antialiased`}>
        {children}
      </body>
    </html>
  );
}
