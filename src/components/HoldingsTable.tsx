"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import DeltaText from "./DeltaText";
import SymbolBox from "./SymbolBox";
import { formatEok } from "@/lib/npsData";

export interface HoldingRow {
  name: string;
  slug: string;
  value: number;
  weight: number | null;
  ownership: number | null;
  ownDelta: number | null;
}

type SortKey = "value" | "ownership" | "weight" | "ownDelta";
const PAGE = 50;

export default function HoldingsTable({ rows }: { rows: HoldingRow[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("value");
  const [only5, setOnly5] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    let r = rows;
    const term = q.trim();
    if (term) r = r.filter((x) => x.name.includes(term));
    if (only5) r = r.filter((x) => (x.ownership ?? 0) >= 5);
    // 모두 내림차순 정렬 (null은 맨 뒤)
    return [...r].sort(
      (a, b) => Number(b[sort] ?? -Infinity) - Number(a[sort] ?? -Infinity),
    );
  }, [rows, q, sort, only5]);

  const visible = filtered.slice(0, limit);

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => { setSort(k); setLimit(PAGE); }}
      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
        sort === k ? "bg-radar/15 text-radar" : "text-white/50 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }}
          placeholder="종목명 검색…"
          className="w-full max-w-xs rounded-xl border border-white/10 bg-base-800 px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-radar focus:outline-none"
        />
        <label className="flex cursor-pointer items-center gap-1.5 text-sm text-white/60">
          <input type="checkbox" checked={only5} onChange={(e) => { setOnly5(e.target.checked); setLimit(PAGE); }} className="accent-radar" />
          지분율 5%+
        </label>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-white/35">정렬</span>
          <SortBtn k="value" label="평가액" />
          <SortBtn k="ownership" label="지분율" />
          <SortBtn k="weight" label="비중" />
          <SortBtn k="ownDelta" label="증감" />
        </div>
      </div>

      <div className="text-xs text-white/40">{filtered.length.toLocaleString("ko-KR")}개 종목</div>

      <div className="card overflow-x-auto scroll-x">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="border-b border-white/[0.07]">
              <th className="th w-10 text-right">#</th>
              <th className="th">종목</th>
              <th className="th text-right">평가액</th>
              <th className="th text-right">비중</th>
              <th className="th text-right">지분율</th>
              <th className="th text-right">전년比</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <tr key={r.slug} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                <td className="td text-right text-white/35">{i + 1}</td>
                <td className="td">
                  <span className="flex items-center">
                    <SymbolBox name={r.name} />
                    <Link href={`/nps/stock/${encodeURIComponent(r.slug)}`} className="font-medium text-white hover:text-radar">
                      {r.name}
                    </Link>
                  </span>
                </td>
                <td className="td text-right tabular-nums">{formatEok(r.value)}</td>
                <td className="td text-right tabular-nums text-white/60">
                  {r.weight == null ? "-" : `${r.weight}%`}
                </td>
                <td className="td text-right font-semibold tabular-nums">
                  <span className={(r.ownership ?? 0) >= 5 ? "text-radar" : "text-white/80"}>
                    {r.ownership == null ? "-" : `${r.ownership}%`}
                  </span>
                </td>
                <td className="td text-right tabular-nums">
                  <DeltaText v={r.ownDelta} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {limit < filtered.length && (
        <div className="text-center">
          <button onClick={() => setLimit((l) => l + PAGE)} className="btn-ghost">
            더 보기 ({Math.min(PAGE, filtered.length - limit)}개 +)
          </button>
        </div>
      )}
    </div>
  );
}
