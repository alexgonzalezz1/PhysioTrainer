#!/bin/bash
# ============================================================================
# PhysioTrainer - Script de Despliegue en Google Cloud Platform
# ============================================================================
# Este script configura y despliega la aplicación completa en GCP
# Ejecutar desde Cloud Shell: ./deploy-gcp.sh
# ============================================================================

set -e  # Salir si hay errores

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para imprimir mensajes
print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================================================
# CONFIGURACIÓN - Modificar según necesidades
# ============================================================================
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project)}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="physiotrainer-api"
FRONTEND_SERVICE_NAME="physiotrainer-frontend"
DB_INSTANCE_NAME="physiotrainer-db"
DB_NAME="physiotrainer"
DB_USER="physiotrainer"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 32)}"

# ============================================================================
# VERIFICACIONES INICIALES
# ============================================================================
echo ""
echo "=============================================="
echo "   PhysioTrainer - Despliegue en GCP"
echo "=============================================="
echo ""

# Verificar que estamos en un proyecto
if [ -z "$PROJECT_ID" ]; then
    print_error "No hay proyecto configurado. Ejecuta: gcloud config set project PROJECT_ID"
    exit 1
fi

print_status "Proyecto: $PROJECT_ID"
print_status "Región: $REGION"
echo ""

# Confirmar despliegue
read -p "¿Continuar con el despliegue? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Despliegue cancelado"
    exit 0
fi

# ============================================================================
# PASO 1: Habilitar APIs necesarias
# ============================================================================
print_status "Habilitando APIs de Google Cloud..."

gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    sqladmin.googleapis.com \
    secretmanager.googleapis.com \
    aiplatform.googleapis.com \
    artifactregistry.googleapis.com \
    --quiet

print_success "APIs habilitadas"

# ============================================================================
# PASO 2: Crear Artifact Registry (si no existe)
# ============================================================================
print_status "Configurando Artifact Registry..."

if ! gcloud artifacts repositories describe physiotrainer --location=$REGION &>/dev/null; then
    gcloud artifacts repositories create physiotrainer \
        --repository-format=docker \
        --location=$REGION \
        --description="PhysioTrainer Docker images"
    print_success "Artifact Registry creado"
else
    print_warning "Artifact Registry ya existe"
fi

# ============================================================================
# PASO 3: Crear instancia de Cloud SQL (si no existe)
# ============================================================================
print_status "Configurando Cloud SQL..."

if ! gcloud sql instances describe $DB_INSTANCE_NAME &>/dev/null; then
    print_status "Creando instancia de Cloud SQL (esto puede tardar varios minutos)..."
    
    gcloud sql instances create $DB_INSTANCE_NAME \
        --database-version=POSTGRES_15 \
        --tier=db-f1-micro \
        --region=$REGION \
        --root-password=$DB_PASSWORD \
        --storage-auto-increase \
        --availability-type=zonal
    
    print_success "Instancia Cloud SQL creada"
    
    # Crear base de datos
    gcloud sql databases create $DB_NAME --instance=$DB_INSTANCE_NAME
    print_success "Base de datos '$DB_NAME' creada"
    
    # Crear usuario
    gcloud sql users create $DB_USER \
        --instance=$DB_INSTANCE_NAME \
        --password=$DB_PASSWORD
    print_success "Usuario '$DB_USER' creado"
else
    print_warning "Instancia Cloud SQL ya existe"
fi

# Obtener connection name
DB_CONNECTION_NAME=$(gcloud sql instances describe $DB_INSTANCE_NAME --format="value(connectionName)")
print_status "Connection Name: $DB_CONNECTION_NAME"

# ============================================================================
# PASO 4: Crear secretos en Secret Manager
# ============================================================================
print_status "Configurando Secret Manager..."

# Construir DATABASE_URL
DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${DB_CONNECTION_NAME}"

# Crear o actualizar secreto de DATABASE_URL
if ! gcloud secrets describe physiotrainer-db-url &>/dev/null; then
    echo -n "$DATABASE_URL" | gcloud secrets create physiotrainer-db-url --data-file=-
    print_success "Secreto 'physiotrainer-db-url' creado"
else
    echo -n "$DATABASE_URL" | gcloud secrets versions add physiotrainer-db-url --data-file=-
    print_warning "Secreto 'physiotrainer-db-url' actualizado"
fi

# ============================================================================
# PASO 5: Construir y subir imagen Docker
# ============================================================================
print_status "Construyendo imagen Docker..."

IMAGE_URL="$REGION-docker.pkg.dev/$PROJECT_ID/physiotrainer/$SERVICE_NAME:latest"

gcloud builds submit --tag $IMAGE_URL .

print_success "Imagen construida y subida: $IMAGE_URL"

# ============================================================================
# PASO 6: Desplegar en Cloud Run
# ============================================================================
print_status "Desplegando en Cloud Run..."

# Obtener service account de Cloud Run
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
CLOUD_RUN_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

# Dar permisos al service account para acceder a secretos
gcloud secrets add-iam-policy-binding physiotrainer-db-url \
    --member="serviceAccount:${CLOUD_RUN_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --quiet

# Dar permisos para Cloud SQL
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${CLOUD_RUN_SA}" \
    --role="roles/cloudsql.client" \
    --quiet

# Dar permisos para Vertex AI
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${CLOUD_RUN_SA}" \
    --role="roles/aiplatform.user" \
    --quiet

# Desplegar el servicio
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_URL \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --add-cloudsql-instances $DB_CONNECTION_NAME \
    --set-env-vars "GCP_PROJECT_ID=$PROJECT_ID,GCP_LOCATION=$REGION" \
    --set-secrets "DATABASE_URL=physiotrainer-db-url:latest" \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --quiet

print_success "API desplegada en Cloud Run"

# Obtener URL del servicio
API_URL=$(gcloud run services describe $SERVICE_NAME --region=$REGION --format="value(status.url)")
print_success "API URL: $API_URL"

# ============================================================================
# PASO 7: Desplegar Frontend (opcional)
# ============================================================================
read -p "¿Desplegar también el frontend React? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    print_status "Construyendo frontend..."
    
    FRONTEND_IMAGE_URL="$REGION-docker.pkg.dev/$PROJECT_ID/physiotrainer/$FRONTEND_SERVICE_NAME:latest"
    
    # Construir con la URL de la API
    cd frontend-react
    # Nota: Eliminamos --substitutions porque al construir desde Dockerfile directo no se usa cloudbuild.yaml
    # y las variables de entorno se inyectan en el despliegue (runtime).
    gcloud builds submit --tag $FRONTEND_IMAGE_URL
    cd ..
    
    # Desplegar frontend
    gcloud run deploy $FRONTEND_SERVICE_NAME \
        --image $FRONTEND_IMAGE_URL \
        --region $REGION \
        --platform managed \
        --allow-unauthenticated \
        --set-env-vars "API_BASE_URL=$API_URL/api/v1" \
        --memory 256Mi \
        --cpu 1 \
        --min-instances 0 \
        --max-instances 5 \
        --quiet
    
    FRONTEND_URL=$(gcloud run services describe $FRONTEND_SERVICE_NAME --region=$REGION --format="value(status.url)")
    print_success "Frontend URL: $FRONTEND_URL"
fi

# ============================================================================
# RESUMEN FINAL
# ============================================================================
echo ""
echo "=============================================="
echo "   ✅ DESPLIEGUE COMPLETADO"
echo "=============================================="
echo ""
echo "📍 Proyecto: $PROJECT_ID"
echo "📍 Región: $REGION"
echo ""
echo "🔗 URLs de la aplicación:"
echo "   API:      $API_URL"
echo "   Docs:     $API_URL/docs"
echo "   Health:   $API_URL/health"
if [ ! -z "$FRONTEND_URL" ]; then
echo "   Frontend: $FRONTEND_URL"
fi
echo ""
echo "🗄️ Base de datos:"
echo "   Instancia: $DB_INSTANCE_NAME"
echo "   Database:  $DB_NAME"
echo "   Usuario:   $DB_USER"
echo ""
echo "⚠️  IMPORTANTE: Guarda la contraseña de la DB en un lugar seguro"
echo "   Password:  $DB_PASSWORD"
echo ""
echo "=============================================="
