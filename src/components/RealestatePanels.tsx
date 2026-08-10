import Link from "next/link";
import { realestate as re, fmtPyeong, fmtHouseholds, RE_PAGES, type ReZone } from "@/lib/realestateData";

const PURPLE = "#a78bfa";

/** 권역별 중앙 급지 — 급지가 낮을수록(=상위) 막대가 길다 */
export function RegionGradeChart() {
  const rows = re.regions;
  const worst = 10; // 급지 스케일 1(최상)~10(하위)
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white/85">권역별 입지 급지</span>
        <span className="text-[11px] text-white/40">중앙값 · 1급지 = 최상</span>
      </div>
      <p className="mb-3 text-[11px] text-white/45">막대가 길수록 상위 급지. 괄호는 400세대+ 단지 수.</p>
      <ul className="space-y-1.5">
        {rows.map((r) => {
          const g = r.grade ?? worst;
          const pct = ((worst - g) / (worst - 1)) * 100; // 1급지=100%
          return (
            <li key={r.metro + r.region} className="grid grid-cols-[74px_1fr_54px] items-center gap-2">
              <span className="truncate text-[12px] text-white/75">
                {r.region}
                {r.metro !== r.region && <span className="ml-1 text-white/30">{r.metro}</span>}
              </span>
              <span className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max(4, pct)}%`, background: `linear-gradient(90deg,${PURPLE}55,${PURPLE})` }}
                />
              </span>
              <span className="text-right text-[12px] font-semibold tabular-nums text-white/80">
                {g}
                <span className="ml-0.5 text-[10px] font-normal text-white/35">급지</span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] text-white/35 sm:grid-cols-4">
        {rows.map((r) => (
          <span key={r.region} className="truncate">
            {r.region} {r.complexes.toLocaleString("ko-KR")}단지 · {fmtHouseholds(r.households)}세대
          </span>
        ))}
      </div>
    </div>
  );
}

/** 급지 분포 히스토그램 */
export function GradeDistribution() {
  const bands = re.gradeBands;
  const max = Math.max(...bands.map((b) => b.count), 1);
  const total = bands.reduce((a, b) => a + b.count, 0);
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white/85">급지 분포</span>
        <span className="text-[11px] text-white/40">{total.toLocaleString("ko-KR")}개 단지</span>
      </div>
      <p className="mb-3 text-[11px] text-white/45">수도권 400세대+ 단지를 입지·상품·희소성으로 채점한 분포.</p>
      <div className="flex h-28 items-end gap-1.5">
        {bands.map((b, i) => {
          const h = (b.count / max) * 100;
          const hue = 268 - i * 6;
          return (
            <div key={b.band} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[9px] tabular-nums text-white/40">{b.count}</span>
              <span
                className="w-full rounded-t"
                style={{ height: `${Math.max(3, h)}%`, background: `hsl(${hue} 70% ${62 - i * 3}%)` }}
              />
              <span className="text-[9px] text-white/35">{b.band.replace("급지", "").replace(".0~", "~")}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-white/30">가로축 = 급지대(왼쪽이 상위) · 세로 = 단지 수</p>
    </div>
  );
}

/** 거시 타이밍 — 기준금리·국고3년 최근 60개월 */
export function MacroTimeline() {
  const s = re.macro.series.filter((p) => p.base != null || p.t3y != null);
  if (!s.length) return null;
  const W = 560, H = 120, PAD = 6;
  const vals = s.flatMap((p) => [p.base, p.t3y].filter((v): v is number => v != null));
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const x = (i: number) => PAD + (i / (s.length - 1)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - ((v - lo) / (hi - lo || 1)) * (H - PAD * 2);
  const line = (key: "base" | "t3y") =>
    s.map((p, i) => (p[key] == null ? null : `${x(i)},${y(p[key]!)}`)).filter(Boolean).join(" ");
  const m = re.macro;
  const tone = (v: number | null) => (v == null ? "text-white/50" : v > 0 ? "text-up" : v < 0 ? "text-down" : "text-white/50");
  const sign = (v: number | null) => (v == null ? "-" : `${v > 0 ? "+" : ""}${v}%p`);

  return (
    <div className="card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white/85">거시 타이밍</span>
        <span className="rounded-full bg-[#a78bfa]/15 px-2 py-0.5 text-[11px] font-semibold text-[#c4b5fd]">
          {m.status ?? "-"}
        </span>
      </div>
      <p className="mb-2 text-[11px] text-white/45">
        금리가 집값의 방향을 정하진 않지만, <strong className="text-white/60">돈의 값</strong>은 정합니다. {m.asOf} 기준.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" style={{ height: 110 }} preserveAspectRatio="none">
        <polyline points={line("t3y")} fill="none" stroke="#5a9bff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <polyline points={line("base")} fill="none" stroke={PURPLE} strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2 w-3 rounded-sm" style={{ background: PURPLE }} />
          <span className="text-white/55">기준금리</span>
          <b className="tabular-nums text-white/85">{m.baseRate}%</b>
          <span className={tone(m.baseRateChange6m)}>{sign(m.baseRateChange6m)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <i className="inline-block h-2 w-3 rounded-sm bg-[#5a9bff]" />
          <span className="text-white/55">국고 3년</span>
          <b className="tabular-nums text-white/85">{m.treasury3y}%</b>
          <span className={tone(m.treasury3yChange6m)}>{sign(m.treasury3yChange6m)}</span>
        </span>
        {m.cpiYoy != null && <span className="text-white/45">물가 <b className="tabular-nums text-white/75">{m.cpiYoy}%</b></span>}
        {m.creditYoy != null && <span className="text-white/45">가계신용 <b className="tabular-nums text-white/75">{m.creditYoy}%</b></span>}
      </div>
      <p className="mt-1 text-[10px] text-white/30">최근 {s.length}개월 · 좌측이 과거</p>
    </div>
  );
}

function ZoneRows({ rows, mode }: { rows: ReZone[]; mode: "price" | "change" }) {
  const max = Math.max(...rows.map((r) => (mode === "price" ? r.pyeong : Math.abs(r.changePct ?? 0))), 1);
  return (
    <ul className="space-y-0.5">
      {rows.map((r) => {
        const v = mode === "price" ? r.pyeong : r.changePct ?? 0;
        const w = (Math.abs(v) / max) * 100;
        const up = (r.changePct ?? 0) >= 0;
        const color = mode === "price" ? PURPLE : up ? "#f0616e" : "#5a9bff";
        return (
          <li key={r.gu + r.zone} className="grid grid-cols-[92px_1fr_58px] items-center gap-2 rounded px-1 py-0.5">
            <span className="truncate text-[12px] text-white/80" title={`${r.gu} ${r.zone}`}>{r.zone}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(3, w)}%`, background: color }} />
            </span>
            <span className="text-right text-[11px] font-semibold tabular-nums" style={{ color }}>
              {mode === "price" ? fmtPyeong(r.pyeong) : `${up ? "+" : ""}${r.changePct}%`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** 생활권 평단가·변동 랭킹 */
export function ZoneRanking() {
  const z = re.zones;
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white/85">생활권 시장</span>
        <span className="text-[11px] text-white/40">평당 매매가 · {re.window}</span>
      </div>
      <p className="mb-3 text-[11px] text-white/45">
        {z.count}개 생활권 중앙 <strong className="text-white/70">{fmtPyeong(z.medianPyeong)}</strong>. 최근 1년 변동률 기준 상승·하락.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <div className="mb-1 text-[11px] font-semibold text-[#c4b5fd]">평단가 TOP</div>
          <ZoneRows rows={z.topPrice.slice(0, 6)} mode="price" />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold text-up">상승 TOP</div>
          <ZoneRows rows={z.topRise} mode="change" />
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold text-down">하락 TOP</div>
          <ZoneRows rows={z.topFall} mode="change" />
        </div>
      </div>
    </div>
  );
}

/** 부동산 세부 진입 카드 3종 */
export function RealestateEntries() {
  const items = [
    { href: RE_PAGES.market, title: "시장분석", desc: "생활권 지도 · 단지 급지 · 실거래 추이", stat: `${re.counts.complexes.toLocaleString("ko-KR")}개 단지` },
    { href: RE_PAGES.policy, title: "정책", desc: "중앙·지방 대책 타임라인 · As-Is/To-Be", stat: "12개 채널" },
    { href: RE_PAGES.experts, title: "전문가집단", desc: "12인 관점 레이더 · 근거 타임라인", stat: "12인 추적" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((it) => (
        <Link key={it.href} href={it.href} className="card group p-4 transition-colors hover:bg-white/[0.04]">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-bold text-white group-hover:text-[#c4b5fd]">{it.title}</span>
            <span className="text-[11px] text-white/35">{it.stat}</span>
          </div>
          <p className="mt-1 text-[12px] text-white/50">{it.desc}</p>
        </Link>
      ))}
    </div>
  );
}
