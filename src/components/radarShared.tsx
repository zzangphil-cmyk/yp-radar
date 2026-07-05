"use client";

// 2D/3D 관제 스코프 공유 모듈 — 두 탭은 레이더만 다르고 구성은 동일하다.
//  · themeMeta: 성좌(테마) 색·대장주·멤버 (radarData 정적 → 모듈 1회 계산)
//  · CircleLogo · JudgeCard(판단 근거 카드) · ThemePanel(성좌별 종목 리스트)
import { useEffect, useRef, useState } from "react";
import { radarData, AXIS5, getTa, groupLabel } from "@/lib/radarData";

export const SELECT = "#22c55e", AMBER = "#f5a623", UP = "#f04452", DOWN = "#4c82fb";
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const dayKST = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
export const fmtDay = (d: string) => (d === dayKST() ? "오늘" : d.slice(5).replace("-", "/"));

// ── 장중 기록 저장소(IndexedDB) + 실시간 버퍼 훅: 2D/3D 공용 ──
export type LiveFrame = { t: string; ts: string; open: boolean; map: Record<string, number[]> };
export type DayRec = { d: string; c: string[]; f: { t: string; ts: string; o: boolean; v: (number[] | null)[] }[] };
function idbOpen(): Promise<IDBDatabase> {
  return new Promise((res, rej) => { const r = indexedDB.open("yp-radar", 1); r.onupgradeneeded = () => r.result.createObjectStore("days"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbPut(key: string, val: unknown) { const db = await idbOpen(); return new Promise<void>((res, rej) => { const tx = db.transaction("days", "readwrite"); tx.objectStore("days").put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbGet<T>(key: string): Promise<T | null> { const db = await idbOpen(); return new Promise((res) => { const tx = db.transaction("days", "readonly"); const rq = tx.objectStore("days").get(key); rq.onsuccess = () => res((rq.result as T) ?? null); rq.onerror = () => res(null); }); }
async function idbKeys(): Promise<string[]> { const db = await idbOpen(); return new Promise((res) => { const tx = db.transaction("days", "readonly"); const rq = tx.objectStore("days").getAllKeys(); rq.onsuccess = () => res((rq.result as string[]) || []); rq.onerror = () => res([]); }); }
async function idbDel(key: string) { const db = await idbOpen(); return new Promise<void>((res) => { const tx = db.transaction("days", "readwrite"); tx.objectStore("days").delete(key); tx.oncomplete = () => res(); tx.onerror = () => res(); }); }
const recToBuf = (rec: DayRec): LiveFrame[] => {
  const codes = rec.c;
  return rec.f.map((fr) => { const map: Record<string, number[]> = {}; fr.v.forEach((bl, k) => { if (bl) map[codes[k]] = bl; }); return { t: fr.t, ts: fr.ts, open: fr.o, map }; });
};

/**
 * 실시간 하루 버퍼 훅 — 서버 히스토리 시딩(접속 시점 무관 09시부터) + 30초 폴링(장중) +
 * IndexedDB 오늘 저장 + 날짜별 기록(서버 우선) + 휴장 자동 전환. active=false면 폴링·로드 중지.
 * loadSeq: 버퍼가 통째로 교체될 때 증가 — 컴포넌트가 애니메이션 리셋 트리거로 사용.
 */
export function useLiveDay(active: boolean) {
  const [liveBuf, setLiveBuf] = useState<LiveFrame[]>([]);
  const [liveDate, setLiveDate] = useState<string>("");
  const [days, setDays] = useState<string[]>([]);
  const [serverDays, setServerDays] = useState<string[]>([]);
  const [liveClosed, setLiveClosed] = useState(false);
  const [loadSeq, setLoadSeq] = useState(0);
  const isToday = liveDate === dayKST() || liveDate === "";
  const liveLast = liveBuf[liveBuf.length - 1];

  // 마운트: 서버 기록 + 브라우저 기록 날짜 병합
  useEffect(() => {
    setLiveDate(dayKST());
    Promise.all([
      idbKeys().catch(() => [] as string[]),
      fetch("/live/index.json").then((r) => (r.ok ? r.json() : { dates: [] })).catch(() => ({ dates: [] })),
    ]).then(([ks, idx]) => {
      const today = dayKST();
      const sv = (idx.dates || []) as string[];
      setServerDays(sv);
      const idbDays = ks.map((k) => k.replace(/^day-/, ""));
      const list = Array.from(new Set([today, ...sv, ...idbDays])).sort().reverse();
      setDays(list);
      idbDays.filter((d) => !list.slice(0, 14).includes(d)).forEach((d) => idbDel(`day-${d}`));
    });
  }, []);

  // 선택 날짜 로드 — 과거: 서버 기록 우선 / 오늘: 서버 히스토리 시딩(폴링 프레임은 뒤에 보존)
  useEffect(() => {
    if (!active || !liveDate) return;
    let alive = true;
    const tmin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const apply = (rec: DayRec | null) => {
      if (!alive) return;
      setLiveBuf(rec && Array.isArray(rec.c) && Array.isArray(rec.f) ? recToBuf(rec) : []);
      setLoadSeq((v) => v + 1);
    };
    const mergeToday = (rec: DayRec | null) => {
      if (!alive || !rec?.c?.length || !rec.f?.length) return false;
      const hist = recToBuf(rec);
      const lastT = tmin(hist[hist.length - 1].t);
      setLiveBuf((prev) => [...hist, ...prev.filter((f) => tmin(f.t) > lastT)]);
      setLoadSeq((v) => v + 1);
      return true;
    };
    if (!isToday && serverDays.includes(liveDate)) {
      fetch(`/live/${liveDate}.json`).then((r) => (r.ok ? r.json() : null)).then(apply).catch(() => apply(null));
    } else if (isToday) {
      fetch("/api/radar/history").then((r) => (r.ok ? r.json() : null))
        .then((rec: DayRec | null) => { if (!mergeToday(rec)) idbGet<DayRec>(`day-${liveDate}`).then(apply); })
        .catch(() => idbGet<DayRec>(`day-${liveDate}`).then(apply));
    } else {
      idbGet<DayRec>(`day-${liveDate}`).then(apply);
    }
    return () => { alive = false; };
  }, [active, liveDate, isToday, serverDays]);

  // 폴링(오늘·장중만) — 마감 감지 시 중지
  useEffect(() => {
    if (!active || !isToday) return;
    let alive = true; let timer: ReturnType<typeof setTimeout> | undefined;
    setLiveClosed(false);
    const pull = async () => {
      let closed = false;
      try {
        const r = await fetch("/api/radar/live", { cache: "no-store" });
        const j = await r.json();
        if (alive && j.stocks) {
          if (j.open) {
            const map: Record<string, number[]> = {};
            for (const bl of j.frame.b) map[j.stocks[bl[0]].code] = bl;
            const fr: LiveFrame = { t: j.t, ts: j.ts ?? j.t, open: true, map };
            setLiveBuf((prev) => {
              if (prev.length && prev[prev.length - 1].ts === fr.ts) return prev;
              const next = [...prev, fr];
              if (next.length > 800) next.shift();
              return next;
            });
          } else closed = true;
        }
      } catch { /* 유지 */ }
      if (!alive) return;
      if (closed) setLiveClosed(true);
      else timer = setTimeout(pull, 30000);
    };
    pull();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [active, isToday]);

  // 장 마감 후 서버 전체 기록으로 교체
  useEffect(() => {
    if (!active || !isToday || !liveClosed) return;
    const today = dayKST();
    if (!serverDays.includes(today)) return;
    let alive = true;
    fetch(`/live/${today}.json`).then((r) => (r.ok ? r.json() : null)).then((rec: DayRec | null) => {
      if (!alive || !rec?.c || !rec?.f) return;
      setLiveBuf(recToBuf(rec)); setLoadSeq((v) => v + 1);
    }).catch(() => { });
    return () => { alive = false; };
  }, [active, isToday, liveClosed, serverDays]);

  // 휴장·주말: 오늘 데이터 없으면 최근 기록일로
  useEffect(() => {
    if (!active || !isToday || !liveClosed || liveBuf.length) return;
    const prev = days.find((d) => d !== dayKST());
    if (prev) setLiveDate(prev);
  }, [active, isToday, liveClosed, liveBuf.length, days]);

  // 오늘 누적 저장(IndexedDB)
  useEffect(() => {
    if (!active || !isToday || !liveBuf.length) return;
    const today = dayKST();
    const codes = Object.keys(liveBuf[liveBuf.length - 1].map);
    const f = liveBuf.map((fr) => ({ t: fr.t, ts: fr.ts, o: fr.open, v: codes.map((c) => fr.map[c] ?? null) }));
    idbPut(`day-${today}`, { d: today, c: codes, f } as DayRec).catch(() => { });
    setDays((prev) => (prev.includes(today) ? prev : [today, ...prev].sort().reverse()));
  }, [liveBuf, active, isToday]);

  const pickDate = (d: string) => setLiveDate(d);
  const goToday = () => setLiveDate(dayKST());
  return { liveBuf, liveDate, days, isToday, liveClosed, liveLast, loadSeq, pickDate, goToday };
}

// 성좌 메타 — 색(수제 고대비 hue)·대장주(테마 내 ETF 노출 1위 = stocks 첫 등장)·멤버
export const themeMeta = (() => {
  const HUES = [355, 45, 190, 275, 110, 20, 220, 320, 75, 165, 250, 300, 140, 205, 30, 345];
  const stocks = radarData.stocks;
  const themeOf = stocks.map((st) => st.theme ?? "기타");
  const themes: string[] = []; const idxOf: Record<string, number> = {};
  themeOf.forEach((t) => { if (!(t in idxOf)) { idxOf[t] = themes.length; themes.push(t); } });
  const hue = themes.map((_, k) => HUES[k % HUES.length]);
  const themeIdx = themeOf.map((t) => idxOf[t]);
  const leader = themes.map(() => -1);
  themeIdx.forEach((k, i) => { if (leader[k] === -1) leader[k] = i; });
  const members = themes.map((_, k) => themeIdx.map((kk, i) => (kk === k ? i : -1)).filter((i) => i >= 0));
  return { themes, hue, themeIdx, leader, members };
})();

const LOGO_BG = ["#3182f6", "#f04452", "#f5a623", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b", "#0ea5e9"];
export function CircleLogo({ name, on, size = 8 }: { name: string; on?: boolean; size?: number }) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const ko = name.replace(/^[A-Z]+\s*/, "").charAt(0);
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size * 4, height: size * 4, fontSize: 12, background: on ? SELECT : LOGO_BG[h % LOGO_BG.length] }}>
      {ko || name.charAt(0)}
    </span>
  );
}

// ── 판단 근거 카드: 예측이 아니라 사람이 판단할 근거 조립 ──
export interface JudgeCardProps {
  code: string; name: string; market?: string;
  temp: number; retPct: number; grp: number;         // 온도·등락·주도원인
  mkt: number; secDev: number; spec: number; led: number; // 왜 떴나(분해)
  perc: number[];                                    // 5축 시장내 백분위
  onClose: () => void;
}
export function JudgeCard(p: JudgeCardProps) {
  const am = Math.abs(p.mkt), as = Math.abs(p.secDev), ap = Math.abs(p.spec), tot = am + as + ap || 1e-9;
  const ledTxt = p.led === 0 ? "종목 고유" : p.led === 1 ? "섹터 동반" : "시장 동반";
  const ledCol = p.led === 0 ? SELECT : "#94a3b8";
  const ta = getTa(p.code);
  const Seg = ({ label, v, col }: { label: string; v: number; col: string }) => (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-[11px] text-white/45">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div className="h-full rounded-full" style={{ width: `${Math.round(v / tot * 100)}%`, background: col }} />
      </div>
      <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/60">{Math.round(v / tot * 100)}%</span>
    </div>
  );
  const taLabel = ta ? {
    rsiT: ta.rsi >= 70 ? "과매수" : ta.rsi <= 30 ? "과매도" : "중립",
    macdT: ta.macdCross === 1 ? "골든크로스" : ta.macdCross === -1 ? "데드크로스" : ta.macdHist > 0 ? "상승" : "하락",
    bbT: ta.bbPctB > 1 ? "상단 이탈" : ta.bbPctB < 0 ? "하단 이탈" : `밴드 내 ${Math.round(ta.bbPctB * 100)}%`,
    maT: ta.maArr === 1 ? "정배열" : ta.maArr === -1 ? "역배열" : "혼조",
    adxT: ta.adx >= 25 ? `추세강함(${ta.trend > 0 ? "상승" : "하락"})` : "추세약함",
  } : null;

  return (
    <div className="rounded-[20px] bg-[#22c55e]/[0.07] p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CircleLogo name={p.name} on size={8} />
          <div>
            <div className="flex items-center gap-1.5 text-[15px] font-bold text-white">
              {p.name}
              {p.market && <span className="rounded bg-white/10 px-1 py-px text-[10px] font-medium text-white/55">{p.market === "KOSDAQ" ? "코스닥" : "코스피"}</span>}
            </div>
            <div className="text-[12px] text-white/50">
              온도 <strong style={{ color: AMBER }}>{Math.round(p.temp * 100)}°</strong>
              {p.grp >= 0 && <> · {groupLabel(p.grp)} 주도</>} · <span style={{ color: p.retPct >= 0 ? UP : DOWN }}>{p.retPct >= 0 ? "+" : ""}{p.retPct.toFixed(1)}%</span>
            </div>
          </div>
        </div>
        <button onClick={p.onClose} className="rounded-full bg-white/[0.06] px-2 py-1 text-xs text-white/50 hover:text-white">닫기 ✕</button>
      </div>

      {/* 1. 왜 떴나 */}
      <div className="mb-3">
        <div className="mb-1.5 text-[12px] font-bold text-white/70">왜 떴나 <span className="font-normal text-white/40">· 이 움직임의 출처</span></div>
        <div className="space-y-1">
          <Seg label="시장" v={am} col="#6a73a0" />
          <Seg label="섹터" v={as} col="#a06a73" />
          <Seg label="고유" v={ap} col={SELECT} />
        </div>
        <div className="mt-1.5 text-[12px]" style={{ color: ledCol }}>→ <strong>{ledTxt}</strong> 주도 {p.led === 0 ? "(시장·섹터 빼도 이 종목만의 움직임)" : "(테마·지수가 같이 움직임 — 종목만의 신호 약함)"}</div>
      </div>

      {/* 2. 무엇이 특이 */}
      {p.perc.length === 5 ? (
        <div className="mb-3">
          <div className="mb-1.5 text-[12px] font-bold text-white/70">무엇이 특이 <span className="font-normal text-white/40">· 동종 대비 위치(백분위)</span></div>
          <div className="space-y-1">
            {AXIS5.map((label, k) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-[11px] text-white/45">{label}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div className="h-full rounded-full" style={{ width: `${p.perc[k]}%`, background: p.perc[k] >= 80 ? AMBER : "#5b6573" }} />
                </div>
                <span className="w-12 shrink-0 text-right text-[11px] tabular-nums" style={{ color: p.perc[k] >= 80 ? AMBER : "rgba(255,255,255,0.45)" }}>
                  {p.perc[k] >= 50 ? `상위${Math.max(1, 100 - p.perc[k])}%` : `하위${Math.max(1, p.perc[k])}%`}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-3 text-[12px] text-white/35">무엇이 특이 — 일일 모드에서 보입니다.</div>
      )}

      {/* 3. 통념 지표 + 정직 라벨 */}
      {taLabel && ta && (
        <div className="mb-2">
          <div className="mb-1.5 text-[12px] font-bold text-white/70">통념 지표 <span className="font-normal text-white/40">· 최신일 기준</span></div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] text-white/65">
            <div>RSI <strong className="text-white/85">{ta.rsi}</strong> <span className="text-white/45">{taLabel.rsiT}</span></div>
            <div>MACD <strong className="text-white/85">{taLabel.macdT}</strong></div>
            <div>볼린저 <strong className="text-white/85">{taLabel.bbT}</strong></div>
            <div>이평 <strong className="text-white/85">{taLabel.maT}</strong></div>
            <div>스토캐스틱 <strong className="text-white/85">{ta.stochK}</strong></div>
            <div>ADX <strong className="text-white/85">{taLabel.adxT}</strong></div>
          </div>
          <div className="mt-1.5 rounded-lg bg-[#f5a623]/[0.08] px-2 py-1 text-[11px] text-[#f5a623]/90">
            ⚠️ 우리 7개월 검증에서 이 지표들의 미래수익 예측력 <strong>0</strong> (특히 과매도≠반등). 친숙한 참고 맥락일 뿐.
          </div>
        </div>
      )}

      <div className="mt-2 border-t border-white/[0.06] pt-2 text-center text-[11px] text-white/40">
        판단은 당신 몫입니다 · <strong className="text-white/55">매매신호·투자자문 아님</strong>
      </div>
    </div>
  );
}

// 일일 프레임에서 JudgeCard 프롭 계산(3D·공용): 분해(시장/섹터/고유) + 백분위
//  overrideB: 실시간 스냅샷 등 프레임 밖 blip 배열(stocks 순 정렬, 결측 null)로 대체 계산
export function judgePropsFromFrame(frameIdx: number, stockIdx: number, onClose: () => void, overrideB?: (number[] | null)[]): JudgeCardProps | null {
  const f = radarData.frames[clamp(frameIdx, 0, radarData.frameCount - 1)];
  const s = radarData.stocks[stockIdx];
  if ((!f && !overrideB) || !s) return null;
  const rows: (number[] | null)[] = overrideB ?? f.b.map((b) => b as unknown as number[]);
  const bl = rows[stockIdx];
  if (!bl) return null;
  const rets = rows.map((b) => (b ? b[5] : 0));
  const mkt = rets.reduce((a, v) => a + v, 0) / (rets.length || 1);
  const th = s.theme ?? "기타";
  const mem = themeMeta.members[themeMeta.themeIdx[stockIdx]] ?? [];
  const themeMean = mem.length ? mem.reduce((a, i) => a + rets[i], 0) / mem.length : mkt;
  const secDev = themeMean - mkt, spec = bl[5] - themeMean;
  const share = Math.abs(spec) / (Math.abs(mkt) + Math.abs(secDev) + Math.abs(spec) || 1e-9);
  const led = share >= 0.5 ? 0 : Math.abs(secDev) >= Math.abs(mkt) ? 1 : 2;
  void th;
  return {
    code: s.code, name: s.name, market: s.market,
    temp: bl[3], retPct: bl[5], grp: (bl[7] as number) ?? -1,
    mkt, secDev, spec, led, perc: (bl[8] as unknown as number[]) ?? [],
    onClose,
  };
}

// ── 성좌별 종목 리스트: 뜨거운 성좌부터, ✦=대장주, 클릭=레이더에서 선택 ──
//  overrideB: 실시간 스냅샷 blip(stocks 순, 결측 null)로 대체
export function ThemePanel({ frameIdx, selected, onSelect, overrideB }: { frameIdx: number; selected: number | null; onSelect: (i: number | null) => void; overrideB?: (number[] | null)[] }) {
  const f = radarData.frames[clamp(frameIdx, 0, radarData.frameCount - 1)];
  if (!f && !overrideB) return null;
  const rowsSrc: (number[] | null)[] = overrideB ?? f.b.map((b) => b as unknown as number[]);
  const stocks = radarData.stocks;
  const groups = themeMeta.themes.map((t, k) => {
    const rows = themeMeta.members[k]
      .map((i) => { const b = rowsSrc[i]; return { i, name: stocks[i].name, temp: b ? b[3] : 0, ret: b ? b[5] : 0, leader: themeMeta.leader[k] === i }; })
      .sort((a, b) => (b.leader ? 1 : 0) - (a.leader ? 1 : 0) || b.temp - a.temp);
    const maxTemp = rows.reduce((m, r) => Math.max(m, r.temp), 0);
    const avgRet = rows.reduce((sum, r) => sum + r.ret, 0) / (rows.length || 1);
    return { t, hue: themeMeta.hue[k], rows, maxTemp, avgRet, n: rows.length };
  }).sort((a, b) => b.maxTemp - a.maxTemp);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <div key={g.t} className="rounded-[20px] bg-base-800 p-3">
          <div className="mb-1.5 flex items-center gap-1.5 px-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `hsl(${g.hue} 70% 62%)` }} />
            <span className="text-[13px] font-bold" style={{ color: `hsl(${g.hue} 70% 68%)` }}>{g.t}</span>
            <span className="text-[11px] text-white/35">{g.n}종목</span>
            <span className={`ml-auto text-[12px] font-semibold tabular-nums ${g.avgRet >= 0 ? "text-up" : "text-down"}`}>
              평균 {g.avgRet >= 0 ? "+" : ""}{g.avgRet.toFixed(1)}%
            </span>
          </div>
          <ul className="space-y-0.5">
            {g.rows.slice(0, 6).map((r) => {
              const on = selected === r.i;
              return (
                <li key={r.i}>
                  <button onClick={() => onSelect(on ? null : r.i)}
                    className={`flex w-full items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-left transition-colors ${on ? "bg-[#22c55e]/10" : "hover:bg-white/[0.04]"}`}>
                    <span className="w-3 shrink-0 text-center text-[11px]" style={{ color: `hsl(${g.hue} 70% 65%)` }}>{r.leader ? "✦" : "·"}</span>
                    <span className={`min-w-0 flex-1 truncate text-[12px] ${on ? "text-[#22c55e]" : r.leader ? "text-white/90 font-semibold" : "text-white/70"}`}>{r.name}</span>
                    {r.temp >= 0.3 && <span className="shrink-0 text-[11px] font-semibold tabular-nums" style={{ color: AMBER }}>{Math.round(r.temp * 100)}°</span>}
                    <span className={`w-12 shrink-0 text-right text-[12px] font-semibold tabular-nums ${r.ret >= 0 ? "text-up" : "text-down"}`}>
                      {r.ret >= 0 ? "+" : ""}{r.ret.toFixed(1)}%
                    </span>
                  </button>
                </li>
              );
            })}
            {g.n > 6 && <li className="px-1.5 pt-0.5 text-[11px] text-white/30">+{g.n - 6}종목 (레이더에서 탐색)</li>}
          </ul>
        </div>
      ))}
    </div>
  );
}
