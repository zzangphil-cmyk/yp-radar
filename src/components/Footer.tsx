import { RadarMark } from "./Brand";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-white/[0.07] py-8">
      <div className="container-page space-y-3 text-xs text-white/45">
        <div className="flex items-center gap-2 text-white/70">
          <RadarMark size={18} />
          <span className="font-semibold">Y&P 레이더</span>
        </div>
        {/* 데이터 출처 — 사이트 전체 통합 표기 */}
        <div className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
          <p><span className="text-white/60">주식 시세·일봉</span> — 토스인베스트 Open API(일봉) · 네이버 금융(실시간·분봉)</p>
          <p><span className="text-white/60">업종·테마 분류</span> — 섹터 ETF 구성(KRX) + 토스증권 업종 분류</p>
          <p><span className="text-white/60">ETF</span> — 네이버 금융 시세(실시간)</p>
          <p><span className="text-white/60">국민연금</span> — 기금운용본부 연간공시(연 1회·약 9개월 지연) · DART 대량보유 공시</p>
        </div>
        <p>
          레이더 온도(D²)는 &ldquo;평소와 얼마나 다른가&rdquo;의 관측치이며 방향 예측이 아닙니다.
          본 사이트는 투자 자문이나 매매 권유가 아니며, 정보의 정확성·완전성을
          보장하지 않습니다. 투자 판단의 책임은 이용자 본인에게 있습니다.
          © {new Date().getFullYear()} Y&P 레이더
        </p>
      </div>
    </footer>
  );
}
