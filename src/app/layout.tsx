import type { Metadata } from "next";
import "./globals.css";
import TopBar from "@/components/TopBar";
import Footer from "@/components/Footer";
import { panel } from "@/lib/npsData";
import { etf } from "@/lib/etfData";
import { radarData } from "@/lib/radarData";

export const metadata: Metadata = {
  title: "주부 레이더 — 주식·부동산·ETF·국민연금",
  description:
    "주식(주)과 부동산(부)을 한 이름에. ETF 실시간 수급·테마, 국민연금 포트폴리오, 수도권 주택시장까지 — 빠른 돈과 느린 돈을 함께 보는 시장 레이더.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="min-h-screen antialiased">
        <TopBar etfAsOf={etf.asOf} npsAsOf={`${panel.curYear}년 말`} radarAsOf={radarData.asOf} />
        <main className="container-page py-8">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
