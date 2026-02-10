#!/bin/bash
# ============================================================================
# PhysioTrainer - Script de Limpieza de Recursos AWS
# ============================================================================
# ¡PRECAUCIÓN! Esto eliminará todos los recursos creados para PhysioTrainer
# ============================================================================

set -e

# Configuración
AWS_REGION="${AWS_REGION:-us-east-1}"
APP_NAME="physiotrainer"
SERVICE_NAME="${APP_NAME}-api"
FRONTEND_SERVICE_NAME="${APP_NAME}-frontend"
CLUSTER_NAME="${APP_NAME}-cluster"
DB_INSTANCE_NAME="${APP_NAME}-db"
ECR_REPO_NAME="${APP_NAME}"
ECR_FRONTEND_REPO_NAME="${APP_NAME}-frontend"
CODEBUILD_PROJECT_BACKEND="${APP_NAME}-backend-build"
CODEBUILD_PROJECT_FRONTEND="${APP_NAME}-frontend-build"
CODEBUILD_ROLE_NAME="${APP_NAME}-codebuild-role"

echo "=============================================="
echo "   🗑️  LIMPIEZA DE RECURSOS AWS"
echo "=============================================="
echo "Este script eliminará:"
echo "- ECS Cluster y Service: '$CLUSTER_NAME'"
echo "- RDS Instance: '$DB_INSTANCE_NAME'"
echo "- ECR Repository: '$ECR_REPO_NAME'"
echo "- ECR Repository: '$ECR_FRONTEND_REPO_NAME'"
echo "- Secrets Manager: secretos de la base de datos"
echo "- CodeBuild: proyectos de build"
echo "- VPC, Subnets, Security Groups, IAM Roles"
echo ""
read -p "¿Estás SEGURO de que quieres continuar? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operación cancelada."
    exit 0
fi

# Obtener VPC ID
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=${APP_NAME}-vpc" --query "Vpcs[0].VpcId" --output text --region $AWS_REGION 2>/dev/null || echo "None")

# 1. Eliminar ECS Service
echo "Eliminando servicio ECS..."
aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --desired-count 0 --region $AWS_REGION 2>/dev/null || true
aws ecs delete-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --force --region $AWS_REGION 2>/dev/null || echo "Servicio ECS no encontrado"

echo "Eliminando servicio ECS (frontend)..."
aws ecs update-service --cluster $CLUSTER_NAME --service $FRONTEND_SERVICE_NAME --desired-count 0 --region $AWS_REGION 2>/dev/null || true
aws ecs delete-service --cluster $CLUSTER_NAME --service $FRONTEND_SERVICE_NAME --force --region $AWS_REGION 2>/dev/null || echo "Servicio ECS frontend no encontrado"

# 2. Eliminar ECS Cluster
echo "Eliminando cluster ECS..."
aws ecs delete-cluster --cluster $CLUSTER_NAME --region $AWS_REGION 2>/dev/null || echo "Cluster ECS no encontrado"

# 3. Eliminar RDS
echo "Eliminando instancia RDS (puede tardar)..."
aws rds delete-db-instance --db-instance-identifier $DB_INSTANCE_NAME --skip-final-snapshot --delete-automated-backups --region $AWS_REGION 2>/dev/null || echo "Instancia RDS no encontrada"

# 4. Eliminar ECR
echo "Eliminando repositorio ECR..."
aws ecr delete-repository --repository-name $ECR_REPO_NAME --force --region $AWS_REGION 2>/dev/null || echo "Repositorio ECR no encontrado"

echo "Eliminando repositorio ECR (frontend)..."
aws ecr delete-repository --repository-name $ECR_FRONTEND_REPO_NAME --force --region $AWS_REGION 2>/dev/null || echo "Repositorio ECR frontend no encontrado"

# 5. Eliminar secreto
echo "Eliminando secretos..."
aws secretsmanager delete-secret --secret-id ${APP_NAME}/database-url --force-delete-without-recovery --region $AWS_REGION 2>/dev/null || echo "Secreto no encontrado"

# 6. Eliminar CodeBuild Projects
echo "Eliminando proyectos CodeBuild..."
aws codebuild delete-project --name $CODEBUILD_PROJECT_BACKEND --region $AWS_REGION 2>/dev/null || echo "Proyecto CodeBuild backend no encontrado"
aws codebuild delete-project --name $CODEBUILD_PROJECT_FRONTEND --region $AWS_REGION 2>/dev/null || echo "Proyecto CodeBuild frontend no encontrado"

# 7. Eliminar IAM Roles...
echo "Eliminando IAM Roles..."
aws iam delete-role-policy --role-name $CODEBUILD_ROLE_NAME --policy-name CodeBuildPermissions 2>/dev/null || true
aws iam delete-role --role-name $CODEBUILD_ROLE_NAME 2>/dev/null || echo "CodeBuild Role no encontrado"

aws iam delete-role-policy --role-name ${APP_NAME}-ecs-task-execution-role --policy-name SecretsManagerAccess 2>/dev/null || true
aws iam detach-role-policy --role-name ${APP_NAME}-ecs-task-execution-role --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy 2>/dev/null || true
aws iam delete-role --role-name ${APP_NAME}-ecs-task-execution-role 2>/dev/null || echo "Task Execution Role no encontrado"

aws iam delete-role-policy --role-name ${APP_NAME}-ecs-task-role --policy-name BedrockAccess 2>/dev/null || true
aws iam delete-role --role-name ${APP_NAME}-ecs-task-role 2>/dev/null || echo "Task Role no encontrado"

# 7. Eliminar CloudWatch Log Group
echo "Eliminando Log Group..."
aws logs delete-log-group --log-group-name /ecs/${APP_NAME} --region $AWS_REGION 2>/dev/null || echo "Log group no encontrado"

# 8. Eliminar DB Subnet Group
echo "Eliminando DB Subnet Group..."
aws rds delete-db-subnet-group --db-subnet-group-name ${APP_NAME}-db-subnet-group --region $AWS_REGION 2>/dev/null || echo "DB Subnet Group no encontrado"

# 9. Eliminar VPC y recursos asociados
if [ "$VPC_ID" != "None" ] && [ -n "$VPC_ID" ]; then
    echo "Eliminando VPC y recursos asociados..."
    
    # Security Groups
    for SG_ID in $(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$VPC_ID" --query "SecurityGroups[?GroupName!='default'].GroupId" --output text --region $AWS_REGION); do
        aws ec2 delete-security-group --group-id $SG_ID --region $AWS_REGION 2>/dev/null || true
    done
    
    # Subnets
    for SUBNET_ID in $(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text --region $AWS_REGION); do
        aws ec2 delete-subnet --subnet-id $SUBNET_ID --region $AWS_REGION 2>/dev/null || true
    done
    
    # Route Tables (non-main)
    for RTB_ID in $(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC_ID" --query "RouteTables[?Associations[0].Main!=\`true\`].RouteTableId" --output text --region $AWS_REGION); do
        aws ec2 delete-route-table --route-table-id $RTB_ID --region $AWS_REGION 2>/dev/null || true
    done
    
    # Internet Gateway
    for IGW_ID in $(aws ec2 describe-internet-gateways --filters "Name=attachment.vpc-id,Values=$VPC_ID" --query "InternetGateways[*].InternetGatewayId" --output text --region $AWS_REGION); do
        aws ec2 detach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID --region $AWS_REGION 2>/dev/null || true
        aws ec2 delete-internet-gateway --internet-gateway-id $IGW_ID --region $AWS_REGION 2>/dev/null || true
    done
    
    # VPC
    aws ec2 delete-vpc --vpc-id $VPC_ID --region $AWS_REGION 2>/dev/null || echo "VPC no se pudo eliminar (puede haber recursos dependientes)"
fi

echo ""
echo "✅ Limpieza completada."
echo "⚠️  Nota: Algunos recursos (como RDS) pueden tardar unos minutos en eliminarse completamente."
