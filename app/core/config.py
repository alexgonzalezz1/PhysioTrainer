from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application configuration settings."""
    
    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/physiotrainer"
    
    # Google Cloud
    gcp_project_id: str = "your-gcp-project-id"
    gcp_location: str = "us-central1"
    
    # Application
    debug: bool = True
    secret_key: str = "your-secret-key-here"
    
    # Gemini Model
    gemini_model: str = "gemini-1.5-flash"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
