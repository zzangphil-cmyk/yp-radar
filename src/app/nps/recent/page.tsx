import Kpi from "@/components/Kpi";
import RecentTable from "@/components/RecentTable";
import { recent, formatYmd } from "@/lib/npsData";

export default function RecentPage() {
  const d = recent;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">최근 동향</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            국민연금의 <strong>5% 이상 보유 종목</strong>에 대한 실시간 지분 변동
            공시(DART). 연간 전체 포트폴리오와 달리 거의 실시간으로 갱신됩니다.
          </p>
        </div>
        <span className="pill bg-radar/15 text-radar">
          <span className="h-1.5 w-1.5 rounded-full bg-radar" />
          DART 실시간 · 최신 {formatYmd(d.recentFilings[0]?.date ?? d.asOf)}
        </span>
      </div>

      <div className="card border-radar/15 bg-radar/[0.05] p-4 text-sm text-white/75">
        <strong className="text-radar">참고.</strong> 이 페이지는 국민연금이 5% 이상
        보유해 <strong className="text-white">대량보유 보고 의무가 있는 종목</strong>만
        다룹니다. 삼성전자·SK하이닉스처럼 안정적으로 보유(변동 1%p 미만)하는 종목은
        공시가 발생하지 않아 여기 잡히지 않으며, 그런 핵심 보유는{" "}
        <strong className="text-white">[보유 종목]</strong>의 연간 전체 포트폴리오에서
        확인하세요.
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="현재 5%+ 보유" value={`${d.counts.holdings}종목`} accent="radar" />
        <Kpi label="최근 매수" value={d.counts.recentBuy} accent="up" sub="최근 85일" />
        <Kpi label="최근 매도" value={d.counts.recentSell} accent="down" sub="최근 85일" />
        <Kpi label="최신 보고일" value={formatYmd(d.recentFilings[0]?.date ?? d.asOf)} />
      </div>

      <section className="space-y-3">
        <h2 className="section-title">최근 지분 변동 (최근 85일)</h2>
        <RecentTable rows={d.recentFilings} />
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <h2 className="section-title">현재 5%+ 보유 현황</h2>
          <span className="text-xs text-white/40">
            universe {d.universeAsOf} · 지분율은 최신 공시 반영
          </span>
        </div>
        <RecentTable rows={d.holdings} />
      </section>

      <p className="text-xs text-white/40">
        ※ 출처: {d.source}. 대량보유 보고는 지분율이 1%p 이상 변동하거나 5%선을
        넘나들 때 제출됩니다. 일부 종목은 종목명 표기 차이로 증감 정보가 빠질 수
        있습니다.
      </p>
    </div>
  );
}
