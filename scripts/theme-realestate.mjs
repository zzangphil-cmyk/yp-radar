// 부동산 분석기(정적 3페이지)를 주부 레이더 다크 UI로 통일.
// - 원본 HTML에 <style id="yp-theme"> 다크 오버라이드 + 상단 글로벌 스위처(.yp-top) 주입
// - 멱등: 재실행/새 버전 재번들 후 다시 돌려도 기존 주입분을 교체
// 사용: node scripts/theme-realestate.mjs
import fs from "node:fs";
import path from "node:path";

// 원자적 쓰기 — 임시 파일에 쓴 뒤 rename.
// 프로세스가 쓰기 도중 죽어도 원본이 0바이트로 잘리지 않는다(실제로 한 번 겪음).
function writeAtomic(p, data) {
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, p);
}

const DIR = path.join(process.cwd(), "public", "realestate");
const ANALYZER = "capital_area_market_analyzer_v3_0.html";
const SIBLINGS = ["real_estate_policy_timeline_v1_0.html", "real_estate_expert_signals_v1_0.html"];

// ── 상단 글로벌 스위처 (사이트 TopBar와 동일 구성) ─────────────────────────
const MARK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#a78bfa" stroke-width="1.4" opacity=".45"/><circle cx="12" cy="12" r="5.5" stroke="#a78bfa" stroke-width="1.4" opacity=".8"/><circle cx="12" cy="12" r="1.7" fill="#a78bfa"/></svg>';
// 사이트 TopBar와 동일한 2단 구조: 대분류(주식·부동산) → 세부(시장분석·정책·전문가집단)
const SUB = [
  { href: `/realestate/${ANALYZER}`, label: "시장분석" },
  { href: "/realestate/real_estate_policy_timeline_v1_0.html", label: "정책" },
  { href: "/realestate/real_estate_expert_signals_v1_0.html", label: "전문가집단" },
];
const barFor = (activeHref) =>
  '<div class="yp-top">' +
    `<a class="yp-brand" href="/">${MARK}<span>주부 <b>레이더</b></span></a>` +
    '<nav class="yp-switch">' +
      '<a href="/radar">주식</a>' +
      `<a class="on" href="/realestate/${ANALYZER}">부동산</a>` +
    '</nav>' +
    '<nav class="yp-sub">' +
      SUB.map((s) => `<a class="${s.href === activeHref ? "on" : ""}" href="${s.href}">${s.label}</a>`).join("") +
    '</nav>' +
    '<span class="yp-chip">수도권 주택시장</span>' +
  '</div>';

// ── 시각 요약 배너 (긴 텍스트 페이지 맨 위에 "한 장 요약"을 얹는다) ─────────
// 요약 수치는 build-realestate-summary.mjs 산출물을 재사용 (없으면 배너 생략)
const SUMMARY_PATH = path.join(process.cwd(), "src", "data", "realestate-summary.json");
const SUM = fs.existsSync(SUMMARY_PATH) ? JSON.parse(fs.readFileSync(SUMMARY_PATH, "utf8")) : null;

function policyBanner() {
  const p = SUM?.policy;
  if (!p?.count) return "";
  const maxY = Math.max(...p.years.map((y) => y.total), 1);
  const bars = p.years.map((y) => {
    const h = Math.max(8, (y.total / maxY) * 100);
    const majorH = y.total ? (y.major / y.total) * 100 : 0;
    return `<div class="ypv-col" title="${y.year} ${y.total}건(주요 ${y.major})">
      <i class="ypv-n">${y.total}</i>
      <span class="ypv-bar" style="height:${h}%"><span style="height:${majorH}%"></span></span>
      <i class="ypv-x">${y.year.slice(2)}</i></div>`;
  }).join("");
  const maxB = Math.max(...p.buckets.map((b) => b.count), 1);
  const buckets = p.buckets.slice(0, 5).map((b) =>
    `<li><span>${b.name}</span><i><em style="width:${(b.count / maxB) * 100}%"></em></i><b>${b.count}</b></li>`
  ).join("");
  return `<section class="ypv">
    <div class="ypv-head"><b>한 장 요약</b><span>${p.count}건 · ${p.range?.[0]?.slice(0, 4)}~${p.range?.[1]?.slice(0, 4)} · 진한 부분 = 주요 대책</span></div>
    <div class="ypv-grid">
      <div class="ypv-chart">${bars}</div>
      <ul class="ypv-list">${buckets}</ul>
    </div>
  </section>`;
}

function expertBanner() {
  const e = SUM?.experts;
  if (!e?.count) return "";
  const c = e.consensusNow ?? 0;
  const pos = ((c + 2) / 4) * 100;
  const label = c > 0.5 ? "상승 우위" : c < -0.5 ? "하락 우위" : "혼조";
  const tone = c > 0.5 ? "#f0616e" : c < -0.5 ? "#5a9bff" : "#8b9096";
  const maxN = Math.max(...e.years.map((y) => y.n), 1);
  const cols = e.years.map((y) => {
    const up = y.avg >= 0;
    const h = Math.max(8, (Math.abs(y.avg) / 2) * 100);
    const op = 0.35 + (y.n / maxN) * 0.65;
    return `<div class="ypv-col2" title="${y.year} 평균 ${y.avg} (${y.n}건)">
      <span class="ypv-up">${up ? `<i style="height:${h}%;opacity:${op}"></i>` : ""}</span>
      <span class="ypv-mid"></span>
      <span class="ypv-dn">${!up ? `<i style="height:${h}%;opacity:${op}"></i>` : ""}</span>
      <i class="ypv-x">${y.year.slice(2)}</i></div>`;
  }).join("");
  return `<section class="ypv">
    <div class="ypv-head"><b>한 장 요약</b><span>${e.count}인 최신 발언 · <strong style="color:${tone}">${label}</strong> (강세 ${e.bullish} · 중립 ${e.neutral} · 약세 ${e.bearish})</span></div>
    <div class="ypv-gauge"><span style="left:${pos}%;background:${tone}"></span></div>
    <div class="ypv-gauge-x"><i>하락</i><i>상승</i></div>
    <div class="ypv-chart2">${cols}</div>
  </section>`;
}

// ── 공통(글로벌 바 + 스크롤바 + 요약 배너) ─────────────────────────────────
const COMMON = `
.ypv{margin:14px 28px 0;background:#17181d;border:1px solid #232430;border-radius:12px;padding:14px}
.ypv-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px;flex-wrap:wrap}
.ypv-head b{font-size:13px;color:#e8eaed}
.ypv-head span{font-size:11px;color:#8b9096}
.ypv-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:18px;align-items:end}
.ypv-chart{display:flex;align-items:flex-end;gap:4px;height:76px}
.ypv-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;height:100%;justify-content:flex-end}
.ypv-n{font-style:normal;font-size:9px;color:#8b9096}
.ypv-bar{width:100%;background:rgba(167,139,250,.25);border-radius:3px 3px 0 0;display:flex;flex-direction:column;justify-content:flex-end;min-height:6px}
.ypv-bar>span{width:100%;background:#a78bfa;border-radius:3px 3px 0 0}
.ypv-x{font-style:normal;font-size:9px;color:#6b7076}
.ypv-list{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.ypv-list li{display:grid;grid-template-columns:58px 1fr 20px;align-items:center;gap:7px}
.ypv-list span{font-size:11px;color:#c9ccd1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ypv-list i{height:6px;background:rgba(255,255,255,.06);border-radius:3px;overflow:hidden;display:block}
.ypv-list i em{display:block;height:100%;background:#a78bfa;border-radius:3px}
.ypv-list b{font-size:10px;color:#8b9096;text-align:right}
.ypv-gauge{position:relative;height:8px;border-radius:999px;background:linear-gradient(90deg,rgba(90,155,255,.25),rgba(139,144,150,.25),rgba(240,97,110,.25))}
.ypv-gauge span{position:absolute;top:50%;transform:translate(-50%,-50%);width:4px;height:16px;border-radius:2px}
.ypv-gauge-x{display:flex;justify-content:space-between;margin-top:3px}
.ypv-gauge-x i{font-style:normal;font-size:10px;color:#6b7076}
.ypv-chart2{display:flex;gap:3px;margin-top:12px}
.ypv-col2{flex:1;display:flex;flex-direction:column;align-items:center}
.ypv-up,.ypv-dn{display:flex;width:100%;height:22px}
.ypv-up{align-items:flex-end}
.ypv-dn{align-items:flex-start}
.ypv-up i,.ypv-dn i{display:block;width:100%;background:#f0616e;border-radius:2px 2px 0 0}
.ypv-dn i{background:#5a9bff;border-radius:0 0 2px 2px}
.ypv-mid{width:100%;height:1px;background:rgba(255,255,255,.1)}
@media(max-width:760px){.ypv{margin:12px 14px 0}.ypv-grid{grid-template-columns:1fr;gap:12px}}

.yp-top{position:sticky;top:0;z-index:60;display:flex;align-items:center;gap:16px;height:56px;padding:0 20px;background:rgba(16,16,19,.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid #1e1f26;font-family:'Noto Sans KR','Malgun Gothic',sans-serif}
.yp-top .yp-brand{display:flex;align-items:center;gap:8px;color:#e8eaed;text-decoration:none;font-size:15px;font-weight:400;letter-spacing:-.01em}
.yp-top .yp-brand b{font-weight:800}
.yp-switch{display:flex;gap:2px;background:rgba(255,255,255,.05);padding:4px;border-radius:14px}
.yp-switch a{padding:6px 13px;border-radius:10px;font-size:13px;font-weight:700;color:rgba(255,255,255,.45);text-decoration:none;transition:color .15s,background .15s}
.yp-switch a:hover{color:#fff}
.yp-switch a.on{background:rgba(167,139,250,.16);color:#c4b5fd}
.yp-sub{display:flex;gap:2px}
.yp-sub a{padding:6px 10px;border-radius:8px;font-size:13px;font-weight:600;color:rgba(255,255,255,.45);text-decoration:none;transition:color .15s,background .15s}
.yp-sub a:hover{color:#fff;background:rgba(255,255,255,.05)}
.yp-sub a.on{color:#c4b5fd;background:rgba(255,255,255,.06)}
.yp-chip{margin-left:auto;font-size:11px;color:#8b9096;border:1px solid #26272e;border-radius:999px;padding:5px 11px;white-space:nowrap}
@media(max-width:680px){.yp-top{height:auto;flex-wrap:wrap;gap:8px;padding:10px 14px}.yp-chip{display:none}.yp-switch,.yp-sub{width:100%}.yp-switch a,.yp-sub a{flex:1;text-align:center}}
::-webkit-scrollbar{width:10px;height:10px}::-webkit-scrollbar-thumb{background:#2b2c33;border-radius:5px}::-webkit-scrollbar-track{background:transparent}
`;

// ── 시장분석기(변수 기반) 다크 오버라이드 ─────────────────────────────────
const ANALYZER_CSS = `
:root{--ink:#e8eaed;--muted:#8b9096;--line:#26272e;--paper:#101013;--panel:#17181d;--accent:#a78bfa;--warn:#f5a623;--good:#34d399}
body{background:var(--paper);color:var(--ink)}
.top{background:#131318;border-bottom:1px solid var(--line)}
.brand h1{font-size:15px;color:#e8eaed}
.metro-tabs{border-color:var(--line)}
.metro-tabs button{background:#1a1b21;color:#c9ccd1;border-color:var(--line)}
.metro-tabs button.active{background:var(--accent);color:#101013}
.page-nav a{color:var(--muted)}
.page-nav a.active{color:#c4b5fd;border-color:#a78bfa}
.shell{min-height:0}
.side{background:#131318;border-left:1px solid var(--line);top:56px;height:calc(100vh - 56px)}
.kpi{background:var(--panel);border-color:var(--line)}
.kpi.clickable:hover{background:#1e1f26;border-color:#3a3b44}
.search input{background:var(--panel);border-color:var(--line);color:var(--ink)}
.search input::placeholder{color:#6b7076}
.crumb button{color:var(--ink)}
.view-switch,.metric-switch,.filter-group{background:var(--panel);border-color:var(--line)}
.view-switch button,.metric-switch button,.filter-group button{background:var(--panel);color:#c9ccd1;border-color:var(--line)}
.view-switch button.active,.metric-switch button.active,.filter-group button.active{background:var(--accent);color:#101013}
.filter-group strong{background:#1a1b21;color:#8b9096}
.grade-band-row{background:var(--panel);border-color:var(--line)}
.grade-band-row:hover,.grade-band-row.active{background:#1e1f26;border-color:#3a3b44}
.info-row,.empty{background:var(--panel);border-color:var(--line)}
.tile.zone,.tile.regional-complex{background:#17181d!important;color:var(--ink);border-color:var(--line)}
.tile.regional-complex small{color:#8b9096}
.tile.zone em,.tile.regional-complex em{color:#8b9096}
.tile.match{outline-color:#a78bfa}
/* 지도 — 평면 검정 대신 은은한 비네트, 얇고 차분한 경계 */
.map.spatial{border-color:var(--line);background:
  radial-gradient(120% 90% at 50% 0%,#15161d 0%,#101116 45%,#0b0b0f 100%)}
.geo-map{filter:saturate(.92)}
/* 경계선은 인라인 style로 그려져 CSS가 지려면 !important가 필요하다 */
.zone-shape{transition:filter .18s,opacity .18s,stroke .18s,stroke-width .18s}
.zone-shape:hover{filter:brightness(1.2) saturate(1.06);stroke:#eceef2!important;stroke-width:1.6!important;stroke-opacity:1!important}
.zone-shape.selected{stroke:#f4e3b0!important;stroke-width:2.2!important;stroke-opacity:1!important;filter:brightness(1.12) drop-shadow(0 0 7px rgba(244,227,176,.35))}
.zone-shape.dimmed{opacity:.16}
/* 수계 — 폴리곤 위에 얹어 한강이 지도를 가르게 (OSM/ODbL) */
.yp-water{fill:#0c1b2c;fill-opacity:.88;stroke:rgba(130,180,230,.28);stroke-width:.6;
  vector-effect:non-scaling-stroke;pointer-events:none}
/* 라벨 — 작고 자간 있는 캡션 톤 + 얇은 헤일로 */
.map-label{fill:#eceef2;font-size:11.5px;font-weight:700;letter-spacing:.02em;
  stroke:rgba(8,8,11,.92);stroke-width:2.6px;paint-order:stroke}
.zone-bubble{fill:rgba(20,21,28,.92);stroke:rgba(232,234,237,.5);stroke-width:1}
.bubble-count{fill:#eceef2;font-size:10.5px}
/* 단지 마커 — 채운 점 대신 링, 선택 시만 금색 강조 */
.complex-marker{fill:rgba(20,21,28,.9);stroke:rgba(236,238,242,.75);stroke-width:1.2;
  transition:fill .15s,stroke .15s,filter .15s}
.complex-marker:hover{fill:#eceef2;stroke:#eceef2}
.complex-marker.selected{fill:#f4e3b0;stroke:#f4e3b0;filter:drop-shadow(0 0 6px rgba(244,227,176,.5))}
.map-foot{background:rgba(14,14,18,.82);border-color:rgba(255,255,255,.07);color:#9aa0a6;
  backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border-radius:8px}
/* 범례 스와치 — 각지지 않게 */
.legend .sw{border-radius:3px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.spark svg,.multi-chart{background:#131318;border-color:var(--line)}
.multi-chart .grid{stroke:#26272e}
.status{background:rgba(52,211,153,.12);color:#34d399}
.status.partial{background:rgba(245,166,35,.14);color:#f5a623}
.facts,.fact{border-color:var(--line)}
.fact span{color:var(--muted)}
.chip{background:var(--panel);border-color:var(--line)}
.complex-row{background:transparent;border-color:var(--line)}
.complex-row:hover,.complex-row.active{background:#1e1f26}
.back-complex{background:var(--panel);border-color:var(--line);color:#c9ccd1}
.note{background:#1c1a12;border-left-color:var(--warn);color:#d8b878}
.source{color:#a78bfa}
.progress{background:#26272e}
.why-box{background:#131318;border-color:var(--line)}
.why-row i{background:#26272e}
.why-row i:after{background:#a78bfa}
.reason,.grade-comment{color:#9aa0a6!important}
.monthly-table-wrap{border-color:var(--line)}
.monthly-table{background:var(--panel)}
.monthly-table th{background:#1a1b21;color:#9aa0a6}
.monthly-table th,.monthly-table td{border-color:#232430}
.monthly-table .sale{color:#f0616e}
.monthly-table .rent{color:#5a9bff}
.monthly-table tr.no-trade{color:#6b7076}
.monthly-table td:nth-child(2),.monthly-table td:nth-child(3),.monthly-table td:nth-child(4),.monthly-table td:nth-child(5),.monthly-table td:nth-child(6),.monthly-table td:nth-child(7),.monthly-table td:nth-child(9){color:#e8eaed}
.grade-transition{background:var(--panel);border-color:#3a3b44}
.transition-cell{border-color:var(--line)}
.transition-cell.to-be{background:rgba(167,139,250,.12);border-color:#5b4b8a}
.cutoff-table th,.cutoff-table td{border-color:var(--line)}
.cutoff-table strong,.key-metric{color:#e8eaed}
.region-node{background:var(--panel);border-color:var(--line)}
.region-head{background:transparent}
.region-head:hover,.region-node.open .region-head{background:#1e1f26}
.region-body{background:#131318}
.region-gu{background:var(--panel);border-color:#232430}
.unit-link{background:var(--panel);border-color:var(--line)}
.unit-link:hover{border-color:#a78bfa}
.go-gu{background:var(--accent);color:#101013}
.market-explorer{border-top-color:#3a3b44}
/* v3.1 신규 UI */
.back-btn{background:var(--panel)!important;border:1px solid var(--line);color:#c9ccd1}
.back-btn:hover{border-color:#a78bfa;color:#fff}
.mini-map{background:rgba(19,19,24,.92)!important;border:1px solid var(--line)}
.mini-map-label{background:rgba(19,19,24,.85)!important;color:#c9ccd1}
.mini-map svg path,.mini-map svg polygon{stroke:#2b2c33}
`;

// ── 정책·전문가(하드코딩 녹색 팔레트) 다크 오버라이드 ──────────────────────
const SIBLING_CSS = `
body{background:#101013;color:#e8eaed}
header{background:#131318;color:#e8eaed;border-bottom:1px solid #1e1f26}
header p{color:#8b9096}
h1{font-size:16px}
.page-nav a{color:#8b9096}
.page-nav a.active,.page-nav a:hover{background:rgba(167,139,250,.15);color:#c4b5fd}
.summary{background:#26272e}
.metric{background:#17181d}
.metric span{color:#8b9096}
.band{background:#17181d;border-top-color:#a78bfa}
.note{color:#8b9096}
.toolbar button,.source-tab,.tabs button,.mode button,.yt-controls button{background:#17181d;color:#c9ccd1;border-color:#2b2c33}
.toolbar button.active,.source-tab.active,.tabs button.active,.mode button.active,.yt-controls button.active{background:#a78bfa;color:#101013;border-color:#a78bfa}
.search{background:#17181d;color:#e8eaed;border-color:#2b2c33}
.search::placeholder{color:#6b7076}
.source-grid{background:#26272e}
.source-card{background:#17181d;color:#e8eaed}
.source-card span{color:#8b9096}
.policy{border-top-color:#232430}
.date,.flow-date{color:#f0616e}
.meta{color:#8b9096}
.major{background:#4a3f12;color:#f5d774}
.matrix{background:#26272e}
.cell{background:#17181d}
.cell b{color:#8b9096}
.agenda{background:#17181d}
.agenda th,.agenda td{border-color:#232430}
.agenda th{color:#8b9096}
.agenda td:nth-child(4){color:#34d399}
.target-label{color:#a78bfa}
summary{color:#c4b5fd}
.source{color:#a78bfa}
.empty,.yt-empty{background:#17181d;color:#8b9096}
.flow-wrap:before{background:#2b2c33}
.flow-dot{border-color:#101013;background:#a78bfa;box-shadow:0 0 0 2px #2b2c33}
.flow-copy{background:#17181d;border-color:#232430}
.flow-copy:hover{border-color:#a78bfa}
.flow-copy p,.flow-side{color:#9aa0a6}
.radar-box{background:#17181d;color:#e8eaed;border:1px solid #232430}
.axis{fill:#8b9096}
.detail,.compare-wrap,.election{background:#17181d}
.facts{background:#26272e}
.fact{background:#17181d}
.fact span{color:#8b9096}
.year{background:#1a1b21;border-color:#232430}
.direction--2{background:#2b5c9a;color:#fff}
.direction--1{background:#3a4d6b}
.direction-0{background:#2b2c33}
.direction-1{background:#6b5836}
.direction-2{background:#b3432f;color:#fff}
.remarks th,.remarks td,.compare th,.compare td{border-color:#232430}
.remarks th,.compare th{color:#8b9096}
.badge{background:#232430;color:#c9ccd1}
.bar{background:#26272e}
.bar i{background:#f0616e}
.coverage i{background:#26272e}
.coverage i.on{background:#34d399}
.yt-card{background:#17181d;border-left-color:#a78bfa}
.yt-period,.count{color:#8b9096}
.yt-sources{border-top-color:#232430}
.yt-sources a{color:#a78bfa}
.basis{background:#3a2f14;color:#e0c98a}
.elect-row{border-color:#232430}
.elect-bar{background:#26272e}
.elect-up,.call-up{background:#c0463a}
.elect-down,.call-down{background:#3a6ea5}
.elect-neutral,.call-tie{background:#5b6167}
.elect-names,.elect-score{color:#8b9096}
`;

// ── 지도 팔레트 정제 (분석기 전용) ────────────────────────────────────────
// 원본은 빨강·주황·노랑연두 신호등 배색 — 다크 배경에서 조악하다.
// 금색(상급지) → 남보라(하급지) 단일 계열 perceptual 램프로 교체한다.
const MAP_MARK = "/*yp-map*/";
const RAMP = `${MAP_MARK}
function _ypRamp(t){
  var S=[[45,86,68],[28,76,61],[352,44,53],[294,30,45],[250,24,37]];
  t=Math.max(0,Math.min(1,t));
  var p=t*(S.length-1),i=Math.min(S.length-2,Math.floor(p)),f=p-i,a=S[i],b=S[i+1];
  var d=b[0]-a[0]; if(d>180)d-=360; if(d<-180)d+=360;
  var h=(a[0]+d*f+360)%360,s=a[1]+(b[1]-a[1])*f,l=a[2]+(b[2]-a[2])*f;
  return 'hsl('+h.toFixed(0)+' '+s.toFixed(0)+'% '+l.toFixed(0)+'%)';
}
function gradeColor(grade){
  if(grade==null||!Number.isFinite(Number(grade)))return '#2b2d38';
  return _ypRamp((Math.max(1,Math.min(10,Number(grade)))-1)/9);
}`;

// 수계(한강·지천) 레이어 — 지도에 지리적 맥락을 준다. OSM/ODbL, 약 35KB.
const WATER_PATH = path.join(process.cwd(), "src", "data", "water-capital.json");
function waterLayerJs() {
  if (!fs.existsSync(WATER_PATH)) return "";
  const w = JSON.parse(fs.readFileSync(WATER_PATH, "utf8"));
  const rings = w.features.flatMap((f) => f.geometry.coordinates); // 좌표만 남겨 용량 최소화
  return `var _YP_WATER=${JSON.stringify(rings)};
function _ypWaterLayer(project,features,geometryPath){
  if(!_YP_WATER||!_YP_WATER.length)return '';
  var d=_YP_WATER.map(function(ring){
    return ring.map(function(p,i){var q=project(p);return (i?'L':'M')+q[0].toFixed(1)+','+q[1].toFixed(1)}).join('')+'Z';
  }).join('');
  // 화면 밖으로 뻗은 강줄기가 허공에 떠 보이지 않도록 육지 실루엣으로 클리핑
  var land=features.map(function(f){return '<path d="'+geometryPath(f.geometry,project)+'"/>'}).join('');
  return '<defs><clipPath id="ypLand" clip-rule="evenodd">'+land+'</clipPath></defs>'+
         '<path class="yp-water" clip-path="url(#ypLand)" d="'+d+'" fill-rule="evenodd"></path>';
}`;
}

// 수계 주입은 팔레트와 별개 단계 (각각 독립적으로 멱등)
const WATER_MARK = "/*yp-water*/";
function refineWater(html) {
  if (html.includes(WATER_MARK)) return html;
  const water = waterLayerJs();
  if (!water) return html;
  html = html.replace("function spatialMap()", `${WATER_MARK}${water}\nfunction spatialMap()`);
  // 폴리곤 위, 라벨 아래에 그려 한강이 지도를 가르게 한다
  const svgRe = /(aria-label="서울 공식 생활권 경계 지도">\$\{paths\})(\$\{bubbles\})/;
  if (!svgRe.test(html)) throw new Error("지도 SVG 조립부를 찾지 못함 — 분석기 구조 변경 확인");
  return html.replace(svgRe, "$1${_ypWaterLayer(project,features,geometryPath)}$2");
}

function refineMap(html) {
  if (html.includes(MAP_MARK)) return html; // 멱등
  // 1) gradeColor 교체 (1급지=금색 … 10급지=남보라)
  const gcRe = /function gradeColor\(grade\)\{[\s\S]*?\n\}/;
  if (!gcRe.test(html)) throw new Error("gradeColor를 찾지 못함 — 분석기 구조 변경 확인");
  html = html.replace(gcRe, RAMP);
  // 2) 연속형 지표(heatColor)도 같은 계열로 — 값이 높을수록 밝은 금색
  // 본문에 `${hue}` 템플릿 중괄호가 있어 [^}]* 로는 끊긴다 — 함수 끝 패턴까지 매칭
  const hcRe = /function heatColor\(value,min,max\)\{[\s\S]*?%\)`\}/;
  if (hcRe.test(html)) {
    html = html.replace(hcRe,
      "function heatColor(value,min,max){if(value==null||!Number.isFinite(Number(value)))return '#2b2d38';" +
      "var t=max===min?0.5:(Number(value)-min)/(max-min);return _ypRamp(1-Math.max(0,Math.min(1,t)))}");
  }
  // 3) 범례 문구를 새 배색에 맞춤
  html = html.replace(
    "1~3급지 빨강 · 4~6급지 주황 · 7~10급지 노랑연두",
    "1급지 금색 → 10급지 남보라 · 밝을수록 상급지"
  );
  html = html.replace(
    "예비급지(시장가격+상품성) 기준 · 같은 색 안에서는 진할수록 상급지",
    "예비급지(시장가격+상품성) 기준 · 색이 곧 급지"
  );
  // 4) 경계선 — 권역별 색 테두리는 채움색과 충돌해 어수선하다.
  //    중립 헤어라인으로 바꿔 색은 오직 '급지'만 말하게 한다(인라인 style이라 CSS로는 못 이김).
  html = html.replace(
    'style="stroke:${COLORS[p.planning_region]};stroke-width:2.2"',
    'style="stroke:rgba(8,8,11,.55);stroke-width:.6"'
  );
  html = html.replace('style="stroke:#1c2b33;stroke-width:1.2"', 'style="stroke:rgba(8,8,11,.5);stroke-width:.7"');
  return html;
}

function apply(file, css, banner = "") {
  const p = path.join(DIR, file);
  let s = fs.readFileSync(p, "utf8");
  // 기존 주입분 제거(멱등)
  s = s.replace(/<style id="yp-theme">[\s\S]*?<\/style>/g, "");
  s = s.replace(/<div class="yp-top">[\s\S]*?<\/div>/g, "");
  s = s.replace(/<section class="ypv">[\s\S]*?<\/section>/g, "");
  // 글로벌 바 + 시각 요약 배너 주입(<body> 직후) — 현재 파일을 세부 탭에서 활성 표시
  s = s.replace(/(<body[^>]*>)/i, `$1${barFor(`/realestate/${file}`)}${banner}`);
  // 오버라이드 스타일은 문서 맨끝(</body> 직전)에 주입 →
  // 원본 <style>이 head 밖(본문)에 있어도 항상 뒤에 와서 우선순위 승
  const block = `<style id="yp-theme">${COMMON}${css}</style>`;
  if (s.includes("</body>")) s = s.replace("</body>", block + "</body>");
  else s = s + block;
  writeAtomic(p, s);
  return (fs.statSync(p).size / 1024 / 1024).toFixed(2);
}

// 지도 팔레트는 분석기에만 적용 (테마 주입 전에 먼저 수행)
{
  const p = path.join(DIR, ANALYZER);
  const before = fs.readFileSync(p, "utf8");
  const paletted = refineMap(before);
  if (paletted !== before) console.log("지도 팔레트 정제 적용 (금색→남보라 램프)");
  const after = refineWater(paletted);
  if (after !== paletted) console.log("수계 레이어 주입 (한강·지천, OSM)");
  if (after !== before) writeAtomic(p, after);
  else console.log("지도 정제 이미 적용됨");
}
const mb1 = apply(ANALYZER, ANALYZER_CSS);
console.log(`시장분석기 테마 적용 · ${mb1} MB`);
const BANNERS = {
  "real_estate_policy_timeline_v1_0.html": policyBanner(),
  "real_estate_expert_signals_v1_0.html": expertBanner(),
};
for (const f of SIBLINGS) {
  const banner = BANNERS[f] ?? "";
  console.log(`${f} 테마 적용 · ${apply(f, SIBLING_CSS, banner)} MB${banner ? " (+요약 배너)" : ""}`);
}
console.log("완료: 3파일 다크 통일 + 글로벌 스위처" + (SUM ? " + 시각 요약" : " (요약 데이터 없음)"));
