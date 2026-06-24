"use client";

import { useState } from "react";
import Link from "next/link";
import DeltaText from "./DeltaText";
import { formatEok, type Changes } from "@/lib/npsData";

type Tab = "accumulated" | "reduced" | "newEntries" | "exits";
const TABS: { key: Tab; label: string }[] = [
  { key: "accumulated", label: "실제 매집 ▲" },
  { key: "reduced", label: "실제 축소 ▼" },
  { key: "newEntries", label: "신규 편입 ＋" },
  { key: "exits", label: "전량 매도 ✕" },
];

function StockLink({ name, slug }: { name: string; slug: string }) {
  return (
    <Link href={`/nps/stock/${encodeURIComponent(slug)}`} className="font-medium text-white hover:text-radar">
      {name}
    </Link>
  );
}

export default function ChangesTabs({ data }: { data: Changes }) {
  const [tab, setTab] = useState<Tab>("accumulated");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-radar/15 text-radar" : "text-white/60 hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card overflow-x-auto scroll-x">
        {(tab === "accumulated" || tab === "reduced") && (
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="th">종목</th>
                <th className="th text-right">지분율 {data.prevYear}→{data.curYear}</th>
                <th className="th text-right">Δ지분율 (매매결정)</th>
                <th className="th text-right">Δ평가액 (시장효과)</th>
              </tr>
            </thead>
            <tbody>
              {data[tab].map((r) => (
                <tr key={r.slug} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="td"><StockLink name={r.name} slug={r.slug} /></td>
                  <td className="td text-right tabular-nums text-white/70">
                    {r.ownPrev}% → <span className="text-white">{r.ownCur}%</span>
                  </td>
                  <td className="td text-right font-semibold tabular-nums"><DeltaText v={r.ownDelta} /></td>
                  <td className="td text-right tabular-nums"><DeltaText v={r.valDelta} suffix="억" digits={0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "newEntries" && (
          <table className="w-full min-w-[480px] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="th">종목</th>
                <th className="th text-right">평가액 ({data.curYear})</th>
                <th className="th text-right">지분율</th>
              </tr>
            </thead>
            <tbody>
              {data.newEntries.map((r) => (
                <tr key={r.slug} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="td"><StockLink name={r.name} slug={r.slug} /></td>
                  <td className="td text-right tabular-nums">{formatEok(r.value)}</td>
                  <td className="td text-right tabular-nums text-radar">{r.ownership}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "exits" && (
          <table className="w-full min-w-[480px] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="th">종목</th>
                <th className="th text-right">직전 평가액 ({data.prevYear})</th>
                <th className="th text-right">직전 지분율</th>
              </tr>
            </thead>
            <tbody>
              {data.exits.map((r) => (
                <tr key={r.slug} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="td"><StockLink name={r.name} slug={r.slug} /></td>
                  <td className="td text-right tabular-nums text-white/70">{formatEok(r.prevValue)}</td>
                  <td className="td text-right tabular-nums text-white/70">{r.prevOwnership}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
