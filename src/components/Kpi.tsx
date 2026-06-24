export default function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  accent?: "up" | "down" | "radar";
}) {
  const color =
    accent === "up"
      ? "text-up"
      : accent === "down"
        ? "text-down"
        : accent === "radar"
          ? "text-radar"
          : "text-white";
  return (
    <div className="card p-4">
      <div className="text-xs text-white/45">{label}</div>
      <div className={`mt-1.5 text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-white/40">{sub}</div>}
    </div>
  );
}
