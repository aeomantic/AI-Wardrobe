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

Optionally, set a read-only Hugging Face access token as a server-only variable
(no `NEXT_PUBLIC_` prefix). The men's catalog search proxies the public
`ashraq/fashion-product-images-small` dataset through `/api/catalog` and works
without a token. The token only raises Hugging Face rate limits:

```text
HF_TOKEN=hf_your_read_only_token
```

Garment tagging (`POST /api/wardrobe/tag`) and outfit picking
(`POST /api/outfits/recommend`) run inside the Next.js app and work with no key at
all, using a deterministic local tagger and outfit matcher. To use a live model, set
one provider's key as a server-only variable. The first configured provider wins,
in this order:

```text
GROQ_API_KEY=...          # optional: GROQ_VISION_MODEL, GROQ_BASE_URL
OPENAI_API_KEY=...        # optional: OPENAI_VISION_MODEL (default gpt-6-luna), OPENAI_BASE_URL
GEMINI_API_KEY=...        # or GOOGLE_GENERATIVE_AI_API_KEY; optional: GEMINI_MODEL (default gemini-3.8-flash)
```

The tagging model must accept image input. Garment photos are compressed in the
browser to under ~150 KB and stored in the user's IndexedDB. They are sent once to
the tagging route and never to the outfit route, which receives only item metadata.

The upload review card shows which engine tagged each photo. "AI Vision Tagged"
means a live model analyzed it. "Local fallback" means it did not, with the reason:
no vision key, a vision API error, or an unreadable AI reply. Each fallback is also
logged on the server as `[wardrobe/tag] local-fallback (<reason>)`, with the provider's
error message and any key-like text redacted. After adding a key, restart `npm run dev`
locally, or redeploy on Vercel, before re-analyzing.

Catalog images are signed Hugging Face URLs that expire after about an hour. They
are rendered with plain `<img>` tags and never pass through `/_next/image`, so they
do not use the Vercel image optimization quota. Do not add the Hugging Face hosts
to `images.remotePatterns`.

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
- Set `GROQ_API_KEY` only when live vision analysis is required
- Optionally set `GROQ_VISION_MODEL=qwen/qwen3.8-27b`
- Set `AI_WARDROBE_CORS_ORIGINS` to the frontend URL

Groq currently labels `qwen/qwen3.8-27b` as Preview. Keep the model environment
variable explicit and monitor Groq deprecations before treating the Vercel deployment
as production-stable.

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
