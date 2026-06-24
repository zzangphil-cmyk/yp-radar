import Link from "next/link";

export interface HeatTile {
  key: string;
  label: string;
  sub?: string;
  value: number; // 타일 크기
  color: string; // 타일 색 (hex)
  href?: string;
}

// 이진 분할 트리맵 (값 비례 면적). 정렬: value desc 가정
function slice(
  items: (HeatTile & { i: number })[],
  x: number, y: number, w: number, h: number,
  horizontal: boolean,
  out: { t: HeatTile; x: number; y: number; w: number; h: number }[],
) {
  if (items.length === 0) return;
  if (items.length === 1) {
    out.push({ t: items[0], x, y, w, h });
    return;
  }
  const total = items.reduce((s, it) => s + it.value, 0);
  let acc = 0, idx = 0;
  for (; idx < items.length - 1; idx++) {
    if (acc + items[idx].value > total / 2) break;
    acc += items[idx].value;
  }
  const a = items.slice(0, idx + 1);
  const b = items.slice(idx + 1);
  const aVal = a.reduce((s, it) => s + it.value, 0);
  const frac = total > 0 ? aVal / total : 0.5;
  if (horizontal) {
    const wA = w * frac;
    slice(a, x, y, wA, h, !horizontal, out);
    slice(b, x + wA, y, w - wA, h, !horizontal, out);
  } else {
    const hA = h * frac;
    slice(a, x, y, w, hA, !horizontal, out);
    slice(b, x, y + hA, w, h - hA, !horizontal, out);
  }
}

const W = 680, H = 360;

export default function Heatmap({ tiles, height = 360 }: { tiles: HeatTile[]; height?: number }) {
  const sorted = [...tiles].filter((t) => t.value > 0).sort((a, b) => b.value - a.value).map((t, i) => ({ ...t, i }));
  const out: { t: HeatTile; x: number; y: number; w: number; h: number }[] = [];
  slice(sorted, 0, 0, W, H, true, out);

  return (
    <div className="relative w-full overflow-hidden rounded-xl" style={{ height }}>
      {out.map(({ t, x, y, w, h }) => {
        const wp = (w / W) * 100, hp = (h / H) * 100;
        const big = w > 70 && h > 34;
        const mid = w > 44 && h > 22;
        const inner = (
          <div
            className="absolute overflow-hidden"
            style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${wp}%`, height: `${hp}%`, padding: 1 }}
          >
            <div className="flex h-full w-full flex-col justify-center rounded-[3px] px-1.5 py-0.5" style={{ background: t.color }}>
              {mid && (
                <div className="truncate text-[11px] font-semibold leading-tight" style={{ color: "rgba(255,255,255,0.95)" }}>
                  {t.label}
                </div>
              )}
              {big && t.sub && (
                <div className="truncate text-[10px] leading-tight" style={{ color: "rgba(255,255,255,0.75)" }}>
                  {t.sub}
                </div>
              )}
            </div>
          </div>
        );
        return t.href ? (
          <Link key={t.key} href={t.href} title={`${t.label}${t.sub ? " · " + t.sub : ""}`}>{inner}</Link>
        ) : (
          <div key={t.key} title={`${t.label}${t.sub ? " · " + t.sub : ""}`}>{inner}</div>
        );
      })}
    </div>
  );
}
