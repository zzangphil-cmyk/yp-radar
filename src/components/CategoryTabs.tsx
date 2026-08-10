"use client";

// 홈 대분류 탭 — 주식 / 부동산. CSS 토글(재마운트 없음)로 상태·스크롤 유지.
import { useState, type ReactNode } from "react";

export default function CategoryTabs({ stock, realestate }: { stock: ReactNode; realestate: ReactNode }) {
  const [tab, setTab] = useState<"s" | "r">("s");
  const Btn = ({ k, label, sub, on }: { k: "s" | "r"; label: string; sub: string; on: boolean }) => (
    <button
      onClick={() => setTab(k)}
      className={`flex-1 rounded-[16px] px-5 py-3.5 text-left transition-colors ${
        on ? "bg-white/[0.10]" : "bg-white/[0.03] hover:bg-white/[0.06]"
      }`}
    >
      <span className={`block text-[17px] font-extrabold tracking-tight ${on ? "text-white" : "text-white/50"}`}>
        {label}
      </span>
      <span className={`mt-0.5 block text-[11px] ${on ? "text-white/55" : "text-white/30"}`}>{sub}</span>
    </button>
  );
  return (
    <div className="space-y-6">
      <div className="flex gap-2 rounded-[20px] bg-white/[0.03] p-1.5">
        <Btn k="s" label="주식" sub="관제 스코프 · ETF · 국민연금" on={tab === "s"} />
        <Btn k="r" label="부동산" sub="시장분석 · 정책 · 전문가집단" on={tab === "r"} />
      </div>
      <div className={tab === "s" ? "" : "hidden"}>{stock}</div>
      <div className={tab === "r" ? "" : "hidden"}>{realestate}</div>
    </div>
  );
}
