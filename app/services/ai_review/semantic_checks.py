"""
L3 semantic — duplicate detection via embedding similarity.

Async — runs inside the arq worker. Embedding is computed once for the draft
content, then matched against the active wiki page embedding table.
"""

import uuid
from typing import Optional

from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import wiki_service

# Pages above this cosine similarity are flagged as potential duplicates.
_DUP_THRESHOLD = 0.85
_DUP_LIMIT = 5


async def run(
    db: AsyncSession,
    content_md: str,
    self_page_id: Optional[uuid.UUID],
    scope_type: str = "global",
    scope_id: Optional[uuid.UUID] = None,
) -> list[dict]:
    out: list[dict] = []

    try:
        from app.ai.registry import ProviderRegistry
        registry = ProviderRegistry(db)
        embedder = await registry.get_embedding(task="document")
        embedding = await embedder.embed(content_md[:4000])
    except Exception as e:  # pragma: no cover — provider failure path
        logger.warning(f"AI L3 embedding failed: {e}")
        return [{
            "id": "semantic.duplicate",
            "layer": "L3",
            "severity": "warn",
            "status": "skipped",
            "message": f"Embedding lookup failed: {e}",
            "matches": [],
        }]

    pairs = await wiki_service.search_pages_semantic(
        db, query_embedding=embedding, top_k=_DUP_LIMIT + 1,
        scope_type=scope_type, scope_id=scope_id,
    )
    similar = []
    for page, sim in pairs:
        if self_page_id is not None and page.id == self_page_id:
            continue
        if sim >= _DUP_THRESHOLD:
            similar.append({"slug": page.slug, "title": page.title, "score": round(sim, 3)})

    out.append({
        "id": "semantic.duplicate",
        "layer": "L3",
        "severity": "warn",
        "status": "warn" if similar else "pass",
        "message": (
            f"{len(similar)} existing page(s) look similar — consider editing instead of creating"
            if similar else None
        ),
        "matches": similar[:_DUP_LIMIT],
    })
    return out
