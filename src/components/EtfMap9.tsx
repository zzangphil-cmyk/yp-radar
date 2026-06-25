"use client";

import { useMemo, useState } from "react";
import { fmtAmt, fmtEok, type Etf } from "@/lib/etfData";

const RET_BAND = 5; // 수익률 중립 밴드 ±%
const W = 620, H = 420, padL = 48, padR = 16, padT = 18, padB = 42;
const RMIN = -20, RMAX = 60; // 수익률 표시 범위(클램프)

const COLS = ["소형", "중형", "대형"]; // 자금(거래대금) 규모
const ROWS = ["상승", "보합", "하락"]; // 위→아래
const INTERP: Record<string, string> = {
  "2-2": "자금 많고 성과도 좋은 주력 ETF",
  "0-2": "떠오르는 소형 ETF — 성과 우수",
  "2-0": "자금 많은데 부진 — 과열/되돌림 주의",
  "0-0": "소형 + 부진",
  "1-2": "중형 ETF 상승",
  "1-0": "중형 ETF 하락",
  "2-1": "대형 자금 · 보합",
  "0-1": "소형 자금 · 보합",
  "1-1": "중형 자금 · 보합",
};

export default function EtfMap9({ rows }: { rows: Etf[] }) {
  const [cell, setCell] = useState<{ cx: number; cy: number } | null>(null);

  const data = useMemo(
    () =>
      rows
        .filter((e) => e.amount != null && e.amount > 0 && e.ret3m != null)
        .map((e) => ({ ...e, lx: Math.log10(e.amount as number), ret: e.ret3m as number })),
    [rows],
  );

  // x(자금) 3분위 경계 (log)
  const sx = data.map((d) => d.lx).sort((a, b) => a - b);
  const xlo = sx[0], xhi = sx[sx.length - 1];
  const xt1 = sx[Math.floor(sx.length / 3)], xt2 = sx[Math.floor((sx.length * 2) / 3)];

  const cxOf = (lx: number) => (lx < xt1 ? 0 : lx < xt2 ? 1 : 2);
  const cyOf = (r: number) => (r > RET_BAND ? 2 : r < -RET_BAND ? 0 : 1);

  const px = (lx: number) => padL + ((lx - xlo) / (xhi - xlo || 1)) * (W - padL - padR);
  const py = (r: number) => padT + (1 - (Math.max(RMIN, Math.min(RMAX, r)) - RMIN) / (RMAX - RMIN)) * (H - padT - padB);

  const xb = [padL, px(xt1), px(xt2), W - padR];
  const yb = [py(RMAX), py(RET_BAND), py(-RET_BAND), py(RMIN)];

  const counts: Record<string, number> = {};
  for (const d of data) counts[`${cxOf(d.lx)}-${cyOf(d.ret)}`] = (counts[`${cxOf(d.lx)}-${cyOf(d.ret)}`] ?? 0) + 1;

  const inCell = (d: { lx: number; ret: number }) => cell != null && cxOf(d.lx) === cell.cx && cyOf(d.ret) === cell.cy;
  const listed = useMemo(() => {
    const arr = cell ? data.filter(inCell) : data;
    return [...arr].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0));
  }, [data, cell]);

  // 한국식: 수익률 상승=레드 / 하락=블루
  const color = (r: number) => (r > RET_BAND ? "#f0616d" : r < -RET_BAND ? "#4c8dff" : "#7a8aa0");

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
            <circle key={d.code} cx={px(d.lx)} cy={py(d.ret)} r={inCell(d) ? 4 : 2.6} fill={color(d.ret)} opacity={cell && !inCell(d) ? 0.12 : 0.72}>
              <title>{`${d.name}\n자금 ${fmtAmt(d.amount)} · 3개월 ${d.ret.toFixed(1)}% · 순자산 ${fmtEok(d.marketSum)}`}</title>
            </circle>
          ))}
          <text x={W / 2} y={H - 6} fontSize="11" fill="rgba(255,255,255,0.5)" textAnchor="middle">ETF 자금(거래대금) → (소형/중형/대형)</text>
          <text x={12} y={H / 2} fontSize="11" fill="rgba(255,255,255,0.5)" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>3개월 수익률 (%) ↑상승 / 하락↓</text>
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
          <span className="text-white/45">분면을 클릭하면 해당 ETF가 나열됩니다. 점 위치 = 자금/수익률.</span>
        )}
      </div>

      <div className="card overflow-x-auto scroll-x">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-b border-white/[0.07]">
              <th className="th">ETF</th>
              <th className="th">테마</th>
              <th className="th text-right">자금(거래대금)</th>
              <th className="th text-right">3개월 수익률</th>
              <th className="th text-right">순자산</th>
            </tr>
          </thead>
          <tbody>
            {listed.map((e) => (
              <tr key={e.code} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                <td className="td">
                  <a href={`https://finance.naver.com/item/main.naver?code=${e.code}`} target="_blank" rel="noreferrer" className="font-medium text-white hover:text-amber-400">{e.name}</a>
                </td>
                <td className="td"><span className="chip">{e.theme}</span></td>
                <td className="td text-right tabular-nums">{fmtAmt(e.amount)}</td>
                <td className="td text-right tabular-nums">
                  <span className={e.ret > RET_BAND ? "text-up" : e.ret < -RET_BAND ? "text-down" : "text-white/50"}>{e.ret > 0 ? "+" : ""}{e.ret.toFixed(1)}%</span>
                </td>
                <td className="td text-right tabular-nums text-white/60">{fmtEok(e.marketSum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
