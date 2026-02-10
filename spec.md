# ESPECIFICACIÓN TÉCNICA: ASISTENTE REHAB AI (AWS & BEDROCK)

## 1. VISIÓN GENERAL
Aplicación personal de seguimiento de rehabilitación funcional. El sistema vincula la carga de entrenamiento con la respuesta de dolor, utilizando **Claude 3.5 Sonnet** vía **AWS Bedrock** para el procesamiento de lenguaje natural y **Amazon ECS Fargate** para el despliegue serverless.

## 2. STACK TECNOLÓGICO (VERSIÓN PYTHON)
- **Framework Backend:** FastAPI (Asíncrono, alto rendimiento).
- **ORM:** SQLModel o SQLAlchemy (Para interactuar con la DB).
- **IA SDK:** `boto3` (AWS SDK para Python) con Bedrock Runtime.
- **Modelo de IA:** Claude 3.5 Sonnet (`anthropic.claude-3-5-sonnet-20241022-v2:0`)
- **Procesamiento de Datos:** Pandas (Para el cálculo de tendencias y promedios de dolor).
- **Frontend (Opcional):** Streamlit (para una PoC ultra rápida) o React/Next.js consumiendo la API de FastAPI.

---

## 3. MODELO DE DATOS (SQLModel / Python)

```python
from sqlmodel import SQLModel, Field, Relationship
from typing import List, Optional
from datetime import datetime

class Ejercicio(SQLModel, table=True):
    id: Optional[str] = Field(default=None, primary_key=True)
    nombre: str = Field(index=True, unique=True)
    categoria: str
    umbral_dolor_max: int = 4
    registros: List["Registro"] = Relationship(back_populates="ejercicio")

class Registro(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    fecha: datetime = Field(default_factory=datetime.utcnow)
    series: int
    reps: int
    peso: float
    dolor_intra: int
    dolor_24h: Optional[int] = None
    notas: Optional[str] = None
    
    ejercicio_id: str = Field(foreign_key="ejercicio.id")
    ejercicio: Ejercicio = Relationship(back_populates="registros")



## 4. REQUISITOS FUNCIONALES

### A. Interfaz de Chat (AWS Bedrock / Claude)
El sistema utilizará el SDK oficial de **AWS (boto3)** para procesar las entradas del usuario mediante Bedrock.
* **Acción:** El usuario envía un mensaje natural (ej: "Hoy búlgaras 3x10 con 12kg, dolor 2").
* **Prompt Interno:** El sistema instruye a **Claude 3.5 Sonnet** para extraer datos en formato JSON estricto: `{ "ejercicio": string, "series": number, "reps": number, "peso": number, "dolorIntra": number }`.
* **Lógica de Persistencia:** Si el nombre del ejercicio no existe en la base de datos, el sistema lo creará automáticamente antes de guardar el registro de la sesión.

### B. Lógica de Progresión (Regla del Semáforo)
Basado en el `dolorIntra` y el histórico, el asistente generará recomendaciones:
* **Verde (Dolor 0-3):** Indica buena tolerancia. Sugerir incremento del **5-10%** en volumen o intensidad para la siguiente sesión.
* **Amarillo (Dolor 4-5):** Indica carga límite. Sugerir **mantenimiento de carga** para consolidar la adaptación del tejido.
* **Rojo (Dolor > 5):** Indica sobrecarga. Sugerir **regresión inmediata** (reducir peso/series o pasar a variante más sencilla).

### C. Seguimiento Diferido (Dolor 24h)
* El sistema filtrará diariamente los registros donde `dolor24h == null`.
* Se mostrará una alerta prominente en el Dashboard para que el usuario complete este dato, fundamental para evaluar la respuesta inflamatoria latente.

---

## 5. DASHBOARD E INFORMES

* **Gráfico de Tendencias:** Implementación con **Recharts** para visualizar la relación entre carga y síntomas.
    * **Eje Y1 (Barras):** Volumen Total ($Series \times Repeticiones \times Peso$).
    * **Eje Y2 (Línea):** Intensidad del Dolor (0-10).
* **Informe Mensual:** Generación automática de un resumen ejecutivo mediante Gemini que analice la evolución de la tolerancia a la carga y detecte patrones de mejora o estancamiento.



---

## 6. DESPLIEGUE EN AMAZON WEB SERVICES (AWS)

### Arquitectura de Red (VPC)
```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              VPC (10.0.0.0/16)                              │
│  ┌────────────────────────────┐    ┌────────────────────────────┐          │
│  │   Subnet Pública 1         │    │   Subnet Pública 2         │          │
│  │   (10.0.1.0/24)            │    │   (10.0.2.0/24)            │          │
│  │   Availability Zone A      │    │   Availability Zone B      │          │
│  │                            │    │                            │          │
│  │  ┌──────────────────┐      │    │  ┌──────────────────┐      │          │
│  │  │   ECS Task       │      │    │  │   ECS Task       │      │          │
│  │  │   (Fargate)      │      │    │  │   (Backup)       │      │          │
│  │  └──────────────────┘      │    │  └──────────────────┘      │          │
│  └────────────────────────────┘    └────────────────────────────┘          │
│                                                                             │
│  ┌────────────────────────────┐    ┌────────────────────────────┐          │
│  │   Subnet Privada 1         │    │   Subnet Privada 2         │          │
│  │   (10.0.3.0/24) - Opcional │    │   (10.0.4.0/24) - Opcional │          │
│  │                            │    │                            │          │
│  │  ┌──────────────────┐      │    │  ┌──────────────────┐      │          │
│  │  │   RDS Primary    │      │    │  │   RDS Standby    │      │          │
│  │  │   (PostgreSQL)   │      │    │  │   (Multi-AZ)     │      │          │
│  │  └──────────────────┘      │    │  └──────────────────┘      │          │
│  └────────────────────────────┘    └────────────────────────────┘          │
│                                                                             │
│  ┌─────────────┐                                                            │
│  │ Internet    │◄──── Acceso público a la aplicación                        │
│  │ Gateway     │                                                            │
│  └─────────────┘                                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Servicios AWS Utilizados

* **Servicio de Cómputo:** **Amazon ECS Fargate** (Serverless containers), configurado para escalado automático.
* **Registro de Imágenes:** **Amazon ECR** (Elastic Container Registry) para almacenar las imágenes Docker.
* **Base de Datos:** **Amazon RDS (PostgreSQL)** para persistencia de datos con backups automáticos.
* **Inteligencia Artificial:** **AWS Bedrock** con modelo Claude 3.5 Sonnet para procesamiento de lenguaje natural.
* **Seguridad y Secretos:** **AWS Secrets Manager** para gestionar credenciales de forma segura.
* **Pipeline CI/CD:** **AWS CodeBuild** + **CodePipeline** conectado a GitHub para despliegues automáticos.
* **Logging:** **Amazon CloudWatch Logs** para monitoreo y debugging.
* **Networking:** **Amazon VPC** con subnets públicas/privadas, Internet Gateway y Security Groups.

### Permisos IAM Requeridos

```json
{
  "Task Execution Role": [
    "ecr:GetAuthorizationToken",
    "ecr:BatchGetImage",
    "secretsmanager:GetSecretValue",
    "logs:CreateLogStream",
    "logs:PutLogEvents"
  ],
  "Task Role": [
    "bedrock:InvokeModel",
    "bedrock:InvokeModelWithResponseStream"
  ]
}
```

### Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Conexión PostgreSQL | `postgresql+asyncpg://user:pass@host:5432/db` |
| `AWS_REGION` | Región de AWS | `us-east-1` |
| `BEDROCK_MODEL_ID` | ID del modelo Bedrock | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| `DEBUG` | Modo debug | `True/False` |