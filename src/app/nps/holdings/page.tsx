import Kpi from "@/components/Kpi";
import HoldingsTable, { type HoldingRow } from "@/components/HoldingsTable";
import { holdingsCur, panel, insights } from "@/lib/npsData";

export default function HoldingsPage() {
  const cur = panel.curYear;
  const rows: HoldingRow[] = holdingsCur()
    .map((s) => ({
      name: s.name,
      slug: s.slug,
      value: s.byYear[cur]?.value ?? 0,
      weight: s.byYear[cur]?.weight ?? null,
      ownership: s.byYear[cur]?.ownership ?? null,
      ownDelta: s.ownDelta,
    }))
    .sort((a, b) => b.value - a.value);

  const over5 = rows.filter((r) => (r.ownership ?? 0) >= 5).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">보유 종목</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-white/55">
          국민연금이 보유한 국내주식 전체 종목 ({cur}년 말 기준). 종목을 클릭하면
          5년 추이를 볼 수 있습니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="국내주식 평가액" value={`${insights.concentration.totalJo}조`} accent="radar" />
        <Kpi label="보유 종목 수" value={rows.length.toLocaleString("ko-KR")} />
        <Kpi label="지분율 5%+ 종목" value={over5} accent="radar" />
        <Kpi label="상위 10종목 비중" value={`${insights.concentration.top10}%`} sub="평가액 기준" />
      </div>

      <HoldingsTable rows={rows} />

      <p className="text-xs text-white/40">
        ※ ‘지분율’ = 발행주식 대비 국민연금 보유 비율(실제 매매 신호), ‘비중’ =
        국민연금 국내주식 포트폴리오 내 비중, ‘전년比’ = 직전 연도 대비 지분율 증감.
      </p>
    </div>
  );
}
