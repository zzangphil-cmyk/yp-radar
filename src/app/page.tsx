import Link from "next/link";
import { RadarMark } from "@/components/Brand";
import EtfTable from "@/components/EtfTable";
import EtfStockMap from "@/components/EtfStockMap";
import CrossPanel from "@/components/CrossPanel";
import DeltaText from "@/components/DeltaText";
import { etf, etfStocks, fmtAmt } from "@/lib/etfData";
import { changes, formatEok } from "@/lib/npsData";
import { cross } from "@/lib/cross";

export default function Hub() {
  const topThemes = etf.themes.slice(0, 5);
  const npsTotal = changes.totals.find((t) => t.year === changes.curYear)?.jo ?? 0;

  return (
    <div className="space-y-10">
      {/* 히어로 */}
      <section className="card relative overflow-hidden p-7 sm:p-9">
        <div className="pointer-events-none absolute -right-10 -top-16 opacity-20">
          <RadarMark size={210} />
        </div>
        <div className="relative max-w-2xl">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="pill bg-amber-500/15 text-amber-400">ETF 실시간 · {etf.asOf}</span>
            <span className="pill bg-radar/15 text-radar">국민연금 · {changes.curYear}년 말</span>
          </div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            빠른 돈과 느린 돈을 한 화면에
          </h1>
          <p className="mt-2 text-sm text-white/60">
            <strong className="text-amber-400">ETF</strong>로 지금 시장의 수급·테마(실시간)를,{" "}
            <strong className="text-radar">국민연금</strong>으로 장기자금의 구조(연간)를 함께 봅니다.
            시점이 다른 두 신호의 <strong className="text-white">일치·괴리</strong>가 인사이트입니다.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/etf" className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-base-900 transition-colors hover:bg-amber-400">
              ETF 레이더
            </Link>
            <Link href="/nps" className="btn-radar">국민연금 레이더</Link>
          </div>
        </div>
      </section>

      {/* ① ETF 실시간 — 구성종목 9분면 (메인 쇼케이스) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">
            지금 시장 — ETF 구성종목 9분면
            <span className="ml-2 align-middle text-xs font-normal text-amber-400">실시간 · {etf.asOf}</span>
          </h2>
          <Link href="/etf/stocks" className="text-sm text-amber-400 hover:text-amber-300">크게 보기 →</Link>
        </div>
        <p className="-mt-1 text-sm text-white/55">
          상위 50개 ETF가 담은 종목을 <strong className="text-white/80">ETF 노출 규모</strong> ×{" "}
          <strong className="text-white/80">자금 유입률</strong>로 배치. 분면을 클릭하면 종목이 나열됩니다.
        </p>
        <EtfStockMap stocks={etfStocks.stocks} compact />

        {/* 보조: ETF 거래량 + 테마 자금 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-white/80">거래량 상위 ETF</span>
              <Link href="/etf" className="text-xs text-amber-400 hover:text-amber-300">ETF 전체 →</Link>
            </div>
            <EtfTable rows={etf.etfs.slice(0, 5)} />
          </div>
          <div className="card p-4">
            <div className="mb-3 text-sm font-semibold text-white/80">테마별 자금 TOP5</div>
            <ul className="space-y-2">
              {topThemes.map((t) => (
                <li key={t.theme} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="text-white/85">{t.theme}</span>
                    <span className="chip">{t.count}</span>
                  </span>
                  <span className="flex items-center gap-2 tabular-nums">
                    <span className="text-white/55">{fmtAmt(t.amount)}</span>
                    {t.avgRet != null && (
                      <span className={`w-12 text-right ${t.avgRet >= 0 ? "text-up" : "text-down"}`}>
                        {t.avgRet >= 0 ? "+" : ""}{t.avgRet}%
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ② 국민연금 구조 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.07] pt-8">
          <h2 className="section-title">
            큰손의 구조 — 국민연금
            <span className="ml-2 align-middle text-xs font-normal text-radar">연간 · {changes.curYear}년 말</span>
          </h2>
          <Link href="/nps" className="text-sm link-radar">국민연금 전체 →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-4">
            <div className="text-xs text-white/45">국내주식 평가액</div>
            <div className="mt-1.5 text-2xl font-bold text-radar">{npsTotal}조</div>
          </div>
          <div className="card p-4">
            <div className="text-xs text-white/45">매집 / 축소</div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums">
              <span className="text-up">{changes.counts.accumulated}</span>
              <span className="text-white/30"> / </span>
              <span className="text-down">{changes.counts.reduced}</span>
            </div>
          </div>
          <div className="card col-span-2 p-4">
            <div className="mb-1 text-xs text-white/45">매집 TOP3 · 축소 TOP3</div>
            <div className="grid grid-cols-2 gap-x-4 text-sm">
              <ul>
                {changes.accumulated.slice(0, 3).map((r) => (
                  <li key={r.slug} className="flex justify-between py-0.5">
                    <Link href={`/nps/stock/${encodeURIComponent(r.slug)}`} className="truncate text-white/85 hover:text-radar">{r.name}</Link>
                    <DeltaText v={r.ownDelta} />
                  </li>
                ))}
              </ul>
              <ul>
                {changes.reduced.slice(0, 3).map((r) => (
                  <li key={r.slug} className="flex justify-between py-0.5">
                    <Link href={`/nps/stock/${encodeURIComponent(r.slug)}`} className="truncate text-white/85 hover:text-radar">{r.name}</Link>
                    <DeltaText v={r.ownDelta} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ③ 교차 신호 (종목 단위) */}
      <section className="space-y-4">
        <div className="border-t border-white/[0.07] pt-8">
          <h2 className="section-title">교차 신호 — ETF × 국민연금</h2>
          <p className="mt-1 max-w-2xl text-sm text-white/55">
            같은 종목을 두 렌즈로. <strong className="text-amber-400">ETF 자금(실시간)</strong>과{" "}
            <strong className="text-radar">국민연금 지분변화(연간)</strong>가 일치하면 공감대,
            엇갈리면 주의. 공통 보유 {cross.matched}종목 분석.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CrossPanel title="🟢 공감대 매수" desc="ETF·국민연금 둘 다 사는 중" tone="text-radar" items={cross.convergeBuy} />
          <CrossPanel title="⚠️ 괴리 · ETF 과열" desc="ETF 자금 유입 ↔ 국민연금은 축소 (과열 주의)" tone="text-up" items={cross.divergeHotEtf} />
          <CrossPanel title="🔵 역발상" desc="ETF 자금 유출 ↔ 국민연금은 매집" tone="text-down" items={cross.divergeContra} />
          <CrossPanel title="🔻 공감대 매도" desc="ETF·국민연금 둘 다 줄이는 중" tone="text-white/70" items={cross.convergeSell} />
        </div>
        <p className="text-xs text-white/40">
          ※ ETF 자금 = 3개월 순유입(2026, 실시간) · 국민연금 = 지분율 증감(2023→2024, 연간). 시점이
          다른 두 신호의 일치/괴리를 봅니다. 종목명을 누르면 ETF 보유 상세로 이동.
        </p>
      </section>
    </div>
  );
}
