"""Safe image normalization and representative video frame extraction."""

from __future__ import annotations

import base64
import io
import os
from dataclasses import dataclass
from pathlib import Path
import shutil
import subprocess
import tempfile

from PIL import Image, ImageFilter, ImageOps, ImageStat, UnidentifiedImageError


DEFAULT_MAX_IMAGE_BYTES = 25 * 1024 * 1024
DEFAULT_MAX_VIDEO_BYTES = 25 * 1024 * 1024
DEFAULT_MAX_DIMENSION = 1600
MAX_INPUT_PIXELS = 50_000_000


class MediaError(ValueError):
    """Base error for invalid or unprocessable media."""


class UnsupportedMediaError(MediaError):
    """Raised when an upload has an unsupported type."""


class MediaProcessingError(MediaError):
    """Raised when a supported upload cannot be decoded safely."""


@dataclass(frozen=True, slots=True)
class MediaDescriptor:
    kind: str
    extension: str
    allowed_content_types: frozenset[str]
    max_bytes: int


@dataclass(slots=True)
class ProcessedMedia:
    image: Image.Image
    jpeg_bytes: bytes
    source_kind: str


def _positive_env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return value if value > 0 else default


def classify_upload(filename: str | None, content_type: str | None) -> MediaDescriptor:
    """Validate the declared filename and MIME type before reading the body."""

    suffix = Path(filename or "").suffix.lower()
    max_image_bytes = _positive_env_int(
        "AI_WARDROBE_MAX_IMAGE_BYTES", DEFAULT_MAX_IMAGE_BYTES
    )
    max_video_bytes = _positive_env_int(
        "AI_WARDROBE_MAX_VIDEO_BYTES", DEFAULT_MAX_VIDEO_BYTES
    )
    supported: dict[str, MediaDescriptor] = {
        ".jpg": MediaDescriptor(
            "image", ".jpg", frozenset({"image/jpeg"}), max_image_bytes
        ),
        ".png": MediaDescriptor(
            "image", ".png", frozenset({"image/png"}), max_image_bytes
        ),
        ".webp": MediaDescriptor(
            "image", ".webp", frozenset({"image/webp"}), max_image_bytes
        ),
        ".mp4": MediaDescriptor(
            "video", ".mp4", frozenset({"video/mp4"}), max_video_bytes
        ),
        ".mov": MediaDescriptor(
            "video",
            ".mov",
            frozenset({"video/quicktime", "video/mov", "video/x-quicktime"}),
            max_video_bytes,
        ),
    }
    descriptor = supported.get(suffix)
    if descriptor is None:
        raise UnsupportedMediaError(
            "Unsupported file extension. Use .jpg, .png, .webp, .mp4, or .mov."
        )

    normalized_content_type = (content_type or "").split(";", 1)[0].strip().lower()
    if normalized_content_type and normalized_content_type not in (
        descriptor.allowed_content_types | {"application/octet-stream"}
    ):
        raise UnsupportedMediaError(
            f"The MIME type {normalized_content_type!r} does not match {suffix}."
        )
    return descriptor


def image_to_data_url(jpeg_bytes: bytes) -> str:
    """Encode normalized JPEG bytes in a browser-ready data URL."""

    encoded = base64.b64encode(jpeg_bytes).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def normalize_image(
    data: bytes,
    *,
    declared_extension: str | None = None,
    max_dimension: int | None = None,
) -> ProcessedMedia:
    """Decode, orient, resize, and re-encode an image without metadata."""

    if not data:
        raise MediaProcessingError("The uploaded image is empty.")
    max_dimension = max_dimension or _positive_env_int(
        "AI_WARDROBE_MAX_DIMENSION", DEFAULT_MAX_DIMENSION
    )
    expected_formats = {
        ".jpg": "JPEG",
        ".png": "PNG",
        ".webp": "WEBP",
    }
    try:
        with Image.open(io.BytesIO(data)) as probe:
            actual_format = (probe.format or "").upper()
            width, height = probe.size
            if width <= 0 or height <= 0 or width * height > MAX_INPUT_PIXELS:
                raise MediaProcessingError(
                    f"Image dimensions are invalid or exceed {MAX_INPUT_PIXELS:,} pixels."
                )
            expected = expected_formats.get(declared_extension or "")
            if expected and actual_format != expected:
                raise MediaProcessingError(
                    f"File contents are {actual_format or 'unknown'}, not {expected}."
                )
            probe.verify()

        with Image.open(io.BytesIO(data)) as source:
            source.load()
            oriented = ImageOps.exif_transpose(source)
            normalized = _normalize_pillow_image(oriented, max_dimension=max_dimension)
    except MediaProcessingError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError) as exc:
        raise MediaProcessingError("The uploaded image could not be decoded safely.") from exc

    output = io.BytesIO()
    normalized.save(
        output,
        format="JPEG",
        quality=92,
        optimize=True,
        progressive=True,
        exif=b"",
    )
    return ProcessedMedia(
        image=normalized,
        jpeg_bytes=output.getvalue(),
        source_kind="image",
    )


def _normalize_pillow_image(image: Image.Image, *, max_dimension: int) -> Image.Image:
    image = image.copy()
    image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
    if image.mode in {"RGBA", "LA"} or (
        image.mode == "P" and "transparency" in image.info
    ):
        rgba = image.convert("RGBA")
        background = Image.new("RGBA", rgba.size, (255, 255, 255, 255))
        image = Image.alpha_composite(background, rgba).convert("RGB")
    else:
        image = image.convert("RGB")
    return image


def extract_sharpest_video_frame(
    data: bytes,
    *,
    suffix: str,
    ffmpeg_binary: str | None = None,
) -> ProcessedMedia:
    """Sample a bounded section of a video and return its sharpest frame."""

    if not data:
        raise MediaProcessingError("The uploaded video is empty.")
    configured_binary = ffmpeg_binary or os.getenv("FFMPEG_BINARY", "ffmpeg")
    executable = shutil.which(configured_binary)
    if executable is None:
        raise MediaProcessingError(
            "ffmpeg was not found. Install it or set FFMPEG_BINARY to its path."
        )

    max_seconds = _positive_env_int("AI_WARDROBE_VIDEO_SCAN_SECONDS", 30)
    max_frames = _positive_env_int("AI_WARDROBE_VIDEO_SAMPLE_FRAMES", 24)
    timeout_seconds = _positive_env_int("AI_WARDROBE_FFMPEG_TIMEOUT_SECONDS", 45)

    with tempfile.TemporaryDirectory(prefix="ai-wardrobe-") as temporary_directory:
        temporary_path = Path(temporary_directory)
        input_path = temporary_path / f"upload{suffix}"
        output_pattern = temporary_path / "frame-%03d.jpg"
        input_path.write_bytes(data)

        command = [
            executable,
            "-hide_banner",
            "-loglevel",
            "error",
            "-nostdin",
            "-protocol_whitelist",
            "file,pipe",
            "-i",
            str(input_path),
            "-t",
            str(max_seconds),
            "-vf",
            "fps=1,scale='min(1600,iw)':-2",
            "-frames:v",
            str(max_frames),
            "-q:v",
            "2",
            str(output_pattern),
        ]
        _run_ffmpeg(command, timeout_seconds=timeout_seconds)
        frames = sorted(temporary_path.glob("frame-*.jpg"))

        if not frames:
            fallback_path = temporary_path / "frame-first.jpg"
            fallback_command = [
                executable,
                "-hide_banner",
                "-loglevel",
                "error",
                "-nostdin",
                "-protocol_whitelist",
                "file,pipe",
                "-i",
                str(input_path),
                "-frames:v",
                "1",
                "-vf",
                "scale='min(1600,iw)':-2",
                "-q:v",
                "2",
                str(fallback_path),
            ]
            _run_ffmpeg(fallback_command, timeout_seconds=timeout_seconds)
            if fallback_path.exists():
                frames = [fallback_path]

        if not frames:
            raise MediaProcessingError(
                "No video frame could be decoded. Check that the clip has a video stream."
            )

        try:
            sharpest = max(frames, key=_sharpness_score)
            normalized = normalize_image(
                sharpest.read_bytes(), declared_extension=".jpg"
            )
        except (OSError, ValueError) as exc:
            raise MediaProcessingError(
                "Extracted video frames could not be processed."
            ) from exc
        normalized.source_kind = "video"
        return normalized


def _run_ffmpeg(command: list[str], *, timeout_seconds: int) -> None:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
            shell=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise MediaProcessingError("Video frame extraction timed out.") from exc
    except OSError as exc:
        raise MediaProcessingError("ffmpeg could not be started.") from exc
    if result.returncode != 0:
        detail = (result.stderr or "unknown ffmpeg error").strip().splitlines()[-1]
        raise MediaProcessingError(f"Video decoding failed: {detail[:300]}")


def _sharpness_score(path: Path) -> float:
    with Image.open(path) as frame:
        grayscale = frame.convert("L")
        grayscale.thumbnail((384, 384), Image.Resampling.BILINEAR)
        edges = grayscale.filter(ImageFilter.FIND_EDGES)
        variance = ImageStat.Stat(edges).var[0]
        return float(variance)


def process_uploaded_media(data: bytes, descriptor: MediaDescriptor) -> ProcessedMedia:
    if descriptor.kind == "image":
        return normalize_image(data, declared_extension=descriptor.extension)
    return extract_sharpest_video_frame(data, suffix=descriptor.extension)
