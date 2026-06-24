"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtEok, type EtfStock } from "@/lib/etfData";

const RATE_BAND = 3; // 유입률 중립 밴드 ±%
const W = 620, H = 420, padL = 48, padR = 16, padT = 18, padB = 42;
const RMIN = -25, RMAX = 60; // 유입률 표시 범위

const COLS = ["소형", "중형", "대형"]; // 노출 규모
const ROWS = ["유입", "중립", "유출"]; // 위→아래
const INTERP: Record<string, string> = {
  "2-2": "대형주에 ETF 자금 유입 — 주력 매집",
  "0-2": "소형주에 ETF 자금 유입 — 신흥 테마",
  "2-0": "대형주에서 ETF 자금 이탈 — 차익/회피",
  "0-0": "소형주 ETF 자금 이탈",
  "1-2": "중형주 ETF 유입",
  "1-0": "중형주 ETF 이탈",
};

export default function EtfStockMap({ stocks, compact = false }: { stocks: EtfStock[]; compact?: boolean }) {
  const [cell, setCell] = useState<{ cx: number; cy: number } | null>(null);
  const limit = compact ? 5 : 50;

  const data = useMemo(
    () =>
      stocks
        .filter((s) => s.exposure > 0)
        .map((s) => ({ ...s, lx: Math.log10(s.exposure), rate: (s.flow / s.exposure) * 100 })),
    [stocks],
  );

  // x(노출) 3분위 경계 (log)
  const sx = data.map((d) => d.lx).sort((a, b) => a - b);
  const xlo = sx[0], xhi = sx[sx.length - 1];
  const xt1 = sx[Math.floor(sx.length / 3)], xt2 = sx[Math.floor((sx.length * 2) / 3)];

  const cxOf = (lx: number) => (lx < xt1 ? 0 : lx < xt2 ? 1 : 2);
  const cyOf = (r: number) => (r > RATE_BAND ? 2 : r < -RATE_BAND ? 0 : 1);

  const px = (lx: number) => padL + ((lx - xlo) / (xhi - xlo || 1)) * (W - padL - padR);
  const py = (r: number) => padT + (1 - (Math.max(RMIN, Math.min(RMAX, r)) - RMIN) / (RMAX - RMIN)) * (H - padT - padB);

  const xb = [padL, px(xt1), px(xt2), W - padR];
  const yb = [py(RMAX), py(RATE_BAND), py(-RATE_BAND), py(RMIN)];

  const counts: Record<string, number> = {};
  for (const d of data) counts[`${cxOf(d.lx)}-${cyOf(d.rate)}`] = (counts[`${cxOf(d.lx)}-${cyOf(d.rate)}`] ?? 0) + 1;

  const inCell = (d: { lx: number; rate: number }) => cell != null && cxOf(d.lx) === cell.cx && cyOf(d.rate) === cell.cy;
  const listed = useMemo(() => {
    const arr = cell ? data.filter(inCell) : data;
    return [...arr].sort((a, b) => b.exposure - a.exposure);
  }, [data, cell]);

  const color = (r: number) => (r > RATE_BAND ? "#16c79a" : r < -RATE_BAND ? "#f0616d" : "#7a8aa0");

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
          {[0, 1, 2].map((cx) =>
            [2, 1, 0].map((cy) => {
              const row = 2 - cy;
              const x = xb[cx], w = xb[cx + 1] - xb[cx], y = yb[row], h = yb[row + 1] - yb[row];
              const sel = cell?.cx === cx && cell?.cy === cy;
              return (
                <g key={`${cx}-${cy}`} onClick={() => setCell(sel ? null : { cx, cy })} style={{ cursor: "pointer" }}>
                  <rect x={x} y={y} width={w} height={h} fill={sel ? "rgba(245,158,11,0.12)" : "transparent"} stroke={sel ? "rgba(245,158,11,0.5)" : "transparent"} />
                  <text x={x + 4} y={y + 13} fontSize="10" fill="rgba(255,255,255,0.35)">{counts[`${cx}-${cy}`] ?? 0}</text>
                </g>
              );
            }),
          )}
          <line x1={xb[1]} y1={padT} x2={xb[1]} y2={H - padB} stroke="rgba(255,255,255,0.1)" />
          <line x1={xb[2]} y1={padT} x2={xb[2]} y2={H - padB} stroke="rgba(255,255,255,0.1)" />
          <line x1={padL} y1={yb[1]} x2={W - padR} y2={yb[1]} stroke="rgba(255,255,255,0.1)" />
          <line x1={padL} y1={yb[2]} x2={W - padR} y2={yb[2]} stroke="rgba(255,255,255,0.1)" />
          <line x1={padL} y1={py(0)} x2={W - padR} y2={py(0)} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 3" />
          {data.map((d) => (
            <circle key={d.code} cx={px(d.lx)} cy={py(d.rate)} r={inCell(d) ? 4 : 2.6} fill={color(d.rate)} opacity={cell && !inCell(d) ? 0.12 : 0.72}>
              <title>{`${d.name}\n노출 ${fmtEok(d.exposure)} · 유입률 ${d.rate.toFixed(1)}% · ${d.etfCount}개 ETF`}</title>
            </circle>
          ))}
          <text x={W / 2} y={H - 6} fontSize="11" fill="rgba(255,255,255,0.5)" textAnchor="middle">ETF 노출 규모 → (소형/중형/대형)</text>
          <text x={12} y={H / 2} fontSize="11" fill="rgba(255,255,255,0.5)" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>ETF 자금 유입률 (%) ↑유입 / 유출↓</text>
        </svg>
      </div>

      <div className="text-sm">
        {cell ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="pill bg-amber-500/15 text-amber-400">{COLS[cell.cx]} · {ROWS[2 - cell.cy]}</span>
            <span className="text-white/60">{INTERP[`${cell.cx}-${cell.cy}`] ?? ""}</span>
            <button onClick={() => setCell(null)} className="ml-1 text-xs text-white/40 hover:text-white">✕ 전체 보기</button>
          </div>
        ) : (
          <span className="text-white/45">분면을 클릭하면 해당 종목이 나열됩니다. 점 크기·위치 = 노출/유입률.</span>
        )}
      </div>

      <div className="card overflow-x-auto scroll-x">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-b border-white/[0.07]">
              <th className="th">종목</th>
              <th className="th">테마</th>
              <th className="th text-right">ETF 노출</th>
              <th className="th text-right">3개월 순유입</th>
              <th className="th text-right">유입률</th>
              <th className="th text-right">ETF 수</th>
            </tr>
          </thead>
          <tbody>
            {listed.slice(0, limit).map((s) => (
              <tr key={s.code} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                <td className="td">
                  <Link href={`/etf/stock/${s.code}`} className="font-medium text-white hover:text-amber-400">{s.name}</Link>
                </td>
                <td className="td"><span className="chip">{s.themes[0] ?? "-"}</span></td>
                <td className="td text-right tabular-nums">{fmtEok(s.exposure)}</td>
                <td className="td text-right tabular-nums">
                  <span className={s.flow > 0 ? "text-radar" : s.flow < 0 ? "text-up" : "text-white/50"}>{s.flow > 0 ? "+" : ""}{fmtEok(s.flow)}</span>
                </td>
                <td className="td text-right tabular-nums">
                  <span className={s.rate > RATE_BAND ? "text-radar" : s.rate < -RATE_BAND ? "text-up" : "text-white/50"}>{s.rate > 0 ? "+" : ""}{s.rate.toFixed(1)}%</span>
                </td>
                <td className="td text-right tabular-nums text-white/60">{s.etfCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
