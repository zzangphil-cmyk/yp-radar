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
            상위 50종목을 <strong className="text-white/80">거래량(평소의 몇 배)</strong> ×{" "}
            <strong className="text-white/80">등락률(%)</strong> 평면에 띄웁니다. 중심=평소·보합,
            가장자리=이상. <strong className="text-white/80">날짜를 옮기면 그날 스냅샷으로 고정</strong>되고,
            재생하면 거래일이 넘어가며 점이 이동합니다.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3182f6]/15 px-3 py-1 text-sm font-medium text-[#3182f6]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3182f6]" />
          일봉 · {radarData.window}
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
        <strong className="text-[#3182f6]">읽는 법.</strong> 가로 = 그날 거래량이 <strong>평소의 몇 배</strong>인가(오른쪽=많음, 중앙=1배),
        세로 = 그날 <strong>등락률</strong>(위=상승/아래=하락, 중앙=보합). 가운데 원(정상권) 밖으로 멀수록 이상이고,
        그때만 색(빨강 급등/파랑 급락)·경보로 뜹니다. <strong>날짜 슬라이더로 원하는 날</strong>을 보고, 재생으로 흐름을 봅니다.
      </div>

      <p className="text-xs text-white/40">
        ※ 출처: {radarData.source}. {radarData.window}. 토스가 과거 분(分) 시세를 제공하지 않아
        <strong className="text-white/55"> 일봉(거래일 단위)</strong>으로 구성했습니다. 25일도 이 구간에 포함됩니다.
        <strong className="text-white/55"> 이상 탐지는 매매 신호가 아닙니다.</strong>
      </p>
    </div>
  );
}
