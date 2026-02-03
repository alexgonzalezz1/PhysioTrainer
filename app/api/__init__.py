"""API routes for PhysioTrainer."""

from fastapi import APIRouter

from app.api.chat import router as chat_router
from app.api.ejercicios import router as ejercicios_router
from app.api.registros import router as registros_router
from app.api.informes import router as informes_router

# Main API router
api_router = APIRouter()

# Include all routers
api_router.include_router(chat_router)
api_router.include_router(ejercicios_router)
api_router.include_router(registros_router)
api_router.include_router(informes_router)

__all__ = ["api_router"]
