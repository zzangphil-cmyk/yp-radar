import Kpi from "@/components/Kpi";
import EtfStockMap from "@/components/EtfStockMap";
import { etfStocks, fmtEok } from "@/lib/etfData";

export default function EtfStocksPage() {
  const s = etfStocks.stocks;
  const topExp = s[0];
  const topFlow = [...s].sort((a, b) => b.flow - a.flow)[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ETF 구성종목 9분면</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            상위 30개 ETF의 <strong>전체 구성종목(KRX)</strong>을 종목 단위로 합쳐,{" "}
            <strong>ETF 노출 규모</strong> × <strong>ETF 자금 유입률</strong>로 배치합니다.
            분면을 클릭하면 종목이 나열됩니다.
          </p>
        </div>
        <span className="pill bg-amber-500/15 text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          실시간 · {etfStocks.asOf}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="고유 구성종목" value={`${etfStocks.count}개`} accent="radar" />
        <Kpi label="수집 ETF" value={`${etfStocks.etfCount}개`} sub="거래량 상위" />
        <Kpi label="노출 1위" value={topExp?.name ?? "-"} sub={`${fmtEok(topExp?.exposure ?? 0)} · ${topExp?.etfCount}개 ETF`} />
        <Kpi label="순유입 1위" value={topFlow?.name ?? "-"} sub={`+${fmtEok(topFlow?.flow ?? 0)}`} accent="radar" />
      </div>

      <div className="card border-amber-500/15 bg-amber-500/[0.05] p-4 text-sm text-white/75">
        <strong className="text-amber-400">노출 규모</strong> = Σ(ETF 비중 × 순자산) — ETF들이 이 종목에
        깔아둔 자금. <strong className="text-amber-400">유입률</strong> = 3개월 순유입 ÷ 노출 — ETF
        자금이 이 종목으로 들어오는/빠지는 속도. 오른쪽 위(대형+유입)는 ETF 주력, 왼쪽 위(소형+유입)는
        떠오르는 종목.
      </div>

      <EtfStockMap stocks={s} />

      <p className="text-xs text-white/40">
        ※ 출처: {etfStocks.source} ({etfStocks.asOf} 기준, 국내주식 구성종목만). 유입률 ±3% 이내는
        ‘중립’, 노출은 3분위(소형/중형/대형). 해외·채권형 ETF의 비국내 보유는 제외.
      </p>
    </div>
  );
}
