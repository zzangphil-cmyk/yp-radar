"use client";

// 요약(결론부터) / 상세 슬라이드 토글 — 주식·ETF·국민연금 메인 탭 공용 레이아웃
import { useState, type ReactNode } from "react";

export default function SlideTabs({ summary, detail }: { summary: ReactNode; detail: ReactNode }) {
  const [tab, setTab] = useState<"s" | "d">("s");
  const Btn = ({ k, label }: { k: "s" | "d"; label: string }) => (
    <button onClick={() => setTab(k)}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${tab === k ? "bg-white/[0.12] text-white" : "bg-white/[0.04] text-white/45 hover:text-white"}`}>
      {label}
    </button>
  );
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-1">
        <Btn k="s" label="요약" />
        <Btn k="d" label="상세" />
      </div>
      {/* CSS 토글(재마운트 없음): 전환 시 상태·스크롤 유지 */}
      <div className={tab === "s" ? "" : "hidden"}>{summary}</div>
      <div className={tab === "d" ? "" : "hidden"}>{detail}</div>
    </div>
  );
}
