import EtfMap9 from "@/components/EtfMap9";
import EtfTable from "@/components/EtfTable";
import { etf } from "@/lib/etfData";

export default function EtfMapPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">ETF 포지션 맵 9분면</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            거래량 상위 50개 ETF를 <strong>자금(거래대금)</strong> × <strong>3개월 수익률</strong>로
            3×3 분면에 배치. 분면을 클릭하면 해당 ETF가 나열됩니다.
          </p>
        </div>
        <span className="pill bg-amber-500/15 text-amber-400">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
          실시간 · {etf.asOf}
        </span>
      </div>

      <EtfMap9 rows={etf.etfs} />

      <div className="card border-amber-500/15 bg-amber-500/[0.05] p-4 text-sm text-white/75">
        <strong className="text-amber-400">읽는 법.</strong> 오른쪽(자금 많음) + 위쪽(수익 높음)
        = 돈도 몰리고 성과도 좋은 주력 ETF. 오른쪽 아래(자금 많은데 수익 부진)는 과열/되돌림 주의 구간.
        왼쪽 위(소형 자금 + 성과 우수)는 떠오르는 ETF.
      </div>

      <h2 className="section-title">상위 50 목록</h2>
      <EtfTable rows={etf.etfs} />
    </div>
  );
}
