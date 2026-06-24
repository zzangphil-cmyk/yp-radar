import Link from "next/link";
import Kpi from "@/components/Kpi";
import EtfTable from "@/components/EtfTable";
import EtfStockMap from "@/components/EtfStockMap";
import IndexCard from "@/components/IndexCard";
import { etf, etfStocks, fmtAmt, fmtEok } from "@/lib/etfData";

function FlowList({ title, tone, rows }: { title: string; tone: string; rows: { code: string; name: string; flow: number }[] }) {
  return (
    <div className="card p-4">
      <div className={`mb-2 text-sm font-semibold ${tone}`}>{title}</div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.code}>
            <Link href={`/etf/stock/${r.code}`} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.04]">
              <span className="truncate text-white/85">{r.name}</span>
              <span className={`ml-2 shrink-0 tabular-nums ${r.flow >= 0 ? "text-radar" : "text-up"}`}>
                {r.flow >= 0 ? "+" : ""}{fmtEok(r.flow)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EtfDashboard() {
  const rets = etf.etfs.map((e) => e.ret3m).filter((v): v is number => v != null);
  const avgRet = rets.length ? rets.reduce((a, b) => a + b, 0) / rets.length : 0;
  const topThemes = etf.themes.slice(0, 5);
  const maxThemeAmt = Math.max(...etf.themes.map((t) => t.amount), 1);
  const inflows = [...etfStocks.stocks].sort((a, b) => b.flow - a.flow).slice(0, 5);
  const outflows = [...etfStocks.stocks].sort((a, b) => a.flow - b.flow).slice(0, 5);

  return (
    <div className="space-y-10">
      {/* 헤더 */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ETF 레이더</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            거래량 상위 30개 ETF (인버스·2X 제외)의 실시간 수급·구성종목·테마.
          </p>
        </div>
        <span className="pill bg-amber-500/15 text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          실시간 · {etf.asOf}
        </span>
      </div>

      {/* 주요 ETF (지수형 요약) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {etf.etfs.slice(0, 4).map((e) => (
          <IndexCard key={e.code} name={e.name} value={e.price?.toLocaleString("ko-KR") ?? "-"} changePct={e.changeRate} />
        ))}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="추적 ETF" value={`${etf.topN}개`} sub="거래량 상위" accent="radar" />
        <Kpi label="구성종목" value={`${etfStocks.count}개`} sub="국내주식" />
        <Kpi label="평균 3개월 수익" value={`${avgRet > 0 ? "+" : ""}${avgRet.toFixed(1)}%`} accent={avgRet >= 0 ? "up" : "down"} />
        <Kpi label="테마 수" value={etf.themes.length} />
      </section>

      {/* 구성종목 9분면 (쇼케이스) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">구성종목 9분면 <span className="ml-1 align-middle text-xs font-normal text-amber-400">노출 × 자금유입률</span></h2>
          <Link href="/etf/stocks" className="text-sm text-amber-400 hover:text-amber-300">크게 보기 →</Link>
        </div>
        <EtfStockMap stocks={etfStocks.stocks} compact />
      </section>

      {/* 자금 흐름 하이라이트 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] pt-8">
          <h2 className="section-title">자금 흐름</h2>
          <Link href="/etf/flows" className="text-sm text-amber-400 hover:text-amber-300">전체 보기 →</Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FlowList title="▲ ETF 자금 유입 TOP" tone="text-radar" rows={inflows} />
          <FlowList title="▼ ETF 자금 유출 TOP" tone="text-up" rows={outflows} />
        </div>
      </section>

      {/* 테마 + ETF 목록 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-white/80">거래량 상위 ETF</span>
            <Link href="/etf/list" className="text-xs text-amber-400 hover:text-amber-300">ETF 목록 →</Link>
          </div>
          <EtfTable rows={etf.etfs.slice(0, 7)} />
        </div>
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-white/80">테마별 자금 TOP5</span>
            <Link href="/etf/themes" className="text-xs text-amber-400 hover:text-amber-300">테마 →</Link>
          </div>
          <ul className="space-y-2.5">
            {topThemes.map((t) => (
              <li key={t.theme} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2"><span className="text-white/85">{t.theme}</span><span className="chip">{t.count}</span></span>
                  <span className="tabular-nums text-white/55">{fmtAmt(t.amount)}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${(t.amount / maxThemeAmt) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="text-xs text-white/40">출처: {etf.source} · {etf.asOfTime} / 구성종목: {etfStocks.source} ({etfStocks.asOf}).</p>
    </div>
  );
}
