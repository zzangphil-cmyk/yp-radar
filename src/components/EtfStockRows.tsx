import Link from "next/link";
import SymbolBox from "./SymbolBox";
import { fmtEok, type EtfStock } from "@/lib/etfData";

export default function EtfStockRows({ rows }: { rows: EtfStock[] }) {
  if (rows.length === 0)
    return <div className="card p-6 text-center text-sm text-white/40">해당 종목 없음</div>;
  return (
    <div className="card overflow-x-auto scroll-x">
      <table className="w-full min-w-[560px] border-collapse">
        <thead>
          <tr className="border-b border-white/[0.07]">
            <th className="th">종목</th>
            <th className="th">테마</th>
            <th className="th text-right">ETF 노출</th>
            <th className="th text-right">3개월 순유입</th>
            <th className="th text-right">유입률</th>
            <th className="th text-right">ETF 수</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const rate = s.exposure > 0 ? (s.flow / s.exposure) * 100 : 0;
            return (
              <tr key={s.code} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                <td className="td">
                  <span className="flex items-center">
                    <SymbolBox name={s.name} />
                    <Link href={`/etf/stock/${s.code}`} className="font-medium text-white hover:text-amber-400">{s.name}</Link>
                  </span>
                </td>
                <td className="td"><span className="chip">{s.themes[0] ?? "-"}</span></td>
                <td className="td text-right tabular-nums">{fmtEok(s.exposure)}</td>
                <td className="td text-right tabular-nums">
                  <span className={s.flow > 0 ? "text-radar" : s.flow < 0 ? "text-up" : "text-white/50"}>{s.flow > 0 ? "+" : ""}{fmtEok(s.flow)}</span>
                </td>
                <td className="td text-right tabular-nums">
                  <span className={rate > 0 ? "text-radar" : rate < 0 ? "text-up" : "text-white/50"}>{rate > 0 ? "+" : ""}{rate.toFixed(1)}%</span>
                </td>
                <td className="td text-right tabular-nums text-white/60">{s.etfCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
