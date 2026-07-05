import type { ReactNode } from "react";
void 0 as unknown as ReactNode;
export default // 유형별 서머리 카드 — 의미·장점·단점 선언 + TOP3/3 (요약 슬라이드 공용)
function KindCard({ color, title, mean, pro, con, leftTitle, rightTitle, left, right }: {
  color: string; title: string; mean: string; pro: string; con: string;
  leftTitle: string; rightTitle: string;
  left: { key: string; name: string; right: string; tone?: string }[];
  right: { key: string; name: string; right: string; tone?: string }[];
}) {
  const Rows = ({ rows }: { rows: typeof left }) => (
    <ul className="space-y-0.5">
      {rows.map((r) => (
        <li key={r.key} className="flex items-center gap-1.5 rounded-lg px-1.5 py-0.5">
          <span className="min-w-0 flex-1 truncate text-[12px] text-white/80">{r.name}</span>
          <span className={`shrink-0 text-[12px] font-semibold tabular-nums ${r.tone ?? "text-white/60"}`}>{r.right}</span>
        </li>
      ))}
      {!rows.length && <li className="px-1 text-[11px] text-white/25">없음</li>}
    </ul>
  );
  return (
    <div className="rounded-[20px] bg-base-800 p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}88` }} />
        <span className="text-[13px] font-bold" style={{ color }}>{title}</span>
      </div>
      <p className="text-[12px] text-white/60">{mean}</p>
      <p className="mt-0.5 text-[11px]"><span className="text-[#22c55e]/80">장점</span> <span className="text-white/50">{pro}</span></p>
      <p className="text-[11px]"><span className="text-[#f04452]/80">단점</span> <span className="text-white/50">{con}</span></p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div><div className="mb-0.5 text-[11px] font-semibold text-up">{leftTitle}</div><Rows rows={left} /></div>
        <div><div className="mb-0.5 text-[11px] font-semibold text-down">{rightTitle}</div><Rows rows={right} /></div>
      </div>
    </div>
  );
}
