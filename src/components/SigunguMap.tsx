"use client";

// 수도권 시군구 코로플레스 — mapcn-kr 행정경계 + mapcn(MapLibre) 다크 베이스맵 위에
// 우리 데이터(82개 시군구의 급지·평단가)를 얹는다.
import { useEffect, useMemo, useRef, useState } from "react";
import { Map, useMap } from "@/components/ui/map";
import { KoreaAdminLayer, type KoreaRegion } from "@/components/ui/korea-map";
import { realestate as re, fmtPyeong, fmtHouseholds } from "@/lib/realestateData";
import aliasJson from "@/data/sgg-alias.json";

// mapcn-kr 경계명(sggnm) → 우리 데이터명. scripts/build-sgg-alias.mjs 산출물
const ALIAS = aliasJson as Record<string, string>;

// 수도권만 담기는 경계 (옹진군 도서 제외한 실사용 범위)
const CAPITAL_BOUNDS: [[number, number], [number, number]] = [
  [126.25, 36.9],
  [127.65, 38.3],
];

const NO_DATA = "#2b2d38";

/** 분석기 지도와 같은 계열: 밝은 금색(상위) → 남보라(하위) */
function ramp(t: number): string {
  const S = [
    [45, 86, 68],
    [28, 76, 61],
    [352, 44, 53],
    [294, 30, 45],
    [250, 24, 37],
  ];
  const x = Math.max(0, Math.min(1, t));
  const p = x * (S.length - 1);
  const i = Math.min(S.length - 2, Math.floor(p));
  const f = p - i;
  const a = S[i], b = S[i + 1];
  let d = b[0] - a[0];
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  const h = (a[0] + d * f + 360) % 360;
  const s = a[1] + (b[1] - a[1]) * f;
  const l = a[2] + (b[2] - a[2]) * f;
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
}

type Metric = "grade" | "pyeong";

/**
 * 홈의 대분류 탭은 CSS(display:none)로 전환된다. 숨겨진 상태에서 MapLibre를 만들면
 * 컨테이너를 0으로 재고 기본 크기(400×300)에 갇히므로, 실제로 보일 때까지 마운트를 미룬다.
 */
function useVisibleOnce<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  // 타이머로 확인한다. rAF/ResizeObserver는 렌더링 단계에 묶여 있어
  // 백그라운드 탭처럼 합성이 멈춘 환경에서는 콜백이 오지 않는다.
  useEffect(() => {
    if (visible) return;
    const id = setInterval(() => {
      const el = ref.current;
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        setVisible(true);
        clearInterval(id);
      }
    }, 120);
    return () => clearInterval(id);
  }, [visible]);
  return { ref, visible };
}

/** 베이스맵 지명을 한글(name:ko)로 — Carto 기본은 영문 표기다 */
function KoreanLabels() {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    const apply = () => {
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.type !== "symbol") continue;
        try {
          if (!map.getLayoutProperty(layer.id, "text-field")) continue;
          map.setLayoutProperty(layer.id, "text-field", [
            "coalesce",
            ["get", "name:ko"],
            ["get", "name_ko"],
            ["get", "name"],
          ]);
        } catch {
          /* 레이블 없는 레이어는 무시 */
        }
      }
    };
    apply();
    map.on("styledata", apply);
    return () => {
      map.off("styledata", apply);
    };
  }, [map, isLoaded]);
  return null;
}

/** 탭 전환 등으로 컨테이너 크기가 바뀌면 지도를 되맞춘다 */
function AutoResize({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const { map, isLoaded } = useMap();
  useEffect(() => {
    if (!map || !isLoaded) return;
    const el = map.getContainer();
    let last = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (!w || w === last) return;
      last = w;
      map.resize();
      map.fitBounds(bounds, { padding: 24, animate: false });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [map, isLoaded, bounds]);
  return null;
}

export default function SigunguMap() {
  const [metric, setMetric] = useState<Metric>("grade");
  const [hover, setHover] = useState<string | null>(null);
  const mapBox = useVisibleOnce<HTMLDivElement>();

  const byName = useMemo(() => {
    const m: Record<string, (typeof re.sigungu)[number]> = {};
    for (const s of re.sigungu) m[s.sigungu] = s;
    return m;
  }, []);

  // 평단가는 분포가 한쪽으로 쏠려 있어 로그 스케일이 읽기 좋다
  const pyeongScale = useMemo(() => {
    const vals = re.sigungu.map((s) => s.pyeong).filter((v): v is number => v != null);
    return { lo: Math.log(Math.min(...vals)), hi: Math.log(Math.max(...vals)) };
  }, []);

  const colorOf = useMemo(
    () => (ourName: string): string => {
      const s = byName[ourName];
      if (!s) return NO_DATA;
      if (metric === "grade") {
        return s.grade == null ? NO_DATA : ramp((s.grade - 1) / 9);
      }
      if (s.pyeong == null) return NO_DATA;
      const t = (Math.log(s.pyeong) - pyeongScale.lo) / (pyeongScale.hi - pyeongScale.lo || 1);
      return ramp(1 - t); // 비쌀수록 금색
    },
    [byName, metric, pyeongScale]
  );

  // MapLibre match 표현식으로 구역별 색을 지정 (mapcn-kr은 단색만 받으므로 표현식을 넘긴다)
  const fillExpr = useMemo(() => {
    const pairs: string[] = [];
    for (const [theirName, ourName] of Object.entries(ALIAS)) {
      pairs.push(theirName, colorOf(ourName));
    }
    return ["match", ["get", "sggnm"], ...pairs, NO_DATA];
  }, [colorOf]);

  const hovered = hover ? byName[ALIAS[hover] ?? ""] : null;

  const Btn = ({ k, label }: { k: Metric; label: string }) => (
    <button
      onClick={() => setMetric(k)}
      className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
        metric === k ? "bg-[#a78bfa]/20 text-[#c4b5fd]" : "text-white/45 hover:text-white"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div>
          <div className="text-sm font-semibold text-white/85">수도권 시군구 지도</div>
          <p className="mt-0.5 text-[11px] text-white/45">
            {re.sigungu.length}개 시군구 · 실제 지도 위에서 비교. 마우스를 올리면 상세가 보입니다.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-1">
          <Btn k="grade" label="급지" />
          <Btn k="pyeong" label="평단가" />
        </div>
      </div>

      <div ref={mapBox.ref} className="relative mt-3 h-[420px] w-full sm:h-[520px]">
        {!mapBox.visible && (
          <div className="flex h-full items-center justify-center text-[12px] text-white/30">지도 준비 중…</div>
        )}
        {mapBox.visible && (
        <Map
          theme="dark"
          bounds={CAPITAL_BOUNDS}
          fitBoundsOptions={{ padding: 24 }}
          minZoom={6}
          maxZoom={12}
          attributionControl={false}
          className="h-full w-full"
        >
          <AutoResize bounds={CAPITAL_BOUNDS} />
          <KoreanLabels />
          <KoreaAdminLayer
            level="sgg"
            drillDown={false}
            boundaryColor="rgba(10,10,13,.55)"
            opacity={{ base: 0.82, hover: 0.95, selected: 0.95 }}
            // mapcn-kr은 단색(string)을 기대하지만 MapLibre paint는 표현식도 받는다
            accentColor={fillExpr as unknown as string}
            onRegionHover={(r: KoreaRegion | null) => setHover(r?.name ?? null)}
          />
        </Map>
        )}

        {/* 호버 상세 */}
        {hovered && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-xl border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-md">
            <div className="text-[13px] font-bold text-white">{hovered.sigungu}</div>
            <div className="mt-0.5 flex gap-3 text-[11px] tabular-nums">
              <span className="text-[#c4b5fd]">{hovered.grade ?? "-"}급지</span>
              <span className="text-white/70">{fmtPyeong(hovered.pyeong)}/평</span>
            </div>
            <div className="mt-0.5 text-[10px] text-white/40">
              {hovered.complexes.toLocaleString("ko-KR")}단지 · {fmtHouseholds(hovered.households)}세대
            </div>
          </div>
        )}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-4 pt-3 text-[10px] text-white/40">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-24 rounded-sm"
            style={{ background: `linear-gradient(90deg,${ramp(0)},${ramp(0.25)},${ramp(0.5)},${ramp(0.75)},${ramp(1)})` }}
          />
          {metric === "grade" ? "1급지 → 10급지" : "비쌈 → 저렴"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-3 rounded-sm" style={{ background: NO_DATA }} />
          자료 없음
        </span>
        <span className="ml-auto">경계 © mapcn-kr(CC BY 4.0) · 지도 © CARTO, OpenStreetMap</span>
      </div>
    </div>
  );
}
