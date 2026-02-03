from typing import Optional
from datetime import datetime, timedelta
from sqlmodel import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Ejercicio, Registro
from app.schemas import EjercicioCreate, RegistroCreate


class EjercicioRepository:
    """Repository for Ejercicio CRUD operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def get_by_id(self, ejercicio_id: str) -> Optional[Ejercicio]:
        """Get ejercicio by ID."""
        result = await self.session.execute(
            select(Ejercicio).where(Ejercicio.id == ejercicio_id)
        )
        return result.scalar_one_or_none()
    
    async def get_by_nombre(self, nombre: str) -> Optional[Ejercicio]:
        """Get ejercicio by name (case-insensitive)."""
        result = await self.session.execute(
            select(Ejercicio).where(Ejercicio.nombre.ilike(nombre))
        )
        return result.scalar_one_or_none()
    
    async def get_all(self) -> list[Ejercicio]:
        """Get all ejercicios."""
        result = await self.session.execute(select(Ejercicio))
        return result.scalars().all()
    
    async def create(self, data: EjercicioCreate) -> Ejercicio:
        """Create new ejercicio."""
        ejercicio = Ejercicio(**data.model_dump())
        self.session.add(ejercicio)
        await self.session.flush()
        await self.session.refresh(ejercicio)
        return ejercicio
    
    async def get_or_create(self, nombre: str, categoria: str = "General") -> Ejercicio:
        """Get existing ejercicio or create new one."""
        ejercicio = await self.get_by_nombre(nombre)
        if not ejercicio:
            ejercicio = await self.create(EjercicioCreate(
                nombre=nombre,
                categoria=categoria
            ))
        return ejercicio


class RegistroRepository:
    """Repository for Registro CRUD operations."""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def get_by_id(self, registro_id: int) -> Optional[Registro]:
        """Get registro by ID."""
        result = await self.session.execute(
            select(Registro).where(Registro.id == registro_id)
        )
        return result.scalar_one_or_none()
    
    async def get_all(self, limit: int = 100, offset: int = 0) -> list[Registro]:
        """Get all registros with pagination."""
        result = await self.session.execute(
            select(Registro)
            .order_by(Registro.fecha.desc())
            .offset(offset)
            .limit(limit)
        )
        return result.scalars().all()
    
    async def get_by_ejercicio(
        self, 
        ejercicio_id: str, 
        limit: int = 50
    ) -> list[Registro]:
        """Get registros for a specific ejercicio."""
        result = await self.session.execute(
            select(Registro)
            .where(Registro.ejercicio_id == ejercicio_id)
            .order_by(Registro.fecha.desc())
            .limit(limit)
        )
        return result.scalars().all()
    
    async def get_pending_dolor_24h(self) -> list[Registro]:
        """Get registros where dolor_24h is null and more than 24h old."""
        cutoff = datetime.utcnow() - timedelta(hours=24)
        result = await self.session.execute(
            select(Registro)
            .where(Registro.dolor_24h == None)
            .where(Registro.fecha < cutoff)
            .order_by(Registro.fecha.desc())
        )
        return result.scalars().all()
    
    async def get_recent_dolor(
        self, 
        ejercicio_id: str, 
        days: int = 14
    ) -> list[int]:
        """Get recent pain levels for an ejercicio."""
        cutoff = datetime.utcnow() - timedelta(days=days)
        result = await self.session.execute(
            select(Registro.dolor_intra)
            .where(Registro.ejercicio_id == ejercicio_id)
            .where(Registro.fecha > cutoff)
            .order_by(Registro.fecha.desc())
        )
        return [r for r in result.scalars().all()]
    
    async def create(
        self, 
        data: RegistroCreate, 
        ejercicio_id: str
    ) -> Registro:
        """Create new registro."""
        registro = Registro(
            series=data.series,
            reps=data.reps,
            peso=data.peso,
            dolor_intra=data.dolor_intra,
            notas=data.notas,
            ejercicio_id=ejercicio_id
        )
        self.session.add(registro)
        await self.session.flush()
        await self.session.refresh(registro)
        return registro
    
    async def update_dolor_24h(
        self, 
        registro_id: int, 
        dolor_24h: int
    ) -> Optional[Registro]:
        """Update dolor_24h for a registro."""
        registro = await self.get_by_id(registro_id)
        if registro:
            registro.dolor_24h = dolor_24h
            await self.session.flush()
            await self.session.refresh(registro)
        return registro
    
    async def get_monthly_data(
        self, 
        year: int, 
        month: int
    ) -> list[Registro]:
        """Get all registros for a specific month."""
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)
        
        result = await self.session.execute(
            select(Registro)
            .where(Registro.fecha >= start_date)
            .where(Registro.fecha < end_date)
            .order_by(Registro.fecha)
        )
        return result.scalars().all()
