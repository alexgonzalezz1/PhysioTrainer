from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class EjercicioExtraido(BaseModel):
    """Schema for exercise data extracted from natural language."""
    ejercicio: str = Field(description="Nombre del ejercicio")
    series: int = Field(ge=1, description="Número de series")
    reps: int = Field(ge=1, description="Número de repeticiones")
    peso: float = Field(ge=0, description="Peso en kg")
    dolor_intra: int = Field(ge=0, le=10, alias="dolorIntra", description="Dolor durante ejercicio (0-10)")
    
    class Config:
        populate_by_name = True


class ChatMessage(BaseModel):
    """Schema for chat messages."""
    mensaje: str = Field(description="Mensaje del usuario en lenguaje natural")


class ChatResponse(BaseModel):
    """Schema for chat response."""
    mensaje: str = Field(description="Respuesta del asistente")
    datos_extraidos: Optional[EjercicioExtraido] = Field(default=None, description="Datos extraídos del mensaje")
    registro_guardado: bool = Field(default=False, description="Si se guardó un registro")
    recomendacion: Optional[str] = Field(default=None, description="Recomendación basada en el dolor")


class RecomendacionProgresion(BaseModel):
    """Schema for progression recommendations."""
    estado: str = Field(description="Estado del semáforo: verde, amarillo, rojo")
    mensaje: str = Field(description="Mensaje de recomendación")
    accion_sugerida: str = Field(description="Acción sugerida para la siguiente sesión")
    porcentaje_cambio: Optional[float] = Field(default=None, description="Porcentaje de cambio sugerido")


class RegistroCreate(BaseModel):
    """Schema for creating a new registro."""
    ejercicio_nombre: str = Field(description="Nombre del ejercicio")
    series: int = Field(ge=1)
    reps: int = Field(ge=1)
    peso: float = Field(ge=0)
    dolor_intra: int = Field(ge=0, le=10)
    notas: Optional[str] = None


class RegistroUpdate(BaseModel):
    """Schema for updating dolor_24h."""
    dolor_24h: int = Field(ge=0, le=10, description="Dolor a las 24 horas")


class RegistroResponse(BaseModel):
    """Schema for registro response."""
    id: int
    fecha: datetime
    series: int
    reps: int
    peso: float
    dolor_intra: int
    dolor_24h: Optional[int]
    notas: Optional[str]
    ejercicio_nombre: str
    volumen_total: float
    
    class Config:
        from_attributes = True


class EjercicioCreate(BaseModel):
    """Schema for creating a new ejercicio."""
    nombre: str
    categoria: str
    umbral_dolor_max: int = Field(default=4, ge=0, le=10)


class EjercicioResponse(BaseModel):
    """Schema for ejercicio response."""
    id: str
    nombre: str
    categoria: str
    umbral_dolor_max: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class TendenciaData(BaseModel):
    """Schema for trend data."""
    fecha: datetime
    volumen_total: float
    dolor_intra: int
    dolor_24h: Optional[int]


class InformeMensual(BaseModel):
    """Schema for monthly report."""
    periodo: str
    ejercicios_analizados: int
    total_sesiones: int
    resumen: str
    tendencias: list[TendenciaData]
