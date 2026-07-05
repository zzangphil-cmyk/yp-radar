import Link from "next/link";
import Kpi from "@/components/Kpi";
import BarChart from "@/components/BarChart";
import Sparkline from "@/components/Sparkline";
import DeltaText from "@/components/DeltaText";
import { RadarMark } from "@/components/Brand";
import RecentTable from "@/components/RecentTable";
import QuadrantChart from "@/components/QuadrantChart";
import AllocationChart from "@/components/AllocationChart";
import SlideTabs from "@/components/SlideTabs";
import KindCard from "@/components/KindCard";
import { changes, recent, quadrant, allocation, formatEok, formatYmd } from "@/lib/npsData";

function HighlightList({
  title,
  tone,
  rows,
}: {
  title: string;
  tone: string;
  rows: { name: string; slug: string; right: React.ReactNode }[];
}) {
  return (
    <div className="card p-4">
      <div className={`mb-2 text-sm font-semibold ${tone}`}>{title}</div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.slug}>
            <Link
              href={`/nps/stock/${encodeURIComponent(r.slug)}`}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-white/[0.04]"
            >
              <span className="truncate text-white/85">{r.name}</span>
              <span className="ml-2 shrink-0 tabular-nums">{r.right}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Dashboard() {
  const total = changes.totals.find((t) => t.year === changes.curYear)?.jo ?? 0;
  const { counts } = changes;
  const recentDate = formatYmd(recent.recentFilings[0]?.date ?? recent.asOf);
  const dom = allocation.assets.find((a) => a.name === "국내주식");
  const ovs = allocation.assets.find((a) => a.name === "해외주식");

  // 결론 TOP5: 국민연금이 실제로 가장 사 모은 종목(지분율 증가) — 이유 = 지분 변화 + 평가액
  const top5 = changes.accumulated.slice(0, 5);
  const recentBuys = recent.recentFilings.filter((f) => (f.ownDelta ?? 0) > 0).slice(0, 3);
  const recentSells = recent.recentFilings.filter((f) => (f.ownDelta ?? 0) < 0).slice(0, 3);

  const summary = (
    <div className="space-y-6">
      {/* 포지션 맵 (비주얼) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">포지션 맵 <span className="ml-2 align-middle text-xs font-normal text-white/45">매매 × 추정수익</span></h2>
          <Link href="/nps/map" className="text-sm link-radar">크게 보기 →</Link>
        </div>
        <QuadrantChart q={quadrant} compact />
      </section>

      {/* 결론부터 — 국민연금이 가장 사 모은 TOP5 */}
      <div className="rounded-[20px] bg-base-800 p-4">
        <div className="mb-1 text-[14px] font-bold text-white">결론 — 국민연금이 실제로 가장 사 모은 TOP 5 <span className="text-[11px] font-normal text-white/40">({changes.prevYear}→{changes.curYear})</span></div>
        <p className="mb-2 text-[12px] text-white/45">주가와 무관하게 <strong className="text-white/60">지분율이 실제로 늘어난</strong>(=순매수) 순서. 왜 이 순위인지를 오른쪽에 적었다.</p>
        <ul className="space-y-0.5">
          {top5.map((r, k) => (
            <li key={r.slug}>
              <Link href={`/nps/stock/${encodeURIComponent(r.slug)}`} className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-white/[0.04]">
                <span className="w-4 shrink-0 text-center text-[13px] font-bold tabular-nums text-white/35">{k + 1}</span>
                <span className="min-w-0 shrink-0 truncate text-[13px] font-semibold text-white/90">{r.name}</span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-up">지분 +{r.ownDelta}%p</span>
                <span className="min-w-0 flex-1 truncate text-right text-[11px] text-white/45">{r.ownPrev}% → {r.ownCur}% · 평가액 {formatEok(r.valCur)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {/* 유형별 서머리 — 의미·장단점 선언 + TOP3 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KindCard color="#16c79a" title="실제 매매 (연간 지분율)"
          mean="1년 사이 지분율이 실제로 변한 종목 (주가 효과 제거)"
          pro="세계 3대 연기금의 실제 순매수·순매도 방향"
          con="연 1회 공시 — 최대 9개월 늦은 스냅샷"
          leftTitle="매집 TOP3" rightTitle="축소 TOP3"
          left={changes.accumulated.slice(0, 3).map((r) => ({ key: r.slug, name: r.name, right: `+${r.ownDelta}%p`, tone: "text-up" }))}
          right={changes.reduced.slice(0, 3).map((r) => ({ key: r.slug, name: r.name, right: `${r.ownDelta}%p`, tone: "text-down" }))} />
        <KindCard color="#f5a623" title="신규 편입 / 전량 매도"
          mean="포트폴리오에 새로 들어오거나 완전히 나간 종목"
          pro="연기금의 시각 변화가 가장 뚜렷한 신호"
          con="편입 규모가 작으면 인덱스 추종일 수 있음"
          leftTitle="신규 TOP3" rightTitle="전량매도 TOP3"
          left={changes.newEntries.slice(0, 3).map((r) => ({ key: r.slug, name: r.name, right: formatEok(r.value), tone: "text-radar" }))}
          right={changes.exits.slice(0, 3).map((r) => ({ key: r.slug, name: r.name, right: formatEok(r.prevValue), tone: "text-white/50" }))} />
        <KindCard color="#06b6d4" title="최근 5%+ 동향 (DART)"
          mean="5% 이상 보유 종목의 거의 실시간 매매 보고"
          pro="연간공시와 달리 지금 움직임이 보임"
          con="5% 이상 보유분만 — 전체 포트폴리오의 일부"
          leftTitle="최근 매수 TOP3" rightTitle="최근 매도 TOP3"
          left={recentBuys.map((f) => ({ key: f.slug + f.date, name: f.name, right: `+${f.ownDelta}%p`, tone: "text-up" }))}
          right={recentSells.map((f) => ({ key: f.slug + f.date, name: f.name, right: `${f.ownDelta}%p`, tone: "text-down" }))} />
      </div>
      <p className="text-center text-[11px] text-white/35">&ldquo;TOP&rdquo;은 공시 데이터의 관측 순위일 뿐, 추천이 아닙니다 · 매매신호·투자자문 아님</p>
    </div>
  );

  const detail = (
    <div className="space-y-10">
      {/* 최근 동향 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="section-title">
            최근 국민연금 동향 <span className="ml-1 align-middle text-xs font-normal text-radar">DART 실시간 · {recentDate}</span>
          </h2>
          <Link href="/nps/recent" className="text-sm link-radar">전체 5%+ 동향 →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="최신 보고일" value={recentDate} accent="radar" />
          <Kpi label="현재 5%+ 보유" value={`${recent.counts.holdings}종목`} />
          <Kpi label="최근 매수" value={recent.counts.recentBuy} accent="up" sub="최근 85일" />
          <Kpi label="최근 매도" value={recent.counts.recentSell} accent="down" sub="최근 85일" />
        </div>
        <RecentTable rows={recent.recentFilings.slice(0, 6)} />
      </section>

      {/* 자산배분 */}
      {dom && ovs && (
        <section className="space-y-3">
          <h2 className="section-title">
            자산배분 — 국내 vs 해외 주식
            <span className="ml-2 align-middle text-xs font-normal text-white/45">{allocation.asOf} · 시장가</span>
          </h2>
          <div className="card p-5">
            <AllocationChart data={allocation} />
            <p className="mt-4 text-sm text-white/65">
              국내주식 비중 <strong className="text-radar">{dom.pct[0]}%</strong>({allocation.periods[0]}) →{" "}
              <strong className="text-radar">{dom.pct[3]}%</strong>({allocation.periods[3]})로 <strong className="text-white">축소</strong>되는 동안,
              해외주식은 <strong className="text-down">{ovs.pct[0]}%</strong> → <strong className="text-down">{ovs.pct[3]}%</strong>로 확대됐습니다.
            </p>
            <p className="mt-1.5 text-xs text-white/40">
              ※ 2025~2026 국내 비중 반등은 국내증시 급등에 따른 평가액 상승(시장 효과) 영향이 큽니다. 출처: {allocation.source}.
            </p>
          </div>
        </section>
      )}

      {/* 전체 포트폴리오 */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3 border-t border-white/[0.07] pt-8">
          <div>
            <h2 className="section-title">전체 포트폴리오</h2>
            <p className="mt-1 text-sm text-white/50">전체 1,200여 종목 · {changes.curYear}년 말 연간공시 (다음 ~2026년 9월)</p>
          </div>
          <Link href="/nps/holdings" className="hidden text-sm link-radar sm:block">전체 보기 →</Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi label="국내주식 평가액" value={`${total}조`} sub={`${changes.curYear}년 말`} accent="radar" />
          <Kpi label="실제 매집 종목" value={counts.accumulated} accent="up" sub={`${changes.prevYear}→${changes.curYear}`} />
          <Kpi label="실제 축소 종목" value={counts.reduced} accent="down" sub={`${changes.prevYear}→${changes.curYear}`} />
          <Kpi label="신규 / 매도" value={`${counts.newEntries} / ${counts.exits}`} sub="편입 / 전량매도" />
        </div>
        <div className="card p-5">
          <div className="mb-4 text-sm font-semibold text-white/80">국내주식 총 평가액 추이 (조원)</div>
          <BarChart data={changes.totals.map((t) => ({ label: t.year, value: t.jo }))} />
        </div>
      </section>

      {/* 연간 하이라이트 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">연간 하이라이트 ({changes.prevYear}→{changes.curYear})</h2>
          <Link href="/nps/changes" className="text-sm link-radar">전체 보기 →</Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HighlightList title="▲ 실제 매집 TOP" tone="text-up"
            rows={changes.accumulated.slice(0, 5).map((r) => ({ name: r.name, slug: r.slug, right: <DeltaText v={r.ownDelta} /> }))} />
          <HighlightList title="▼ 실제 축소 TOP" tone="text-down"
            rows={changes.reduced.slice(0, 5).map((r) => ({ name: r.name, slug: r.slug, right: <DeltaText v={r.ownDelta} /> }))} />
          <HighlightList title="＋ 신규 편입" tone="text-radar"
            rows={changes.newEntries.slice(0, 5).map((r) => ({ name: r.name, slug: r.slug, right: <span className="text-white/60">{formatEok(r.value)}</span> }))} />
          <HighlightList title="✕ 전량 매도" tone="text-white/70"
            rows={changes.exits.slice(0, 5).map((r) => ({ name: r.name, slug: r.slug, right: <span className="text-white/50">{formatEok(r.prevValue)}</span> }))} />
        </div>
      </section>

      {/* 상위 보유 TOP10 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="section-title">상위 보유 종목</h2>
          <Link href="/nps/holdings" className="text-sm link-radar">전체 1,200종목 →</Link>
        </div>
        <div className="card overflow-x-auto scroll-x">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="th w-10 text-right">#</th>
                <th className="th">종목</th>
                <th className="th text-right">평가액</th>
                <th className="th text-right">지분율</th>
                <th className="th text-center">5년 추세</th>
              </tr>
            </thead>
            <tbody>
              {changes.topHoldings.slice(0, 10).map((h, i) => (
                <tr key={h.slug} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="td text-right text-white/40">{i + 1}</td>
                  <td className="td">
                    <Link href={`/nps/stock/${encodeURIComponent(h.slug)}`} className="font-medium text-white hover:text-radar">{h.name}</Link>
                  </td>
                  <td className="td text-right tabular-nums">{formatEok(h.value)}</td>
                  <td className="td text-right font-semibold tabular-nums text-radar">{h.ownership}%</td>
                  <td className="td"><div className="flex justify-center"><Sparkline data={h.trend} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* 히어로 (compact) */}
      <section className="card relative overflow-hidden p-7 sm:p-8">
        <div className="pointer-events-none absolute -right-10 -top-16 opacity-20">
          <RadarMark size={200} />
        </div>
        <div className="relative max-w-2xl">
          <p className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
            <span className="text-radar">최근 5%+ 동향 {recentDate}</span>
            <span className="text-white/30">·</span>
            <span className="text-white/50">전체 포트폴리오 {changes.curYear}년 말</span>
          </p>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
            국민연금이 사고판 종목을 한눈에 추적하다
          </h1>
          <p className="mt-2 text-sm text-white/60">
            5% 이상 보유 종목은 DART로 거의 실시간, 전체 1,200여 종목은 연 1회 공식
            공시로. 지분율(실제 매매)과 수익을 함께 봅니다.
          </p>
        </div>
      </section>

      <SlideTabs summary={summary} detail={detail} />
    </div>
  );
}
