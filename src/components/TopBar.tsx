"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brand } from "./Brand";

// 2단 구조: 대분류(주식·부동산) → 세부(제품) → 제품 내 페이지
const RADAR_NAV = [
  { href: "/radar", label: "2D 관제 스코프", exact: true },
  { href: "/radar/3d", label: "3D 관제 스코프" },
];
const ETF_NAV = [
  { href: "/etf", label: "대시보드", exact: true },
  { href: "/etf/list", label: "ETF 목록" },
  { href: "/etf/stocks", label: "구성종목" },
  { href: "/etf/flows", label: "자금 흐름" },
  { href: "/etf/map", label: "포지션 맵" },
  { href: "/etf/themes", label: "테마" },
];
const NPS_NAV = [
  { href: "/nps", label: "대시보드", exact: true },
  { href: "/nps/recent", label: "최근 동향" },
  { href: "/nps/holdings", label: "보유 종목" },
  { href: "/nps/changes", label: "변화 분석" },
  { href: "/nps/map", label: "포지션 맵" },
  { href: "/nps/insights", label: "인사이트" },
];

// 대분류별 세부 제품
const STOCK_PRODUCTS = [
  { key: "radar", href: "/radar", label: "관제 스코프", accent: "text-[#3182f6]", nav: RADAR_NAV },
  { key: "etf", href: "/etf", label: "ETF", accent: "text-amber-400", nav: ETF_NAV },
  { key: "nps", href: "/nps", label: "국민연금", accent: "text-radar", nav: NPS_NAV },
];
const RE_PRODUCTS = [
  { key: "re-market", href: "/realestate/capital_area_market_analyzer_v3_0.html", label: "시장분석", accent: "text-[#4c8dff]", nav: [] },
  { key: "re-policy", href: "/realestate/real_estate_policy_timeline_v1_0.html", label: "정책", accent: "text-[#4c8dff]", nav: [] },
  { key: "re-expert", href: "/realestate/real_estate_expert_signals_v1_0.html", label: "전문가집단", accent: "text-[#4c8dff]", nav: [] },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  if (exact) {
    if (href === "/nps") return pathname === "/nps" || pathname.startsWith("/nps/stock");
    if (href === "/radar") return pathname === "/radar";
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export default function TopBar({ etfAsOf, npsAsOf, radarAsOf }: { etfAsOf: string; npsAsOf: string; radarAsOf: string }) {
  const pathname = usePathname();

  const product =
    pathname.startsWith("/radar") ? "radar" :
    pathname.startsWith("/etf") ? "etf" :
    pathname.startsWith("/nps") ? "nps" : "hub";
  const category = product === "hub" ? "hub" : "stock"; // 부동산은 정적 페이지(자체 바)
  const active = STOCK_PRODUCTS.find((p) => p.key === product);
  const nav = active?.nav ?? [];

  const chip =
    product === "etf" ? `ETF 실시간 ${etfAsOf}` :
    product === "nps" ? `국민연금 ${npsAsOf}` :
    product === "radar" ? `주식 ${radarAsOf}` :
    `주식 ${radarAsOf} · ETF ${etfAsOf}`;

  // 대분류 스위처
  const CatBtn = ({ href, label, on }: { href: string; label: string; on: boolean }) => (
    <Link
      href={href}
      className={`rounded-[10px] px-3.5 py-1.5 text-sm font-bold transition-colors ${
        on ? "bg-white/[0.10] text-white" : "text-white/45 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <header className="sticky top-0 z-30 bg-base/85 backdrop-blur-md">
      {/* 1단: 브랜드 + 대분류 */}
      <div className="container-page flex h-16 items-center gap-4">
        <Link href="/" className="shrink-0">
          <Brand />
        </Link>
        <div className="flex items-center gap-0.5 rounded-[14px] bg-white/[0.05] p-1">
          <CatBtn href="/radar" label="주식" on={category === "stock"} />
          <CatBtn href={RE_PRODUCTS[0].href} label="부동산" on={false} />
        </div>
        {/* 2단: 세부 제품 (데스크톱) */}
        {category === "stock" && (
          <nav className="hidden items-center gap-1 lg:flex">
            {STOCK_PRODUCTS.map((p) => {
              const on = p.key === product;
              return (
                <Link
                  key={p.key}
                  href={p.href}
                  className={`rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors ${
                    on ? p.accent : "text-white/55 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  {p.label}
                </Link>
              );
            })}
          </nav>
        )}
        <div className="ml-auto hidden shrink-0 items-center sm:flex">
          <span className="chip">{chip}</span>
        </div>
      </div>

      {/* 3단: 제품 내 페이지 */}
      {nav.length > 0 && (
        <nav className="container-page flex gap-1 overflow-x-auto pb-2 lg:pb-2.5">
          {nav.map((item) => {
            const on = isActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[13px] transition-colors ${
                  on ? `${active?.accent} bg-white/[0.06]` : "text-white/45 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}

      {/* 모바일: 세부 제품 */}
      {category === "stock" && (
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
          {STOCK_PRODUCTS.map((p) => (
            <Link
              key={p.key}
              href={p.href}
              className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold ${
                p.key === product ? p.accent : "text-white/55"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
