/** 연도별 라인 차트 (종목 지분율/평가액 추이). 순수 SVG */
export default function TrendChart({
  points,
  unit = "%",
  color = "#16c79a",
  height = 200,
}: {
  points: { label: string | number; value: number | null }[];
  unit?: string;
  color?: string;
  height?: number;
}) {
  const W = 560;
  const H = height;
  const padX = 36;
  const padY = 28;
  const valid = points
    .map((p, i) => ({ ...p, i }))
    .filter((p): p is { label: string | number; value: number; i: number } =>
      p.value != null && Number.isFinite(p.value),
    );
  if (valid.length === 0)
    return <div className="text-sm text-white/40">데이터 없음</div>;

  const vals = valid.map((p) => p.value);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || Math.abs(max) || 1;
  const lo = min - span * 0.15;
  const hi = max + span * 0.15;
  const xs = points.length - 1 || 1;
  const x = (i: number) => padX + (i / xs) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - lo) / (hi - lo || 1)) * (H - padY * 2);

  const line = valid
    .map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* 가로 그리드 */}
      {[0, 0.5, 1].map((t) => {
        const gv = lo + t * (hi - lo);
        const gy = y(gv);
        return (
          <g key={t}>
            <line x1={padX} y1={gy} x2={W - padX} y2={gy} stroke="rgba(255,255,255,0.07)" />
            <text x={4} y={gy + 4} fontSize="10" fill="rgba(255,255,255,0.4)">
              {gv.toFixed(1)}
            </text>
          </g>
        );
      })}
      <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
      {valid.map((p) => (
        <g key={p.i}>
          <circle cx={x(p.i)} cy={y(p.value)} r="3.5" fill={color} />
          <text x={x(p.i)} y={y(p.value) - 9} fontSize="10.5" fill="#e7eef7" textAnchor="middle">
            {p.value}
            {unit}
          </text>
        </g>
      ))}
      {points.map((p, i) => (
        <text key={i} x={x(i)} y={H - 8} fontSize="11" fill="rgba(255,255,255,0.5)" textAnchor="middle">
          {p.label}
        </text>
      ))}
    </svg>
  );
}
