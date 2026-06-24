import Link from "next/link";
import Kpi from "@/components/Kpi";
import Sparkline from "@/components/Sparkline";
import DeltaText from "@/components/DeltaText";
import { insights, formatEok, type ChangeRow, type TrendItem } from "@/lib/npsData";

function stockHref(slug: string) {
  return `/nps/stock/${encodeURIComponent(slug)}`;
}

function DivergenceTable({ rows }: { rows: ChangeRow[] }) {
  if (rows.length === 0)
    return <div className="card p-6 text-center text-sm text-white/40">해당 종목 없음</div>;
  return (
    <div className="card overflow-x-auto scroll-x">
      <table className="w-full min-w-[520px] border-collapse">
        <thead>
          <tr className="border-b border-white/[0.07]">
            <th className="th">종목</th>
            <th className="th text-right">Δ지분율 (매매)</th>
            <th className="th text-right">Δ평가액 (주가)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
              <td className="td">
                <Link href={stockHref(r.slug)} className="font-medium text-white hover:text-radar">
                  {r.name}
                </Link>
              </td>
              <td className="td text-right font-semibold tabular-nums"><DeltaText v={r.ownDelta} /></td>
              <td className="td text-right tabular-nums"><DeltaText v={r.valDelta} suffix="억" digits={0} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendList({ rows, tone }: { rows: TrendItem[]; tone: string }) {
  return (
    <div className="card overflow-x-auto scroll-x">
      <table className="w-full min-w-[420px] border-collapse">
        <thead>
          <tr className="border-b border-white/[0.07]">
            <th className="th">종목</th>
            <th className="th text-right">5년 순증감</th>
            <th className="th text-center">추세</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.slug} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
              <td className="td">
                <Link href={stockHref(r.slug)} className="font-medium text-white hover:text-radar">
                  {r.name}
                </Link>
              </td>
              <td className={`td text-right font-semibold tabular-nums ${tone}`}>
                {r.net > 0 ? "+" : ""}{r.net}%p
              </td>
              <td className="td"><div className="flex justify-center"><Sparkline data={r.trend} /></div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function InsightsPage() {
  const d = insights;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">인사이트</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-white/55">
          단순 보유 수치를 넘어, 국민연금의 행동에서 읽히는 신호. 포트폴리오 변화는
          국내외 증시·정치·신기술 테마가 섞인 결과이므로, 주가 효과와 실제 매매를
          분리해 봅니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="국내주식 평가액" value={`${d.concentration.totalJo}조`} accent="radar" />
        <Kpi label="상위 10종목 비중" value={`${d.concentration.top10}%`} />
        <Kpi label="상위 50종목 비중" value={`${d.concentration.top50}%`} />
        <Kpi label="상위 100종목 비중" value={`${d.concentration.top100}%`} />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="section-title text-up">⚠️ 테마 거품 주의</h2>
          <p className="mt-1 text-sm text-white/55">
            주가(평가액)는 올랐는데 국민연금은 지분을 <strong>줄인</strong> 종목.
            테마·시장 효과로 가격만 오른 신호일 수 있습니다.
          </p>
        </div>
        <DivergenceTable rows={d.themeBubble} />
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="section-title text-radar">🟢 역발상 매집</h2>
          <p className="mt-1 text-sm text-white/55">
            주가가 빠진 구간에서 오히려 국민연금이 지분을 <strong>늘린</strong> 종목.
          </p>
        </div>
        <DivergenceTable rows={d.contrarian} />
      </section>

      <section className="space-y-3">
        <h2 className="section-title">추세 일관성 ({d.years[0]}~{d.curYear})</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-up">5년 연속 매집</div>
            <TrendList rows={d.consecAccum} tone="text-up" />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-semibold text-down">5년 연속 축소</div>
            <TrendList rows={d.consecReduce} tone="text-down" />
          </div>
        </div>
      </section>

      <p className="text-xs text-white/40">
        ※ 섹터별 순매수/순매도, 정책·테마 태깅은 후속 업데이트 예정(외부 섹터 데이터
        연동 필요). 현재 지표는 모두 국민연금 공식 연간공시 기반.
      </p>
    </div>
  );
}
