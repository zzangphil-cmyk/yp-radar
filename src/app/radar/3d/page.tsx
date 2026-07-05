import StockRadar3D from "@/components/StockRadar3D";
import { radarData } from "@/lib/radarData";

export const metadata = { title: "3D 관제 스코프 | Y&P 레이더" };

export default function Radar3DPage() {
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
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">3D 관제 스코프</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-white/55">
            <strong className="text-white/80">{(radarData as { universe?: string }).universe ?? "코스피 200 · 코스닥"}</strong>의{" "}
            <strong className="text-white/80">온도</strong>(지금 평소와 얼마나 다른가)를 3차원 구체로 보는 관측 도구입니다.
            X 거래량 × Y 수익률 × Z <strong className="text-white/80">자금유입</strong>(과거 검증에서 살아남은 신호) + 크기·밝기 ={" "}
            <strong className="text-white/80">온도(D²)</strong> — <strong className="text-white/80">방향이 아니라 &ldquo;크게 움직이는 중&rdquo;을 측정</strong>합니다.
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#3182f6]/15 px-3 py-1 text-sm font-medium text-[#3182f6]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#3182f6]" />
          일봉 · {radarData.window}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="추적 종목" value={`${radarData.stocks.length}개`} sub={(radarData as { universe?: string }).universe ?? "코스피·코스닥"} />
        <Stat label="고온 종목" value={`${alertCount}건`} sub="온도 50°+ (평소와 크게 다름)" />
        <Stat label="최고 온도" value={topName} sub={top ? `${Math.round(top[3] * 100)}°` : undefined} />
        <Stat label="기준" value={radarData.asOf} sub={radarData.window} />
      </div>

      <StockRadar3D />

      <div className="rounded-[20px] bg-[#3182f6]/[0.08] p-4 text-sm text-white/75">
        <strong className="text-[#3182f6]">읽는 법.</strong> 별의 <strong>크기·밝기 = 온도</strong>(D², 평소와 다른 정도), <strong>색 = 성좌(테마)</strong>,{" "}
        <strong>✦ = 대장주</strong>(테마의 주도). 위치의 <strong>원점은 그날 평균 종목</strong> — 가로 거래량 · 세로 수익률 · 앞뒤 자금유입.
        드래그 회전, 휠·핀치 줌 — <strong>줌인하면 고온 별의 이름</strong>이 성도처럼 나타납니다. 날짜 슬라이더·재생으로 온도 변화를 봅니다.
      </div>

    </div>
  );
}
