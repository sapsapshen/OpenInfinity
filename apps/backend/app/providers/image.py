import asyncio
from dataclasses import dataclass
from json import JSONDecodeError

import httpx
from fastapi import HTTPException

from app.config import get_settings

SIZE_MAP = {
    "1:1": "1024*1024",
    "4:3": "1024*768",
    "3:4": "768*1024",
    "16:9": "1280*720",
    "9:16": "720*1280",
}


@dataclass(slots=True)
class GeneratedImage:
    image_bytes: bytes
    mime_type: str
    model: str
    revised_prompt: str | None = None


def _parse_json_response(response: httpx.Response, label: str) -> dict:
    try:
        return response.json()
    except JSONDecodeError as exc:
        preview = response.text[:500]
        raise HTTPException(
            status_code=502,
            detail=f"{label} returned non-JSON response: {preview}",
        ) from exc


def _raise_for_dashscope_response(response: httpx.Response, label: str) -> None:
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


async def generate_image(prompt: str, aspect_ratio: str, tier: str) -> GeneratedImage:
    settings = get_settings()
    model = settings.image_model_for_tier(tier)
    size = SIZE_MAP.get(aspect_ratio, SIZE_MAP["16:9"])
    headers = {
        "Authorization": f"Bearer {settings.dashscope_api_key}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }
    create_url = f"{settings.dashscope_base_url}/services/aigc/text2image/image-synthesis"

    async with httpx.AsyncClient(timeout=120) as client:
        create_response = await client.post(
            create_url,
            headers=headers,
            json={
                "model": model,
                "input": {"prompt": prompt},
                "parameters": {"size": size, "n": 1},
            },
        )
        _raise_for_dashscope_response(create_response, "DashScope image create")
        create_payload = _parse_json_response(create_response, "DashScope image create")
        task_id = create_payload.get("output", {}).get("task_id")
        if not task_id:
            raise HTTPException(status_code=502, detail="DashScope image task_id missing")

        task_url = f"{settings.dashscope_base_url}/tasks/{task_id}"
        image_url: str | None = None
        revised_prompt: str | None = None
        for _ in range(80):
            task_response = await client.get(
                task_url,
                headers={"Authorization": f"Bearer {settings.dashscope_api_key}"},
            )
            _raise_for_dashscope_response(task_response, "DashScope image task poll")
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

        image_response = await client.get(image_url)
        _raise_for_dashscope_response(image_response, "DashScope image download")
        mime_type = image_response.headers.get("content-type", "image/png").split(";")[0]
        return GeneratedImage(
            image_bytes=image_response.content,
            mime_type=mime_type,
            model=model,
            revised_prompt=revised_prompt,
        )
