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
    <div className="rounded-[20px] bg-base-800 px-4 py-3.5">
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
            <strong className="text-white/80">코스피 200 · 코스닥 50</strong>의 <strong className="text-white/80">온도</strong>(지금 평소와 얼마나 다른가)를
            보여주는 관측 도구입니다. 온도는 거래량·고유수익·변동성·자금유입 5축의 동시 이탈을
            <strong className="text-white/80"> 마할라노비스 D²</strong>(시장 내 표준화)로 합친 강도 —{" "}
            <strong className="text-white/80">방향(오를지·내릴지)이 아니라 &ldquo;크게 움직이는 중&rdquo;을 측정</strong>합니다.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3182f6]/15 px-3 py-1 text-sm font-medium text-[#3182f6]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3182f6]" />
          일봉 · {radarData.window}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="추적 종목" value={`${radarData.stocks.length}개`} sub={(radarData as { universe?: string }).universe ?? "코스피200·코스닥50"} />
        <Stat label="고온 종목" value={`${alertCount}건`} sub="온도 50°+ (평소와 크게 다름)" />
        <Stat label="최고 온도" value={topName} sub={top ? `${Math.round(top[3] * 100)}°` : undefined} />
        <Stat label="기준" value={radarData.asOf} sub={radarData.window} />
      </div>

      <StockRadar />

      <div className="rounded-[20px] bg-[#3182f6]/[0.08] p-4 text-sm text-white/75">
        <strong className="text-[#3182f6]">읽는 법.</strong> 점의 <strong>크기·밝기 = 온도</strong>(D², 평소와 다른 정도) — 뜨거울수록 거래량·고유수익·변동성·자금유입이
        <strong> 동시에</strong> 평소를 벗어난 것. 위치의 <strong>원점은 그날 평균 종목</strong> — 가로 = 거래량(평균 대비 ×2·×4), 세로 = 등락률(평균 대비 초과/미달)로 맥락만 표시합니다.
        색조는 <strong>왜 떴나</strong>(빨강·파랑=수익률 주도 / 호박색=거래량·변동성·자금 주도). <strong>날짜 슬라이더·재생</strong>으로 온도 변화를 봅니다.
      </div>

      <p className="text-xs text-white/40">
        ※ 출처: {radarData.source}. {radarData.window}. 토스가 과거 분(分) 시세를 제공하지 않아
        <strong className="text-white/55"> 일봉(거래일 단위)</strong>으로 구성했습니다. 25일도 이 구간에 포함됩니다.
        <strong className="text-white/55"> 이상 탐지는 매매 신호가 아닙니다.</strong>
      </p>
    </div>
  );
}
