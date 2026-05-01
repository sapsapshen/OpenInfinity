import asyncio
from json import JSONDecodeError

import httpx
from fastapi import HTTPException

from app.config import get_settings

RESOLUTION_MAP = {
    "1:1": "720P",
    "4:3": "720P",
    "3:4": "720P",
    "16:9": "720P",
    "9:16": "720P",
}


def _parse_json_response(response: httpx.Response, label: str) -> dict:
    try:
        return response.json()
    except JSONDecodeError as exc:
        preview = response.text[:500]
        raise HTTPException(
            status_code=502,
            detail=f"{label} returned non-JSON response: {preview}",
        ) from exc


async def generate_video(
    prompt: str,
    image_url: str | None,
    image_data_url: str | None,
    aspect_ratio: str,
    tier: str,
) -> tuple[str, str]:
    settings = get_settings()
    model = settings.video_model_for_tier(tier)
    source = image_data_url or image_url
    if not source:
        raise HTTPException(status_code=400, detail="Animate request requires image source")

    parameters: dict[str, object] = {
        "resolution": RESOLUTION_MAP.get(aspect_ratio, "720P"),
        "prompt_extend": settings.animate_prompt_rewrite,
        "watermark": False,
    }
    if model.endswith("turbo"):
        parameters["duration"] = 5

    headers = {
        "Authorization": f"Bearer {settings.dashscope_api_key}",
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
    }
    create_url = f"{settings.dashscope_base_url}/services/aigc/video-generation/video-synthesis"

    async with httpx.AsyncClient(timeout=120) as client:
        create_response = await client.post(
            create_url,
            headers=headers,
            json={
                "model": model,
                "input": {"prompt": prompt, "img_url": source},
                "parameters": parameters,
            },
        )
        create_response.raise_for_status()
        create_payload = _parse_json_response(create_response, "DashScope video create")
        task_id = create_payload.get("output", {}).get("task_id")
        if not task_id:
            raise HTTPException(status_code=502, detail="DashScope video task_id missing")

        task_url = f"{settings.dashscope_base_url}/tasks/{task_id}"
        for _ in range(80):
            task_response = await client.get(
                task_url,
                headers={"Authorization": f"Bearer {settings.dashscope_api_key}"},
            )
            task_response.raise_for_status()
            task_payload = _parse_json_response(task_response, "DashScope video task poll")
            output = task_payload.get("output", {})
            task_status = output.get("task_status")
            if task_status == "SUCCEEDED":
                video_url = output.get("video_url")
                if not video_url:
                    raise HTTPException(status_code=502, detail="DashScope video result missing")
                return model, video_url
            if task_status == "FAILED":
                raise HTTPException(
                    status_code=502,
                    detail=output.get("message") or "DashScope video generation failed",
                )
            await asyncio.sleep(5)

        raise HTTPException(status_code=504, detail="DashScope video generation timed out")
