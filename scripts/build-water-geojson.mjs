// 수도권 주요 수계(한강·지천·호수) GeoJSON 수집 → src/data/water-capital.json
// 출처: OpenStreetMap (Overpass API) · ODbL. 지도에 지리적 맥락을 주기 위한 표시용 레이어.
// 한 번 받아두면 되므로 파이프라인 상시 단계는 아니다(수계는 거의 안 변함).
import fs from "node:fs";
import path from "node:path";

const OUT = path.join(process.cwd(), "src", "data", "water-capital.json");
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// 수도권 bbox (남,서,북,동) — 서울·경기·인천 포함
const BBOX = "36.85,126.30,38.30,127.90";
// 본류는 relation, 지천은 way로 들어오는 경우가 섞여 있어 둘 다 조회
const QUERY = `[out:json][timeout:180];
(
  relation["natural"="water"]["name"~"한강|북한강|남한강|임진강|팔당호|청평호"](${BBOX});
  way["natural"="water"]["name"~"한강|북한강|남한강|임진강|팔당호|청평호"](${BBOX});
  way["waterway"="riverbank"](${BBOX});
  way["natural"="water"]["water"="river"](${BBOX});
);
out geom;`;

async function overpass() {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      console.log(`조회: ${new URL(url).host} …`);
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Oversspass는 UA 없는 요청을 406으로 거절한다
          "User-Agent": "yp-radar/1.0 (real-estate map water layer; contact via github zzangphil-cmyk/yp-radar)",
          Accept: "application/json",
        },
        body: "data=" + encodeURIComponent(QUERY),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      console.log(`  실패: ${String(e.message).slice(0, 60)}`);
      lastErr = e;
    }
  }
  throw lastErr;
}

const r5 = (v) => Math.round(v * 1e5) / 1e5; // 약 1m 정밀도
const ringOf = (geom) => geom.filter((p) => p.lat != null).map((p) => [r5(p.lon), r5(p.lat)]);

// 면적이 아주 작은 조각은 지도에서 보이지도 않으므로 제외(용량 절약)
function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  return Math.abs(a / 2);
}
const MIN_AREA = 2e-6;

const data = await overpass();
console.log(`요소 ${data.elements.length}개 수신`);

const polys = [];
for (const el of data.elements) {
  if (el.type === "way" && el.geometry) {
    const ring = ringOf(el.geometry);
    if (ring.length > 3 && ringArea(ring) >= MIN_AREA) polys.push([ring]);
  } else if (el.type === "relation" && el.members) {
    // multipolygon: outer 링만 사용(내부 섬은 표시상 무시)
    for (const m of el.members) {
      if (m.role !== "outer" || !m.geometry) continue;
      const ring = ringOf(m.geometry);
      if (ring.length > 3 && ringArea(ring) >= MIN_AREA) polys.push([ring]);
    }
  }
}

// ── 단순화(Douglas-Peucker) ────────────────────────────────────────────────
// 지도는 폭 700px에 약 1.5도를 담으므로 0.0002도(≈20m) 이하 굴곡은 화면에서 안 보인다.
const TOL = 0.0002;
function dp(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay;
  const den = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / den;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [...dp(pts.slice(0, idx + 1), tol).slice(0, -1), ...dp(pts.slice(idx), tol)];
}
const simplified = polys
  .map(([ring]) => {
    const s = dp(ring, TOL);
    if (s.length > 2 && (s[0][0] !== s[s.length - 1][0] || s[0][1] !== s[s.length - 1][1])) s.push(s[0]);
    return [s];
  })
  .filter(([r]) => r.length > 3);

const before = polys.reduce((a, [r]) => a + r.length, 0);
const after = simplified.reduce((a, [r]) => a + r.length, 0);
console.log(`단순화: 점 ${before} → ${after} (${((1 - after / before) * 100).toFixed(0)}% 감소)`);

const out = {
  type: "FeatureCollection",
  source: "OpenStreetMap contributors (ODbL) · Overpass API",
  features: simplified.map((coords) => ({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: coords } })),
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`저장: src/data/water-capital.json · 폴리곤 ${out.features.length}개 · ${kb}KB`);
