// 종목/ETF 심볼 박스 (웹불식 — 머리글자 + 해시 색)
const PALETTE: [string, string][] = [
  ["#3a2f1a", "#f5a623"],
  ["#1a2f3a", "#4cc2ff"],
  ["#2f1a2f", "#e06ad8"],
  ["#1a3a2a", "#3ddc97"],
  ["#2a1a3a", "#b07aff"],
  ["#3a1a1a", "#ff7b7b"],
  ["#1f2f1a", "#a3d977"],
  ["#23284a", "#8fa0ff"],
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function initials(name: string): string {
  const n = name.replace(/\(주\)|주식회사|㈜/g, "").trim();
  const m = n.match(/^[A-Za-z0-9]{1,3}/);
  if (m) return m[0].slice(0, 2).toUpperCase();
  return n.slice(0, 1);
}

export default function SymbolBox({ name, size = 20 }: { name: string; size?: number }) {
  const [bg, fg] = PALETTE[hash(name) % PALETTE.length];
  return (
    <span
      aria-hidden
      style={{
        background: bg,
        color: fg,
        width: size,
        height: size,
        lineHeight: `${size}px`,
        fontSize: size <= 18 ? 10 : 11,
      }}
      className="mr-2 inline-block shrink-0 rounded-md text-center font-semibold align-middle"
    >
      {initials(name)}
    </span>
  );
}
