@echo off
REM YP 레이더 저녁 일괄(주식 일봉·통념지표·ETF·국민연금) — 평일 17:30
cd /d "C:\Users\zzang\Desktop\Yoon_temp\stock"
node scripts\daily-update.mjs evening >> daily-update.log 2>&1
