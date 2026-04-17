"""NIM-based report generation for crisis incidents.

Exports:
  generate_report_from_nim(...) -> dict with keys:
    root_cause, technical_fix, impact_summary, recommended_actions
"""

import json
import os

import httpx

_NIM_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
_NIM_MODEL = "meta/llama-3.1-70b-instruct"

_MOCK_REPORT = {
    "root_cause": (
        "The primary fault originates from a rapid decline in renewable energy output "
        "that exceeds the grid's immediate compensatory capacity. The fossil baseline "
        "is insufficient to cover the emerging deficit, creating a demand-supply "
        "imbalance that threatens regional grid stability."
    ),
    "technical_fix": (
        "Immediate activation of reserve thermal units at Ghannouch and Sousse plants "
        "is required. Cross-region load balancing should be engaged with STEG Dispatch "
        "Center to redistribute load from affected zones to northern segments with "
        "available headroom, while Algeria Transmed import capacity is maximised."
    ),
    "impact_summary": (
        "Approximately 15–20% of regional demand is at risk of uncontrolled load "
        "shedding if reserves are not activated within 30 minutes. Cascade failure "
        "probability is elevated in adjacent governorates."
    ),
    "recommended_actions": [
        "Activate STEG emergency reserve protocol — contact National Dispatch Center immediately",
        "Initiate 20% industrial load reduction in affected zone",
        "Open Algeria Transmed import channel to maximum available capacity",
        "Deploy field technicians to primary substation for manual override readiness",
    ],
}


async def generate_report_from_nim(
    region: str,
    risk_level: str,
    scenario_label: str,
    source: str,
    magnitude_mw: float,
    cascade_regions: list,
    prevention_actions: list,
) -> dict:
    """
    Call NVIDIA NIM to generate a structured incident diagnosis.
    Falls back to _MOCK_REPORT if the API key is absent or the call fails.
    Returns dict with: root_cause, technical_fix, impact_summary, recommended_actions.
    """
    nim_key = os.getenv("NVIDIA_NIM_API_KEY", "").strip()
    if not nim_key:
        return _MOCK_REPORT.copy()

    cascade_str = (
        ", ".join(f"{c['name']} ({c['risk_level']})" for c in cascade_regions)
        if cascade_regions
        else "None"
    )
    actions_block = (
        "\n".join(f"  - {a}" for a in prevention_actions)
        if prevention_actions
        else "  - None activated"
    )

    user_prompt = f"""You are a senior grid operations engineer at STEG Tunisia.
Analyze this power crisis and produce a diagnosis report.

INCIDENT DATA:
- Scenario: {scenario_label}
- Primary Region: {region}
- Risk Level: {risk_level}
- Energy Source: {source}
- Affected Capacity: {magnitude_mw} MW
- Cascade Regions: {cascade_str}
- Prevention Actions Activated:
{actions_block}

Respond with ONLY valid JSON (no markdown fences, no explanation) using exactly this structure:
{{
  "root_cause": "2-3 sentences on the technical root cause specific to this incident",
  "technical_fix": "2-3 sentences on the immediate operator resolution steps",
  "impact_summary": "1-2 sentences quantifying grid impact and time sensitivity",
  "recommended_actions": ["action 1", "action 2", "action 3", "action 4"]
}}"""

    payload = {
        "model": _NIM_MODEL,
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are a STEG grid operations AI assistant. "
                    "Always respond with valid JSON only. No markdown. No preamble."
                ),
            },
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
        "max_tokens": 600,
        "stream": False,
    }
    headers = {
        "Authorization": f"Bearer {nim_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient() as http_client:
            resp = await http_client.post(_NIM_URL, json=payload, headers=headers, timeout=30.0)
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            parts = content.split("```")
            content = parts[1] if len(parts) > 1 else content
            if content[:4].lower() == "json":
                content = content[4:]
        return json.loads(content.strip())
    except Exception:
        return _MOCK_REPORT.copy()
