// [자동 데이터 갱신] 작업 스케줄러용. mode: morning | evening
//   morning(08:40): 베이스라인(전일종가·20일 거래량) — 반드시 장 시작 전(오늘 봉 제외 로직 때문)
//   evening(17:30): 주식 일봉(패널→레이더→통념지표) + ETF + 국민연금 최근동향
//   공통: 주말 스킵 · git pull --rebase 선행(커밋 경합 방지) · 변경 있을 때만 커밋·푸시
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = process.cwd();
const mode = process.argv[2] === "morning" ? "morning" : "evening";
const node = process.execPath;
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, stdio: "inherit", timeout: 30 * 60 * 1000 });
const kstDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());

// 주말 스킵(KST)
const dow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })).getDay();
if (dow === 0 || dow === 6) { console.log(`주말(KST) — ${mode} 갱신 스킵`); process.exit(0); }

console.log(`=== 자동 갱신(${mode}) ${kstDate()} ===`);
try { run("git", ["pull", "--rebase", "origin", "main"]); } catch { console.log("pull --rebase 실패 — 로컬 기준으로 진행"); }

const paths = [];
if (mode === "morning") {
  run(node, [path.join(ROOT, "scripts", "build-baseline.mjs")]);
  paths.push("src/data/radar-baseline.json");
} else {
  const steps = [
    ["build-panel.mjs", null], ["build-radar.mjs", "src/data/radar-frames.json"],
    ["build-ta-panel.mjs", null], ["build-ta-latest.mjs", "src/data/ta-latest.json"],
    ["build-etf-data.mjs", "src/data/etf.json"],
    ["build-recent-data.mjs", "src/data/nps-recent.json"],
  ];
  for (const [script, out] of steps) {
    try { run(node, [path.join(ROOT, "scripts", script)]); if (out) paths.push(out); }
    catch (e) { console.log(`${script} 실패 — 건너뜀:`, String(e).slice(0, 100)); }
  }
}

if (!paths.length) { console.log("갱신된 산출물 없음 — 종료"); process.exit(0); }
try {
  run("git", ["add", ...paths]);
  // 변경 없으면 커밋 스킵
  try { execFileSync("git", ["diff", "--cached", "--quiet"], { cwd: ROOT }); console.log("변경 없음 — 커밋 스킵"); process.exit(0); } catch { /* 변경 있음 */ }
  run("git", ["commit", "-m", `자동 갱신(${mode === "morning" ? "베이스라인" : "일일 데이터"}) ${kstDate()}`]);
  run("git", ["push", "origin", "main"]);
  console.log("커밋·푸시 완료");
} catch (e) { console.log("커밋 실패(수동 확인 필요):", String(e).slice(0, 150)); process.exit(1); }
