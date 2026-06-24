import Link from "next/link";
import { notFound } from "next/navigation";
import Kpi from "@/components/Kpi";
import { getEtfStock, allEtfStockCodes, etfStocks, fmtEok } from "@/lib/etfData";

export function generateStaticParams() {
  return allEtfStockCodes().map((code) => ({ code }));
}
export const dynamicParams = true;

export default async function EtfStockPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const s = getEtfStock(code);
  if (!s) notFound();

  const rate = s.exposure > 0 ? (s.flow / s.exposure) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/etf/stocks" className="text-sm text-white/45 hover:text-white">← ETF 구성종목 9분면</Link>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
          {s.name}
          <span className="text-base font-normal text-white/40">{s.code}</span>
        </h1>
        <p className="mt-1 text-sm text-white/55">
          상위 30개 ETF 중 <strong className="text-amber-400">{s.etfCount}개</strong>가 보유 ·{" "}
          {s.themes.map((t) => <span key={t} className="chip mr-1">{t}</span>)}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="ETF 노출 규모" value={fmtEok(s.exposure)} accent="radar" sub="Σ 비중×순자산" />
        <Kpi label="3개월 순유입" value={`${s.flow >= 0 ? "+" : ""}${fmtEok(s.flow)}`} accent={s.flow >= 0 ? "radar" : "up"} />
        <Kpi label="자금 유입률" value={`${rate >= 0 ? "+" : ""}${rate.toFixed(1)}%`} accent={rate >= 0 ? "radar" : "up"} />
        <Kpi label="보유 ETF 수" value={`${s.etfCount}개`} />
      </div>

      <section className="space-y-3">
        <h2 className="section-title">이 종목을 담은 ETF</h2>
        <div className="card overflow-x-auto scroll-x">
          <table className="w-full min-w-[420px] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="th w-8 text-right">#</th>
                <th className="th">ETF</th>
                <th className="th text-right">이 ETF 내 비중</th>
              </tr>
            </thead>
            <tbody>
              {s.etfs.map((e, i) => (
                <tr key={e.name} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="td text-right text-white/35">{i + 1}</td>
                  <td className="td font-medium text-white">{e.name}</td>
                  <td className="td text-right tabular-nums text-amber-400">{e.weight}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <a
        href={`https://finance.naver.com/item/main.naver?code=${s.code}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block text-sm text-amber-400 hover:text-amber-300"
      >
        네이버 금융에서 {s.name} 보기 ↗
      </a>

      <p className="text-xs text-white/40">
        ※ 출처: {etfStocks.source} ({etfStocks.asOf} 기준). ‘노출 규모’ = ETF별 (비중×순자산) 합,
        ‘순유입’ = ETF별 (비중×3개월 순유입) 합.
      </p>
    </div>
  );
}
