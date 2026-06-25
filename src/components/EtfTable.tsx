import SymbolBox from "./SymbolBox";
import Sparkline from "./Sparkline";
import { fmtVol, fmtAmt, fmtEok, type Etf } from "@/lib/etfData";
import { getSpark } from "@/lib/tossData";

function Ret({ v }: { v: number | null }) {
  if (v == null) return <span className="text-white/35">-</span>;
  const up = v > 0;
  return <span className={up ? "text-up" : v < 0 ? "text-down" : "text-white/50"}>{up ? "+" : ""}{v.toFixed(1)}%</span>;
}

export default function EtfTable({ rows }: { rows: Etf[] }) {
  return (
    <div className="card overflow-x-auto scroll-x">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-white/[0.07]">
            <th className="th w-8 text-right">#</th>
            <th className="th">ETF</th>
            <th className="th">테마</th>
            <th className="th text-right">추세 3M</th>
            <th className="th text-right">거래량</th>
            <th className="th text-right">3개월 수익</th>
            <th className="th text-right">거래대금</th>
            <th className="th text-right">순자산</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.code} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
              <td className="td text-right text-white/35">{e.rank}</td>
              <td className="td">
                <span className="flex items-center">
                  <SymbolBox name={e.name} />
                  <a
                    href={`https://finance.naver.com/item/main.naver?code=${e.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-white hover:text-amber-400"
                  >
                    {e.name}
                  </a>
                </span>
              </td>
              <td className="td"><span className="chip">{e.theme}</span></td>
              <td className="td text-right">
                <span className="inline-flex justify-end">
                  <Sparkline data={getSpark(e.code)?.spark ?? []} width={64} height={20} />
                </span>
              </td>
              <td className="td text-right tabular-nums">{fmtVol(e.volume)}</td>
              <td className="td text-right tabular-nums font-semibold"><Ret v={e.ret3m} /></td>
              <td className="td text-right tabular-nums text-white/70">{fmtAmt(e.amount)}</td>
              <td className="td text-right tabular-nums text-white/70">{fmtEok(e.marketSum)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
