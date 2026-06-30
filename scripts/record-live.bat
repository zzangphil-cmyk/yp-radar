@echo off
REM YP 레이더 실시간 풀세션 기록 — 작업 스케줄러용 (평일 08:55 시작, 15:40 자동 종료+커밋)
cd /d "C:\Users\zzang\Desktop\Yoon_temp\stock"
set AUTOCOMMIT=1
node scripts\record-live.mjs >> live-record.log 2>&1
