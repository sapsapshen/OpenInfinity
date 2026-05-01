import json
from typing import Any

from openai import AsyncOpenAI

from app.config import Settings, get_settings
from app.schemas import ClickPoint, ClickUnderstanding, PagePlan


def _extract_json(content: str) -> dict[str, Any]:
    stripped = content.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return json.loads(stripped)

    start = stripped.find("{")
    end = stripped.rfind("}")
    if start >= 0 and end > start:
        return json.loads(stripped[start : end + 1])

    raise ValueError("Model did not return JSON content")


def _text_client(settings: Settings) -> AsyncOpenAI:
    return AsyncOpenAI(api_key=settings.deepseek_api_key, base_url=settings.text_base_url)


def _vlm_client(settings: Settings) -> AsyncOpenAI:
    return AsyncOpenAI(api_key=settings.dashscope_api_key, base_url=settings.vlm_base_url)


async def plan_page(
    query: str,
    language: str,
    style_anchor: str | None = None,
    parent_title: str | None = None,
    parent_facts: list[str] | None = None,
) -> PagePlan:
    settings = get_settings()
    client = _text_client(settings)
    parent_fact_lines = "\n".join(f"- {fact}" for fact in (parent_facts or [])) or "- 无"
    style_line = style_anchor or "保持说明型页面风格统一，带清晰标签和注释。"
    parent_title_line = parent_title or "无"

    system_prompt = (
        "你是一个为 AI 无限翻页产品规划单页内容的策展编辑。"
        "你必须输出 JSON 对象，字段固定为 page_title、prompt、facts。"
        "其中："
        "1) page_title 简洁、适合作为页面标题；"
        "2) prompt 必须用英文，面向图像模型，生成带标注、带说明、信息密度高、适合点击探索的说明型页面；"
        "3) facts 必须是 3 到 6 条，适合直接出现在图片中的中文或指定语言知识标签。"
    )

    user_prompt = (
        f"主题：{query}\n"
        f"输出语言：{language}\n"
        f"父页面标题：{parent_title_line}\n"
        f"父页面事实：\n{parent_fact_lines}\n"
        f"风格锚点：{style_line}\n\n"
        "请生成一个适合无限翻页探索的下一页。"
        "要求：画面不是普通插画，而是带标题、局部标注、解释性标签、视觉层级清晰的单页知识图片；"
        "prompt 中要显式要求 diagram-like annotated educational poster / labeled scene / readable callouts / rich composition；"
        "如果存在风格锚点，要在 prompt 中保持它。"
    )

    response = await client.chat.completions.create(
        model=settings.text_model,
        response_format={"type": "json_object"},
        temperature=0.7,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = response.choices[0].message.content or ""
    payload = _extract_json(content)
    return PagePlan.model_validate(payload)


async def click_to_subject(
    annotated_image_data_url: str,
    click: ClickPoint,
    parent_title: str | None,
    parent_facts: list[str] | None,
    parent_prompt: str | None,
) -> ClickUnderstanding:
    settings = get_settings()
    client = _vlm_client(settings)
    parent_facts_text = "\n".join(f"- {fact}" for fact in (parent_facts or [])) or "- 无"

    instruction = (
        "你正在分析一张可点击的说明型图片。图上已经用红色十字标出用户点击位置。"
        "请只围绕十字附近目标，输出 JSON："
        '{"subject":"用户点中的具体对象或主题","style":"当前页面的视觉风格总结"}'
        "其中 subject 要尽量具体，style 要概括这页图的视觉语言、配色、布局、标注方式。"
        f"\n点击归一化坐标：x={click.x:.4f}, y={click.y:.4f}"
        f"\n父页面标题：{parent_title or '无'}"
        f"\n父页面事实：\n{parent_facts_text}"
        f"\n父页面提示词：{parent_prompt or '无'}"
    )

    response = await client.chat.completions.create(
        model=settings.vlm_model,
        temperature=0.2,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {"type": "image_url", "image_url": {"url": annotated_image_data_url}},
                ],
            }
        ],
    )
    content = response.choices[0].message.content or ""
    payload = _extract_json(content)
    return ClickUnderstanding.model_validate(payload)


async def rewrite_video_prompt(page_title: str, facts: list[str], prompt: str) -> str:
    settings = get_settings()
    if not settings.animate_prompt_rewrite:
        return prompt

    client = _text_client(settings)
    fact_lines = "\n".join(f"- {fact}" for fact in facts) or "- 无"
    response = await client.chat.completions.create(
        model=settings.text_model,
        temperature=0.5,
        messages=[
            {
                "role": "system",
                "content": "你要把页面生图提示词改写成简洁的视频运动提示词。只输出纯文本，不要 JSON。",
            },
            {
                "role": "user",
                "content": (
                    f"页面标题：{page_title}\n"
                    f"页面要点：\n{fact_lines}\n"
                    f"原始生图提示词：{prompt}\n\n"
                    "请改写成图生视频 prompt，要求保留主体和风格，加入轻微镜头运动、局部动态、氛围变化，"
                    "避免大幅变形，长度控制在 120 英文词以内。"
                ),
            },
        ],
    )
    return (response.choices[0].message.content or prompt).strip()

