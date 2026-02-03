import json
import re
from typing import Optional
import vertexai
from vertexai.generative_models import GenerativeModel, Part, GenerationConfig

from app.core.config import get_settings
from app.schemas import EjercicioExtraido

settings = get_settings()


class GeminiService:
    """Service for interacting with Vertex AI Gemini model."""
    
    def __init__(self):
        """Initialize Vertex AI and Gemini model."""
        vertexai.init(
            project=settings.gcp_project_id,
            location=settings.gcp_location
        )
        self.model = GenerativeModel(settings.gemini_model)
        
    async def extraer_datos_ejercicio(self, mensaje: str) -> Optional[EjercicioExtraido]:
        """
        Extract exercise data from natural language input.
        
        Args:
            mensaje: Natural language message from user
            
        Returns:
            Extracted exercise data or None if extraction fails
        """
        prompt = f"""Eres un asistente de rehabilitación funcional. Tu tarea es extraer información de entrenamiento del siguiente mensaje del usuario.

Mensaje del usuario: "{mensaje}"

Extrae los siguientes datos y devuélvelos ÚNICAMENTE en formato JSON estricto (sin markdown, sin explicaciones):
{{
    "ejercicio": "nombre del ejercicio",
    "series": número de series,
    "reps": número de repeticiones,
    "peso": peso en kg (número decimal),
    "dolorIntra": nivel de dolor durante el ejercicio (0-10)
}}

Si algún dato no está presente o no puedes extraerlo, usa estos valores por defecto:
- series: 1
- reps: 1  
- peso: 0.0
- dolorIntra: 0

Reglas:
- "búlgaras" = "Sentadilla Búlgara"
- "3x10" significa 3 series de 10 repeticiones
- "dolor 2" o "d2" significa dolorIntra = 2
- El peso siempre en kg

Responde SOLO con el JSON, sin texto adicional."""

        generation_config = GenerationConfig(
            temperature=0.1,
            max_output_tokens=500,
        )
        
        try:
            response = self.model.generate_content(
                prompt,
                generation_config=generation_config
            )
            
            # Parse JSON response
            json_text = response.text.strip()
            # Remove markdown code blocks if present
            json_text = re.sub(r'^```json\s*', '', json_text)
            json_text = re.sub(r'\s*```$', '', json_text)
            
            data = json.loads(json_text)
            return EjercicioExtraido(**data)
            
        except Exception as e:
            print(f"Error extracting exercise data: {e}")
            return None
    
    async def generar_recomendacion(
        self, 
        ejercicio: str, 
        dolor_actual: int,
        historial_dolor: list[int],
        volumen_actual: float
    ) -> str:
        """
        Generate progression recommendation based on pain levels.
        
        Args:
            ejercicio: Exercise name
            dolor_actual: Current pain level
            historial_dolor: Recent pain history
            volumen_actual: Current training volume
            
        Returns:
            Recommendation message
        """
        dolor_promedio = sum(historial_dolor) / len(historial_dolor) if historial_dolor else dolor_actual
        
        prompt = f"""Eres un fisioterapeuta experto en rehabilitación funcional. Genera una recomendación breve y profesional basada en:

Ejercicio: {ejercicio}
Dolor actual (0-10): {dolor_actual}
Dolor promedio reciente: {dolor_promedio:.1f}
Volumen actual: {volumen_actual}

Usa la Regla del Semáforo:
- VERDE (Dolor 0-3): Buena tolerancia. Sugiere incremento del 5-10% en volumen o intensidad.
- AMARILLO (Dolor 4-5): Carga límite. Sugiere mantener carga para consolidar adaptación.
- ROJO (Dolor > 5): Sobrecarga. Sugiere regresión inmediata (reducir peso/series o variante más sencilla).

Responde en español, de forma concisa y motivadora (máximo 2-3 oraciones)."""

        generation_config = GenerationConfig(
            temperature=0.7,
            max_output_tokens=200,
        )
        
        try:
            response = self.model.generate_content(
                prompt,
                generation_config=generation_config
            )
            return response.text.strip()
        except Exception as e:
            print(f"Error generating recommendation: {e}")
            return self._recomendacion_fallback(dolor_actual)
    
    def _recomendacion_fallback(self, dolor: int) -> str:
        """Fallback recommendation when AI is unavailable."""
        if dolor <= 3:
            return "🟢 Buena tolerancia. Puedes considerar incrementar la carga un 5-10% en tu próxima sesión."
        elif dolor <= 5:
            return "🟡 Estás en el límite. Mantén la carga actual para consolidar la adaptación del tejido."
        else:
            return "🔴 Dolor elevado. Reduce la carga o considera una variante más sencilla del ejercicio."
    
    async def generar_informe_mensual(
        self,
        datos_ejercicios: list[dict],
        periodo: str
    ) -> str:
        """
        Generate monthly executive summary report.
        
        Args:
            datos_ejercicios: List of exercise data with volumes and pain
            periodo: Month/year string
            
        Returns:
            Executive summary text
        """
        datos_str = json.dumps(datos_ejercicios, indent=2, ensure_ascii=False, default=str)
        
        prompt = f"""Eres un fisioterapeuta experto. Genera un informe ejecutivo mensual de rehabilitación.

Período: {periodo}
Datos de entrenamiento:
{datos_str}

El informe debe incluir:
1. Resumen general de progreso
2. Análisis de tolerancia a la carga
3. Patrones identificados (mejora/estancamiento)
4. Recomendaciones para el próximo mes

Escribe en español, de forma profesional pero accesible. Máximo 300 palabras."""

        generation_config = GenerationConfig(
            temperature=0.5,
            max_output_tokens=800,
        )
        
        try:
            response = self.model.generate_content(
                prompt,
                generation_config=generation_config
            )
            return response.text.strip()
        except Exception as e:
            print(f"Error generating monthly report: {e}")
            return "No se pudo generar el informe automático. Por favor, revisa los datos manualmente."


# Singleton instance
gemini_service = GeminiService()


def get_gemini_service() -> GeminiService:
    """Get Gemini service instance."""
    return gemini_service
