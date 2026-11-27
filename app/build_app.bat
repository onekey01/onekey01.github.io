@echo off
chcp 65001 >nul
rem 무무 라이딩 안드로이드 앱(APK) 만들기 — 두 번 눌러 실행
rem 결과: app\mumuride-debug.apk  (태블릿이 USB로 연결돼 있으면 바로 설치까지)
cd /d "%~dp0"
set "JAVA_HOME=C:\Program Files\Java\jdk-19"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"
rem 재발 방지(2026-11-27): 이 PC의 자바가 "Unable to establish loopback connection"으로 멈춰서 임시 소켓 폴더를 짧은 경로로 지정
if not exist C:\gtmp mkdir C:\gtmp
set "GRADLE_OPTS=-Djdk.net.unixdomain.tmpdir=C:\gtmp -Djava.net.preferIPv4Stack=true"
set "JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\gtmp"
echo [1/4] 최신 코드 받기
rem 재발 방지(2026-11-27): npm install 이 바꿔 둔 package-lock.json 때문에 최신 코드 받기가 멈췄음 → 받기 전에 되돌림
git -C .. checkout -- app/package-lock.json
git -C .. pull --ff-only
echo [2/4] 앱 부품 설치
call npm install --no-audit --no-fund || goto :err
echo [3/4] 웹앱 파일을 앱으로 복사
call npm run sync || goto :err
if not exist android\app\google-services.json (echo google-services.json 이 없어요 - 구글 로그인이 안 되는 APK가 만들어져요. Firebase 콘솔 mumuride 프로젝트 안드로이드 앱 kr.mumuride.app 에서 받아 android\app 에 넣어 주세요 & goto :err)
echo [4/4] APK 만들기 (처음엔 10분 넘게 걸릴 수 있어요)
cd android
if not exist local.properties powershell -NoProfile -Command "\"sdk.dir=$($env:ANDROID_HOME -replace '\\','\\')\" | Set-Content local.properties -Encoding ASCII"
call gradlew.bat assembleDebug --no-daemon -q || goto :err
cd ..
copy /y android\app\build\outputs\apk\debug\app-debug.apk mumuride-debug.apk >nul
echo 완료: %cd%\mumuride-debug.apk
adb devices | find "device" | find /v "List" >nul && (echo 태블릿에 설치 중... & adb install -r mumuride-debug.apk)
pause
exit /b 0
:err
echo 실패했어요. 이 창의 내용을 Claude에게 알려 주세요.
pause
exit /b 1
