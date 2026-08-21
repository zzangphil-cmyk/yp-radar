import Link from "next/link";
import { RadarMark } from "@/components/Brand";
import EtfTable from "@/components/EtfTable";
import EtfStockMap from "@/components/EtfStockMap";
import CrossPanel from "@/components/CrossPanel";
import DeltaText from "@/components/DeltaText";
import CategoryTabs from "@/components/CategoryTabs";
import SigunguMap from "@/components/SigunguMap";
import {
  RegionGradeChart,
  GradeDistribution,
  MacroTimeline,
  ZoneRanking,
  PolicyPulse,
  ExpertConsensus,
  RealestateEntries,
} from "@/components/RealestatePanels";
import { etf, etfStocks, fmtAmt } from "@/lib/etfData";
import { changes } from "@/lib/npsData";
import { radarData } from "@/lib/radarData";
import { realestate as re } from "@/lib/realestateData";
import { cross } from "@/lib/cross";

export default function Hub() {
  const topThemes = etf.themes.slice(0, 5);
  const npsTotal = changes.totals.find((t) => t.year === changes.curYear)?.jo ?? 0;

  // ── 주식 대분류 ──────────────────────────────────────────────────────────
  const stock = (
    <div className="space-y-10">
      {/* 세부 진입 */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/radar" className="card group p-4 transition-colors hover:bg-white/[0.04]">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-white group-hover:text-[#3182f6]">관제 스코프</span>
            <span className="text-[11px] text-white/35">{radarData.asOf}</span>
          </div>
          <p className="mt-1 text-[12px] text-white/50">이상 신호 온도 · 2D/3D 실시간 레이더</p>
        </Link>
        <Link href="/etf" className="card group p-4 transition-colors hover:bg-white/[0.04]">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-white group-hover:text-amber-400">ETF</span>
            <span className="text-[11px] text-white/35">{etf.asOf}</span>
          </div>
          <p className="mt-1 text-[12px] text-white/50">수급·테마·구성종목 · 실시간</p>
        </Link>
        <Link href="/nps" className="card group p-4 transition-colors hover:bg-white/[0.04]">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-white group-hover:text-radar">국민연금</span>
            <span className="text-[11px] text-white/35">{changes.curYear}년 말</span>
          </div>
          <p className="mt-1 text-[12px] text-white/50">장기자금 포트폴리오 · DART 동향</p>
        </Link>
      </section>

      {/* ETF 구성종목 9분면 */}
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

      {/* 국민연금 구조 */}
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

      {/* 교차 신호 */}
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
          ※ ETF 자금 = 3개월 순유입(실시간) · 국민연금 = 지분율 증감(연간). 시점이 다른 두 신호의
          일치/괴리를 봅니다. 종목명을 누르면 ETF 보유 상세로 이동.
        </p>
      </section>
    </div>
  );

  // ── 부동산 대분류 ────────────────────────────────────────────────────────
  const realestate = (
    <div className="space-y-10">
      <RealestateEntries />

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">
            수도권 한눈에
            <span className="ml-2 align-middle text-xs font-normal text-[#4c8dff]">기준 {re.asOf}</span>
          </h2>
          <Link href="/realestate/capital_area_market_analyzer_v3_0.html" className="text-sm text-[#4c8dff] hover:text-[#7aa9ff]">
            분석기 열기 →
          </Link>
        </div>
        <p className="-mt-1 text-sm text-white/55">
          400세대 이상 <strong className="text-white/80">{re.counts.complexes.toLocaleString("ko-KR")}개 단지</strong>,{" "}
          <strong className="text-white/80">{re.counts.zones}개 생활권</strong>, {re.counts.sigungu}개 시군구를
          입지·상품·희소성으로 채점했습니다.
        </p>
        <SigunguMap />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <RegionGradeChart />
          <GradeDistribution />
        </div>
      </section>

      <section className="space-y-4">
        <div className="border-t border-white/[0.07] pt-8">
          <h2 className="section-title">가격 지도 — 어디가 비싸고, 어디가 움직였나</h2>
        </div>
        <ZoneRanking />
      </section>

      <section className="space-y-4">
        <div className="border-t border-white/[0.07] pt-8">
          <h2 className="section-title">돈의 값 — 거시 타이밍</h2>
        </div>
        <MacroTimeline />
      </section>

      <section className="space-y-4">
        <div className="border-t border-white/[0.07] pt-8">
          <h2 className="section-title">
            판을 움직이는 것 — 정책과 사람
            <span className="ml-2 align-middle text-xs font-normal text-white/40">긴 글 대신 한 장으로</span>
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <PolicyPulse />
          <ExpertConsensus />
        </div>
        <p className="text-xs text-white/40">
          ※ 급지·점수·컨센서스는 공개 데이터 기반 관측 지표이며 감정평가나 투자 권유가 아닙니다. 전문가 방향성은
          공개 발언을 정리한 것으로 본 사이트의 전망이 아닙니다. 출처: {re.source}
        </p>
      </section>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* 히어로 */}
      <section className="card relative overflow-hidden p-7 sm:p-9">
        <div className="pointer-events-none absolute -right-10 -top-16 opacity-20">
          <RadarMark size={210} />
        </div>
        <div className="relative max-w-2xl">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="pill bg-[#3182f6]/15 text-[#3182f6]">주식 · {radarData.asOf}</span>
            <span className="pill bg-[#3182f6]/15 text-[#4c8dff]">부동산 · {re.asOf}</span>
          </div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            주식과 부동산, 한 화면에
          </h1>
          <p className="mt-2 text-sm text-white/60">
            한국 가계 자산의 두 축을 같은 렌즈로 봅니다. <strong className="text-white">주식</strong>은
            이상 신호·수급·장기자금으로, <strong className="text-white">부동산</strong>은 급지·실거래·정책으로.
          </p>
        </div>
      </section>

      <CategoryTabs stock={stock} realestate={realestate} />
    </div>
  );
}
