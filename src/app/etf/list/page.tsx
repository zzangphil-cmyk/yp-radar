import Kpi from "@/components/Kpi";
import EtfTable from "@/components/EtfTable";
import { etf } from "@/lib/etfData";

export default function EtfListPage() {
  const rets = etf.etfs.map((e) => e.ret3m).filter((v): v is number => v != null);
  const avgRet = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ETF 목록</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            거래량 상위 50개 ETF (인버스·레버리지2X 제외). 시세·수익률·거래대금·순자산.
          </p>
        </div>
        <span className="pill bg-amber-500/15 text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          실시간 · {etf.asOf}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="추적 ETF" value={`${etf.topN}개`} sub="거래량 상위" accent="radar" />
        <Kpi label="전체 ETF" value={etf.universe.toLocaleString("ko-KR")} sub={`인버스·2X ${etf.excluded}개 제외`} />
        <Kpi label="평균 3개월 수익" value={`${avgRet > 0 ? "+" : ""}${avgRet.toFixed(1)}%`} accent={avgRet >= 0 ? "up" : "down"} />
        <Kpi label="테마 수" value={etf.themes.length} />
      </div>

      <EtfTable rows={etf.etfs} />

      <p className="text-xs text-white/40">
        ※ 출처: {etf.source} · {etf.asOfTime}. ETF명을 누르면 네이버 금융으로 이동.
      </p>
    </div>
  );
}
