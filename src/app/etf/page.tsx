import Link from "next/link";
import Kpi from "@/components/Kpi";
import EtfTable from "@/components/EtfTable";
import EtfStockMap from "@/components/EtfStockMap";
import IndexCard from "@/components/IndexCard";
import SlideTabs from "@/components/SlideTabs";
import KindCard from "@/components/KindCard";
import { etf, etfStocks, fmtAmt, fmtEok } from "@/lib/etfData";
import { getSpark } from "@/lib/tossData";

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

  // 결론 TOP5: 오늘 |등락|이 가장 큰 ETF — 이유 = 테마 · 거래량 순위(etfs가 거래량순)
  const top5 = [...etf.etfs]
    .map((e, i) => ({ ...e, volRank: i + 1 }))
    .sort((a, b) => Math.abs(b.changeRate ?? 0) - Math.abs(a.changeRate ?? 0))
    .slice(0, 5);
  // 유형별
  const byChg = [...etf.etfs].sort((a, b) => (b.changeRate ?? 0) - (a.changeRate ?? 0));
  const byRet3m = [...etf.etfs].filter((e) => e.ret3m != null).sort((a, b) => (b.ret3m ?? 0) - (a.ret3m ?? 0));

  const pct = (v: number | null | undefined) => `${(v ?? 0) >= 0 ? "+" : ""}${(v ?? 0).toFixed(1)}%`;

  const summary = (
    <div className="space-y-6">
      {/* 주요 ETF (시장 한눈) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {etf.etfs.slice(0, 4).map((e) => (
          <IndexCard key={e.code} name={e.name} value={e.price?.toLocaleString("ko-KR") ?? "-"} changePct={e.changeRate} trend={getSpark(e.code)?.spark} />
        ))}
      </section>

      {/* 결론부터 — 오늘의 ETF TOP5 */}
      <div className="rounded-[20px] bg-base-800 p-4">
        <div className="mb-1 text-[14px] font-bold text-white">오늘의 결론 — 가장 크게 움직인 ETF TOP 5</div>
        <p className="mb-2 text-[12px] text-white/45">거래량 상위 50개 중 오늘 등락이 가장 큰 순서. <strong className="text-white/60">왜 이 순위인지</strong>를 오른쪽에 적었다.</p>
        <ul className="space-y-0.5">
          {top5.map((e, k) => (
            <li key={e.code} className="flex items-center gap-2 rounded-lg px-1.5 py-1">
              <span className="w-4 shrink-0 text-center text-[13px] font-bold tabular-nums text-white/35">{k + 1}</span>
              <span className="min-w-0 shrink-0 truncate text-[13px] font-semibold text-white/90">{e.name}</span>
              <span className={`shrink-0 text-[12px] font-semibold tabular-nums ${(e.changeRate ?? 0) >= 0 ? "text-up" : "text-down"}`}>{pct(e.changeRate)}</span>
              <span className="min-w-0 flex-1 truncate text-right text-[11px] text-white/45">{e.theme} · 거래량 {e.volRank}위 · 3개월 {pct(e.ret3m)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 유형별 서머리 — 의미·장단점 선언 + TOP3 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KindCard color="#06b6d4" title="구성종목 자금 유·출입"
          mean="ETF들이 실제로 사고판 개별 종목의 순유입(3개월)"
          pro="리테일·패시브 자금이 어느 종목으로 쏠리는지 보임"
          con="지수 편입·리밸런싱 등 기계적 매매가 섞여 있음"
          leftTitle="유입 TOP3" rightTitle="유출 TOP3"
          left={inflows.slice(0, 3).map((r) => ({ key: r.code, name: r.name, right: `+${fmtEok(r.flow)}`, tone: "text-radar" }))}
          right={outflows.slice(0, 3).map((r) => ({ key: r.code, name: r.name, right: fmtEok(r.flow), tone: "text-up" }))} />
        <KindCard color="#f5a623" title="오늘 등락"
          mean="오늘 하루의 가격 움직임"
          pro="지금 시장이 어디에 반응 중인지 즉시 보임"
          con="하루짜리 노이즈일 수 있음(추세 아님)"
          leftTitle="상승 TOP3" rightTitle="하락 TOP3"
          left={byChg.slice(0, 3).map((e) => ({ key: e.code, name: e.name, right: pct(e.changeRate), tone: "text-up" }))}
          right={byChg.slice(-3).reverse().map((e) => ({ key: e.code, name: e.name, right: pct(e.changeRate), tone: "text-down" }))} />
        <KindCard color="#8b5cf6" title="3개월 수익(추세)"
          mean="최근 3개월 누적 수익률"
          pro="테마의 중기 방향이 보임"
          con="이미 오른 뒤일 수 있음 — 과거 수익 ≠ 미래"
          leftTitle="수익 TOP3" rightTitle="부진 TOP3"
          left={byRet3m.slice(0, 3).map((e) => ({ key: e.code, name: e.name, right: pct(e.ret3m), tone: "text-up" }))}
          right={byRet3m.slice(-3).reverse().map((e) => ({ key: e.code, name: e.name, right: pct(e.ret3m), tone: "text-down" }))} />
      </div>
      <p className="text-center text-[11px] text-white/35">&ldquo;TOP&rdquo;은 관측 기준의 순위일 뿐, 오를 상품이 아닙니다 · 매매신호·투자자문 아님</p>
    </div>
  );

  const detail = (
    <div className="space-y-10">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="추적 ETF" value={`${etf.topN}개`} sub="거래량 상위" accent="radar" />
        <Kpi label="구성종목" value={`${etfStocks.count}개`} sub="국내주식" />
        <Kpi label="평균 3개월 수익" value={`${avgRet > 0 ? "+" : ""}${avgRet.toFixed(1)}%`} accent={avgRet >= 0 ? "up" : "down"} />
        <Kpi label="테마 수" value={etf.themes.length} />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">구성종목 9분면 <span className="ml-1 align-middle text-xs font-normal text-amber-400">노출 × 자금유입률</span></h2>
          <Link href="/etf/stocks" className="text-sm text-amber-400 hover:text-amber-300">크게 보기 →</Link>
        </div>
        <EtfStockMap stocks={etfStocks.stocks} compact />
      </section>

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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ETF 레이더</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            거래량 상위 50개 ETF (인버스·2X 제외)의 실시간 수급·구성종목·테마.
          </p>
        </div>
        <span className="pill bg-amber-500/15 text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          실시간 · {etf.asOf}
        </span>
      </div>
      <SlideTabs summary={summary} detail={detail} />
    </div>
  );
}
