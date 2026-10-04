# Deployment

This repository contains two independently deployed applications:

- `frontend/`: the public Next.js interface
- `backend/`: the FastAPI media-analysis service

## Recommended production layout

Deploy the Next.js frontend to Vercel and deploy FastAPI to a container host that
supports ffmpeg and request bodies larger than 4.5 MB. The backend currently accepts
media up to 25 MB, extracts video frames with ffmpeg, and returns a processed image
plus multiple JPEG crops.

### Vercel frontend project

Use these project settings:

- Root Directory: `frontend`
- Framework Preset: Next.js
- Install Command: leave automatic, or `npm ci`
- Build Command: leave automatic, or `npm run build`
- Output Directory: leave blank

Set this production environment variable before redeploying:

```text
NEXT_PUBLIC_API_URL=https://your-api-domain.example
```

On the backend host, allow the deployed frontend origin:

```text
AI_WARDROBE_CORS_ORIGINS=https://your-frontend.vercel.app
```

## Optional Vercel API deployment for small image requests

The root `pyproject.toml` points Vercel to `backend.main:app`, and the root
`requirements.txt` exposes the backend dependencies. For an API-only Vercel project:

- Root Directory: leave blank so the repository root is used
- Framework Preset: FastAPI, or leave automatic detection enabled
- Build Command: leave blank
- Output Directory: leave blank
- Set `OPENAI_API_KEY` only when live vision analysis is required
- Set `AI_WARDROBE_CORS_ORIGINS` to the frontend URL

This option is not equivalent to the complete local pipeline. Vercel Functions limit
request and response payloads to 4.5 MB, and the deployment does not guarantee an
ffmpeg executable. Use it only for small image requests or after redesigning uploads
around direct object storage and an asynchronous media worker.

## Why the original deployment failed

The project used `backend/` as the Vercel Root Directory. Vercel therefore loaded
`backend/main.py` as `/var/task/main.py`. The statement
`from backend.schemas import OutfitAnalysisResponse` then failed because there was no
`backend` package above the function root.

The repository also recorded `frontend/` as a Git gitlink rather than normal files.
The parent repository could not provide the Next.js source to Vercel until that nested
repository was flattened into the parent repository.
