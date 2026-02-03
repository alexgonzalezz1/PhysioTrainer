import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test health check endpoint."""
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


@pytest.mark.asyncio
async def test_root_endpoint(client: AsyncClient):
    """Test root endpoint."""
    response = await client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "PhysioTrainer" in data["message"]


@pytest.mark.asyncio
async def test_create_ejercicio(client: AsyncClient):
    """Test creating a new ejercicio."""
    response = await client.post(
        "/api/v1/ejercicios/",
        json={
            "nombre": "Sentadilla Búlgara",
            "categoria": "Fuerza",
            "umbral_dolor_max": 4
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["nombre"] == "Sentadilla Búlgara"
    assert data["categoria"] == "Fuerza"


@pytest.mark.asyncio
async def test_get_ejercicios_empty(client: AsyncClient):
    """Test getting ejercicios when none exist."""
    response = await client.get("/api/v1/ejercicios/")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_create_registro(client: AsyncClient):
    """Test creating a new registro."""
    response = await client.post(
        "/api/v1/registros/",
        json={
            "ejercicio_nombre": "Sentadilla",
            "series": 3,
            "reps": 10,
            "peso": 12.5,
            "dolor_intra": 2
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["series"] == 3
    assert data["reps"] == 10
    assert data["peso"] == 12.5
    assert data["dolor_intra"] == 2
    assert data["volumen_total"] == 375.0  # 3 * 10 * 12.5


@pytest.mark.asyncio
async def test_get_registros_pendientes(client: AsyncClient):
    """Test getting registros pending dolor_24h."""
    response = await client.get("/api/v1/registros/pendientes")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)


@pytest.mark.asyncio
async def test_update_dolor_24h(client: AsyncClient):
    """Test updating dolor_24h for a registro."""
    # First create a registro
    create_response = await client.post(
        "/api/v1/registros/",
        json={
            "ejercicio_nombre": "Press Banca",
            "series": 4,
            "reps": 8,
            "peso": 40.0,
            "dolor_intra": 3
        }
    )
    registro_id = create_response.json()["id"]
    
    # Update dolor_24h
    response = await client.patch(
        f"/api/v1/registros/{registro_id}/dolor-24h",
        json={"dolor_24h": 2}
    )
    assert response.status_code == 200
    data = response.json()
    assert data["dolor_24h"] == 2


@pytest.mark.asyncio
async def test_get_estadisticas(client: AsyncClient):
    """Test getting general statistics."""
    response = await client.get("/api/v1/informes/estadisticas")
    assert response.status_code == 200
    data = response.json()
    assert "total_registros" in data
    assert "pendientes_dolor_24h" in data
