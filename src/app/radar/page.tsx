import StockRadar from "@/components/StockRadar";
import { radarData } from "@/lib/radarData";

export const metadata = { title: "종목 레이더 | Y&P 레이더" };

export default function RadarPage() {
  const last = radarData.frames[radarData.frames.length - 1]?.b ?? [];
  const ranked = [...last].sort((a, b) => b[3] - a[3]);
  const top = ranked[0];
  const topName = top ? radarData.stocks[top[0]].name : "-";
  const alertCount = last.filter((x) => x[3] > 0.5).length;

  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <div className="text-xs text-white/45">{label}</div>
      <div className="mt-0.5 truncate text-lg font-bold text-white">{value}</div>
      {sub && <div className="text-xs text-white/40">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">종목 관제 레이더</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            상위 50종목을 <strong className="text-white/80">상대거래량</strong> ×{" "}
            <strong className="text-white/80">변동성 모멘텀</strong> 평면에 띄워,{" "}
            <strong className="text-white/80">평소와 다르게 움직이는</strong> 종목을 포착합니다.
            중심=정상, 가장자리=이상.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3182f6]/15 px-3 py-1 text-sm font-medium text-[#3182f6]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3182f6]" />
          리플레이 · {radarData.asOf}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="추적 종목" value={`${radarData.stocks.length}개`} sub="노출 상위" />
        <Stat label="이상 경보" value={`${alertCount}건`} sub="점수 50+ 종목" />
        <Stat label="최고 이상치" value={topName} sub={top ? `점수 ${Math.round(top[3] * 100)}` : undefined} />
        <Stat label="기준" value={radarData.asOf} sub={radarData.window} />
      </div>

      <StockRadar />

      <div className="rounded-2xl border border-[#3182f6]/15 bg-[#3182f6]/[0.05] p-4 text-sm text-white/75">
        <strong className="text-[#3182f6]">읽는 법.</strong> 가로 = 평소 대비 거래량(오른쪽=급증),
        세로 = 자기 변동성 대비 가격 움직임(위=급등/아래=급락). <strong>중심에서 멀수록 이상</strong>이고,
        점수가 높을수록 크고 밝게 + 경보에 뜹니다. 정상 장에선 대부분 중앙에 모입니다.
      </div>

      <p className="text-xs text-white/40">
        ※ 출처: {radarData.source}. {radarData.window}(5분 프레임). 토스 1분봉은 최근 ~200분만 제공돼
        지난 구간 리플레이입니다(테스트). <strong className="text-white/55">이상 탐지는 매매 신호가 아닙니다.</strong>
      </p>
    </div>
  );
}
