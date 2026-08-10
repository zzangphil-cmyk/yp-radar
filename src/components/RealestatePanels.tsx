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

/** 정책 흐름 — 연도별 밀도 + 분야 분포 (텍스트 28건을 한 장으로) */
export function PolicyPulse() {
  const p = re.policy;
  if (!p.count) return null;
  const maxY = Math.max(...p.years.map((y) => y.total), 1);
  const maxB = Math.max(...p.buckets.map((b) => b.count), 1);
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white/85">정책 흐름</span>
        <span className="text-[11px] text-white/40">{p.count}건 · {p.range?.[0]?.slice(0, 4)}~{p.range?.[1]?.slice(0, 4)}</span>
      </div>
      <p className="mb-3 text-[11px] text-white/45">
        막대 높이 = 그해 대책 수. <span className="text-[#c4b5fd]">진한 부분</span>이 주요 대책 —{" "}
        <strong className="text-white/70">최근 2년에 몰려 있으면 규제 사이클</strong>입니다.
      </p>
      <div className="flex h-20 items-end gap-1">
        {p.years.map((y) => {
          const h = (y.total / maxY) * 100;
          const majorH = y.total ? (y.major / y.total) * 100 : 0;
          return (
            <div key={y.year} className="flex flex-1 flex-col items-center gap-1" title={`${y.year} ${y.total}건 (주요 ${y.major})`}>
              <span className="text-[9px] tabular-nums text-white/40">{y.total}</span>
              <span className="flex w-full flex-col justify-end rounded-t bg-[#a78bfa]/25" style={{ height: `${Math.max(6, h)}%` }}>
                <span className="w-full rounded-t bg-[#a78bfa]" style={{ height: `${majorH}%` }} />
              </span>
              <span className="text-[9px] text-white/35">{y.year.slice(2)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <div className="mb-1 text-[11px] font-semibold text-white/55">분야</div>
          <ul className="space-y-0.5">
            {p.buckets.slice(0, 5).map((b) => (
              <li key={b.name} className="grid grid-cols-[62px_1fr_20px] items-center gap-2">
                <span className="truncate text-[11px] text-white/70">{b.name}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                  <span className="block h-full rounded-full bg-[#a78bfa]" style={{ width: `${(b.count / maxB) * 100}%` }} />
                </span>
                <span className="text-right text-[10px] tabular-nums text-white/45">{b.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="mb-1 text-[11px] font-semibold text-white/55">최근 대책</div>
          <ul className="space-y-0.5">
            {p.latest.slice(0, 4).map((it) => (
              <li key={it.date + it.title} className="flex items-center gap-1.5">
                <span className="shrink-0 text-[10px] tabular-nums text-white/35">{it.date.slice(2, 7)}</span>
                {it.major && <span className="shrink-0 rounded bg-[#a78bfa]/15 px-1 text-[9px] font-bold text-[#c4b5fd]">주요</span>}
                <span className="min-w-0 flex-1 truncate text-[11px] text-white/75" title={it.title}>{it.title}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Link href={RE_PAGES.policy} className="mt-2 inline-block text-[11px] text-[#c4b5fd] hover:text-[#ddd6fe]">
        정책 타임라인 전체 →
      </Link>
    </div>
  );
}

/** 전문가 컨센서스 — 12인 방향성을 게이지 + 연도별 추이로 */
export function ExpertConsensus() {
  const e = re.experts;
  if (!e.count) return null;
  const c = e.consensusNow ?? 0;
  const pos = ((c + 2) / 4) * 100; // -2~+2 → 0~100%
  const label = c > 0.5 ? "상승 우위" : c < -0.5 ? "하락 우위" : "혼조";
  const tone = c > 0.5 ? "#f0616e" : c < -0.5 ? "#5a9bff" : "#8b9096";
  const maxN = Math.max(...e.years.map((y) => y.n), 1);
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white/85">전문가 컨센서스</span>
        <span className="text-[11px] font-semibold" style={{ color: tone }}>{label}</span>
      </div>
      <p className="mb-3 text-[11px] text-white/45">
        {e.count}인의 최신 발언 방향. <strong className="text-white/70">합의가 한쪽으로 쏠릴수록</strong> 되돌림 위험도 함께 커집니다.
      </p>

      {/* 게이지 */}
      <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg,#5a9bff33,#8b909633,#f0616e33)" }}>
        <span className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full" style={{ left: `${pos}%`, background: tone }} />
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-white/35">
        <span>하락</span>
        <span className="tabular-nums text-white/60">
          강세 {e.bullish} · 중립 {e.neutral} · 약세 {e.bearish}
        </span>
        <span>상승</span>
      </div>

      {/* 연도별 방향 */}
      <div className="mt-3 flex h-14 items-center gap-1">
        {e.years.map((y) => {
          const up = y.avg >= 0;
          const h = (Math.abs(y.avg) / 2) * 100;
          return (
            <div key={y.year} className="flex flex-1 flex-col items-center" title={`${y.year} 평균 ${y.avg} (${y.n}건)`}>
              <span className="flex h-6 w-full items-end">
                {up && <span className="w-full rounded-t" style={{ height: `${Math.max(6, h)}%`, background: "#f0616e", opacity: 0.35 + (y.n / maxN) * 0.65 }} />}
              </span>
              <span className="h-px w-full bg-white/10" />
              <span className="flex h-6 w-full items-start">
                {!up && <span className="w-full rounded-b" style={{ height: `${Math.max(6, h)}%`, background: "#5a9bff", opacity: 0.35 + (y.n / maxN) * 0.65 }} />}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 text-[9px] text-white/30">
        {e.years.map((y) => <span key={y.year} className="flex-1 text-center">{y.year.slice(2)}</span>)}
      </div>
      <Link href={RE_PAGES.experts} className="mt-2 inline-block text-[11px] text-[#c4b5fd] hover:text-[#ddd6fe]">
        전문가 12인 상세 →
      </Link>
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
