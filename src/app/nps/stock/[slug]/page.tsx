import Link from "next/link";
import { notFound } from "next/navigation";
import TrendChart from "@/components/TrendChart";
import DeltaText from "@/components/DeltaText";
import Kpi from "@/components/Kpi";
import { panel, getStock, holdingsCur, formatEok } from "@/lib/npsData";

// 상위 보유 종목만 미리 생성, 나머지는 요청 시 렌더
export function generateStaticParams() {
  const cur = panel.curYear;
  return holdingsCur()
    .sort((a, b) => (b.byYear[cur]?.value ?? 0) - (a.byYear[cur]?.value ?? 0))
    .slice(0, 400)
    .map((s) => ({ slug: s.slug }));
}
export const dynamicParams = true;

export default async function StockPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stock = getStock(decodeURIComponent(slug));
  if (!stock) notFound();

  const cur = panel.curYear;
  const c = stock.byYear[cur];
  const ownPoints = panel.years.map((y) => ({
    label: y,
    value: stock.byYear[y]?.ownership ?? null,
  }));
  const valPoints = panel.years.map((y) => ({
    label: y,
    value: stock.byYear[y]?.value != null ? Math.round(stock.byYear[y]!.value! / 1000) / 10 : null,
  }));

  // 해석
  const od = stock.ownDelta;
  const vd = stock.valDelta;
  let verdict = "";
  if (od != null && vd != null) {
    if (vd > 0 && od < -0.1)
      verdict = "⚠️ 주가는 올랐지만 국민연금은 지분을 줄였습니다 (테마/시장 효과로 평가액만 증가).";
    else if (vd < 0 && od > 0.1)
      verdict = "🟢 주가가 빠진 구간에서 오히려 지분을 늘렸습니다 (역발상 매집).";
    else if (od > 0.1) verdict = "🟢 국민연금이 실제 지분을 늘린 종목입니다 (매집).";
    else if (od < -0.1) verdict = "🔻 국민연금이 실제 지분을 줄인 종목입니다 (축소).";
    else verdict = "지분율 변화가 크지 않은 안정 보유 종목입니다.";
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/nps/holdings" className="text-sm text-white/45 hover:text-white">
          ← 보유 종목
        </Link>
        <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{stock.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={`평가액 (${cur})`} value={c ? formatEok(c.value) : "-"} accent="radar" />
        <Kpi label="지분율" value={c?.ownership != null ? `${c.ownership}%` : "-"} />
        <Kpi label="포트폴리오 비중" value={c?.weight != null ? `${c.weight}%` : "-"} />
        <Kpi label="전년比 지분율" value={<DeltaText v={stock.ownDelta} />} />
      </div>

      {verdict && (
        <div className="card border-radar/15 bg-radar/[0.05] p-4 text-sm text-white/80">
          {verdict}
        </div>
      )}

      <section className="card p-5">
        <div className="mb-2 section-title">지분율 추이 (%)</div>
        <TrendChart points={ownPoints} unit="%" color="#16c79a" />
      </section>

      <section className="card p-5">
        <div className="mb-2 section-title">평가액 추이 (조원)</div>
        <TrendChart points={valPoints} unit="조" color="#4c8dff" />
      </section>

      <div className="card overflow-x-auto scroll-x">
        <table className="w-full min-w-[480px] border-collapse">
          <thead>
            <tr className="border-b border-white/[0.07]">
              <th className="th">연도</th>
              <th className="th text-right">평가액</th>
              <th className="th text-right">비중</th>
              <th className="th text-right">지분율</th>
            </tr>
          </thead>
          <tbody>
            {panel.years.map((y) => {
              const v = stock.byYear[y];
              return (
                <tr key={y} className="border-b border-white/[0.04]">
                  <td className="td font-medium text-white/90">{y}</td>
                  <td className="td text-right tabular-nums">{v ? formatEok(v.value) : "-"}</td>
                  <td className="td text-right tabular-nums text-white/60">
                    {v?.weight != null ? `${v.weight}%` : "-"}
                  </td>
                  <td className="td text-right tabular-nums">
                    {v?.ownership != null ? `${v.ownership}%` : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
