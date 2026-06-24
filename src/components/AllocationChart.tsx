import type { Allocation } from "@/lib/npsData";

// 국내주식 vs 해외주식 비중(%) 추이 — 기간별 그룹 막대
export default function AllocationChart({ data }: { data: Allocation }) {
  const dom = data.assets.find((a) => a.name === "국내주식");
  const ovs = data.assets.find((a) => a.name === "해외주식");
  if (!dom || !ovs) return null;
  const max = Math.max(...dom.pct, ...ovs.pct, 1);
  const H = 150;

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-radar" /> 국내주식
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-down" /> 해외주식
        </span>
      </div>
      <div className="flex items-end gap-2 sm:gap-4" style={{ height: H }}>
        {data.periods.map((p, i) => (
          <div key={p} className="flex flex-1 flex-col items-center justify-end gap-1">
            <div className="flex w-full items-end justify-center gap-1" style={{ height: H - 24 }}>
              <div className="flex w-1/2 max-w-[26px] flex-col items-center justify-end">
                <span className="mb-0.5 text-[10px] tabular-nums text-radar">{dom.pct[i]}</span>
                <div className="w-full rounded-t bg-radar/80" style={{ height: `${(dom.pct[i] / max) * (H - 44)}px` }} />
              </div>
              <div className="flex w-1/2 max-w-[26px] flex-col items-center justify-end">
                <span className="mb-0.5 text-[10px] tabular-nums text-down">{ovs.pct[i]}</span>
                <div className="w-full rounded-t bg-down/80" style={{ height: `${(ovs.pct[i] / max) * (H - 44)}px` }} />
              </div>
            </div>
            <div className="text-[11px] text-white/45">{p}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
