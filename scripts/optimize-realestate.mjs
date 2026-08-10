// 부동산 분석기 용량 최적화 — 표시 결과는 그대로 두고 payload만 줄인다.
//   A) 미압축 테이블을 {columns,rows}로 패킹 (앱의 inflateTable 재사용)
//   B) geojson 좌표를 소수 5자리(≈1m)로 반올림
//   C) 앱 코드에서 한 번도 참조되지 않는 열 제거 (이름이 코드에 등장하면 무조건 보존 — 보수적)
//   D) base64 → 원본 JSON 인라인 (base64는 33% 부풀고 압축도 방해)
// 새 버전 반영 순서: 파일 교체 → optimize → build-realestate-summary → theme-realestate
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const ROOT = process.cwd();
const FILE = path.join(ROOT, "public", "realestate", "capital_area_market_analyzer_v3_0.html");
const MARK = "/*yp-optimized*/";

let html = fs.readFileSync(FILE, "utf8");
if (html.includes(MARK)) {
  console.log("이미 최적화됨 — 건너뜀 (새 원본으로 교체 후 재실행하세요)");
  process.exit(0);
}

const mb = (b) => (b / 1024 / 1024).toFixed(1);
const before = Buffer.byteLength(html);

// ── payload 추출 ──────────────────────────────────────────────────────────
const m = html.match(/_decodePayload\("([A-Za-z0-9+/=]+)"\)/);
if (!m) throw new Error("base64 payload를 찾지 못함 — 분석기 구조 변경 확인");
const DATA = JSON.parse(Buffer.from(m[1], "base64").toString("utf8"));

// 앱 JS 본문(참조 여부 판단용) — payload 문자열 자체는 제외해야 오탐이 없다
const jsBody = html.slice(html.indexOf("_decodePayload(\"") + m[1].length);

// ── A) 패킹 대상: 배열-of-객체이면서 아직 미압축인 대형 테이블 ─────────────
const ALREADY_PACKED = ["complex_market_monthly_area", "zone_market_monthly_area",
  "complex_market_window_area", "zone_market_window_area", "location", "official_land"];
const packed = [];
for (const [k, v] of Object.entries(DATA)) {
  if (ALREADY_PACKED.includes(k)) continue;
  if (!Array.isArray(v) || v.length < 200 || typeof v[0] !== "object" || v[0] === null) continue;
  const cols = [...new Set(v.flatMap((r) => Object.keys(r)))];
  DATA[k] = { columns: cols, rows: v.map((r) => cols.map((c) => r[c] ?? null)) };
  packed.push(k);
}

// 앱 코드엔 없지만 build-realestate-summary.mjs가 쓰는 열은 반드시 보존
const KEEP = new Set(["source_as_of"]);

// ── C) 미참조 열 제거 (패킹된 테이블에 대해서만, 이름이 코드에 없으면 삭제) ──
let droppedCols = 0;
for (const k of [...packed, ...ALREADY_PACKED]) {
  const t = DATA[k];
  if (!t?.columns) continue;
  const keep = t.columns.map((c) => KEEP.has(c) || jsBody.includes(c));
  const dropCount = keep.filter((x) => !x).length;
  if (!dropCount) continue;
  droppedCols += dropCount;
  t.rows = t.rows.map((row) => row.filter((_, i) => keep[i]));
  t.columns = t.columns.filter((_, i) => keep[i]);
}

// ── B) geojson 좌표 정밀도 ────────────────────────────────────────────────
const round5 = (o) => {
  if (Array.isArray(o)) return o.map(round5);
  if (typeof o === "number") return Math.round(o * 1e5) / 1e5;
  if (o && typeof o === "object") { const r = {}; for (const k in o) r[k] = round5(o[k]); return r; }
  return o;
};
for (const k of ["sigungu_geojson", "geojson"]) if (DATA[k]) DATA[k] = round5(DATA[k]);

// ── D) 원본 JSON 인라인 (base64 제거) ─────────────────────────────────────
// HTML <script> 안이므로 '<'를 이스케이프해 </script> 조기 종료를 방지
const json = JSON.stringify(DATA).replace(/</g, "\\u003c");

// _decodePayload("...") → 인라인 JSON
html = html.replace(/_decodePayload\("[A-Za-z0-9+/=]+"\)/, `${MARK}${json}`);

// 새로 패킹한 키를 앱의 inflate 목록에 추가
const listRe = /(\[)((?:'[a-z_]+',?)+)(\]\.forEach\(key=>\{DATA\[key\]=inflateTable\(DATA\[key\]\)\}\))/;
if (!listRe.test(html)) throw new Error("inflateTable 목록을 찾지 못함");
html = html.replace(listRe, (_, a, list, c) => {
  const cur = list.split(",").map((s) => s.trim().replace(/'/g, "")).filter(Boolean);
  const merged = [...new Set([...cur, ...packed])];
  return a + merged.map((k) => `'${k}'`).join(",") + c;
});

fs.writeFileSync(FILE, html);
const after = Buffer.byteLength(html);
console.log(`패킹: ${packed.length}개 테이블 (${packed.join(", ")})`);
console.log(`미참조 열 제거: ${droppedCols}개`);
console.log(`파일: ${mb(before)} → ${mb(after)} MB (-${mb(before - after)})`);
const br = zlib.brotliCompressSync(Buffer.from(html)).length;
console.log(`brotli 전송 예상: ${mb(br)} MB`);
