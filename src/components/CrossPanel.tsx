import Link from "next/link";
import type { CrossItem } from "@/lib/cross";
import { fmtEok } from "@/lib/etfData";

function Sig({ label, v, suffix }: { label: string; v: number; suffix: string }) {
  const up = v > 0;
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <span className="text-white/35">{label}</span>
      <span className={up ? "text-radar" : "text-up"}>
        {up ? "▲" : "▼"}
        {suffix === "억" ? fmtEok(Math.abs(v)) : `${Math.abs(v)}${suffix}`}
      </span>
    </span>
  );
}

function Row({ it }: { it: CrossItem }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.04]">
      <Link href={`/etf/stock/${it.code}`} className="truncate font-medium text-white hover:text-amber-400">
        {it.name}
      </Link>
      <span className="flex shrink-0 items-center gap-2.5 text-xs">
        <Sig label="ETF" v={it.etfFlow} suffix="억" />
        <Sig label="연금" v={it.npsOwnDelta} suffix="%p" />
      </span>
    </li>
  );
}

export default function CrossPanel({
  title,
  desc,
  tone,
  items,
}: {
  title: string;
  desc: string;
  tone: string;
  items: CrossItem[];
}) {
  return (
    <div className="card p-4">
      <div className={`text-sm font-bold ${tone}`}>{title}</div>
      <div className="mt-0.5 text-xs text-white/45">{desc}</div>
      <ul className="mt-2 space-y-0.5">
        {items.length === 0 ? (
          <li className="px-2 py-2 text-sm text-white/35">해당 종목 없음</li>
        ) : (
          items.slice(0, 5).map((it) => <Row key={it.code} it={it} />)
        )}
      </ul>
    </div>
  );
}
