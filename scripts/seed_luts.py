"""
Idempotent seed script: discover and import .cube LUT files from static/luts/
"""

import uuid
from pathlib import Path

import db.crud as crud
from logger import get_logger

logger = get_logger("scripts.seed_luts")

LUTS_ROOT = Path(__file__).parent.parent / "static" / "luts"


def _new_uuid() -> str:
    """Generate a new UUID as string."""
    return str(uuid.uuid4())


async def seed_luts():
    """Discover all .cube files and seed them into the luts table."""
    if not LUTS_ROOT.exists():
        logger.debug("LUT directory does not exist, skipping seed", extra={"path": str(LUTS_ROOT)})
        return

    cube_files = list(LUTS_ROOT.rglob("*.cube"))
    if not cube_files:
        logger.debug("No .cube files found, skipping seed", extra={"path": str(LUTS_ROOT)})
        return

    logger.info(f"Seeding {len(cube_files)} LUT(s) from {LUTS_ROOT}")

    for cube_path in cube_files:
        camera = cube_path.parent.name
        stem = cube_path.stem  # e.g. "logc3_alexa_to_rec709"
        parts = stem.split("_", 1)
        log_profile = parts[0]  # e.g. "logc3"
        name = stem.replace("_", " ").title()  # e.g. "Logc3 Alexa To Rec709"

        try:
            lut_id = _new_uuid()
            await crud.upsert_lut(
                id=lut_id,
                name=name,
                camera=camera,
                log_profile=log_profile,
                color_space=None,
                gamma=None,
                file_path=str(cube_path.resolve()),
                lut_type="3d",
            )
            logger.debug(
                "LUT seeded",
                extra={
                    "id": lut_id,
                    "name": name,
                    "camera": camera,
                    "log_profile": log_profile,
                    "file": cube_path.name,
                },
            )
        except Exception as e:
            logger.error(
                f"Failed to seed LUT",
                extra={"file": str(cube_path), "camera": camera},
                exc_info=True,
            )

    logger.info(f"LUT seed complete")
