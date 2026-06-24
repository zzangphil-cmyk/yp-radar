/** 연도별 막대 차트 (총 평가액 추이 등). 순수 SVG·반응형 */
export default function BarChart({
  data,
  unit = "",
  height = 150,
}: {
  data: { label: string | number; value: number }[];
  unit?: string;
  height?: number;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-3" style={{ height }}>
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center justify-end gap-1.5">
          <div className="text-xs font-medium tabular-nums text-white/70">
            {d.value.toLocaleString("ko-KR")}
            {unit}
          </div>
          <div
            className="w-full rounded-t-md bg-gradient-to-t from-radar-dim/50 to-radar/80"
            style={{ height: `${Math.max((d.value / max) * (height - 44), 3)}px` }}
          />
          <div className="text-[11px] text-white/45">{d.label}</div>
        </div>
      ))}
    </div>
  );
}
