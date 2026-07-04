@echo off
REM YP 레이더 아침 갱신(베이스라인) — 평일 08:40
cd /d "C:\Users\zzang\Desktop\Yoon_temp\stock"
node scripts\daily-update.mjs morning >> daily-update.log 2>&1
