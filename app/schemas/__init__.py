"""Pydantic schemas for API requests and responses."""

from app.schemas.schemas import (
    EjercicioExtraido,
    ChatMessage,
    ChatResponse,
    RecomendacionProgresion,
    RegistroCreate,
    RegistroUpdate,
    RegistroResponse,
    EjercicioCreate,
    EjercicioResponse,
    TendenciaData,
    InformeMensual
)

__all__ = [
    "EjercicioExtraido",
    "ChatMessage", 
    "ChatResponse",
    "RecomendacionProgresion",
    "RegistroCreate",
    "RegistroUpdate",
    "RegistroResponse",
    "EjercicioCreate",
    "EjercicioResponse",
    "TendenciaData",
    "InformeMensual"
]
