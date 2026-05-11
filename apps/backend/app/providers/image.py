import asyncio
from dataclasses import dataclass, field
from json import JSONDecodeError
from typing import Literal

import httpx
from fastapi import HTTPException

from app.config import get_settings

# DashScope uses "*" separator; SiliconFlow uses "x"
_DASHSCOPE_SIZE_MAP = {
    "1:1": "1024*1024",
    "4:3": "1024*768",
    "3:4": "768*1024",
    "16:9": "1280*720",
    "9:16": "720*1280",
}

_SILICONFLOW_SIZE_MAP = {
    "1:1": "1024x1024",
    "4:3": "1024x768",
    "3:4": "768x1024",
    "16:9": "1280x720",
    "9:16": "720x1280",
}


@dataclass(slots=True)
class GeneratedImage:
    # Exactly one of image_bytes or image_url will be set
    image_bytes: bytes | None
    image_url: str | None
    mime_type: str
    model: str
    revised_prompt: str | None = field(default=None)


def _parse_json_response(response: httpx.Response, label: str) -> dict:
    try:
        return response.json()
    except JSONDecodeError as exc:
        preview = response.text[:500]
        raise HTTPException(
            status_code=502,
            detail=f"{label} returned non-JSON response: {preview}",
        ) from exc


def _raise_for_status(response: httpx.Response, label: str) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        detail = f"{label} failed with status {response.status_code}"
        try:
            payload = response.json()
        except JSONDecodeError:
            preview = response.text[:500]
            if preview:
                detail = f"{detail}: {preview}"
        else:
            message = (
                payload.get("message")
                or payload.get("error_message")
                or payload.get("output", {}).get("message")
                or payload.get("code")
            )
            if message:
                detail = f"{detail}: {message}"
        raise HTTPException(status_code=response.status_code, detail=detail) from exc


async def _dashscope_generate(
    prompt: str, aspect_ratio: str, tier: str
) -> GeneratedImage:
    settings = get_settings()
    model = settings.image_model_for_tier(tier, "dashscope")
    size = _DASHSCOPE_SIZE_MAP.get(aspect_ratio, _DASHSCOPE_SIZE_MAP["16:9"])
    auth = f"Bearer {settings.dashscope_api_key}"
    create_url = f"{settings.dashscope_base_url}/services/aigc/text2image/image-synthesis"

    async with httpx.AsyncClient(timeout=180) as client:
        create_response = await client.post(
            create_url,
            headers={
                "Authorization": auth,
                "Content-Type": "application/json",
                "X-DashScope-Async": "enable",
            },
            json={
                "model": model,
                "input": {"prompt": prompt},
                "parameters": {"size": size, "n": 1},
            },
        )
        _raise_for_status(create_response, "DashScope image create")
        create_payload = _parse_json_response(create_response, "DashScope image create")
        task_id = create_payload.get("output", {}).get("task_id")
        if not task_id:
            raise HTTPException(status_code=502, detail="DashScope image task_id missing")

        task_url = f"{settings.dashscope_base_url}/tasks/{task_id}"
        task_headers = {"Authorization": auth}
        image_url: str | None = None
        revised_prompt: str | None = None

        for _ in range(80):
            task_response = await client.get(task_url, headers=task_headers)
            _raise_for_status(task_response, "DashScope image task poll")
            task_payload = _parse_json_response(task_response, "DashScope image task poll")
            output = task_payload.get("output", {})
            task_status = output.get("task_status")
            if task_status == "SUCCEEDED":
                results = output.get("results") or []
                if not results or not results[0].get("url"):
                    raise HTTPException(status_code=502, detail="DashScope image result missing")
                image_url = results[0]["url"]
                revised_prompt = output.get("actual_prompt")
                break
            if task_status == "FAILED":
                raise HTTPException(
                    status_code=502,
                    detail=output.get("message") or "DashScope image generation failed",
                )
            await asyncio.sleep(3)

        if not image_url:
            raise HTTPException(status_code=504, detail="DashScope image generation timed out")

        # Return the CDN URL directly — the web layer will download + cache it
        return GeneratedImage(
            image_bytes=None,
            image_url=image_url,
            mime_type="image/jpeg",
            model=model,
            revised_prompt=revised_prompt,
        )


async def _siliconflow_generate(
    prompt: str, aspect_ratio: str, tier: str
) -> GeneratedImage:
    """Synchronous image generation via SiliconFlow (Flux). Typical latency: 3–8 s."""
    settings = get_settings()
    model = settings.image_model_for_tier(tier, "siliconflow")
    image_size = _SILICONFLOW_SIZE_MAP.get(aspect_ratio, _SILICONFLOW_SIZE_MAP["16:9"])

    # Turbo-style step count only for schnell; dev/pro use their own defaults
    extra: dict = {}
    if "schnell" in model.lower():
        extra["num_inference_steps"] = 4

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            f"{settings.siliconflow_base_url}/images/generations",
            headers={
                "Authorization": f"Bearer {settings.siliconflow_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "prompt": prompt,
                "image_size": image_size,
                "batch_size": 1,
                **extra,
            },
        )
        _raise_for_status(response, "SiliconFlow image")
        payload = _parse_json_response(response, "SiliconFlow image")
        images = payload.get("images") or []
        if not images or not images[0].get("url"):
            raise HTTPException(status_code=502, detail="SiliconFlow image result missing")

        image_url: str = images[0]["url"]
        return GeneratedImage(
            image_bytes=None,
            image_url=image_url,
            mime_type="image/jpeg",
            model=model,
        )


async def generate_image(
    prompt: str,
    aspect_ratio: str,
    tier: str,
    provider: Literal["dashscope", "siliconflow"] | None = None,
) -> GeneratedImage:
    settings = get_settings()
    effective_provider = (provider or settings.image_provider).lower()
    if effective_provider == "siliconflow":
        return await _siliconflow_generate(prompt, aspect_ratio, tier)
    return await _dashscope_generate(prompt, aspect_ratio, tier)
