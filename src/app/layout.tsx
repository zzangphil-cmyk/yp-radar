import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";
import { panel } from "@/lib/npsData";
import { etf } from "@/lib/etfData";

export const metadata: Metadata = {
  title: "Y&P 레이더 — ETF·국민연금 수급 추적",
  description:
    "ETF 실시간 수급·테마와 국민연금 포트폴리오를 한 곳에서. 빠른 리테일 흐름(ETF)과 느린 장기자금(국민연금)을 함께 추적하는 수급 레이더.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <TopBar etfAsOf={etf.asOf} npsAsOf={`${panel.curYear}년 말`} />
        <main className="container-page py-8">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
