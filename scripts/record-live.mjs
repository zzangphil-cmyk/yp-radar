// [실시간 기록기] 장중 라이브 프레임을 받아 public/live/<날짜>.json 에 하루 전체 기록.
//   브라우저 탭과 무관하게 풀세션 기록 → 배포 사이트의 날짜 선택에서 모두가 그날 장중 재생.
//   호출: node scripts/record-live.mjs   (env: RADAR_URL, INTERVAL_MS, STOP_HHMM, AUTOCOMMIT=1)
//   기본: 배포 라우트 폴링, 60초 간격, 15:40(KST)까지, 마감 후 git 커밋·푸시(AUTOCOMMIT=1).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.cwd();
const URL = process.env.RADAR_URL || "https://yp-radar.vercel.app/api/radar/live";
const INTERVAL = Number(process.env.INTERVAL_MS) || 60000;
const RES_MIN = Number(process.env.RES_MIN) || 3;   // 저장 해상도(분) — 파일 크기 절약
const STOP_HHMM = process.env.STOP_HHMM || "1540"; // 이 시각(KST) 지나면 종료
const AUTOCOMMIT = process.env.AUTOCOMMIT === "1";
const FORCE = process.env.FORCE === "1";            // 장 마감에도 기록(테스트용)
const DIR = path.join(ROOT, "public", "live");
fs.mkdirSync(DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kst = () => { const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date()); const g = (t) => p.find((x) => x.type === t).value; return { date: `${g("year")}-${g("month")}-${g("day")}`, hhmm: `${g("hour")}${g("minute")}` }; };

function loadDay(date) {
  const f = path.join(DIR, `${date}.json`);
  if (fs.existsSync(f)) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { /*손상시 새로*/ } }
  return null;
}
function saveDay(date, rec) { fs.writeFileSync(path.join(DIR, `${date}.json`), JSON.stringify(rec)); }
function updateIndex() {
  const dates = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.replace(".json", "")).sort().reverse().slice(0, 30);
  fs.writeFileSync(path.join(DIR, "index.json"), JSON.stringify({ dates }));
  return dates;
}

const tmin = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + m; };
let rec = null, codes = null, lastSaved = null, n = 0;
console.log(`기록 시작 · URL=${URL} · ${INTERVAL / 1000}s 폴링 · ${RES_MIN}분 해상도 · ${STOP_HHMM}(KST)까지${AUTOCOMMIT ? " · 자동커밋" : ""}`);
while (true) {
  const { date, hhmm } = kst();
  if (hhmm >= STOP_HHMM) break;
  try {
    const r = await fetch(URL, { cache: "no-store", headers: { "User-Agent": "yp-recorder" } });
    const j = await r.json();
    if (j && j.stocks && j.frame && (j.open || FORCE)) { // 장중(open)만 기록
      if (!rec || rec.d !== date) { rec = loadDay(date) || { d: date, c: [], f: [] }; codes = rec.c.length ? rec.c : null; lastSaved = rec.f.length ? tmin(rec.f[rec.f.length - 1].t) : null; }
      if (!codes) { codes = j.stocks.map((s) => s.code); rec.c = codes; }
      const idx = {}; j.stocks.forEach((s, i) => { idx[s.code] = i; });
      const v = codes.map((c) => { const i = idx[c]; return i == null ? null : j.frame.b[i]; });
      const t = j.t, cur = tmin(t);
      const fr = { t, ts: j.ts || t, o: !!j.open, v };
      if (lastSaved == null || cur - lastSaved >= RES_MIN) { rec.f.push(fr); lastSaved = cur; n++; saveDay(date, rec); } // 새 버킷
      else if (rec.f.length) { rec.f[rec.f.length - 1] = fr; saveDay(date, rec); } // 같은 버킷 → 최신값
      if (n % 10 === 0 || n < 3) console.log(`  ${date} ${t} · open=${j.open} · 프레임 ${rec.f.length}`);
    } else if (n % 10 === 0) console.log(`  ${date} ${kst().hhmm} · 대기(open=${j?.open})`);
  } catch (e) { console.log("  폴링 실패:", String(e).slice(0, 80)); }
  await sleep(INTERVAL);
}

// 마감 후 완전성 백필: 장중 절전·중단으로 구멍이 나도 네이버 분봉으로 그날 전체(09:00~15:30) 재구성
//  ※ 절전으로 다음날 깨어난 경우를 대비해 '기록하던 날짜'(rec.d)를 우선 사용
const today = (rec && rec.d) || kst().date;
try {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "backfill-day.mjs"), today], { cwd: ROOT, stdio: "inherit", timeout: 10 * 60 * 1000 });
  console.log("완전성 백필 완료");
} catch (e) { console.log("백필 실패(라이브 기록 그대로 사용):", String(e).slice(0, 120)); }

const dates = updateIndex();
const finalRec = loadDay(today) || rec;
console.log(`기록 종료 · ${finalRec ? finalRec.d : "-"} 프레임 ${finalRec ? finalRec.f.length : 0} · index ${dates.length}일`);
if (AUTOCOMMIT && finalRec && finalRec.f.length) {
  try {
    execFileSync("git", ["add", "public/live"], { cwd: ROOT });
    execFileSync("git", ["commit", "-m", `장중 기록 ${finalRec.d} (${finalRec.f.length}프레임)`], { cwd: ROOT });
    execFileSync("git", ["push", "origin", "main"], { cwd: ROOT });
    console.log("자동 커밋·푸시 완료");
  } catch (e) { console.log("자동 커밋 실패(수동 커밋 필요):", String(e).slice(0, 120)); }
}
