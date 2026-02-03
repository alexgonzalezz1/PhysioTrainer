from sqlmodel import SQLModel, Field, Relationship
from typing import List, Optional
from datetime import datetime
import uuid


def generate_uuid() -> str:
    """Generate a unique UUID string."""
    return str(uuid.uuid4())


class Ejercicio(SQLModel, table=True):
    """Exercise model for tracking different rehabilitation exercises."""
    
    __tablename__ = "ejercicios"
    
    id: Optional[str] = Field(default_factory=generate_uuid, primary_key=True)
    nombre: str = Field(index=True, unique=True, description="Nombre único del ejercicio")
    categoria: str = Field(description="Categoría del ejercicio (ej: fuerza, movilidad)")
    umbral_dolor_max: int = Field(default=4, description="Umbral máximo de dolor aceptable (0-10)")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Relationship to registros
    registros: List["Registro"] = Relationship(back_populates="ejercicio")
    
    class Config:
        json_schema_extra = {
            "example": {
                "nombre": "Sentadilla Búlgara",
                "categoria": "Fuerza",
                "umbral_dolor_max": 4
            }
        }


class Registro(SQLModel, table=True):
    """Training session record with pain tracking."""
    
    __tablename__ = "registros"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    fecha: datetime = Field(default_factory=datetime.utcnow, description="Fecha y hora del registro")
    series: int = Field(ge=1, description="Número de series realizadas")
    reps: int = Field(ge=1, description="Número de repeticiones por serie")
    peso: float = Field(ge=0, description="Peso utilizado en kg")
    dolor_intra: int = Field(ge=0, le=10, description="Dolor durante el ejercicio (0-10)")
    dolor_24h: Optional[int] = Field(default=None, ge=0, le=10, description="Dolor a las 24h (0-10)")
    notas: Optional[str] = Field(default=None, description="Notas adicionales sobre la sesión")
    
    # Foreign key
    ejercicio_id: str = Field(foreign_key="ejercicios.id")
    
    # Relationship to ejercicio
    ejercicio: Ejercicio = Relationship(back_populates="registros")
    
    @property
    def volumen_total(self) -> float:
        """Calculate total volume (series × reps × weight)."""
        return self.series * self.reps * self.peso
    
    class Config:
        json_schema_extra = {
            "example": {
                "series": 3,
                "reps": 10,
                "peso": 12.0,
                "dolor_intra": 2,
                "dolor_24h": None,
                "notas": "Buena sesión, sin molestias"
            }
        }
