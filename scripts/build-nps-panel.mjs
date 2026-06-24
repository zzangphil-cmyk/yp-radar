// 국민연금 국내주식 연간 스냅샷(2020~2024) XLSX → 종목×연도 패널 + YoY 변화 EDA
// 입력: data/nps_files/x_FL2500209{2..6}/  (압축 해제된 xlsx)
// 출력: data/nps-panel.json
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FILES = [
  { id: "FL25002092", year: 2024 },
  { id: "FL25002093", year: 2023 },
  { id: "FL25002094", year: 2022 },
  { id: "FL25002095", year: 2021 },
  { id: "FL25002096", year: 2020 },
];

function colLetters(ref) {
  return ref.replace(/[0-9]+/g, "");
}
function colToNum(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(dir) {
  const ssPath = path.join(dir, "xl/sharedStrings.xml");
  const shared = [];
  if (fs.existsSync(ssPath)) {
    const ss = fs.readFileSync(ssPath, "utf8");
    for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const text = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((m) => m[1])
        .join("");
      shared.push(
        text
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">"),
      );
    }
  }
  // 시트 파일 찾기
  let sheetFile = path.join(dir, "xl/worksheets/sheet1.xml");
  if (!fs.existsSync(sheetFile)) {
    const wdir = path.join(dir, "xl/worksheets");
    sheetFile = path.join(wdir, fs.readdirSync(wdir).find((f) => f.endsWith(".xml")));
  }
  const sheet = fs.readFileSync(sheetFile, "utf8");
  const rows = [];
  for (const r of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const c of r[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*)>([\s\S]*?)<\/c>/g)) {
      const col = colToNum(colLetters(c[1]));
      const attrs = c[2];
      const inner = c[3];
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (v === undefined) continue;
      if (/t="s"/.test(attrs)) cells[col] = shared[Number(v)] ?? "";
      else cells[col] = v;
    }
    rows.push(cells);
  }
  return rows;
}

function extractYear(dir) {
  const rows = parseSheet(dir);
  // 헤더 행 탐색
  let headerIdx = -1;
  const colMap = {};
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const vals = rows[i];
    for (const [col, val] of Object.entries(vals)) {
      const s = String(val);
      if (s.includes("종목명")) colMap.name = +col;
      else if (s.includes("평가액")) colMap.value = +col;
      else if (s.includes("비중")) colMap.weight = +col;
      else if (s.includes("지분율")) colMap.ownership = +col;
    }
    if (colMap.name !== undefined && colMap.ownership !== undefined) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) throw new Error("헤더 못 찾음: " + dir);
  // 셀 → 숫자 (텍스트 "7.28%", 콤마 등 처리)
  const parseCell = (v) => {
    if (v === undefined || v === null) return NaN;
    return Number(String(v).replace(/[%,\s]/g, ""));
  };
  const out = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[colMap.name] ?? "").trim();
    if (!name) continue;
    const value = parseCell(r[colMap.value]);
    const weight = colMap.weight !== undefined ? parseCell(r[colMap.weight]) : NaN;
    const ownership = parseCell(r[colMap.ownership]);
    if (!Number.isFinite(value)) continue;
    out.push({ name, value, weight, ownership });
  }
  // 연도별 단위 정규화: 비율이 소수(분수)로 저장된 해는 ×100 (max<=1.5 판정)
  const fixScale = (key) => {
    const vals = out.map((r) => r[key]).filter((x) => Number.isFinite(x));
    if (vals.length && Math.max(...vals) <= 1.5) {
      for (const r of out) if (Number.isFinite(r[key])) r[key] = r[key] * 100;
    }
  };
  fixScale("ownership");
  fixScale("weight");
  return out;
}

const norm = (s) => s.replace(/\(주\)|주식회사|㈜/g, "").replace(/\s+/g, "").trim();

// --- 연도별 추출 → 패널 병합 ---
const byYear = {};
for (const f of FILES) {
  const dir = path.join(ROOT, "data/nps_files", "x_" + f.id);
  const rows = extractYear(dir);
  byYear[f.year] = rows;
  console.log(`${f.year}년: ${rows.length}종목, 평가액합 ${(rows.reduce((s, r) => s + r.value, 0) / 10000).toFixed(0)}조`);
}

const years = FILES.map((f) => f.year).sort();
const panel = new Map(); // normName -> { name, byYear:{year:{value,weight,ownership}} }
for (const y of years) {
  for (const r of byYear[y]) {
    const k = norm(r.name);
    if (!panel.has(k)) panel.set(k, { name: r.name, byYear: {} });
    panel.get(k).byYear[y] = { value: r.value, weight: r.weight, ownership: r.ownership };
  }
}

const panelArr = [...panel.values()];
fs.writeFileSync(
  path.join(ROOT, "data/nps-panel.json"),
  JSON.stringify({ years, count: panelArr.length, stocks: panelArr }, null, 1),
);

// --- EDA ---
console.log("\n===== 패널 EDA =====");
console.log("고유 종목(5년 합집합):", panelArr.length);
const allYears = panelArr.filter((p) => years.every((y) => p.byYear[y]));
console.log("5년 연속 보유:", allYears.length);

// YoY 지분율 변화 (연속 보유 종목, 2023→2024)
const yoy = [];
for (const p of panelArr) {
  const a = p.byYear[2023]?.ownership;
  const b = p.byYear[2024]?.ownership;
  if (Number.isFinite(a) && Number.isFinite(b)) {
    yoy.push({ name: p.name, d: b - a });
  }
}
const up = yoy.filter((x) => x.d > 0.01).length;
const dn = yoy.filter((x) => x.d < -0.01).length;
const flat = yoy.length - up - dn;
console.log(`2023→2024 지분율 변화 (n=${yoy.length}): 증가 ${up} / 감소 ${dn} / 보합 ${flat}`);
console.log("  최대 증가:", [...yoy].sort((a, b) => b.d - a.d).slice(0, 3).map((x) => `${x.name}(+${x.d.toFixed(2)})`).join(", "));
console.log("  최대 감소:", [...yoy].sort((a, b) => a.d - b.d).slice(0, 3).map((x) => `${x.name}(${x.d.toFixed(2)})`).join(", "));

// 신규 편입 / 제외 (2024 vs 2023)
const in2023 = new Set(byYear[2023].map((r) => norm(r.name)));
const in2024 = new Set(byYear[2024].map((r) => norm(r.name)));
const entered = [...in2024].filter((k) => !in2023.has(k)).length;
const exited = [...in2023].filter((k) => !in2024.has(k)).length;
console.log(`2024 신규 편입: ${entered}종목 / 2024 제외(매도): ${exited}종목`);
console.log("저장: data/nps-panel.json");
