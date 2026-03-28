"""Async utilities for routes."""

import asyncio
from pathlib import Path
from typing import List


async def async_rglob(root: Path, pattern: str) -> List[Path]:
    """Asynchronously recursively glob for files."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: list(root.rglob(pattern)))


async def async_iterdir(p: Path) -> List[Path]:
    """Asynchronously list and sort directory entries."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, lambda: sorted(p.iterdir()))
