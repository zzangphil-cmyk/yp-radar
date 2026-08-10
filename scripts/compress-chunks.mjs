// 월별 데이터 청크를 gzip으로 저장해 저장소 용량을 줄인다 (112MB → 약 9MB).
// 확장자를 .jsonz로 두는 이유: .gz면 일부 호스팅이 Content-Encoding을 자동으로 붙여
// 브라우저가 먼저 풀어버려 이중 해제 문제가 생길 수 있다. 중립 확장자면 항상 원본 바이트가 온다.
// 브라우저 측 해제는 optimize-realestate.mjs가 주입하는 _ypGunzip()이 담당.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIR = path.join(process.cwd(), "public", "realestate", "data", "market_monthly_chunks_v1_0");
if (!fs.existsSync(DIR)) { console.log("청크 디렉터리 없음 — 건너뜀"); process.exit(0); }

const files = fs.readdirSync(DIR);
const jsons = files.filter((f) => f.endsWith(".json"));
if (!jsons.length) {
  const z = files.filter((f) => f.endsWith(".jsonz"));
  console.log(`이미 압축됨 (.jsonz ${z.length}개) — 건너뜀`);
  process.exit(0);
}

let before = 0, after = 0;
for (const f of jsons) {
  const src = path.join(DIR, f);
  const buf = fs.readFileSync(src);
  const gz = zlib.gzipSync(buf, { level: 9 });
  fs.writeFileSync(path.join(DIR, f.replace(/\.json$/, ".jsonz")), gz);
  fs.unlinkSync(src);
  before += buf.length;
  after += gz.length;
}
const mb = (b) => (b / 1024 / 1024).toFixed(1);
console.log(`청크 ${jsons.length}개 압축: ${mb(before)} → ${mb(after)} MB (-${mb(before - after)})`);
