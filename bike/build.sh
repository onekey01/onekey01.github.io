#!/bin/sh
# 앱 묶기. 실패하면 바로 멈추고 알림 (2026-11-26: 빌드가 깨진 채 시험이 옛 app.js로 돌아간 일 재발 방지)
cd "$(dirname "$0")" && NODE_PATH=/home/claude/t/node_modules /home/claude/t/node_modules/.bin/esbuild src/main.js --bundle --minify --format=iife --target=es2020 --outfile=app.js --log-level=warning || { echo '빌드 실패 — 시험·올리기 중단'; exit 1; }
node ../app/make-manifest.mjs || { echo '업데이트 목록 실패'; exit 1; }
echo '빌드 성공'
