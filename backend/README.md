# AI Wardrobe backend

FastAPI service for media normalization, garment decomposition, server-side crops,
and three deterministic outfit-building recipes. It does not contain shopping,
catalog, scraping, or affiliate functionality.

## Run

Run these commands from the repository root so the `backend` package resolves:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r backend\requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Install `ffmpeg` separately and make sure `ffmpeg -version` works before testing
video. Set `FFMPEG_BINARY` to an absolute executable path when it is not on PATH.

The default upload limit is 25 MB for every accepted file. The API accepts exactly
`.jpg`, `.png`, `.webp`, `.mp4`, and `.mov`. Declared MIME types are checked against
the extension, then the content is decoded to reject spoofed or corrupt media.

## API

- `GET /health`
- `POST /api/analyze-outfit`, multipart field name: `file`

Both `processed_image_base64` and `crop_base64` contain complete, browser-ready JPEG
data URIs in the form `data:image/jpeg;base64,...`, not bare base64 payloads. All
`box_2d` values use `[ymin, xmin, ymax, xmax]` normalized to a 0-1000 grid against
the processed image.

Without `GROQ_API_KEY`, the service uses the deterministic image-aware mock. With
the key, it calls `qwen/qwen3.8-27b` through Groq by default. Set
`GROQ_VISION_MODEL` to override the model. Provider errors fall back to the mock unless
`AI_WARDROBE_STRICT_PROVIDER=true` is configured.

Create the key at <https://console.groq.com/keys>.
Optional Groq controls are `AI_WARDROBE_GROQ_TIMEOUT_SECONDS` and `GROQ_BASE_URL`.
Keep `GROQ_API_KEY` server-side and never expose it through a `NEXT_PUBLIC_*` variable.
The default vision model is currently a Groq Preview model, so keep
`GROQ_VISION_MODEL` configurable and monitor Groq model deprecations before relying on
it for a production SLA.

Useful limits can be overridden with `AI_WARDROBE_MAX_IMAGE_BYTES`,
`AI_WARDROBE_MAX_VIDEO_BYTES`, and `AI_WARDROBE_MAX_DIMENSION`.

## Test

```powershell
python -m unittest backend.tests.test_backend -v
```
