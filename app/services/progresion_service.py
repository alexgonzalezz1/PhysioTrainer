from enum import Enum
from dataclasses import dataclass
from typing import Optional


class EstadoSemaforo(str, Enum):
    """Traffic light states for pain progression."""
    VERDE = "verde"
    AMARILLO = "amarillo"
    ROJO = "rojo"


@dataclass
class RecomendacionProgresion:
    """Progression recommendation based on pain levels."""
    estado: EstadoSemaforo
    mensaje: str
    accion: str
    porcentaje_cambio: Optional[float] = None


def calcular_estado_semaforo(dolor: int) -> EstadoSemaforo:
    """
    Calculate traffic light state based on pain level.
    
    Args:
        dolor: Pain level (0-10)
        
    Returns:
        Traffic light state
    """
    if dolor <= 3:
        return EstadoSemaforo.VERDE
    elif dolor <= 5:
        return EstadoSemaforo.AMARILLO
    else:
        return EstadoSemaforo.ROJO


def generar_recomendacion_progresion(
    dolor_actual: int,
    historial_dolor: list[int] = None,
    ejercicio: str = "el ejercicio"
) -> RecomendacionProgresion:
    """
    Generate progression recommendation based on pain levels.
    
    Implements the Traffic Light Rule:
    - GREEN (0-3): Good tolerance, suggest 5-10% increase
    - YELLOW (4-5): Limit load, suggest maintenance
    - RED (>5): Overload, suggest immediate regression
    
    Args:
        dolor_actual: Current pain level (0-10)
        historial_dolor: Recent pain history
        ejercicio: Exercise name for personalized message
        
    Returns:
        Progression recommendation
    """
    estado = calcular_estado_semaforo(dolor_actual)
    
    # Calculate trend if history available
    tendencia = None
    if historial_dolor and len(historial_dolor) >= 3:
        promedio_reciente = sum(historial_dolor[:3]) / 3
        promedio_anterior = sum(historial_dolor[3:6]) / 3 if len(historial_dolor) >= 6 else promedio_reciente
        tendencia = "mejorando" if promedio_reciente < promedio_anterior else "estable o empeorando"
    
    if estado == EstadoSemaforo.VERDE:
        mensaje = f"🟢 ¡Excelente tolerancia en {ejercicio}! "
        if tendencia == "mejorando":
            mensaje += "Tu progreso es muy positivo. "
        mensaje += "Tu cuerpo está respondiendo bien a la carga actual."
        
        return RecomendacionProgresion(
            estado=estado,
            mensaje=mensaje,
            accion="Puedes incrementar el volumen o intensidad un 5-10% en tu próxima sesión.",
            porcentaje_cambio=7.5  # Average of 5-10%
        )
    
    elif estado == EstadoSemaforo.AMARILLO:
        mensaje = f"🟡 Estás en zona límite con {ejercicio}. "
        mensaje += "El dolor indica que estás cerca del umbral de tolerancia."
        
        return RecomendacionProgresion(
            estado=estado,
            mensaje=mensaje,
            accion="Mantén la carga actual para consolidar la adaptación del tejido antes de progresar.",
            porcentaje_cambio=0
        )
    
    else:  # ROJO
        mensaje = f"🔴 Dolor elevado en {ejercicio}. "
        mensaje += "Esta carga está generando una respuesta excesiva."
        
        return RecomendacionProgresion(
            estado=estado,
            mensaje=mensaje,
            accion="Reduce la carga un 15-20% o considera una variante más sencilla del ejercicio.",
            porcentaje_cambio=-17.5  # Average of -15 to -20%
        )


def calcular_nueva_carga(
    carga_actual: float,
    dolor: int,
    es_peso: bool = True
) -> dict:
    """
    Calculate recommended new load based on pain level.
    
    Args:
        carga_actual: Current load (weight or volume)
        dolor: Current pain level
        es_peso: Whether the load is weight (True) or reps/sets (False)
        
    Returns:
        Dictionary with recommended changes
    """
    recomendacion = generar_recomendacion_progresion(dolor)
    
    if recomendacion.porcentaje_cambio is None or recomendacion.porcentaje_cambio == 0:
        nueva_carga = carga_actual
    else:
        factor = 1 + (recomendacion.porcentaje_cambio / 100)
        nueva_carga = carga_actual * factor
    
    # Round appropriately
    if es_peso:
        # Round to nearest 0.5 for weights
        nueva_carga = round(nueva_carga * 2) / 2
    else:
        # Round to integer for reps/sets
        nueva_carga = round(nueva_carga)
    
    return {
        "carga_actual": carga_actual,
        "carga_sugerida": nueva_carga,
        "cambio_porcentual": recomendacion.porcentaje_cambio,
        "estado": recomendacion.estado.value,
        "recomendacion": recomendacion.accion
    }


def evaluar_dolor_24h(dolor_intra: int, dolor_24h: int) -> dict:
    """
    Evaluate the 24h pain response compared to intra-exercise pain.
    
    Args:
        dolor_intra: Pain during exercise
        dolor_24h: Pain 24 hours after
        
    Returns:
        Evaluation with interpretation
    """
    diferencia = dolor_24h - dolor_intra
    
    if dolor_24h <= dolor_intra and dolor_24h <= 3:
        return {
            "interpretacion": "respuesta_optima",
            "mensaje": "✅ Excelente recuperación. El tejido toleró bien la carga.",
            "puede_progresar": True
        }
    elif dolor_24h <= dolor_intra + 1 and dolor_24h <= 5:
        return {
            "interpretacion": "respuesta_aceptable", 
            "mensaje": "⚠️ Respuesta inflamatoria moderada. Mantén la carga actual.",
            "puede_progresar": False
        }
    else:
        return {
            "interpretacion": "respuesta_excesiva",
            "mensaje": "🚨 Respuesta inflamatoria elevada. Considera reducir la carga.",
            "puede_progresar": False
        }
