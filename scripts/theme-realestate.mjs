// 부동산 분석기(정적 3페이지)를 Y&P 레이더 다크 UI로 통일.
// - 원본 HTML에 <style id="yp-theme"> 다크 오버라이드 + 상단 글로벌 스위처(.yp-top) 주입
// - 멱등: 재실행/새 버전 재번들 후 다시 돌려도 기존 주입분을 교체
// 사용: node scripts/theme-realestate.mjs
import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "realestate");
const ANALYZER = "capital_area_market_analyzer_v3_0.html";
const SIBLINGS = ["real_estate_policy_timeline_v1_0.html", "real_estate_expert_signals_v1_0.html"];

// ── 상단 글로벌 스위처 (사이트 TopBar와 동일 구성) ─────────────────────────
const MARK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="#a78bfa" stroke-width="1.4" opacity=".45"/><circle cx="12" cy="12" r="5.5" stroke="#a78bfa" stroke-width="1.4" opacity=".8"/><circle cx="12" cy="12" r="1.7" fill="#a78bfa"/></svg>';
const YP_BAR =
  '<div class="yp-top">' +
    `<a class="yp-brand" href="/">${MARK}<span>Y&amp;P <b>레이더</b></span></a>` +
    '<nav class="yp-switch">' +
      '<a href="/radar">주식</a>' +
      '<a href="/etf">ETF</a>' +
      '<a href="/nps">국민연금</a>' +
      `<a class="on" href="/realestate/${ANALYZER}">부동산</a>` +
    '</nav>' +
    '<span class="yp-chip">부동산 레이더 · 수도권</span>' +
  '</div>';

// ── 공통(글로벌 바 + 스크롤바) ─────────────────────────────────────────────
const COMMON = `
.yp-top{position:sticky;top:0;z-index:60;display:flex;align-items:center;gap:16px;height:56px;padding:0 20px;background:rgba(16,16,19,.88);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-bottom:1px solid #1e1f26;font-family:'Noto Sans KR','Malgun Gothic',sans-serif}
.yp-top .yp-brand{display:flex;align-items:center;gap:8px;color:#e8eaed;text-decoration:none;font-size:15px;font-weight:400;letter-spacing:-.01em}
.yp-top .yp-brand b{font-weight:800}
.yp-switch{display:flex;gap:2px;background:rgba(255,255,255,.05);padding:4px;border-radius:14px}
.yp-switch a{padding:6px 13px;border-radius:10px;font-size:13px;font-weight:700;color:rgba(255,255,255,.45);text-decoration:none;transition:color .15s,background .15s}
.yp-switch a:hover{color:#fff}
.yp-switch a.on{background:rgba(167,139,250,.16);color:#c4b5fd}
.yp-chip{margin-left:auto;font-size:11px;color:#8b9096;border:1px solid #26272e;border-radius:999px;padding:5px 11px;white-space:nowrap}
@media(max-width:680px){.yp-top{height:auto;flex-wrap:wrap;gap:10px;padding:10px 14px}.yp-chip{display:none}.yp-switch{width:100%}.yp-switch a{flex:1;text-align:center}}
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
.map.spatial{background:#0d0d10;border-color:var(--line)}
.zone-shape{stroke:#101013}
.zone-shape:hover,.zone-shape.selected{stroke:#a78bfa}
.map-label{fill:#e8eaed;stroke:#0d0d10}
.zone-bubble{fill:#17181d;stroke:#a78bfa}
.bubble-count{fill:#e8eaed}
.complex-marker{fill:#17181d;stroke:#a78bfa}
.complex-marker:hover,.complex-marker.selected{fill:#a78bfa;stroke:#101013}
.map-foot{background:rgba(19,19,24,.9);border-color:var(--line);color:#8b9096}
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

function apply(file, css) {
  const p = path.join(DIR, file);
  let s = fs.readFileSync(p, "utf8");
  // 기존 주입분 제거(멱등)
  s = s.replace(/<style id="yp-theme">[\s\S]*?<\/style>/g, "");
  s = s.replace(/<div class="yp-top">[\s\S]*?<\/div>/g, "");
  // 글로벌 바 주입(<body> 직후)
  s = s.replace(/(<body[^>]*>)/i, `$1${YP_BAR}`);
  // 오버라이드 스타일은 문서 맨끝(</body> 직전)에 주입 →
  // 원본 <style>이 head 밖(본문)에 있어도 항상 뒤에 와서 우선순위 승
  const block = `<style id="yp-theme">${COMMON}${css}</style>`;
  if (s.includes("</body>")) s = s.replace("</body>", block + "</body>");
  else s = s + block;
  fs.writeFileSync(p, s);
  return (fs.statSync(p).size / 1024 / 1024).toFixed(2);
}

const mb1 = apply(ANALYZER, ANALYZER_CSS);
console.log(`시장분석기 테마 적용 · ${mb1} MB`);
for (const f of SIBLINGS) console.log(`${f} 테마 적용 · ${apply(f, SIBLING_CSS)} MB`);
console.log("완료: 3파일 다크 통일 + 글로벌 스위처");
