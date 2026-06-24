import Link from "next/link";
import Kpi from "@/components/Kpi";
import BarChart from "@/components/BarChart";
import Sparkline from "@/components/Sparkline";
import ChangesTabs from "@/components/ChangesTabs";
import { changes, formatEok } from "@/lib/npsData";

export default function ChangesPage() {
  const d = changes;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          변화 분석 ({d.prevYear} → {d.curYear})
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-white/55">
          국민연금이 1년간 무엇을 사 모으고 줄였는지. 연간공시 스냅샷 비교.
        </p>
      </div>

      <div className="card border-radar/15 bg-radar/[0.05] p-4 text-sm text-white/75">
        <strong className="text-radar">읽는 법.</strong>{" "}
        <strong className="text-white">지분율 변화</strong>는 국민연금의 실제 매매
        결정(주식 수 증감)이고, <strong className="text-white">평가액 변화</strong>는
        국내외 증시·정치·신기술 테마에 따른 주가 효과까지 포함합니다. 둘을 나란히
        보면 “테마로 주가만 오른 것”과 “실제로 사 모은 것”을 구분할 수 있습니다.
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="실제 매집" value={d.counts.accumulated} accent="up" sub="지분율 증가" />
        <Kpi label="실제 축소" value={d.counts.reduced} accent="down" sub="지분율 감소" />
        <Kpi label="신규 편입" value={d.counts.newEntries} accent="radar" />
        <Kpi label="전량 매도" value={d.counts.exits} />
      </div>

      <div className="card p-5">
        <div className="mb-4 section-title">국내주식 총 평가액 추이 (조원)</div>
        <BarChart data={d.totals.map((t) => ({ label: t.year, value: t.jo }))} />
      </div>

      <ChangesTabs data={d} />

      <section>
        <h2 className="mb-3 section-title">상위 보유 종목 5년 지분율 추세</h2>
        <div className="card overflow-x-auto scroll-x">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="border-b border-white/[0.07]">
                <th className="th">종목</th>
                <th className="th text-right">평가액</th>
                {d.years.map((y) => (
                  <th key={y} className="th text-right">{y}</th>
                ))}
                <th className="th text-center">추세</th>
              </tr>
            </thead>
            <tbody>
              {d.topHoldings.map((h) => (
                <tr key={h.slug} className="border-b border-white/[0.04] hover:bg-white/[0.03]">
                  <td className="td">
                    <Link href={`/nps/stock/${encodeURIComponent(h.slug)}`} className="font-medium text-white hover:text-radar">
                      {h.name}
                    </Link>
                  </td>
                  <td className="td text-right tabular-nums text-white/60">{formatEok(h.value)}</td>
                  {h.trend.map((v, i) => (
                    <td key={i} className="td text-right tabular-nums text-white/75">
                      {v == null ? "-" : `${v}%`}
                    </td>
                  ))}
                  <td className="td">
                    <div className="flex justify-center"><Sparkline data={h.trend} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-white/40">
        ※ 출처: 국민연금기금운용본부 연간공시. 연 1회·약 9개월 지연.
      </p>
    </div>
  );
}
