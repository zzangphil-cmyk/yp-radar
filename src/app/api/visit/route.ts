import { NextResponse } from "next/server";

// 방문자 카운터 — Upstash Redis REST (Vercel Marketplace 연동 env 사용)
// 저장 키: v:d:<KST날짜> = 그날 방문(브라우저·1일 1회), v:total = 누적
// env 미설정 시 ok:false 반환 → 푸터에서 표시 생략 (사이트 동작에는 영향 없음)

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

function dayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function redis(cmds: string[][]): Promise<{ result: unknown }[] | null> {
  if (!url || !token) return null;
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? parseInt(v, 10) || 0 : 0);

export async function GET() {
  const day = dayKST();
  const r = await redis([["GET", `v:d:${day}`], ["GET", "v:total"]]);
  if (!r) return NextResponse.json({ ok: false });
  return NextResponse.json({ ok: true, day, today: num(r[0]?.result), total: num(r[1]?.result) });
}

export async function POST() {
  const day = dayKST();
  const r = await redis([["INCR", `v:d:${day}`], ["INCR", "v:total"]]);
  if (!r) return NextResponse.json({ ok: false });
  return NextResponse.json({ ok: true, day, today: num(r[0]?.result), total: num(r[1]?.result) });
}
