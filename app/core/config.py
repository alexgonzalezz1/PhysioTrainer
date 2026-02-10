from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application configuration settings."""
    
    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/physiotrainer"
    
    # AWS Configuration
    aws_region: str = "us-east-1"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    
    # Application
    debug: bool = True
    secret_key: str = "your-secret-key-here"
    
    # AWS Bedrock Model (Claude 3.5 Sonnet)
    bedrock_model_id: str = "anthropic.claude-3-5-sonnet-20241022-v2:0"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
