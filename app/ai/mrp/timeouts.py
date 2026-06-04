"""
LLM call timeouts for the MRP pipeline.

The per-call defaults are tuned for fast cloud providers (Gemini/GPT/Claude).
Self-hosted backends (e.g. Ollama on a single GPU) generate slower and trip
those limits - a 14B model can need >120s for a large extraction chunk.

Instead of patching each call site, every timeout goes through llm_timeout()
which scales the default by the MRP_LLM_TIMEOUT_SCALE env var (float,
default 1.0 = unchanged). Example: MRP_LLM_TIMEOUT_SCALE=5 turns the 120s
extraction budget into 600s.
"""

import os


def llm_timeout(base_seconds: float) -> float:
    """Return base_seconds scaled by MRP_LLM_TIMEOUT_SCALE (clamped >= 1.0)."""
    try:
        scale = float(os.getenv("MRP_LLM_TIMEOUT_SCALE", "1"))
    except ValueError:
        scale = 1.0
    return base_seconds * max(1.0, scale)
