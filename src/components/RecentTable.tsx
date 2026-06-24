import Link from "next/link";
import DeltaText from "./DeltaText";
import SymbolBox from "./SymbolBox";
import { formatYmd, type RecentRow } from "@/lib/npsData";

function NameCell({ r }: { r: RecentRow }) {
  return (
    <span className="flex items-center">
      <SymbolBox name={r.name} />
      {r.inPanel ? (
        <Link href={`/nps/stock/${encodeURIComponent(r.slug)}`} className="font-medium text-white hover:text-radar">
          {r.name}
        </Link>
      ) : (
        <span className="font-medium text-white">{r.name}</span>
      )}
    </span>
  );
}

export default function RecentTable({
  rows,
  showReason = true,
}: {
  rows: RecentRow[];
  showReason?: boolean;
}) {
  if (rows.length === 0)
    return <div className="card p-6 text-center text-sm text-white/40">해당 내역이 없습니다.</div>;
  return (
    <div className="card overflow-x-auto scroll-x">
      <table className="w-full min-w-[640px] border-collapse">
        <thead>
          <tr className="border-b border-white/[0.07]">
            <th className="th">종목</th>
            <th className="th text-right">지분율</th>
            <th className="th text-right">증감</th>
            {showReason && <th className="th">사유</th>}
            <th className="th text-right">보고일</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.slug}-${r.date}`} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
              <td className="td"><NameCell r={r} /></td>
              <td className="td text-right font-semibold tabular-nums text-radar">
                {r.ownership == null ? "-" : `${r.ownership}%`}
              </td>
              <td className="td text-right tabular-nums"><DeltaText v={r.ownDelta} /></td>
              {showReason && <td className="td text-white/55">{r.reason || "-"}</td>}
              <td className="td whitespace-nowrap text-right text-white/55">{formatYmd(r.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
