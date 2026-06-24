/** 증감을 한국식 색(상승=레드, 하락=블루)으로 표시 */
export default function DeltaText({
  v,
  suffix = "%p",
  digits = 2,
}: {
  v: number | null;
  suffix?: string;
  digits?: number;
}) {
  if (v == null || !Number.isFinite(v) || v === 0)
    return <span className="text-white/35">-</span>;
  const up = v > 0;
  return (
    <span className={up ? "text-up" : "text-down"}>
      {up ? "▲" : "▼"} {Math.abs(v).toFixed(digits)}
      {suffix}
    </span>
  );
}
