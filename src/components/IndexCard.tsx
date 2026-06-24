import Sparkline from "./Sparkline";

// 웹불식 지수형 요약 카드: 이름 + 값 + 등락% (+ 선택 스파크라인)
export default function IndexCard({
  name,
  value,
  changePct,
  trend,
  href,
}: {
  name: string;
  value: string;
  changePct: number | null;
  trend?: (number | null)[];
  href?: string;
}) {
  const up = (changePct ?? 0) >= 0;
  const inner = (
    <div className="card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-semibold text-white/90">{name}</span>
        {trend && trend.length > 1 && <Sparkline data={trend} width={52} height={18} />}
      </div>
      <div className="mt-1 flex items-baseline justify-between">
        <span className="text-lg font-bold tabular-nums">{value}</span>
        {changePct != null && (
          <span className={`text-xs font-medium tabular-nums ${up ? "text-up" : "text-down"}`}>
            {up ? "+" : ""}{changePct.toFixed(2)}%
          </span>
        )}
      </div>
    </div>
  );
  return inner;
}
