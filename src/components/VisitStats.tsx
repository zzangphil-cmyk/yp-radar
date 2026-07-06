"use client";

// 푸터 방문자 통계 — 브라우저당 하루 1회만 카운트(localStorage 스탬프), env 미설정이면 표시 생략
import { useEffect, useState } from "react";

export default function VisitStats() {
  const [stats, setStats] = useState<{ today: number; total: number } | null>(null);

  useEffect(() => {
    const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const KEY = "yp-visit-day";
    let counted = false;
    try { counted = localStorage.getItem(KEY) === day; } catch { /* 시크릿 모드 등 */ }

    fetch("/api/visit", { method: counted ? "GET" : "POST" })
      .then((r) => r.json())
      .then((d) => {
        if (!d?.ok) return;
        if (!counted) { try { localStorage.setItem(KEY, day); } catch { /* noop */ } }
        setStats({ today: d.today, total: d.total });
      })
      .catch(() => {});
  }, []);

  if (!stats) return null;
  return (
    <span className="tabular-nums text-white/35">
      오늘 방문 {stats.today.toLocaleString("ko-KR")} · 누적 {stats.total.toLocaleString("ko-KR")}
    </span>
  );
}
