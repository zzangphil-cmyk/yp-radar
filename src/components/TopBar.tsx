"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./Brand";

const NPS_NAV = [
  { href: "/nps", label: "대시보드", exact: true },
  { href: "/nps/recent", label: "최근 동향" },
  { href: "/nps/holdings", label: "보유 종목" },
  { href: "/nps/changes", label: "변화 분석" },
  { href: "/nps/map", label: "포지션 맵" },
  { href: "/nps/insights", label: "인사이트" },
];
const ETF_NAV = [
  { href: "/etf", label: "대시보드", exact: true },
  { href: "/etf/list", label: "ETF 목록" },
  { href: "/etf/stocks", label: "구성종목" },
  { href: "/etf/flows", label: "자금 흐름" },
  { href: "/etf/map", label: "포지션 맵" },
  { href: "/etf/themes", label: "테마" },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) {
    if (href === "/nps") return pathname === "/nps" || pathname.startsWith("/nps/stock");
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export default function TopBar({ etfAsOf, npsAsOf }: { etfAsOf: string; npsAsOf: string }) {
  const pathname = usePathname();
  const product = pathname.startsWith("/etf") ? "etf" : pathname.startsWith("/nps") ? "nps" : "hub";
  const nav = product === "etf" ? ETF_NAV : product === "nps" ? NPS_NAV : [];
  const accentText = product === "etf" ? "text-amber-400" : "text-radar";
  const accentBg = product === "etf" ? "bg-amber-500/15 text-amber-400" : "bg-radar/15 text-radar";

  const SwitchBtn = ({ href, label, on }: { href: string; label: string; on: boolean }) => (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
        on ? accentBg : "text-white/50 hover:bg-white/5 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.07] bg-base/80 backdrop-blur-md">
      <div className="container-page flex h-16 items-center gap-4">
        <Link href="/" className="shrink-0">
          <Brand />
        </Link>
        {/* 제품 스위처 */}
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1">
          <SwitchBtn href="/etf" label="ETF" on={product === "etf"} />
          <SwitchBtn href="/nps" label="국민연금" on={product === "nps"} />
        </div>
        {/* 제품별 서브 네비 (데스크톱) */}
        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => {
            const on = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-2.5 py-2 text-sm transition-colors ${
                  on ? accentText : "text-white/55 hover:bg-white/5 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto hidden shrink-0 items-center sm:flex">
          <span className="chip">
            {product === "etf" ? `ETF 실시간 ${etfAsOf}` : product === "nps" ? `국민연금 ${npsAsOf}` : `ETF ${etfAsOf} · 연금 ${npsAsOf}`}
          </span>
        </div>
      </div>
      {/* 서브 네비 (모바일/태블릿) */}
      {nav.length > 0 && (
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
          {nav.map((item) => {
            const on = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm ${on ? accentText : "text-white/55"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </header>
  );
}
