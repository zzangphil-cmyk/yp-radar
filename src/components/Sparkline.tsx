/** 작은 인라인 추세선 (null은 건너뜀) */
export default function Sparkline({
  data,
  width = 80,
  height = 24,
}: {
  data: (number | null)[];
  width?: number;
  height?: number;
}) {
  const pts = data
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null && Number.isFinite(p.v));
  if (pts.length < 2) return <span className="text-white/30">–</span>;

  const xs = data.length - 1 || 1;
  const vals = pts.map((p) => p.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const pad = 2;
  const x = (i: number) => pad + (i / xs) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);

  const d = pts.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  const rising = last.v >= pts[0].v;
  const stroke = rising ? "#f0616d" : "#4c8dff";

  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={x(last.i)} cy={y(last.v)} r="2" fill={stroke} />
    </svg>
  );
}
