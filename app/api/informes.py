from fastapi import APIRouter, Depends, Query, HTTPException, Path
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
from typing import List

from app.db import get_session
from app.repositories import RegistroRepository
from app.services import get_gemini_service, GeminiService
from app.schemas import TendenciaData, InformeMensual

router = APIRouter(prefix="/informes", tags=["informes"])


@router.get("/tendencias/{ejercicio_id}", response_model=List[TendenciaData])
async def get_tendencias(
    ejercicio_id: str,
    limit: int = Query(default=30, le=100),
    session: AsyncSession = Depends(get_session)
):
    """Get trend data for a specific ejercicio (for charts)."""
    repo = RegistroRepository(session)
    registros = await repo.get_by_ejercicio(ejercicio_id, limit=limit)
    
    return [
        TendenciaData(
            fecha=r.fecha,
            volumen_total=r.series * r.reps * r.peso,
            dolor_intra=r.dolor_intra,
            dolor_24h=r.dolor_24h
        )
        for r in reversed(registros)  # Chronological order
    ]


@router.get("/mensual/{year}/{month}", response_model=InformeMensual)
async def get_monthly_report(
    year: int = Path(...),
    month: int = Path(..., ge=1, le=12),
    session: AsyncSession = Depends(get_session),
    gemini: GeminiService = Depends(get_gemini_service)
):
    """Generate monthly executive report with AI analysis."""
    if year < 2020 or year > 2030:
        raise HTTPException(status_code=400, detail="Año fuera de rango válido")
    
    repo = RegistroRepository(session)
    registros = await repo.get_monthly_data(year, month)
    
    if not registros:
        raise HTTPException(
            status_code=404, 
            detail="No hay registros para el período seleccionado"
        )
    
    # Prepare data for AI analysis
    ejercicios_set = set()
    datos_para_ia = []
    tendencias = []
    
    for r in registros:
        ejercicios_set.add(r.ejercicio.nombre)
        volumen = r.series * r.reps * r.peso
        
        datos_para_ia.append({
            "fecha": r.fecha.isoformat(),
            "ejercicio": r.ejercicio.nombre,
            "volumen": volumen,
            "dolor_intra": r.dolor_intra,
            "dolor_24h": r.dolor_24h
        })
        
        tendencias.append(TendenciaData(
            fecha=r.fecha,
            volumen_total=volumen,
            dolor_intra=r.dolor_intra,
            dolor_24h=r.dolor_24h
        ))
    
    # Generate AI summary
    periodo = f"{month:02d}/{year}"
    resumen = await gemini.generar_informe_mensual(datos_para_ia, periodo)
    
    return InformeMensual(
        periodo=periodo,
        ejercicios_analizados=len(ejercicios_set),
        total_sesiones=len(registros),
        resumen=resumen,
        tendencias=tendencias
    )


@router.get("/estadisticas")
async def get_estadisticas_generales(
    session: AsyncSession = Depends(get_session)
):
    """Get general statistics."""
    repo = RegistroRepository(session)
    
    # Get all registros
    registros = await repo.get_all(limit=1000)
    pendientes = await repo.get_pending_dolor_24h()
    
    if not registros:
        return {
            "total_registros": 0,
            "pendientes_dolor_24h": 0,
            "promedio_dolor_intra": 0,
            "ultimo_registro": None
        }
    
    dolor_total = sum(r.dolor_intra for r in registros)
    
    return {
        "total_registros": len(registros),
        "pendientes_dolor_24h": len(pendientes),
        "promedio_dolor_intra": round(dolor_total / len(registros), 2),
        "ultimo_registro": registros[0].fecha if registros else None
    }
