import type { Etf } from "@/lib/etfData";

// ETF 자금(거래대금) × 3개월 수익률 4분면 산점도 (순수 SVG)
export default function EtfScatter({ rows }: { rows: Etf[] }) {
  const pts = rows.filter((e) => e.amount != null && e.amount > 0 && e.ret3m != null);
  if (pts.length === 0) return null;

  const W = 640, H = 420, padL = 44, padR = 16, padT = 16, padB = 40;
  const xs = pts.map((e) => Math.log10(e.amount as number));
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ys = pts.map((e) => e.ret3m as number);
  const ymin = Math.min(...ys, 0), ymax = Math.max(...ys, 0);
  const ylo = ymin - (ymax - ymin) * 0.1, yhi = ymax + (ymax - ymin) * 0.12;

  const px = (a: number) => padL + ((Math.log10(a) - xmin) / (xmax - xmin || 1)) * (W - padL - padR);
  const py = (r: number) => padT + (1 - (r - ylo) / (yhi - ylo || 1)) * (H - padT - padB);

  // 중앙값 거래대금 기준선
  const sortedX = [...xs].sort((a, b) => a - b);
  const medX = sortedX[Math.floor(sortedX.length / 2)];
  const medXpix = padL + ((medX - xmin) / (xmax - xmin || 1)) * (W - padL - padR);
  const zeroY = py(0);

  const color = (r: number) => (r > 0 ? "#f0616d" : r < 0 ? "#4c8dff" : "#7a8aa0");
  const rad = (m: number | null) => Math.max(3, Math.min(9, Math.sqrt((m ?? 100) / 1000) + 3));

  return (
    <div className="card p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* 분면 라벨 */}
        <text x={(medXpix + W - padR) / 2} y={padT + 12} fontSize="10" fill="rgba(240,97,109,0.5)" textAnchor="middle">자금多·수익↑</text>
        <text x={(padL + medXpix) / 2} y={padT + 12} fontSize="10" fill="rgba(255,255,255,0.3)" textAnchor="middle">자금少·수익↑</text>
        <text x={(medXpix + W - padR) / 2} y={H - padB - 4} fontSize="10" fill="rgba(76,141,255,0.5)" textAnchor="middle">자금多·수익↓</text>
        {/* 기준선 */}
        <line x1={medXpix} y1={padT} x2={medXpix} y2={H - padB} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="rgba(255,255,255,0.22)" strokeDasharray="3 3" />
        <text x={padL - 4} y={zeroY + 3} fontSize="9" fill="rgba(255,255,255,0.4)" textAnchor="end">0%</text>
        {/* 점 */}
        {pts.map((e) => {
          const x = px(e.amount as number), y = py(e.ret3m as number);
          return (
            <g key={e.code}>
              <circle cx={x} cy={y} r={rad(e.marketSum)} fill={color(e.ret3m as number)} opacity="0.7">
                <title>{`${e.name}\n3개월 ${(e.ret3m as number).toFixed(1)}% · 순자산 ${e.marketSum?.toLocaleString()}억`}</title>
              </circle>
            </g>
          );
        })}
        {/* 축 */}
        <text x={W / 2} y={H - 6} fontSize="11" fill="rgba(255,255,255,0.5)" textAnchor="middle">거래대금(자금) → · 점 크기 = 순자산</text>
        <text x={12} y={H / 2} fontSize="11" fill="rgba(255,255,255,0.5)" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>3개월 수익률 (%)</text>
      </svg>
    </div>
  );
}
