# 🛰️ 국민연금 레이더 (NPS Radar)

국민연금이 보유한 **국내주식 1,200여 종목**과 연도별 **매집·축소·신규편입·전량매도**를
추적·분석하는 플랫폼. 자산 1,000조 국민연금의 포트폴리오 변화를 한눈에 봅니다.

> 데이터 출처: **국민연금기금운용본부 국내주식 종목별 투자현황(연간공시)**.
> 연 1회·연말 기준 공식 스냅샷(2020~2024)을 가공해 제공합니다.

## 기능

| 메뉴 | 경로 | 내용 |
|---|---|---|
| 대시보드 | `/` | 핵심 KPI, 최근 동향, 5년 평가액 추이, 올해 하이라이트, 상위 보유 |
| 최근 동향 | `/recent` | **DART 실시간** 5%+ 지분 변동(최신 필링까지). 연간보다 훨씬 신선 |
| 보유 종목 | `/holdings` | 전체 종목 검색·정렬·필터, 행 클릭 → 종목 상세 |
| 변화 분석 | `/changes` | 지분율(실제 매매)·평가액(시장 효과) 이중지표, 매집/축소/신규/매도 |
| 인사이트 | `/insights` | 테마 거품·역발상 매집·5년 연속 매집/축소·집중도 |
| 종목 상세 | `/stock/[종목]` | 5년 지분율·평가액 추이 + 자동 해석 |

**핵심 관점** — 포트폴리오 변화는 단순 산술이 아닙니다.
`지분율 변화`(국민연금의 실제 매매 결정)와 `평가액 변화`(국내외 증시·정치·신기술
테마에 따른 주가 효과)를 분리해 보여줍니다.

## 빠른 시작

```bash
npm install
npm run dev      # http://localhost:3100 (개발)
# 또는
npm run build && npm run start   # 프로덕션
```

사이트 **런타임은 정적 데이터만** 쓰므로 API 키가 필요 없습니다. 단, 아래 "최근 동향"
데이터를 갱신할 때만 빌드 시점에 DART 키(`.env.local`)를 사용합니다.

## 데이터 파이프라인

**연간 전체 포트폴리오 (구조 레이어)**
```
data/nps_files/*.xlsx           # 국민연금 연간공시 원본(2020~2024)
  └ scripts/build-nps-panel.mjs → data/nps-panel.json   # 종목×연도 패널 정규화
      └ scripts/build-site-data.mjs → src/data/{nps-panel,nps-changes,nps-insights}.json
```
새 연도 공시 XLSX를 `data/nps_files/`에 추가 후 위 두 스크립트 재실행 (다음 공시 ~2026-09).

**최근 동향 (DART 실시간 5%+ 레이어)**
```
.env.local의 DART_API_KEY + data.go.kr 5%+ 보고내역 + DART majorstock/list.json
  └ scripts/build-recent-data.mjs → src/data/nps-recent.json
```
갱신: `node scripts/build-recent-data.mjs` 재실행 (DART에서 최신 필링까지 재수집).
DART 무료 키 발급: https://opendart.fss.or.kr/

## 기술 스택

- **Next.js 15** (App Router) + **React 19** + **TypeScript** + **Tailwind CSS 3**
- 차트는 의존성 없는 순수 SVG 컴포넌트 (`BarChart` / `TrendChart` / `Sparkline`)
- 종목 상세는 정적 생성(상위 400) + 동적 라우팅

## 구조

```
src/
  app/            # 대시보드(/), holdings, changes, insights, stock/[slug]
  components/      # TopBar, Brand, Kpi, 차트, 테이블 등
  lib/npsData.ts   # 데이터 로더·타입·포맷
  data/*.json      # 사이트가 사용하는 정제 데이터
```

## 면책

본 사이트는 투자 자문·매매 권유가 아니며, 정보의 정확성·완전성을 보장하지 않습니다.
공식 데이터는 연 1회·약 9개월 지연 공개되는 스냅샷으로, 최신 실시간 보유와 다를 수 있습니다.
