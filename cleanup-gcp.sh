#!/bin/bash
# ============================================================================
# PhysioTrainer - Script de Limpieza de Recursos GCP
# ============================================================================
# ¡PRECAUCIÓN! Esto eliminará todos los recursos creados para PhysioTrainer
# ============================================================================

set -e

# Configuración
REGION="${REGION:-us-central1}"
SERVICE_NAME="physiotrainer-api"
FRONTEND_SERVICE_NAME="physiotrainer-frontend"
DB_INSTANCE_NAME="physiotrainer-db"
REPOSITORY_NAME="physiotrainer"

echo "=============================================="
echo "   🗑️  LIMPIEZA DE RECURSOS GCP"
echo "=============================================="
echo "Este script eliminará:"
echo "- Cloud Run: servicios '$SERVICE_NAME' y '$FRONTEND_SERVICE_NAME'"
echo "- Cloud SQL: instancia '$DB_INSTANCE_NAME'"
echo "- Artifact Registry: repositorio '$REPOSITORY_NAME'"
echo "- Secret Manager: secretos de la base de datos"
echo ""
read -p "¿Estás SEGURO de que quieres continuar? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operación cancelada."
    exit 0
fi

# 1. Eliminar servicios de Cloud Run
echo "Eliminando servicios Cloud Run..."
gcloud run services delete $SERVICE_NAME --region=$REGION --quiet || echo "Servicio $SERVICE_NAME no encontrado o ya eliminado."
gcloud run services delete $FRONTEND_SERVICE_NAME --region=$REGION --quiet || echo "Servicio $FRONTEND_SERVICE_NAME no encontrado o ya eliminado."

# 2. Eliminar instancia de Cloud SQL
echo "Eliminando instancia Cloud SQL (puede tardar)..."
gcloud sql instances delete $DB_INSTANCE_NAME --quiet || echo "Instancia $DB_INSTANCE_NAME no encontrada o ya eliminada."

# 3. Eliminar Artifact Registry
echo "Eliminando imágenes de Artifact Registry..."
gcloud artifacts repositories delete $REPOSITORY_NAME --location=$REGION --quiet || echo "Repositorio $REPOSITORY_NAME no encontrado o ya eliminado."

# 4. Eliminar Secretos
echo "Eliminando secretos..."
gcloud secrets delete physiotrainer-db-url --quiet || echo "Secreto physiotrainer-db-url no encontrado o ya eliminado."

echo ""
echo "✅ Limpieza completada. Recursos eliminados."
