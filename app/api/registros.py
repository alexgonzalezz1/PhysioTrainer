from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from app.db import get_session
from app.repositories import RegistroRepository, EjercicioRepository
from app.schemas import (
    RegistroCreate, 
    RegistroResponse, 
    RegistroUpdate
)

router = APIRouter(prefix="/registros", tags=["registros"])


@router.get("/", response_model=List[RegistroResponse])
async def get_all_registros(
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    session: AsyncSession = Depends(get_session)
):
    """Get all registros with pagination."""
    repo = RegistroRepository(session)
    registros = await repo.get_all(limit=limit, offset=offset)
    
    return [
        RegistroResponse(
            id=r.id,
            fecha=r.fecha,
            series=r.series,
            reps=r.reps,
            peso=r.peso,
            dolor_intra=r.dolor_intra,
            dolor_24h=r.dolor_24h,
            notas=r.notas,
            ejercicio_nombre=r.ejercicio.nombre,
            volumen_total=r.series * r.reps * r.peso
        )
        for r in registros
    ]


@router.get("/pendientes", response_model=List[RegistroResponse])
async def get_pending_dolor_24h(
    session: AsyncSession = Depends(get_session)
):
    """Get registros pending dolor_24h update (more than 24h old)."""
    repo = RegistroRepository(session)
    registros = await repo.get_pending_dolor_24h()
    
    return [
        RegistroResponse(
            id=r.id,
            fecha=r.fecha,
            series=r.series,
            reps=r.reps,
            peso=r.peso,
            dolor_intra=r.dolor_intra,
            dolor_24h=r.dolor_24h,
            notas=r.notas,
            ejercicio_nombre=r.ejercicio.nombre,
            volumen_total=r.series * r.reps * r.peso
        )
        for r in registros
    ]


@router.get("/ejercicio/{ejercicio_id}", response_model=List[RegistroResponse])
async def get_registros_by_ejercicio(
    ejercicio_id: str,
    limit: int = Query(default=50, le=200),
    session: AsyncSession = Depends(get_session)
):
    """Get registros for a specific ejercicio."""
    repo = RegistroRepository(session)
    registros = await repo.get_by_ejercicio(ejercicio_id, limit=limit)
    
    return [
        RegistroResponse(
            id=r.id,
            fecha=r.fecha,
            series=r.series,
            reps=r.reps,
            peso=r.peso,
            dolor_intra=r.dolor_intra,
            dolor_24h=r.dolor_24h,
            notas=r.notas,
            ejercicio_nombre=r.ejercicio.nombre,
            volumen_total=r.series * r.reps * r.peso
        )
        for r in registros
    ]


@router.get("/{registro_id}", response_model=RegistroResponse)
async def get_registro(
    registro_id: int,
    session: AsyncSession = Depends(get_session)
):
    """Get registro by ID."""
    repo = RegistroRepository(session)
    registro = await repo.get_by_id(registro_id)
    
    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    return RegistroResponse(
        id=registro.id,
        fecha=registro.fecha,
        series=registro.series,
        reps=registro.reps,
        peso=registro.peso,
        dolor_intra=registro.dolor_intra,
        dolor_24h=registro.dolor_24h,
        notas=registro.notas,
        ejercicio_nombre=registro.ejercicio.nombre,
        volumen_total=registro.series * registro.reps * registro.peso
    )


@router.post("/", response_model=RegistroResponse, status_code=201)
async def create_registro(
    data: RegistroCreate,
    session: AsyncSession = Depends(get_session)
):
    """Create new registro."""
    ejercicio_repo = EjercicioRepository(session)
    registro_repo = RegistroRepository(session)
    
    # Get or create ejercicio
    ejercicio = await ejercicio_repo.get_or_create(
        nombre=data.ejercicio_nombre,
        categoria="General"
    )
    
    registro = await registro_repo.create(data, ejercicio.id)
    
    return RegistroResponse(
        id=registro.id,
        fecha=registro.fecha,
        series=registro.series,
        reps=registro.reps,
        peso=registro.peso,
        dolor_intra=registro.dolor_intra,
        dolor_24h=registro.dolor_24h,
        notas=registro.notas,
        ejercicio_nombre=ejercicio.nombre,
        volumen_total=registro.series * registro.reps * registro.peso
    )


@router.patch("/{registro_id}/dolor-24h", response_model=RegistroResponse)
async def update_dolor_24h(
    registro_id: int,
    data: RegistroUpdate,
    session: AsyncSession = Depends(get_session)
):
    """Update dolor_24h for a registro."""
    repo = RegistroRepository(session)
    registro = await repo.update_dolor_24h(registro_id, data.dolor_24h)
    
    if not registro:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    
    return RegistroResponse(
        id=registro.id,
        fecha=registro.fecha,
        series=registro.series,
        reps=registro.reps,
        peso=registro.peso,
        dolor_intra=registro.dolor_intra,
        dolor_24h=registro.dolor_24h,
        notas=registro.notas,
        ejercicio_nombre=registro.ejercicio.nombre,
        volumen_total=registro.series * registro.reps * registro.peso
    )
