import Kpi from "@/components/Kpi";
import EtfStockRows from "@/components/EtfStockRows";
import { etfStocks, fmtEok } from "@/lib/etfData";

const BAND = 100; // 억

export default function EtfFlowsPage() {
  const s = etfStocks.stocks;
  const inflows = [...s].filter((x) => x.flow > BAND).sort((a, b) => b.flow - a.flow);
  const outflows = [...s].filter((x) => x.flow < -BAND).sort((a, b) => a.flow - b.flow);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">자금 흐름</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            상위 50개 ETF의 <strong>3개월 순유입</strong>을 구성종목 단위로 합산. 어떤 종목으로 ETF
            자금이 들어오고 빠지는지 봅니다.
          </p>
        </div>
        <span className="pill bg-amber-500/15 text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          실시간 · {etfStocks.asOf}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="자금 유입 종목" value={inflows.length} accent="radar" sub={`+${BAND}억 초과`} />
        <Kpi label="자금 유출 종목" value={outflows.length} accent="up" sub={`-${BAND}억 미만`} />
        <Kpi label="순유입 1위" value={inflows[0]?.name ?? "-"} sub={inflows[0] ? `+${fmtEok(inflows[0].flow)}` : ""} accent="radar" />
        <Kpi label="순유출 1위" value={outflows[0]?.name ?? "-"} sub={outflows[0] ? fmtEok(outflows[0].flow) : ""} accent="up" />
      </div>

      <section className="space-y-3">
        <h2 className="section-title text-radar">▲ ETF 자금 유입 TOP</h2>
        <EtfStockRows rows={inflows.slice(0, 20)} />
      </section>

      <section className="space-y-3">
        <h2 className="section-title text-up">▼ ETF 자금 유출 TOP</h2>
        <EtfStockRows rows={outflows.slice(0, 20)} />
      </section>

      <p className="text-xs text-white/40">
        ※ 순유입 = Σ(ETF 비중 × 해당 ETF 3개월 순유입). 출처: {etfStocks.source} ({etfStocks.asOf}).
      </p>
    </div>
  );
}
