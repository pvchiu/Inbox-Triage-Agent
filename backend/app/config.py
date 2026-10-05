from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: str | None = None
    gemini_api_key: str | None = None
    groq_api_key: str | None = None
    model: str = "gemini-3.5-flash"
    google_client_id: str
    google_client_secret: str
    google_redirect_uri: str = "http://localhost:8000/auth/callback"
    frontend_url: str = "http://localhost:3000"
    database_url: str = "sqlite:///./triage.db"
    timezone: str = "Asia/Ho_Chi_Minh"
    auto_create_events: bool = False


settings = Settings()

