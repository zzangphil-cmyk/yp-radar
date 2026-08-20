"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
// maplibre-gl v6는 default export가 없어 네임스페이스 타입 임포트로 사용
import type * as MapLibreGL from "maplibre-gl";
import { LngLatBounds } from "maplibre-gl";

import { Map, useMap } from "@/components/ui/map";

/**
 * Korean administrative boundaries for mapcn.
 *
 * Data: 통계청 SGIS via vuski/admdongkor + 행안부 리 경계 (CC BY 4.0) —
 * simplified to 시도 / 시군구 / 읍면동 / 리 GeoJSON, served from this
 * project's repository. Override `dataBaseUrl` or `data` to self-host.
 */

/** Where the default boundary GeoJSON is fetched from. */
const DEFAULT_DATA_BASE_URL =
  "https://cdn.jsdelivr.net/gh/DevMinGeonPark/mapcn-kr@main/data";

/** Rough bounding box of South Korea, ready for `fitBounds`. */
export const KOREA_BOUNDS: [[number, number], [number, number]] = [
  [124.6, 33.0],
  [131.0, 38.65],
];

type AdminLevel = "sido" | "sgg" | "emd";

export type KoreaRegion = {
  /** Which admin level this feature belongs to ("ri" = 법정 리, the smallest unit). */
  level: AdminLevel | "ri";
  /** Admin code — 시도 2, 시군구 5, 읍면동 10 (행안부), 리 10 (법정) digits. */
  code: string;
  /** Region name (e.g. "서울특별시", "종로구", "사직동", "동부리"). */
  name: string;
  /** Parent 시도 code. Equals `code` when `level` is "sido". */
  sidoCode: string;
  /** Parent 시도 name (empty for 리 — resolve via `emdCode`). */
  sidoName: string;
  /** Parent 시군구 code. */
  sggCode?: string;
  /** Parent 시군구 name. */
  sggName?: string;
  /** Parent 행정 읍면동 code (리 only, spatially matched). */
  emdCode?: string;
  /** Number of 행정동 inside this region. */
  dongCount: number;
  /** Number of 시군구 inside this region (시도 only). */
  sggCount?: number;
  /** Whether this 읍면동 contains 리 (읍면동 only). */
  hasRi?: boolean;
};

type AdminProperties = {
  sido: string;
  sidonm: string;
  sgg?: string;
  sggnm?: string;
  adm_cd2?: string;
  dong?: string;
  dong_cnt?: number;
  sgg_cnt?: number;
  has_ri?: number;
  // 리 (법정)
  li_cd?: string;
  li_nm?: string;
  emd_adm?: string;
};

type FeatureCollection = GeoJSON.FeatureCollection<
  GeoJSON.MultiPolygon | GeoJSON.Polygon,
  AdminProperties
>;

/** One drill step. 시도 → 시군구 → 읍면동(리 보유 시) 순으로 깊어집니다. */
export type KoreaDrill =
  | { level: "sido"; code: string }
  | { level: "sgg"; code: string; sidoCode: string }
  | { level: "emd"; code: string; sggCode: string; sidoCode: string };

type KoreaAdminLayerProps = {
  /**
   * Which level to render nationwide: 시도, 시군구, or 읍면동.
   * With `drillDown` (default), clicking a region splits it into the next
   * level — 시도 → 시군구 → 읍면동 → 리(里, 읍·면 지역만).
   */
  level?: AdminLevel;
  /** Click a region to split it into the next admin level (default: true). */
  drillDown?: boolean;
  /** Whether regions respond to hover/click (default: true). */
  interactive?: boolean;
  /** Accent color for hover/selected states (default: #3b82f6). */
  accentColor?: string;
  /** Boundary line color. Defaults per theme (#94a3b8 light / #52525b dark). */
  boundaryColor?: string;
  /** Fill opacity at rest / on hover / when selected. */
  opacity?: { base?: number; hover?: number; selected?: number };
  /** Fit the map to a region when drilling into it (default: true). */
  fitBoundsOnDrill?: boolean;
  /** Provide boundary data directly instead of fetching. `ri` is keyed by 시도 code. */
  data?: {
    sido?: FeatureCollection;
    sgg?: FeatureCollection;
    emd?: FeatureCollection;
    ri?: Record<string, FeatureCollection>;
  };
  /** Base URL to fetch `sido/sgg/emd.json` and `ri/{시도}.json` from. */
  dataBaseUrl?: string;
  /** Fired when a region is clicked. */
  onRegionClick?: (region: KoreaRegion) => void;
  /** Fired when the hovered region changes; `null` when the cursor leaves. */
  onRegionHover?: (region: KoreaRegion | null) => void;
  /** Fired when the drill state changes; `null` when back to nationwide. */
  onDrillChange?: (drill: KoreaDrill | null) => void;
};

const dataCache: Record<string, Promise<FeatureCollection>> = {};

function fetchData(url: string): Promise<FeatureCollection> {
  dataCache[url] ??= fetch(url).then((r) => {
    if (!r.ok) throw new Error(`mapcn-kr: failed to fetch ${url} (${r.status})`);
    return r.json();
  });
  return dataCache[url];
}

function toRegion(level: AdminLevel | "ri", p: AdminProperties): KoreaRegion {
  if (level === "sido") {
    return {
      level,
      code: p.sido,
      name: p.sidonm,
      sidoCode: p.sido,
      sidoName: p.sidonm,
      dongCount: p.dong_cnt ?? 0,
      sggCount: p.sgg_cnt,
    };
  }
  if (level === "sgg") {
    return {
      level,
      code: p.sgg!,
      name: p.sggnm!,
      sidoCode: p.sido,
      sidoName: p.sidonm,
      sggCode: p.sgg,
      sggName: p.sggnm,
      dongCount: p.dong_cnt ?? 0,
    };
  }
  if (level === "emd") {
    return {
      level,
      code: p.adm_cd2!,
      name: p.dong!,
      sidoCode: p.sido,
      sidoName: p.sidonm,
      sggCode: p.sgg,
      sggName: p.sggnm,
      dongCount: 1,
      hasRi: !!p.has_ri,
    };
  }
  return {
    level: "ri",
    code: p.li_cd!,
    name: p.li_nm!,
    sidoCode: p.emd_adm?.slice(0, 2) ?? "",
    sidoName: "",
    emdCode: p.emd_adm,
    dongCount: 0,
  };
}

function featureBounds(geom: GeoJSON.Geometry): LngLatBounds {
  const bounds = new LngLatBounds();
  const walk = (c: unknown): void => {
    if (typeof (c as number[])[0] === "number") {
      bounds.extend(c as [number, number]);
    } else {
      (c as unknown[]).forEach(walk);
    }
  };
  walk((geom as GeoJSON.MultiPolygon).coordinates);
  return bounds;
}

// 항상 false (리 소스에는 sido 속성이 없지만 null ≠ ''로 역시 false)
const NONE: MapLibreGL.FilterSpecification = ["==", ["get", "sido"], ""];
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

const SOURCES = [
  { src: "korea-sido", key: "sido", promoteId: "sido", lineWidth: 1.4 },
  { src: "korea-sgg", key: "sgg", promoteId: "sgg", lineWidth: 0.9 },
  { src: "korea-emd", key: "emd", promoteId: "adm_cd2", lineWidth: 0.6 },
  { src: "korea-ri", key: "ri", promoteId: "li_cd", lineWidth: 0.5 },
] as const;

/**
 * Renders Korean administrative boundaries on top of any mapcn `<Map>`.
 * Composes like `MapGeoJSON` — drop it inside `<Map>`; boundaries are drawn
 * beneath the basemap's labels so streets and place names stay readable.
 *
 * ```tsx
 * <Map>
 *   <KoreaAdminLayer onRegionClick={(r) => console.log(r.name)} />
 * </Map>
 * ```
 */
export function KoreaAdminLayer({
  level = "sido",
  drillDown = true,
  interactive = true,
  accentColor = "#3b82f6",
  boundaryColor,
  opacity,
  fitBoundsOnDrill = true,
  data,
  dataBaseUrl = DEFAULT_DATA_BASE_URL,
  onRegionClick,
  onRegionHover,
  onDrillChange,
}: KoreaAdminLayerProps) {
  const { map, isLoaded, resolvedTheme } = useMap();
  const [geo, setGeo] = useState<{
    sido: FeatureCollection;
    sgg: FeatureCollection;
    emd: FeatureCollection | null;
  } | null>(null);
  const [drill, setDrill] = useState<KoreaDrill | null>(null);
  // 리는 시도 단위 청크로 lazy-fetch해 누적한다.
  const [riData, setRiData] = useState<FeatureCollection>(EMPTY);
  const riLoaded = useRef<Set<string>>(new Set());

  // 읍면동 (1.6MB) is only fetched once it's actually needed.
  const needsEmd = level === "emd" || drill?.level === "sgg" || drill?.level === "emd";

  const opacities = { base: 0.03, hover: 0.16, selected: 0.3, ...opacity };
  const lineColor = boundaryColor ?? (resolvedTheme === "dark" ? "#52525b" : "#94a3b8");

  // Latest callbacks without re-binding map events.
  const latest = useRef({ onRegionClick, onRegionHover, onDrillChange, drillDown, fitBoundsOnDrill });
  latest.current = { onRegionClick, onRegionHover, onDrillChange, drillDown, fitBoundsOnDrill };

  const hovered = useRef<{ source: string; id: string } | null>(null);
  const selected = useRef<{ source: string; id: string } | null>(null);

  // ---- load boundary data ----
  useEffect(() => {
    let cancelled = false;
    const sido = data?.sido ? Promise.resolve(data.sido) : fetchData(`${dataBaseUrl}/sido.json`);
    const sgg = data?.sgg ? Promise.resolve(data.sgg) : fetchData(`${dataBaseUrl}/sgg.json`);
    const emd = !needsEmd
      ? Promise.resolve(null)
      : data?.emd
        ? Promise.resolve(data.emd)
        : fetchData(`${dataBaseUrl}/emd.json`);
    Promise.all([sido, sgg, emd]).then(([s, g, e]) => {
      if (!cancelled) setGeo({ sido: s, sgg: g, emd: e });
    });
    return () => {
      cancelled = true;
    };
  }, [data, dataBaseUrl, needsEmd]);

  // ---- lazy-load the drilled 시도's 리 chunk ----
  useEffect(() => {
    if (drill?.level !== "emd") return;
    const sido = drill.sidoCode;
    if (riLoaded.current.has(sido)) return;
    let cancelled = false;
    const chunk = data?.ri?.[sido]
      ? Promise.resolve(data.ri[sido])
      : fetchData(`${dataBaseUrl}/ri/${sido}.json`);
    chunk.then((c) => {
      if (cancelled || riLoaded.current.has(sido)) return;
      riLoaded.current.add(sido);
      setRiData((prev) => ({
        type: "FeatureCollection",
        features: [...prev.features, ...c.features],
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [drill, data, dataBaseUrl]);

  // ---- level/drill filters ----
  const filters = useMemo((): Record<
    (typeof SOURCES)[number]["key"],
    MapLibreGL.FilterSpecification | null
  > => {
    const F: Record<string, MapLibreGL.FilterSpecification | null> = {
      sido: NONE,
      sgg: NONE,
      emd: NONE,
      ri: NONE,
    };
    if (level === "emd") {
      if (drill?.level === "emd") {
        F.emd = ["!=", ["get", "adm_cd2"], drill.code];
        F.ri = ["==", ["get", "emd_adm"], drill.code];
      } else F.emd = null;
      return F;
    }
    if (level === "sgg") {
      if (drill?.level === "emd") {
        F.sgg = ["!=", ["get", "sgg"], drill.sggCode];
        F.emd = ["all", ["==", ["get", "sgg"], drill.sggCode], ["!=", ["get", "adm_cd2"], drill.code]];
        F.ri = ["==", ["get", "emd_adm"], drill.code];
      } else if (drill?.level === "sgg") {
        F.sgg = ["!=", ["get", "sgg"], drill.code];
        F.emd = ["==", ["get", "sgg"], drill.code];
      } else F.sgg = null;
      return F;
    }
    // level === "sido"
    if (drill?.level === "emd") {
      F.sido = ["!=", ["get", "sido"], drill.sidoCode];
      F.sgg = ["all", ["==", ["get", "sido"], drill.sidoCode], ["!=", ["get", "sgg"], drill.sggCode]];
      F.emd = ["all", ["==", ["get", "sgg"], drill.sggCode], ["!=", ["get", "adm_cd2"], drill.code]];
      F.ri = ["==", ["get", "emd_adm"], drill.code];
    } else if (drill?.level === "sgg") {
      F.sido = ["!=", ["get", "sido"], drill.sidoCode];
      F.sgg = ["all", ["==", ["get", "sido"], drill.sidoCode], ["!=", ["get", "sgg"], drill.code]];
      F.emd = ["==", ["get", "sgg"], drill.code];
    } else if (drill) {
      F.sido = ["!=", ["get", "sido"], drill.code];
      F.sgg = ["==", ["get", "sido"], drill.code];
    } else F.sido = null;
    return F;
  }, [level, drill]);

  // ---- sources + layers (re-added whenever the style reloads) ----
  useEffect(() => {
    if (!isLoaded || !map || !geo) return;

    const beforeId = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
    const fillPaint: MapLibreGL.FillLayerSpecification["paint"] = {
      "fill-color": accentColor,
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        opacities.selected,
        ["boolean", ["feature-state", "hover"], false],
        opacities.hover,
        opacities.base,
      ],
    };

    for (const { src, key, promoteId, lineWidth } of SOURCES) {
      const collection = key === "ri" ? riData : geo[key];
      if (!collection) continue;
      map.addSource(src, { type: "geojson", data: collection, promoteId });
      map.addLayer(
        { id: `${src}-fill`, type: "fill", source: src, filter: NONE, paint: fillPaint },
        beforeId,
      );
      map.addLayer(
        {
          id: `${src}-line`,
          type: "line",
          source: src,
          filter: NONE,
          paint: { "line-color": lineColor, "line-width": lineWidth },
        },
        beforeId,
      );
      map.addLayer(
        {
          id: `${src}-ring`,
          type: "line",
          source: src,
          filter: NONE,
          paint: { "line-color": accentColor, "line-width": 1.8 },
        },
        beforeId,
      );
    }

    return () => {
      hovered.current = null;
      for (const { src } of SOURCES) {
        try {
          for (const suffix of ["fill", "line", "ring"]) {
            if (map.getLayer(`${src}-${suffix}`)) map.removeLayer(`${src}-${suffix}`);
          }
          if (map.getSource(src)) map.removeSource(src);
        } catch {
          // style may be mid-reload
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, map, geo]);

  // ---- push accumulated 리 chunks into the source ----
  useEffect(() => {
    if (!isLoaded || !map) return;
    const source = map.getSource("korea-ri") as MapLibreGL.GeoJSONSource | undefined;
    source?.setData(riData as never);
  }, [isLoaded, map, geo, riData]);

  // ---- keep paint in sync with theme/props ----
  useEffect(() => {
    if (!isLoaded || !map) return;
    for (const { src } of SOURCES) {
      if (!map.getLayer(`${src}-fill`)) continue;
      map.setPaintProperty(`${src}-line`, "line-color", lineColor);
      map.setPaintProperty(`${src}-ring`, "line-color", accentColor);
      map.setPaintProperty(`${src}-fill`, "fill-color", accentColor);
    }
  }, [isLoaded, map, geo, lineColor, accentColor]);

  // ---- keep filters in sync with level/drill ----
  useEffect(() => {
    if (!isLoaded || !map) return;
    for (const { src, key } of SOURCES) {
      if (!map.getLayer(`${src}-fill`)) continue;
      map.setFilter(`${src}-fill`, filters[key]);
      map.setFilter(`${src}-line`, filters[key]);
    }
  }, [isLoaded, map, geo, filters]);

  const clearHover = useCallback(() => {
    if (!map) return;
    if (hovered.current) {
      map.setFeatureState(hovered.current, { hover: false });
      hovered.current = null;
      latest.current.onRegionHover?.(null);
    }
    for (const { src } of SOURCES) {
      if (map.getLayer(`${src}-ring`)) map.setFilter(`${src}-ring`, NONE);
    }
    map.getCanvas().style.cursor = "";
  }, [map]);

  // ---- pointer events ----
  useEffect(() => {
    if (!isLoaded || !map || !geo || !interactive) return;

    const levelOf = (source: string): AdminLevel | "ri" =>
      source === "korea-ri"
        ? "ri"
        : source === "korea-emd"
          ? "emd"
          : source === "korea-sgg"
            ? "sgg"
            : "sido";
    const idOf = (l: AdminLevel | "ri", p: AdminProperties) =>
      l === "ri" ? p.li_cd! : l === "emd" ? p.adm_cd2! : l === "sgg" ? p.sgg! : p.sido;

    const queryAt = (point: MapLibreGL.Point) => {
      const layers = ["korea-ri-fill", "korea-emd-fill", "korea-sgg-fill", "korea-sido-fill"].filter(
        (l) => map.getLayer(l),
      );
      return layers.length ? map.queryRenderedFeatures(point, { layers })[0] : undefined;
    };

    const onMove = (e: MapLibreGL.MapMouseEvent) => {
      const f = queryAt(e.point);
      if (!f) {
        clearHover();
        return;
      }
      const p = f.properties as AdminProperties;
      const l = levelOf(f.source);
      const key = { source: f.source, id: idOf(l, p) };
      if (hovered.current?.source === key.source && hovered.current?.id === key.id) return;
      if (hovered.current) map.setFeatureState(hovered.current, { hover: false });
      hovered.current = key;
      map.setFeatureState(key, { hover: true });
      map.getCanvas().style.cursor = "pointer";
      for (const { src, promoteId } of SOURCES) {
        if (!map.getLayer(`${src}-ring`)) continue;
        map.setFilter(
          `${src}-ring`,
          f.source === src ? ["==", ["get", promoteId], key.id] : NONE,
        );
      }
      latest.current.onRegionHover?.(toRegion(l, p));
    };

    const onClick = (e: MapLibreGL.MapMouseEvent) => {
      const f = queryAt(e.point);
      if (!f) return;
      const p = f.properties as AdminProperties;
      const l = levelOf(f.source);
      const region = toRegion(l, p);

      const canDrill =
        latest.current.drillDown && (l === "sido" || l === "sgg" || (l === "emd" && !!p.has_ri));
      if (canDrill) {
        const next: KoreaDrill =
          l === "sido"
            ? { level: "sido", code: p.sido }
            : l === "sgg"
              ? { level: "sgg", code: p.sgg!, sidoCode: p.sido }
              : { level: "emd", code: p.adm_cd2!, sggCode: p.sgg!, sidoCode: p.sido };
        setDrill(next);
        latest.current.onDrillChange?.(next);
        if (latest.current.fitBoundsOnDrill) {
          map.fitBounds(featureBounds(f.geometry), { padding: 80, duration: 700 });
        }
      } else {
        if (selected.current) map.setFeatureState(selected.current, { selected: false });
        selected.current = { source: f.source, id: idOf(l, p) };
        map.setFeatureState(selected.current, { selected: true });
      }
      latest.current.onRegionClick?.(region);
    };

    const onLeave = () => clearHover();

    map.on("mousemove", onMove);
    map.on("click", onClick);
    map.getCanvas().addEventListener("mouseleave", onLeave);
    return () => {
      map.off("mousemove", onMove);
      map.off("click", onClick);
      map.getCanvas().removeEventListener("mouseleave", onLeave);
    };
  }, [isLoaded, map, geo, interactive, clearHover]);

  // ---- reset drill/selection when the level prop changes ----
  useEffect(() => {
    setDrill(null);
    latest.current.onDrillChange?.(null);
    if (selected.current && map) {
      map.setFeatureState(selected.current, { selected: false });
      selected.current = null;
    }
  }, [level, map]);

  return null;
}

type KoreaMapProps = Omit<ComponentProps<typeof Map>, "bounds"> & {
  /** Padding around Korea when fitting the initial view (default: 40). */
  boundsPadding?: number;
};

/**
 * A mapcn `<Map>` pre-framed on South Korea. Compose `<KoreaAdminLayer>`
 * (or any mapcn component) as children.
 *
 * ```tsx
 * <KoreaMap className="h-[480px]">
 *   <KoreaAdminLayer level="sgg" />
 * </KoreaMap>
 * ```
 */
export function KoreaMap({ boundsPadding = 40, children, ...props }: KoreaMapProps) {
  return (
    <Map
      bounds={KOREA_BOUNDS}
      fitBoundsOptions={{ padding: boundsPadding }}
      {...props}
    >
      {children}
    </Map>
  );
}

