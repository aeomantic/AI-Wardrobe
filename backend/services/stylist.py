"""Deterministic outfit completion and remix recipes."""

from __future__ import annotations

from backend.schemas import GarmentBox


def build_style_suggestions(
    garments: list[GarmentBox],
    *,
    overall_vibe: str,
) -> list[dict[str, str]]:
    """Build exactly three flat, frontend-friendly styling recipes."""

    categories = {garment.category for garment in garments}
    colors = list(dict.fromkeys(garment.color for garment in garments if garment.color))
    anchors = _anchor_labels(garments)
    completion = _missing_foundation(categories)
    color_direction = _color_direction(colors)
    existing_palette = ", ".join(colors[:4]) or "the detected base palette"

    return [
        {
            "title": "Casual Day Out",
            "vibe": "Relaxed, useful, and intentionally put together",
            "anchor_piece": anchors,
            "keep": f"Keep {anchors} as the recognizable core of the outfit.",
            "add": completion
            if completion
            else "Add a compact crossbody or minimal cap for one practical focal point.",
            "swap": "Use clean low-profile sneakers and a lightweight everyday layer to soften the look.",
            "color_direction": color_direction,
            "styling_notes": (
                "Roll or push the outer sleeves slightly, keep hems clean, and repeat one "
                f"shade from {existing_palette} to make the combination feel deliberate."
            ),
        },
        {
            "title": "Elevated Evening",
            "vibe": "Sharper proportions with a restrained after-dark finish",
            "anchor_piece": anchors,
            "keep": f"Retain {anchors}, then make the surrounding pieces more structured.",
            "add": (
                "Add a tailored dark layer, a slim belt, and one polished metal accent. "
                + completion
                if completion
                else "Add a tailored dark layer, a slim belt, and one polished metal accent."
            ),
            "swap": "Swap casual footwear for a leather loafer, sleek ankle boot, or minimal dress sneaker.",
            "color_direction": (
                "Deepen the existing palette with charcoal, ink navy, or espresso, then "
                "use one small high-contrast detail."
            ),
            "styling_notes": (
                "Define the waist or front-tuck the top, reduce visual bulk, and keep the "
                "accessory shapes compact and structured."
            ),
        },
        {
            "title": "Layered Alternative",
            "vibe": f"A more dimensional remix of {overall_vibe}",
            "anchor_piece": anchors,
            "keep": f"Use {anchors} as the middle or base layer instead of the final layer.",
            "add": (
                "Add a fine-gauge base layer plus a cropped jacket, overshirt, or technical "
                "shell with a visibly different texture."
            ),
            "swap": (
                "Trade one same-weight piece for a lighter or heavier texture so the layers "
                "stay distinct rather than blending together."
            ),
            "color_direction": (
                "Work tonally with two neighboring shades, then introduce one controlled "
                "accent in the smallest layer or accessory."
            ),
            "styling_notes": (
                "Let each hem differ in length, keep only one layer oversized, and balance "
                "the extra volume with a cleaner trouser or footwear line."
            ),
        },
    ]


def _anchor_labels(garments: list[GarmentBox]) -> str:
    priority = {
        "one-piece": 0,
        "outerwear": 1,
        "top": 2,
        "bottom": 3,
        "footwear": 4,
        "accessory": 5,
    }
    ordered = sorted(
        garments,
        key=lambda garment: (priority.get(garment.category, 9), -garment.confidence),
    )
    labels = [garment.label for garment in ordered[:2]]
    if not labels:
        return "the strongest detected garment"
    if len(labels) == 1:
        return labels[0]
    return f"the {labels[0]} and {labels[1]}"


def _missing_foundation(categories: set[str]) -> str:
    missing: list[str] = []
    has_one_piece = "one-piece" in categories
    if "top" not in categories and not has_one_piece:
        missing.append("a clean fitted or regular-fit top")
    if "bottom" not in categories and not has_one_piece:
        missing.append("a straight trouser or relaxed denim base")
    if "footwear" not in categories:
        missing.append("footwear that repeats one outfit color")
    if "outerwear" not in categories:
        missing.append("a light third layer")
    if "accessory" not in categories:
        missing.append("one compact accessory")
    if not missing:
        return ""
    if len(missing) == 1:
        return f"Complete the foundation with {missing[0]}."
    return f"Complete the foundation with {', '.join(missing[:-1])}, and {missing[-1]}."


def _color_direction(colors: list[str]) -> str:
    lowered = {color.lower() for color in colors}
    warm = {"red", "burgundy", "orange", "camel", "mustard", "yellow", "pink"}
    cool = {"green", "olive", "teal", "blue", "navy", "purple"}
    if lowered & warm and not lowered & cool:
        return "Balance the warm base with cream, charcoal, or one muted navy accent."
    if lowered & cool and not lowered & warm:
        return "Warm the cool base with ecru, tan, camel, or a restrained rust accent."
    if not lowered or lowered <= {"black", "white", "gray", "charcoal", "neutral"}:
        return "Keep the neutral base tonal and add one controlled accent color near the face or shoes."
    return "Repeat one detected color twice and let the remaining pieces stay neutral."
