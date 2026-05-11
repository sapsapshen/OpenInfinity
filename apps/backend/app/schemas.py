from typing import Literal

from pydantic import BaseModel, Field


class ClickPoint(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class GenerateRequest(BaseModel):
    query: str = Field(min_length=1)
    session_id: str | None = None
    parent_id: str | None = None
    parent_title: str | None = None
    parent_facts: list[str] = Field(default_factory=list)
    parent_prompt: str | None = None
    parent_style: str | None = None
    annotated_image_data_url: str | None = None
    click: ClickPoint | None = None
    aspect_ratio: Literal["1:1", "4:3", "3:4", "16:9", "9:16"] = "16:9"
    image_tier: Literal["fast", "balanced", "pro"] = "balanced"
    language: str = "zh-CN"


class PagePlan(BaseModel):
    page_title: str
    prompt: str
    facts: list[str]


class ClickUnderstanding(BaseModel):
    subject: str
    style: str


class GenerateResponse(BaseModel):
    session_id: str | None = None
    parent_id: str | None = None
    query: str
    page_title: str
    prompt: str
    facts: list[str]
    final_prompt: str
    aspect_ratio: str
    image_model: str
    image_mime_type: str
    # Exactly one of these will be set — prefer image_url when available
    image_data_url: str | None = None
    image_url: str | None = None
    subject: str | None = None
    style_anchor: str | None = None
    click_in_parent: ClickPoint | None = None


class AnimateRequest(BaseModel):
    image_url: str | None = None
    image_data_url: str | None = None
    prompt: str
    page_title: str
    facts: list[str] = Field(default_factory=list)
    aspect_ratio: Literal["1:1", "4:3", "3:4", "16:9", "9:16"] = "16:9"
    video_tier: Literal["fast", "balanced", "pro"] = "fast"


class AnimateResponse(BaseModel):
    video_url: str
    video_model: str
    final_prompt: str

