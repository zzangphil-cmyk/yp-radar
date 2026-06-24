@echo off
rem Preview 호스트 환경에 Node PATH가 없을 때를 대비한 래퍼
set "PATH=C:\Program Files\nodejs;%PATH%"
call "C:\Program Files\nodejs\npm.cmd" run dev -- -p 3100
