"""
LLM model catalog — code-level whitelist of supported text-generation models.

Single source of truth for which LLMs the system supports. Admins pick from
this catalog in the settings UI; they cannot type free-form model IDs, which
previously caused:

  1. Misspelled model_id → API call fails or silently routes to a fallback.
  2. Unknown context window → writer used a 60k-char fallback budget even for
     1M-token models, silently truncating source documents.
  3. Tool-call attempts on models that don't support function calling.

Adding a new model means adding an entry here. The catalog is the only place
where context window and capability metadata live — the rest of the codebase
queries the spec via ProviderRegistry instead of hard-coding model IDs.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class LLMModelSpec:
    id: str                          # canonical "<provider>/<model_id>"
    provider: str                    # matches ProviderType: "openai" | "google" | "anthropic"
    model_id: str                    # ID sent to the provider API
    context_window_tokens: int       # total context window (input + output)
    max_output_tokens: int           # max output tokens per request
    supports_tools: bool             # true if model supports function calling
    supports_vision: bool            # true if model can accept image inputs
    label: str                       # short label shown in UI
    cost_per_1m_input_tokens: Optional[float]   # USD per 1M input tokens
    cost_per_1m_output_tokens: Optional[float]  # USD per 1M output tokens
    notes: Optional[str] = None
    default_base_url: Optional[str] = None  # Override the SDK default endpoint
                                            # (proxies, Groq, Together, Azure, …)


# All entries here must be reachable via their provider's SDK. When adding a
# new model, double-check context_window_tokens against the provider's docs —
# the writer uses ~60% of this for source text, so wrong values silently
# truncate documents.
LLM_CATALOG: dict[str, LLMModelSpec] = {
    # --- Anthropic Claude 4.x ---
    "anthropic/claude-opus-4-7": LLMModelSpec(
        id="anthropic/claude-opus-4-7",
        provider="anthropic",
        model_id="claude-opus-4-7",
        context_window_tokens=1_000_000,
        max_output_tokens=32_000,
        supports_tools=True,
        supports_vision=True,
        label="Claude Opus 4.7 (1M)",
        cost_per_1m_input_tokens=15.0,
        cost_per_1m_output_tokens=75.0,
        notes="Highest-quality Anthropic model. Use for complex wiki compilation.",
    ),
    "anthropic/claude-sonnet-4-6": LLMModelSpec(
        id="anthropic/claude-sonnet-4-6",
        provider="anthropic",
        model_id="claude-sonnet-4-6",
        context_window_tokens=1_000_000,
        max_output_tokens=64_000,
        supports_tools=True,
        supports_vision=True,
        label="Claude Sonnet 4.6 (1M)",
        cost_per_1m_input_tokens=3.0,
        cost_per_1m_output_tokens=15.0,
        notes="Balanced cost/quality. Recommended default.",
    ),
    # --- Google Gemini ---
    "google/gemini-3.1-pro-preview": LLMModelSpec(
        id="google/gemini-3.1-pro-preview",
        provider="google",
        model_id="gemini-3.1-pro-preview",
        context_window_tokens=1_000_000,
        max_output_tokens=65_000,
        supports_tools=True,
        supports_vision=True,
        label="Gemini 3.1 Pro (1M)",
        cost_per_1m_input_tokens=1.25,
        cost_per_1m_output_tokens=10.0,
        notes="High-context Gemini. Strong on long-doc reasoning.",
    ),
    "google/gemini-3-flash-preview": LLMModelSpec(
        id="google/gemini-3-flash-preview",
        provider="google",
        model_id="gemini-3-flash-preview",
        context_window_tokens=1_048_576,
        max_output_tokens=65_536,
        supports_tools=True,
        supports_vision=True,
        label="Gemini 3 Flash Preview (1M)",
        cost_per_1m_input_tokens=0.5,
        cost_per_1m_output_tokens=3,
        notes=(
            "Preview model. Strongest multimodal + agentic Flash so far. "
            "Supports thinking and computer use. Pricing not yet published."
        ),
    ),
    "google/gemini-3.1-flash-lite": LLMModelSpec(
        id="google/gemini-3.1-flash-lite",
        provider="google",
        model_id="gemini-3.1-flash-lite",
        context_window_tokens=1_048_576,
        max_output_tokens=65_536,
        supports_tools=True,
        supports_vision=True,
        label="Gemini 3.1 Flash-Lite (1M)",
        cost_per_1m_input_tokens=0.25,
        cost_per_1m_output_tokens=1.50,  # includes thinking tokens
        notes=(
            "Most cost-efficient 1M-context Gemini. Optimized for high-volume "
            "agentic tasks, translation, simple extraction. Supports thinking. "
            "Audio input charged at $0.50/1M."
        ),
    ),
    # --- OpenAI ---
    "openai/gpt-5.4": LLMModelSpec(
        id="openai/gpt-5.4",
        provider="openai",
        model_id="gpt-5.4",
        context_window_tokens=1_000_000,
        max_output_tokens=32_000,
        supports_tools=True,
        supports_vision=True,
        label="GPT-5.4 (1M)",
        cost_per_1m_input_tokens=2.50,
        cost_per_1m_output_tokens=10.0,
        notes="Latest GPT-5 with 1M context.",
    ),
    "openai/gpt-5.2": LLMModelSpec(
        id="openai/gpt-5.2",
        provider="openai",
        model_id="gpt-5.2",
        context_window_tokens=256_000,
        max_output_tokens=16_000,
        supports_tools=True,
        supports_vision=True,
        label="GPT-5.2 (256k)",
        cost_per_1m_input_tokens=1.50,
        cost_per_1m_output_tokens=6.0,
    ),
    "openai/gpt-4.1-mini": LLMModelSpec(
        id="openai/gpt-4.1-mini",
        provider="openai",
        model_id="gpt-4.1-mini",
        context_window_tokens=1_000_000,
        max_output_tokens=32_000,
        supports_tools=True,
        supports_vision=True,
        label="GPT-4.1 Mini (1M)",
        cost_per_1m_input_tokens=0.40,
        cost_per_1m_output_tokens=1.60,
        notes="Cheap 1M-context option.",
    ),
    "openai/gpt-4o": LLMModelSpec(
        id="openai/gpt-4o",
        provider="openai",
        model_id="gpt-4o",
        context_window_tokens=128_000,
        max_output_tokens=16_384,
        supports_tools=True,
        supports_vision=True,
        label="GPT-4o (128k)",
        cost_per_1m_input_tokens=2.50,
        cost_per_1m_output_tokens=10.0,
    ),
    "openai/gpt-4o-mini": LLMModelSpec(
        id="openai/gpt-4o-mini",
        provider="openai",
        model_id="gpt-4o-mini",
        context_window_tokens=128_000,
        max_output_tokens=16_384,
        supports_tools=True,
        supports_vision=True,
        label="GPT-4o Mini (128k)",
        cost_per_1m_input_tokens=0.15,
        cost_per_1m_output_tokens=0.60,
    ),
    # --- Antigravity proxy (OpenAI-compatible local gateway) ---
    # Provider must be "openai" so OpenAILLM is used (it honors base_url).
    # default_base_url assumes the proxy runs on the Docker host at port 8045;
    # override via the `llm_base_url` setting if your proxy lives elsewhere.
    "antigravity/gemini-3-flash": LLMModelSpec(
        id="antigravity/gemini-3-flash",
        provider="openai",
        model_id="gemini-3-flash",
        context_window_tokens=1_048_576,
        max_output_tokens=65_536,
        supports_tools=True,
        supports_vision=True,
        label="Antigravity · Gemini 3 Flash",
        cost_per_1m_input_tokens=0.0,
        cost_per_1m_output_tokens=0.0,
        notes="Routed via local Antigravity OpenAI-compatible proxy.",
        default_base_url="http://host.docker.internal:8045/v1",
    ),
    "antigravity/gemini-3-pro": LLMModelSpec(
        id="antigravity/gemini-3-pro",
        provider="openai",
        model_id="gemini-3-pro",
        context_window_tokens=1_048_576,
        max_output_tokens=65_536,
        supports_tools=True,
        supports_vision=True,
        label="Antigravity · Gemini 3 Pro",
        cost_per_1m_input_tokens=0.0,
        cost_per_1m_output_tokens=0.0,
        notes="Routed via local Antigravity OpenAI-compatible proxy.",
        default_base_url="http://host.docker.internal:8045/v1",
    ),
    "antigravity/claude-sonnet-4-6": LLMModelSpec(
        id="antigravity/claude-sonnet-4-6",
        provider="openai",
        model_id="claude-sonnet-4-6",
        context_window_tokens=200_000,
        max_output_tokens=8_192,
        supports_tools=True,
        supports_vision=True,
        label="Antigravity · Claude Sonnet 4.6",
        cost_per_1m_input_tokens=0.0,
        cost_per_1m_output_tokens=0.0,
        notes="Routed via local Antigravity OpenAI-compatible proxy.",
        default_base_url="http://host.docker.internal:8045/v1",
    ),
    "antigravity/claude-opus-4-6": LLMModelSpec(
        id="antigravity/claude-opus-4-6",
        provider="openai",
        model_id="claude-opus-4-6",
        context_window_tokens=200_000,
        max_output_tokens=8_192,
        supports_tools=True,
        supports_vision=True,
        label="Antigravity · Claude Opus 4.6",
        cost_per_1m_input_tokens=0.0,
        cost_per_1m_output_tokens=0.0,
        notes="Routed via local Antigravity OpenAI-compatible proxy.",
        default_base_url="http://host.docker.internal:8045/v1",
    ),
    # --- Groq (OpenAI-compatible cloud, very fast Llama inference) ---
    # Requires a Groq API key configured as llm_api_key.
    "groq/llama-3.3-70b-versatile": LLMModelSpec(
        id="groq/llama-3.3-70b-versatile",
        provider="openai",
        model_id="llama-3.3-70b-versatile",
        context_window_tokens=131_072,
        max_output_tokens=32_768,
        supports_tools=True,
        supports_vision=False,
        label="Groq · Llama 3.3 70B Versatile",
        cost_per_1m_input_tokens=0.59,
        cost_per_1m_output_tokens=0.79,
        notes="High-throughput Llama on Groq. Tool calling supported.",
        default_base_url="https://api.groq.com/openai/v1",
    ),
    "groq/llama-3.1-8b-instant": LLMModelSpec(
        id="groq/llama-3.1-8b-instant",
        provider="openai",
        model_id="llama-3.1-8b-instant",
        context_window_tokens=131_072,
        max_output_tokens=8_192,
        supports_tools=True,
        supports_vision=False,
        label="Groq · Llama 3.1 8B Instant",
        cost_per_1m_input_tokens=0.05,
        cost_per_1m_output_tokens=0.08,
        notes="Cheapest Groq option. Good for simple extraction tasks.",
        default_base_url="https://api.groq.com/openai/v1",
    ),
    "groq/gpt-oss-120b": LLMModelSpec(
        id="groq/gpt-oss-120b",
        provider="openai",
        model_id="openai/gpt-oss-120b",
        context_window_tokens=131_072,
        max_output_tokens=32_768,
        supports_tools=True,
        supports_vision=False,
        label="Groq · GPT-OSS 120B",
        cost_per_1m_input_tokens=0.15,
        cost_per_1m_output_tokens=0.75,
        notes="OpenAI open-weights model on Groq. Strong reasoning.",
        default_base_url="https://api.groq.com/openai/v1",
    ),
}


class UnknownLLMModel(KeyError):
    """Raised when a spec_id is not in the LLM catalog."""


def get_spec(spec_id: str) -> LLMModelSpec:
    try:
        return LLM_CATALOG[spec_id]
    except KeyError as e:
        raise UnknownLLMModel(
            f"Unknown LLM model spec_id={spec_id!r}. "
            f"Valid IDs: {sorted(LLM_CATALOG.keys())}"
        ) from e


def list_specs() -> list[LLMModelSpec]:
    return list(LLM_CATALOG.values())


def list_specs_by_provider(provider: str) -> list[LLMModelSpec]:
    return [s for s in LLM_CATALOG.values() if s.provider == provider]


def derive_spec_id(provider: str, model_id: str) -> Optional[str]:
    """
    Look up a spec_id from legacy (provider, model_id) config. Returns None
    if no spec matches — caller should treat that as 'unknown model, use
    fallbacks'. Used during the backward-compat migration from the old
    llm_provider+llm_model_id config keys.
    """
    for spec in LLM_CATALOG.values():
        if spec.provider == provider and spec.model_id == model_id:
            return spec.id
    return None
