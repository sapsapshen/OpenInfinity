import base64
import json
import logging

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from app.config import get_settings
from app.providers.image import generate_image
from app.providers.llm import click_to_subject, plan_page, rewrite_video_prompt
from app.providers.video import generate_video
from app.schemas import AnimateRequest, AnimateResponse, GenerateRequest, GenerateResponse

settings = get_settings()
logger = logging.getLogger(__name__)

app = FastAPI(title="OpenInfinity Backend", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _data_url_from_bytes(image_bytes: bytes, mime_type: str) -> str:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _image_fields_from_result(image_result) -> dict:
    """Return the image payload fields, preferring URL over data-URL."""
    if image_result.image_url:
        return {"image_url": image_result.image_url, "image_data_url": None}
    return {
        "image_url": None,
        "image_data_url": _data_url_from_bytes(image_result.image_bytes, image_result.mime_type),
    }


def _sse_event(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _detail_from_exception(exc: Exception) -> str:
    if isinstance(exc, HTTPException):
        if isinstance(exc.detail, str):
            return exc.detail
        return json.dumps(exc.detail, ensure_ascii=False)
    return str(exc) or "生成失败"


async def _generate_payload(request: GenerateRequest) -> GenerateResponse:
    subject = None
    style_anchor = request.parent_style
    effective_query = request.query

    if request.annotated_image_data_url and request.click:
        click_result = await click_to_subject(
            annotated_image_data_url=request.annotated_image_data_url,
            click=request.click,
            parent_title=request.parent_title,
            parent_facts=request.parent_facts,
            parent_prompt=request.parent_prompt,
        )
        subject = click_result.subject
        style_anchor = click_result.style
        effective_query = click_result.subject

    page_plan = await plan_page(
        query=effective_query,
        language=request.language,
        style_anchor=style_anchor,
        parent_title=request.parent_title,
        parent_facts=request.parent_facts,
    )
    image_result = await generate_image(
        prompt=page_plan.prompt,
        aspect_ratio=request.aspect_ratio,
        tier=request.image_tier,
    )
    final_prompt = image_result.revised_prompt or page_plan.prompt
    return GenerateResponse(
        session_id=request.session_id,
        parent_id=request.parent_id,
        query=effective_query,
        page_title=page_plan.page_title,
        prompt=page_plan.prompt,
        facts=page_plan.facts,
        final_prompt=final_prompt,
        aspect_ratio=request.aspect_ratio,
        image_model=image_result.model,
        image_mime_type=image_result.mime_type,
        **_image_fields_from_result(image_result),
        subject=subject,
        style_anchor=style_anchor,
        click_in_parent=request.click,
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
async def generate(request: GenerateRequest) -> GenerateResponse:
    return await _generate_payload(request)


@app.post("/sse/generate")
async def sse_generate(request: GenerateRequest) -> StreamingResponse:
    async def event_stream():
        try:
            subject = None
            style_anchor = request.parent_style
            effective_query = request.query

            if request.annotated_image_data_url and request.click:
                yield _sse_event(
                    "status",
                    {"stage": "understanding-click", "message": "正在理解点击区域"},
                )
                click_result = await click_to_subject(
                    annotated_image_data_url=request.annotated_image_data_url,
                    click=request.click,
                    parent_title=request.parent_title,
                    parent_facts=request.parent_facts,
                    parent_prompt=request.parent_prompt,
                )
                subject = click_result.subject
                style_anchor = click_result.style
                effective_query = click_result.subject

            yield _sse_event("status", {"stage": "planning", "message": "正在规划页面"})
            page_plan = await plan_page(
                query=effective_query,
                language=request.language,
                style_anchor=style_anchor,
                parent_title=request.parent_title,
                parent_facts=request.parent_facts,
            )

            yield _sse_event("status", {"stage": "generating-image", "message": "正在生成图片"})
            image_result = await generate_image(
                prompt=page_plan.prompt,
                aspect_ratio=request.aspect_ratio,
                tier=request.image_tier,
            )

            payload = GenerateResponse(
                session_id=request.session_id,
                parent_id=request.parent_id,
                query=effective_query,
                page_title=page_plan.page_title,
                prompt=page_plan.prompt,
                facts=page_plan.facts,
                final_prompt=image_result.revised_prompt or page_plan.prompt,
                aspect_ratio=request.aspect_ratio,
                image_model=image_result.model,
                image_mime_type=image_result.mime_type,
                **_image_fields_from_result(image_result),
                subject=subject,
                style_anchor=style_anchor,
                click_in_parent=request.click,
            )

            yield _sse_event("status", {"stage": "complete", "message": "图片已生成"})
            yield f"event: result\ndata: {payload.model_dump_json()}\n\n"
        except Exception as exc:
            logger.exception("SSE generate failed")
            yield _sse_event(
                "error",
                {"detail": _detail_from_exception(exc)},
            )
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/animate", response_model=AnimateResponse)
async def animate(request: AnimateRequest) -> AnimateResponse:
    final_prompt = await rewrite_video_prompt(
        page_title=request.page_title,
        facts=request.facts,
        prompt=request.prompt,
    )
    video_model, video_url = await generate_video(
        prompt=final_prompt,
        image_url=request.image_url,
        image_data_url=request.image_data_url,
        aspect_ratio=request.aspect_ratio,
        tier=request.video_tier,
    )
    return AnimateResponse(video_url=video_url, video_model=video_model, final_prompt=final_prompt)


@app.exception_handler(ValueError)
async def value_error_handler(_, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})
