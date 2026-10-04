# Threadline, AI Outfit Builder MVP

Threadline decomposes one outfit image, or a representative frame from a short
video, into garment regions and attributes. It then creates three complementary
styling recipes. The MVP contains no catalog, shopping, scraping, affiliate, or
e-commerce features.

## Project layout

- `backend/`: FastAPI, Pillow media processing, ffmpeg frame selection, provider-based
  garment detection, server-side crops, and rule-based outfit recipes.
- `frontend/`: Next.js 16 App Router, TypeScript, Tailwind CSS, Lucide icons, interactive
  normalized overlays, garment inspector cards, and Style Studio.
- `frontend/public/demo-outfit.png`: Original local demo asset generated for this project.

All garment boxes use `[ymin, xmin, ymax, xmax]` normalized to a `0..1000` grid.
The API returns browser-ready `data:image/jpeg;base64,...` strings for the processed
frame and every crop.

## 1. Install ffmpeg for video uploads

On Windows PowerShell:

```powershell
winget install --id Gyan.FFmpeg --exact
```

Open a new terminal after installation, then verify:

```powershell
ffmpeg -version
```

Images work without ffmpeg. Video requests return a clear `422` response when ffmpeg
is unavailable. You can also set `FFMPEG_BINARY` to an absolute ffmpeg executable path.

## 2. Start the FastAPI backend on port 8000

From the repository root:

```powershell
cd F:\AIWardrobe
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/health` to confirm the service is ready. Without an
`OPENAI_API_KEY`, the backend automatically uses its deterministic image-aware mock.

To enable the live OpenAI vision provider for the current PowerShell session:

```powershell
$env:OPENAI_API_KEY="your-key"
$env:OPENAI_VISION_MODEL="gpt-4o-mini"
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Do not commit real keys. Set `AI_WARDROBE_STRICT_PROVIDER=true` only when provider
failures should return `503` instead of falling back to the mock.

## 3. Start the Next.js frontend on port 3000

In a second PowerShell terminal:

```powershell
cd F:\AIWardrobe\frontend
Copy-Item .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`. Drag a `.jpg`, `.png`, `.webp`, `.mp4`, or `.mov`
file into the input card. Analysis begins immediately. Click a box on the image to
select the matching garment card, then use `Find styling alternatives` to focus the
Style Studio recipes around that piece.

## 4. Test an image and video directly against the API

Replace the sample paths with real files:

```powershell
curl.exe -X POST "http://127.0.0.1:8000/api/analyze-outfit" -F "file=@C:\media\outfit.jpg" -o image-analysis.json
curl.exe -X POST "http://127.0.0.1:8000/api/analyze-outfit" -F "file=@C:\media\outfit.mp4" -o video-analysis.json
```

Confirm the contract without printing the large base64 fields:

```powershell
$result = Get-Content -Raw image-analysis.json | ConvertFrom-Json
$result | Select-Object session_id, overall_vibe
$result.detected_garments | Select-Object id, category, label, confidence, box_2d
$result.build_suggestions | Select-Object title, keep, add, swap
```

Repeat those inspection commands with `video-analysis.json` for the clip result.

## Verification commands

```powershell
cd F:\AIWardrobe
.\.venv\Scripts\python.exe -m unittest backend.tests.test_backend -v

cd F:\AIWardrobe\frontend
npm run lint
npm run build
```

The backend API docs are also available at `http://127.0.0.1:8000/docs` while the
server is running.
