from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.repositories import EjercicioRepository, RegistroRepository
from app.services import get_bedrock_service, BedrockService
from app.schemas import (
    ChatMessage,
    ChatResponse,
    RegistroCreate,
    RegistroResponse
)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/", response_model=ChatResponse)
async def process_chat_message(
    message: ChatMessage,
    session: AsyncSession = Depends(get_session),
    bedrock: BedrockService = Depends(get_bedrock_service)
):
    """
    Process natural language message and extract exercise data.
    
    Example: "Hoy búlgaras 3x10 con 12kg, dolor 2"
    """
    # Extract exercise data from message
    datos = await bedrock.extraer_datos_ejercicio(message.mensaje)
    
    if not datos:
        return ChatResponse(
            mensaje="No pude entender tu mensaje. Por favor, incluye el ejercicio, series, repeticiones, peso y nivel de dolor.",
            datos_extraidos=None,
            registro_guardado=False
        )
    
    # Get or create ejercicio
    ejercicio_repo = EjercicioRepository(session)
    ejercicio = await ejercicio_repo.get_or_create(
        nombre=datos.ejercicio,
        categoria="General"
    )
    
    # Create registro
    registro_repo = RegistroRepository(session)
    registro_data = RegistroCreate(
        ejercicio_nombre=datos.ejercicio,
        series=datos.series,
        reps=datos.reps,
        peso=datos.peso,
        dolor_intra=datos.dolor_intra
    )
    
    registro = await registro_repo.create(registro_data, ejercicio.id)
    
    # Get pain history and generate recommendation
    historial_dolor = await registro_repo.get_recent_dolor(ejercicio.id)
    volumen = registro.series * registro.reps * registro.peso
    
    recomendacion = await bedrock.generar_recomendacion(
        ejercicio=datos.ejercicio,
        dolor_actual=datos.dolor_intra,
        historial_dolor=historial_dolor,
        volumen_actual=volumen
    )
    
    return ChatResponse(
        mensaje=f"✅ Registro guardado: {datos.ejercicio} - {datos.series}x{datos.reps} @ {datos.peso}kg (Dolor: {datos.dolor_intra}/10)",
        datos_extraidos=datos,
        registro_guardado=True,
        recomendacion=recomendacion
    )
