# Threadline frontend

Next.js App Router client for the AI outfit decomposition and styling MVP.

## Local development

```powershell
Copy-Item .env.example .env.local
npm ci
npm run dev
```

The frontend opens on `http://localhost:3000` and expects the FastAPI service at
`http://localhost:8000`. Change `NEXT_PUBLIC_API_URL` in `.env.local` when the API
runs elsewhere.

The built-in demo remains available without the API. Real image and video uploads
require the backend.

## Checks

```powershell
npm run lint
npm run build
```
