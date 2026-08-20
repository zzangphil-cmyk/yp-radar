// mapcn-kr 경계의 시군구명(sggnm) ↔ 우리 데이터 시군구명 매핑 → src/data/sgg-alias.json
// 예: mapcn-kr "수원시장안구" ↔ 우리 "수원장안구"
// 시군구명은 거의 안 바뀌므로 상시 실행 단계가 아니라 필요할 때만 돌린다.
import fs from "node:fs";
import path from "node:path";

const SGG_URL = "https://cdn.jsdelivr.net/gh/DevMinGeonPark/mapcn-kr@main/data/sgg.json";
const OUT = path.join(process.cwd(), "src", "data", "sgg-alias.json");

const summary = JSON.parse(fs.readFileSync(path.join(process.cwd(), "src", "data", "realestate-summary.json"), "utf8"));
const ours = summary.sigungu.map((s) => s.sigungu);

const fc = await fetch(SGG_URL).then((r) => r.json());
const theirs = fc.features
  .map((f) => ({ sido: f.properties.sidonm, name: f.properties.sggnm }))
  .filter((t) => /서울|경기|인천/.test(t.sido));

// "수원시장안구" → "수원장안구" (구로 끝나면 중간의 '시'를 뺀 형태도 후보)
const variants = (n) => {
  const v = new Set([n]);
  if (n.endsWith("구")) v.add(n.replace("시", ""));
  return [...v];
};

const alias = {}; // mapcn-kr 이름 → 우리 이름
const unmatchedTheirs = [];
for (const t of theirs) {
  const hit = variants(t.name).find((v) => ours.includes(v));
  if (hit) alias[t.name] = hit;
  else unmatchedTheirs.push(`${t.sido}/${t.name}`);
}
const matchedOurs = new Set(Object.values(alias));
const unmatchedOurs = ours.filter((o) => !matchedOurs.has(o));

fs.writeFileSync(OUT, JSON.stringify(alias, null, 1));
console.log(`매칭 ${Object.keys(alias).length} / mapcn-kr 수도권 ${theirs.length} · 우리 ${ours.length}`);
if (unmatchedTheirs.length) console.log(`경계에만 있음(${unmatchedTheirs.length}): ${unmatchedTheirs.join(", ")}`);
if (unmatchedOurs.length) console.log(`우리에만 있음(${unmatchedOurs.length}): ${unmatchedOurs.join(", ")}`);
console.log(`저장: src/data/sgg-alias.json`);
