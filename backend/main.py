"""FastAPI entry point for the AI Wardrobe outfit decomposition service."""

from __future__ import annotations

from functools import lru_cache
import os
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from starlette.concurrency import run_in_threadpool

from backend.schemas import OutfitAnalysisResponse
from backend.services.cropper import crop_garments
from backend.services.detector import DetectorError, DetectorService
from backend.services.media import (
    MediaDescriptor,
    MediaProcessingError,
    UnsupportedMediaError,
    classify_upload,
    image_to_data_url,
    process_uploaded_media,
)
from backend.services.stylist import build_style_suggestions


app = FastAPI(
    title="AI Wardrobe Outfit Analysis API",
    description="Garment decomposition and outfit building without commerce features.",
    version="0.1.0",
)


def _cors_origins() -> list[str]:
    configured = os.getenv("AI_WARDROBE_CORS_ORIGINS", "")
    origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
    origins.extend(origin.strip() for origin in configured.split(",") if origin.strip())
    return list(dict.fromkeys(origins))


app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Authorization", "Content-Type"],
)


@lru_cache(maxsize=1)
def get_detector_service() -> DetectorService:
    return DetectorService.from_environment()


@app.get("/health")
def healthcheck() -> dict[str, str]:
    try:
        provider = get_detector_service().provider_name
    except DetectorError:
        provider = "unavailable"
    return {
        "status": "ok",
        "service": "ai-wardrobe-backend",
        "detector_provider": provider,
    }


@app.post(
    "/api/analyze-outfit",
    response_model=OutfitAnalysisResponse,
    status_code=status.HTTP_200_OK,
    responses={
        413: {"description": "Upload exceeds the configured size limit"},
        415: {"description": "Unsupported media type"},
        422: {"description": "Media could not be decoded or processed"},
        503: {"description": "The configured vision provider is unavailable"},
    },
)
async def analyze_outfit(
    file: UploadFile = File(..., description="A .jpg, .png, .webp, .mp4, or .mov file"),
) -> OutfitAnalysisResponse:
    try:
        descriptor = classify_upload(file.filename, file.content_type)
    except UnsupportedMediaError as exc:
        await file.close()
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=str(exc),
        ) from exc

    try:
        data = await _read_upload_limited(file, descriptor)
    finally:
        await file.close()

    try:
        processed = await run_in_threadpool(process_uploaded_media, data, descriptor)
    except MediaProcessingError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    try:
        detector = get_detector_service()
        detection = await run_in_threadpool(
            detector.detect,
            processed.image,
            processed.jpeg_bytes,
        )
    except DetectorError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    garments = await run_in_threadpool(
        crop_garments,
        processed.image,
        detection.detected_garments,
    )
    suggestions = build_style_suggestions(
        garments,
        overall_vibe=detection.overall_vibe,
    )
    return OutfitAnalysisResponse(
        session_id=str(uuid4()),
        processed_image_base64=image_to_data_url(processed.jpeg_bytes),
        overall_vibe=detection.overall_vibe,
        detected_garments=garments,
        style_breakdown=detection.style_breakdown,
        build_suggestions=suggestions,
    )


async def _read_upload_limited(file: UploadFile, descriptor: MediaDescriptor) -> bytes:
    declared_size = getattr(file, "size", None)
    if isinstance(declared_size, int) and declared_size > descriptor.max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Upload exceeds the {descriptor.max_bytes // (1024 * 1024)} MB limit.",
        )

    chunks = bytearray()
    chunk_size = 1024 * 1024
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        chunks.extend(chunk)
        if len(chunks) > descriptor.max_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Upload exceeds the {descriptor.max_bytes // (1024 * 1024)} MB limit.",
            )
    if not chunks:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="The uploaded file is empty.",
        )
    return bytes(chunks)
