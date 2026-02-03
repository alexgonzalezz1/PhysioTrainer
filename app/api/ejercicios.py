from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.db import get_session
from app.repositories import EjercicioRepository
from app.schemas import EjercicioCreate, EjercicioResponse

router = APIRouter(prefix="/ejercicios", tags=["ejercicios"])


@router.get("/", response_model=List[EjercicioResponse])
async def get_all_ejercicios(
    session: AsyncSession = Depends(get_session)
):
    """Get all ejercicios."""
    repo = EjercicioRepository(session)
    ejercicios = await repo.get_all()
    return ejercicios


@router.get("/{ejercicio_id}", response_model=EjercicioResponse)
async def get_ejercicio(
    ejercicio_id: str,
    session: AsyncSession = Depends(get_session)
):
    """Get ejercicio by ID."""
    repo = EjercicioRepository(session)
    ejercicio = await repo.get_by_id(ejercicio_id)
    
    if not ejercicio:
        raise HTTPException(status_code=404, detail="Ejercicio no encontrado")
    
    return ejercicio


@router.post("/", response_model=EjercicioResponse, status_code=201)
async def create_ejercicio(
    data: EjercicioCreate,
    session: AsyncSession = Depends(get_session)
):
    """Create new ejercicio."""
    repo = EjercicioRepository(session)
    
    # Check if already exists
    existing = await repo.get_by_nombre(data.nombre)
    if existing:
        raise HTTPException(
            status_code=400, 
            detail="Ya existe un ejercicio con ese nombre"
        )
    
    ejercicio = await repo.create(data)
    return ejercicio


@router.get("/buscar/{nombre}", response_model=EjercicioResponse)
async def search_ejercicio_by_name(
    nombre: str,
    session: AsyncSession = Depends(get_session)
):
    """Search ejercicio by name."""
    repo = EjercicioRepository(session)
    ejercicio = await repo.get_by_nombre(nombre)
    
    if not ejercicio:
        raise HTTPException(status_code=404, detail="Ejercicio no encontrado")
    
    return ejercicio
