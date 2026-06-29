// [판단 근거 카드 — 통념 지표] data/ta-panel.json → src/data/ta-latest.json (최신일 상태, 커밋용)
//   종목별 RSI·MACD(교차)·볼린저·스토캐스틱·이평배열·ADX 현재 상태. 카드에서 '정직 라벨'과 함께 표시.
//   ※ 11번 검증: 이 신호들은 미래수익 예측력 0 — 카드는 친숙한 맥락일 뿐 매매신호 아님.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const ta = JSON.parse(fs.readFileSync(path.join(ROOT, "data/ta-panel.json"), "utf8"));
const C = ta.cols, ci = (k) => C.indexOf(k);
const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
const r2 = (v) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

const out = {};
for (const code in ta.panel) {
  const rows = ta.panel[code].rows;
  if (!rows || rows.length < 2) continue;
  const r = rows[rows.length - 1], pv = rows[rows.length - 2];
  const g = (row, k) => row[ci(k)];
  const mhNow = g(r, "macdHist"), mhPrev = g(pv, "macdHist");
  let macdCross = 0; if (mhPrev != null && mhNow != null) { if (mhPrev <= 0 && mhNow > 0) macdCross = 1; else if (mhPrev >= 0 && mhNow < 0) macdCross = -1; }
  const s5 = g(r, "sma5"), s20 = g(r, "sma20"), s60 = g(r, "sma60");
  let maArr = 0; if (s5 != null && s20 != null && s60 != null) { if (s5 > s20 && s20 > s60) maArr = 1; else if (s5 < s20 && s20 < s60) maArr = -1; }
  out[code] = {
    rsi: r1(g(r, "rsi14")),
    macdHist: r2(mhNow), macdCross,            // 1=골든 -1=데드 0=없음
    bbPctB: r2(g(r, "bbPctB")),                 // <0 하단이탈 / >1 상단이탈
    stochK: r1(g(r, "stochK")),                 // <20 과매도 / >80 과매수
    maArr,                                      // 1=정배열 -1=역배열 0=혼조
    adx: r1(g(r, "adx14")),                     // >25 추세
    trend: (g(r, "pdi14") ?? 0) >= (g(r, "mdi14") ?? 0) ? 1 : -1,
    disp20: r1(g(r, "disp20")),
  };
}
fs.writeFileSync(path.join(ROOT, "src/data/ta-latest.json"), JSON.stringify({ asOf: ta.panel[Object.keys(ta.panel)[0]]?.dates.slice(-1)[0], count: Object.keys(out).length, byCode: out }));
console.log(`TA 최신값 ${Object.keys(out).length}종목 → src/data/ta-latest.json`);
const s = out["005930"]; if (s) console.log("삼성전자:", JSON.stringify(s));
