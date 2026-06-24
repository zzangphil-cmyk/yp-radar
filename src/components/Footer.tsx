import { RadarMark } from "./Brand";

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-white/[0.07] py-8">
      <div className="container-page space-y-3 text-xs text-white/45">
        <div className="flex items-center gap-2 text-white/70">
          <RadarMark size={18} />
          <span className="font-semibold">Y&P 레이더</span>
        </div>
        <p>
          데이터 출처: ETF — 네이버 금융 시세(실시간) / 국민연금 — 기금운용본부
          연간공시(연 1회·약 9개월 지연). ETF 구성종목 등 일부는 추후 확장됩니다.
        </p>
        <p>
          본 사이트는 투자 자문이나 매매 권유가 아니며, 정보의 정확성·완전성을
          보장하지 않습니다. 투자 판단의 책임은 이용자 본인에게 있습니다.
          © {new Date().getFullYear()} 국민연금 레이더
        </p>
      </div>
    </footer>
  );
}
