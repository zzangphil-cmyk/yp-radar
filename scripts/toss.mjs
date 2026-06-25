// 토스인베스트 Open API 공용 헬퍼 (빌드 시점 조회 전용)
// .env.local 의 TOSS_CLIENT_ID / TOSS_CLIENT_SECRET 사용. 조회(시세·캔들·마스터)만 호출.
import fs from "node:fs";
import path from "node:path";

const BASE = "https://openapi.tossinvest.com";
const ROOT = process.cwd();

function loadEnv() {
  const p = path.join(ROOT, ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
}
loadEnv();

const ID = process.env.TOSS_CLIENT_ID;
const SECRET = process.env.TOSS_CLIENT_SECRET;
export const hasToss = Boolean(ID && SECRET);

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let _token = null;
export async function token() {
  if (_token) return _token;
  if (!hasToss) throw new Error("TOSS_CLIENT_ID/SECRET 없음 (.env.local 확인)");
  const r = await fetch(`${BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: ID, client_secret: SECRET }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("토큰 발급 실패: " + JSON.stringify(j).slice(0, 160));
  _token = j.access_token;
  return _token;
}

export async function tossGet(pathQuery) {
  const t = await token();
  const r = await fetch(BASE + pathQuery, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`${r.status} ${pathQuery} ${(await r.text()).slice(0, 120)}`);
  return r.json();
}

/** /stocks 마스터 (symbols 콤마, 50개씩 분할) → { [symbol]: row } */
export async function stocksBatch(symbols) {
  const out = {};
  for (let i = 0; i < symbols.length; i += 50) {
    const chunk = symbols.slice(i, i + 50);
    const j = await tossGet(`/api/v1/stocks?symbols=${chunk.join(",")}`);
    for (const x of j.result || []) out[x.symbol] = x;
    await sleep(150); // MARKET_DATA 10 req/s 여유
  }
  return out;
}

/** 일봉 캔들 (최신→과거 순) */
export async function candles(symbol, count = 90) {
  const j = await tossGet(`/api/v1/candles?symbol=${symbol}&interval=1d&count=${count}`);
  return (j.result && j.result.candles) || [];
}
