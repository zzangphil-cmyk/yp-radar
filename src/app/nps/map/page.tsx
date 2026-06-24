import QuadrantChart from "@/components/QuadrantChart";
import { quadrant } from "@/lib/npsData";

export default function MapPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">포지션 맵</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-white/55">
          국민연금의 <strong>지분율 변화(실제 매매)</strong>와 <strong>추정 수익률</strong>을
          두 축으로 종목을 배치합니다. 영역을 클릭하면 해당 종목이 나열됩니다.
        </p>
      </div>

      <div className="card border-radar/15 bg-radar/[0.05] p-4 text-sm text-white/75">
        <strong className="text-radar">추정 수익률.</strong> 보유 평가액과 지분율만으로
        가격 수익률을 역산합니다 —{" "}
        <code className="rounded bg-white/10 px-1.5 py-0.5 text-xs">
          (평가액₂/평가액₁) ÷ (지분율₂/지분율₁) − 1
        </code>
        . 지분율이 보유주식 수에 비례한다는 가정에 기반한 <strong className="text-white">근사치</strong>로,
        증자·감자·배당은 반영되지 않으며 양 시점 모두 보유한 종목만 대상입니다.
      </div>

      <QuadrantChart q={quadrant} />

      <p className="text-xs text-white/40">
        ※ 영역 기준: 지분율 변화 ±0.3%p 이내는 ‘유지’, 추정 수익률 ±5% 이내는 ‘유지’.
        극단치는 −95%~+300%로 제한. 출처: 국민연금 연간공시 가공.
      </p>
    </div>
  );
}
