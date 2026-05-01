from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    deepseek_api_key: str = Field(alias="DEEPSEEK_API_KEY")
    dashscope_api_key: str = Field(alias="DASHSCOPE_API_KEY")

    text_base_url: str = Field(default="https://api.deepseek.com", alias="TEXT_BASE_URL")
    text_model: str = Field(default="deepseek-v4-flash", alias="TEXT_MODEL")
    text_enable_web_search: bool = Field(default=False, alias="TEXT_ENABLE_WEB_SEARCH")

    vlm_base_url: str = Field(
        default="https://dashscope.aliyuncs.com/compatible-mode/v1",
        alias="VLM_BASE_URL",
    )
    vlm_model: str = Field(default="qwen-vl-max-latest", alias="VLM_MODEL")

    dashscope_base_url: str = Field(
        default="https://dashscope.aliyuncs.com/api/v1",
        alias="DASHSCOPE_BASE_URL",
    )
    image_tier: str = Field(default="balanced", alias="IMAGE_TIER")
    dashscope_image_model_fast: str = Field(
        default="wanx2.1-t2i-turbo",
        alias="DASHSCOPE_IMAGE_MODEL_FAST",
    )
    dashscope_image_model_balanced: str = Field(
        default="wanx2.1-t2i-plus",
        alias="DASHSCOPE_IMAGE_MODEL_BALANCED",
    )
    dashscope_image_model_pro: str = Field(
        default="wanx2.1-t2i-max",
        alias="DASHSCOPE_IMAGE_MODEL_PRO",
    )

    video_tier: str = Field(default="fast", alias="VIDEO_TIER")
    dashscope_video_model_fast: str = Field(
        default="wanx2.1-i2v-turbo",
        alias="DASHSCOPE_VIDEO_MODEL_FAST",
    )
    dashscope_video_model_balanced: str = Field(
        default="wanx2.1-i2v-plus",
        alias="DASHSCOPE_VIDEO_MODEL_BALANCED",
    )
    dashscope_video_model_pro: str = Field(
        default="wanx2.1-i2v-max",
        alias="DASHSCOPE_VIDEO_MODEL_PRO",
    )
    animate_prompt_rewrite: bool = Field(default=True, alias="ANIMATE_PROMPT_REWRITE")

    cors_origins: str = Field(default="http://localhost:3000", alias="CORS_ORIGINS")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    def image_model_for_tier(self, tier: str | None) -> str:
        resolved = (tier or self.image_tier).lower()
        if resolved == "fast":
            return self.dashscope_image_model_fast
        if resolved == "pro":
            return self.dashscope_image_model_pro
        return self.dashscope_image_model_balanced

    def video_model_for_tier(self, tier: str | None) -> str:
        resolved = (tier or self.video_tier).lower()
        if resolved == "balanced":
            return self.dashscope_video_model_balanced
        if resolved == "pro":
            return self.dashscope_video_model_pro
        return self.dashscope_video_model_fast


@lru_cache
def get_settings() -> Settings:
    return Settings()

