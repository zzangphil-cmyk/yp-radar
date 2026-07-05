import StockRadar3D from "@/components/StockRadar3D";
import { radarData } from "@/lib/radarData";

export const metadata = { title: "3D 구체 TEST | Y&P 레이더" };

export default function Radar3DTestPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            3D 관제 구체 <span className="rounded-lg bg-[#f5a623]/15 px-2 py-0.5 align-middle text-sm font-bold text-[#f5a623]">TEST</span>
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            2D 레이더에 <strong className="text-white/80">자금유입 축(Z)</strong>을 더한 실험 화면입니다.
            X 거래량 × Y 수익률 × Z <strong className="text-white/80">자금유입</strong>(시총 통제 거래대금 —{" "}
            과거 검증에서 유일하게 살아남은 신호) + 크기·발광 = <strong className="text-white/80">온도(D²)</strong>.
            &ldquo;가격·거래량은 평범한데 자금만 몰리는 종목&rdquo;이 앞뒤(Z)로 분리되어 보입니다.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3182f6]/15 px-3 py-1 text-sm font-medium text-[#3182f6]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3182f6]" />
          일봉 · {radarData.window}
        </span>
      </div>

      <StockRadar3D />

      <p className="text-xs text-white/40">
        ※ 실험 기능: 축·조작감 피드백을 위한 테스트입니다. 데이터·모델은 2D 레이더와 동일(마할라노비스 D², 원점=그날 평균).{" "}
        <strong className="text-white/55">이상 탐지는 매매 신호가 아닙니다.</strong>
      </p>
    </div>
  );
}
