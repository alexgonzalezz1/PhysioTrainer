import pytest
from app.services.progresion_service import (
    EstadoSemaforo,
    calcular_estado_semaforo,
    generar_recomendacion_progresion,
    calcular_nueva_carga,
    evaluar_dolor_24h
)


class TestCalcularEstadoSemaforo:
    """Tests for calcular_estado_semaforo function."""
    
    def test_verde_dolor_0(self):
        assert calcular_estado_semaforo(0) == EstadoSemaforo.VERDE
    
    def test_verde_dolor_3(self):
        assert calcular_estado_semaforo(3) == EstadoSemaforo.VERDE
    
    def test_amarillo_dolor_4(self):
        assert calcular_estado_semaforo(4) == EstadoSemaforo.AMARILLO
    
    def test_amarillo_dolor_5(self):
        assert calcular_estado_semaforo(5) == EstadoSemaforo.AMARILLO
    
    def test_rojo_dolor_6(self):
        assert calcular_estado_semaforo(6) == EstadoSemaforo.ROJO
    
    def test_rojo_dolor_10(self):
        assert calcular_estado_semaforo(10) == EstadoSemaforo.ROJO


class TestGenerarRecomendacion:
    """Tests for generar_recomendacion_progresion function."""
    
    def test_recomendacion_verde(self):
        rec = generar_recomendacion_progresion(2, ejercicio="Sentadilla")
        assert rec.estado == EstadoSemaforo.VERDE
        assert rec.porcentaje_cambio > 0
        assert "🟢" in rec.mensaje
    
    def test_recomendacion_amarillo(self):
        rec = generar_recomendacion_progresion(4, ejercicio="Sentadilla")
        assert rec.estado == EstadoSemaforo.AMARILLO
        assert rec.porcentaje_cambio == 0
        assert "🟡" in rec.mensaje
    
    def test_recomendacion_rojo(self):
        rec = generar_recomendacion_progresion(7, ejercicio="Sentadilla")
        assert rec.estado == EstadoSemaforo.ROJO
        assert rec.porcentaje_cambio < 0
        assert "🔴" in rec.mensaje


class TestCalcularNuevaCarga:
    """Tests for calcular_nueva_carga function."""
    
    def test_incremento_verde(self):
        result = calcular_nueva_carga(10.0, 2, es_peso=True)
        assert result["carga_sugerida"] > result["carga_actual"]
        assert result["estado"] == "verde"
    
    def test_mantenimiento_amarillo(self):
        result = calcular_nueva_carga(10.0, 4, es_peso=True)
        assert result["carga_sugerida"] == result["carga_actual"]
        assert result["estado"] == "amarillo"
    
    def test_reduccion_rojo(self):
        result = calcular_nueva_carga(10.0, 7, es_peso=True)
        assert result["carga_sugerida"] < result["carga_actual"]
        assert result["estado"] == "rojo"
    
    def test_redondeo_peso(self):
        result = calcular_nueva_carga(12.0, 2, es_peso=True)
        # Should round to nearest 0.5
        assert result["carga_sugerida"] % 0.5 == 0


class TestEvaluarDolor24h:
    """Tests for evaluar_dolor_24h function."""
    
    def test_respuesta_optima(self):
        result = evaluar_dolor_24h(dolor_intra=3, dolor_24h=2)
        assert result["interpretacion"] == "respuesta_optima"
        assert result["puede_progresar"] == True
    
    def test_respuesta_aceptable(self):
        result = evaluar_dolor_24h(dolor_intra=3, dolor_24h=4)
        assert result["interpretacion"] == "respuesta_aceptable"
        assert result["puede_progresar"] == False
    
    def test_respuesta_excesiva(self):
        result = evaluar_dolor_24h(dolor_intra=3, dolor_24h=7)
        assert result["interpretacion"] == "respuesta_excesiva"
        assert result["puede_progresar"] == False
