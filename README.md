# PhysioTrainer - Asistente de Rehabilitación con IA

[![Deploy to Cloud Run](https://deploy.cloud.run/button.svg)](https://deploy.cloud.run)

Aplicación de seguimiento de rehabilitación funcional que vincula la carga de entrenamiento con la respuesta de dolor, utilizando **Gemini 1.5** vía **Vertex AI** para el procesamiento de lenguaje natural.

## 🚀 Características

- **Chat con IA**: Registra tus entrenamientos en lenguaje natural
  - Ejemplo: "Hoy búlgaras 3x10 con 12kg, dolor 2"
- **Sistema de Semáforo**: Recomendaciones automáticas basadas en dolor
  - 🟢 Verde (0-3): Buena tolerancia, sugiere incrementar
  - 🟡 Amarillo (4-5): Carga límite, mantener
  - 🔴 Rojo (>5): Sobrecarga, reducir
- **Seguimiento 24h**: Alertas para actualizar dolor diferido
- **Dashboard**: Visualización de tendencias y progreso
- **Informes Mensuales**: Análisis automático con IA

---

## 📁 Estructura del Proyecto

```
PhysioTrainer/
├── app/
│   ├── api/                 # Endpoints FastAPI
│   │   ├── chat.py         # Chat con IA
│   │   ├── ejercicios.py   # CRUD ejercicios
│   │   ├── registros.py    # CRUD registros
│   │   └── informes.py     # Tendencias e informes
│   ├── core/               # Configuración
│   ├── db/                 # Base de datos
│   ├── models/             # Modelos SQLModel
│   ├── repositories/       # Capa de datos
│   ├── schemas/            # Schemas Pydantic
│   ├── services/           # Lógica de negocio
│   │   ├── gemini_service.py    # Integración Vertex AI
│   │   └── progresion_service.py # Regla del semáforo
│   └── main.py             # Aplicación FastAPI
├── frontend/               # Frontend Streamlit (simple)
├── frontend-react/         # Frontend Next.js (completo)
├── tests/                  # Tests pytest
├── deploy-gcp.sh          # 🚀 Script de despliegue automático
├── cloudbuild.yaml        # CI/CD con Cloud Build
├── Dockerfile             # Docker para API
├── docker-compose.yml     # Desarrollo local
└── README.md
```

---

## ☁️ DESPLIEGUE EN GOOGLE CLOUD PLATFORM

### 🚀 Opción 1: Despliegue Automático (Recomendado)

#### Paso 1: Abrir Cloud Shell

1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Selecciona o crea un proyecto
3. Haz clic en el icono de **Cloud Shell** (terminal) en la barra superior

#### Paso 2: Clonar el repositorio

```bash
git clone https://github.com/TU_USUARIO/PhysioTrainer.git
cd PhysioTrainer
```

#### Paso 3: Ejecutar script de despliegue

```bash
# Dar permisos de ejecución
chmod +x deploy-gcp.sh

# Ejecutar el despliegue
./deploy-gcp.sh
```

El script automáticamente:
- ✅ Habilita las APIs necesarias
- ✅ Crea Artifact Registry
- ✅ Crea instancia Cloud SQL (PostgreSQL)
- ✅ Configura Secret Manager
- ✅ Construye y despliega la imagen Docker
- ✅ Configura permisos IAM
- ✅ Despliega en Cloud Run

---

### 📋 Opción 2: Despliegue Manual Paso a Paso

#### Paso 1: Configurar el proyecto

```bash
# En Cloud Shell
export PROJECT_ID=$(gcloud config get-value project)
export REGION=us-central1

# Verificar proyecto
echo "Proyecto: $PROJECT_ID"
```

#### Paso 2: Habilitar APIs

```bash
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    sqladmin.googleapis.com \
    secretmanager.googleapis.com \
    aiplatform.googleapis.com \
    artifactregistry.googleapis.com
```

#### Paso 3: Crear Artifact Registry

```bash
gcloud artifacts repositories create physiotrainer \
    --repository-format=docker \
    --location=$REGION \
    --description="PhysioTrainer Docker images"
```

#### Paso 4: Crear Cloud SQL

```bash
# Generar contraseña segura
export DB_PASSWORD=$(openssl rand -base64 32)
echo "Contraseña DB: $DB_PASSWORD"  # ¡GUARDAR!

# Crear instancia (tarda ~5 minutos)
gcloud sql instances create physiotrainer-db \
    --database-version=POSTGRES_15 \
    --tier=db-f1-micro \
    --region=$REGION \
    --root-password=$DB_PASSWORD

# Crear base de datos
gcloud sql databases create physiotrainer \
    --instance=physiotrainer-db

# Crear usuario
gcloud sql users create physiotrainer \
    --instance=physiotrainer-db \
    --password=$DB_PASSWORD
```

#### Paso 5: Configurar Secret Manager

```bash
# Obtener connection name
DB_CONNECTION=$(gcloud sql instances describe physiotrainer-db \
    --format="value(connectionName)")

# Crear secreto con DATABASE_URL
echo -n "postgresql+asyncpg://physiotrainer:${DB_PASSWORD}@/physiotrainer?host=/cloudsql/${DB_CONNECTION}" | \
    gcloud secrets create physiotrainer-db-url --data-file=-
```

#### Paso 6: Construir imagen Docker

```bash
# Clonar repo si no lo has hecho
git clone https://github.com/TU_USUARIO/PhysioTrainer.git
cd PhysioTrainer

# Construir y subir imagen
gcloud builds submit \
    --tag $REGION-docker.pkg.dev/$PROJECT_ID/physiotrainer/physiotrainer-api:latest
```

#### Paso 7: Configurar permisos IAM

```bash
# Obtener service account
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Permisos para Secret Manager
gcloud secrets add-iam-policy-binding physiotrainer-db-url \
    --member="serviceAccount:${SA}" \
    --role="roles/secretmanager.secretAccessor"

# Permisos para Cloud SQL
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SA}" \
    --role="roles/cloudsql.client"

# Permisos para Vertex AI
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SA}" \
    --role="roles/aiplatform.user"
```

#### Paso 8: Desplegar en Cloud Run

```bash
gcloud run deploy physiotrainer-api \
    --image $REGION-docker.pkg.dev/$PROJECT_ID/physiotrainer/physiotrainer-api:latest \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --add-cloudsql-instances $DB_CONNECTION \
    --set-env-vars "GCP_PROJECT_ID=$PROJECT_ID,GCP_LOCATION=$REGION" \
    --set-secrets "DATABASE_URL=physiotrainer-db-url:latest" \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10
```

#### Paso 9: Obtener URL

```bash
# Ver URL del servicio
gcloud run services describe physiotrainer-api \
    --region $REGION \
    --format="value(status.url)"
```

---

### 🔄 Opción 3: CI/CD con Cloud Build (GitHub)

#### Conectar repositorio

1. Ve a [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers)
2. Haz clic en **Conectar repositorio**
3. Selecciona **GitHub** y autoriza
4. Selecciona el repositorio **PhysioTrainer**

#### Crear trigger

```bash
# Obtener DB_CONNECTION primero
DB_CONNECTION=$(gcloud sql instances describe physiotrainer-db \
    --format="value(connectionName)")

# Crear trigger
gcloud builds triggers create github \
    --repo-name=PhysioTrainer \
    --repo-owner=TU_USUARIO \
    --branch-pattern="^main$" \
    --build-config=cloudbuild.yaml \
    --substitutions="_REGION=us-central1,_DB_CONNECTION=$DB_CONNECTION"
```

Ahora cada push a `main` desplegará automáticamente.

---

## 🖥️ Desplegar Frontend React

```bash
cd frontend-react

# Obtener URL de la API
API_URL=$(gcloud run services describe physiotrainer-api \
    --region $REGION --format="value(status.url)")

# Construir imagen
gcloud builds submit \
    --tag $REGION-docker.pkg.dev/$PROJECT_ID/physiotrainer/physiotrainer-frontend:latest

# Desplegar
gcloud run deploy physiotrainer-frontend \
    --image $REGION-docker.pkg.dev/$PROJECT_ID/physiotrainer/physiotrainer-frontend:latest \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "API_BASE_URL=$API_URL/api/v1" \
    --memory 256Mi \
    --min-instances 0 \
    --max-instances 5
```

---

## 💰 Costos Estimados (GCP)

| Servicio | Tier | Costo Estimado/mes |
|----------|------|-------------------|
| Cloud Run (API) | 0-2 instancias | ~$0-10 |
| Cloud Run (Frontend) | 0-1 instancias | ~$0-5 |
| Cloud SQL | db-f1-micro | ~$10-15 |
| Vertex AI (Gemini) | Por uso | ~$0-5 |
| **Total estimado** | | **~$15-35/mes** |

> 💡 **Tip**: Cloud Run cobra solo cuando hay tráfico. Con poco uso, el costo puede ser $0.

---

## 🛠️ Desarrollo Local

### Con Docker Compose

```bash
# Iniciar todos los servicios
docker-compose up --build

# URLs locales:
# - API: http://localhost:8000
# - Docs: http://localhost:8000/docs
# - Frontend React: http://localhost:3000
# - Frontend Streamlit: http://localhost:8501
```

### Sin Docker

```bash
# Backend
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend React
cd frontend-react
npm install
npm run dev
```

---

## 📚 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/v1/chat/` | Procesar mensaje natural |
| GET | `/api/v1/ejercicios/` | Listar ejercicios |
| POST | `/api/v1/ejercicios/` | Crear ejercicio |
| GET | `/api/v1/registros/` | Listar registros |
| GET | `/api/v1/registros/pendientes` | Registros sin dolor 24h |
| PATCH | `/api/v1/registros/{id}/dolor-24h` | Actualizar dolor 24h |
| GET | `/api/v1/informes/tendencias/{id}` | Datos para gráficos |
| GET | `/api/v1/informes/mensual/{year}/{month}` | Informe mensual IA |
| GET | `/health` | Health check |

---

## 🔧 Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | URL de PostgreSQL | `postgresql+asyncpg://...` |
| `GCP_PROJECT_ID` | ID del proyecto GCP | `my-project-123` |
| `GCP_LOCATION` | Región de Vertex AI | `us-central1` |
| `DEBUG` | Modo debug | `true` / `false` |

---

## 🧪 Tests

```bash
# Ejecutar tests
pytest

# Con cobertura
pytest --cov=app tests/
```

---

## 🆘 Troubleshooting

### Error: "Permission denied" en Cloud SQL
```bash
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SA}" \
    --role="roles/cloudsql.client"
```

### Error: "Secret not found"
```bash
# Verificar que el secreto existe
gcloud secrets list

# Recrear si es necesario
gcloud secrets delete physiotrainer-db-url
# Luego recrear con el paso 5
```

### Error: "Vertex AI API not enabled"
```bash
gcloud services enable aiplatform.googleapis.com
```

### Ver logs de Cloud Run
```bash
gcloud run services logs read physiotrainer-api --region $REGION
```

---

## 📄 Licencia

MIT License
