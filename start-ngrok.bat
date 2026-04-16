@echo off
echo ============================================================
echo  NoorGrid — ngrok tunnel
echo  Exposes the React frontend (port 3000) publicly.
echo  The Vite proxy forwards all API calls to the FastAPI
echo  backend on port 8000 — no second tunnel needed.
echo.
echo  BEFORE running this:
echo    1. start-backend.bat  (FastAPI on port 8000)
echo    2. start-frontend.bat (React on port 3000)
echo.
echo  Then share the https://xxxx.ngrok-free.app URL that
echo  appears below.
echo ============================================================
echo.
ngrok http 3000
