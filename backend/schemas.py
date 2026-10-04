"""Public API models shared by the outfit analysis pipeline."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


GarmentCategory = Literal[
    "outerwear",
    "top",
    "bottom",
    "footwear",
    "accessory",
    "one-piece",
]


class GarmentBox(BaseModel):
    """A detected garment and its normalized 2D location."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=120)
    category: GarmentCategory
    label: str = Field(min_length=1, max_length=160)
    confidence: float = Field(ge=0.0, le=1.0)
    box_2d: Annotated[list[int], Field(min_length=4, max_length=4)]
    color: str = Field(min_length=1, max_length=80)
    material_estimate: str = Field(min_length=1, max_length=120)
    silhouette: str = Field(min_length=1, max_length=120)
    crop_base64: str | None = None

    @field_validator("box_2d")
    @classmethod
    def validate_box(cls, value: list[int]) -> list[int]:
        if any(coordinate < 0 or coordinate > 1000 for coordinate in value):
            raise ValueError("box_2d coordinates must be normalized from 0 to 1000")
        ymin, xmin, ymax, xmax = value
        if ymin >= ymax or xmin >= xmax:
            raise ValueError("box_2d must have positive width and height")
        return value


class OutfitAnalysisResponse(BaseModel):
    """Complete response returned by POST /api/analyze-outfit."""

    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(min_length=1)
    processed_image_base64: str = Field(min_length=1)
    overall_vibe: str = Field(min_length=1)
    detected_garments: list[GarmentBox]
    style_breakdown: dict[str, str]
    build_suggestions: list[dict[str, str]]
