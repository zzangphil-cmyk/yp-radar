import Link from "next/link";
import Heatmap, { type HeatTile } from "@/components/Heatmap";
import { etf, etfStocks, fmtAmt, fmtEok, heatColor } from "@/lib/etfData";

export default function EtfThemesPage() {
  const maxAmt = Math.max(...etf.themes.map((t) => t.amount), 1);
  const heatTiles: HeatTile[] = etf.themes.map((t) => ({
    key: t.theme,
    label: t.theme,
    sub: t.avgRet != null ? `${t.avgRet >= 0 ? "+" : ""}${t.avgRet}%` : fmtAmt(t.amount),
    value: t.amount,
    color: heatColor(t.avgRet, 60),
  }));

  // 테마별 상위 구성종목 (노출 기준)
  const stocksByTheme = (theme: string) =>
    etfStocks.stocks
      .filter((s) => s.themes.includes(theme))
      .sort((a, b) => b.exposure - a.exposure)
      .slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">테마</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            상위 30개 ETF를 테마로 묶어 자금(거래대금)·수익률·주요 종목을 봅니다.
          </p>
        </div>
        <span className="pill bg-amber-500/15 text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          실시간 · {etf.asOf}
        </span>
      </div>

      <section className="space-y-2">
        <h2 className="section-title">테마 히트맵 <span className="ml-1 align-middle text-xs font-normal text-white/45">크기=자금 · 색=평균수익</span></h2>
        <Heatmap tiles={heatTiles} height={230} />
      </section>

      <div className="space-y-3">
        {etf.themes.map((t) => (
          <div key={t.theme} className="card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-base font-bold text-white">{t.theme}</div>
              <span className="chip">{t.count}개 ETF</span>
              <div className="ml-auto flex items-center gap-3 text-sm tabular-nums">
                <span className="text-white/55">자금 {fmtAmt(t.amount)}</span>
                {t.avgRet != null && (
                  <span className={t.avgRet >= 0 ? "text-up" : "text-down"}>
                    평균 {t.avgRet >= 0 ? "+" : ""}{t.avgRet}%
                  </span>
                )}
              </div>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.05]">
              <div className="h-full rounded-full bg-amber-500/70" style={{ width: `${(t.amount / maxAmt) * 100}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs text-white/40">ETF</div>
                <div className="flex flex-wrap gap-1.5">
                  {t.etfs.map((n) => <span key={n} className="chip">{n}</span>)}
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-white/40">주요 구성종목 (노출순)</div>
                <ul className="space-y-0.5">
                  {stocksByTheme(t.theme).map((s) => (
                    <li key={s.code} className="flex items-center justify-between">
                      <Link href={`/etf/stock/${s.code}`} className="text-white/85 hover:text-amber-400">{s.name}</Link>
                      <span className="tabular-nums text-white/50">{fmtEok(s.exposure)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-white/40">
        ※ 테마는 ETF명 기반 자동 분류. 자금 = 거래대금 합. 주요 종목 노출 = Σ(ETF 비중×순자산).
      </p>
    </div>
  );
}
