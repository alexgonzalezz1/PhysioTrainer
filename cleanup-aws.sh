#!/bin/bash
# ============================================================================
# PhysioTrainer - Script de Limpieza de Recursos AWS
# ============================================================================
# ¡PRECAUCIÓN! Esto eliminará TODOS los recursos creados para PhysioTrainer
# ============================================================================

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[OK]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARN]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

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
TASK_EXEC_ROLE_NAME="${APP_NAME}-ecs-task-execution-role"
TASK_ROLE_NAME="${APP_NAME}-ecs-task-role"

echo ""
echo "=============================================="
echo "   🗑️  LIMPIEZA DE RECURSOS AWS"
echo "=============================================="
echo ""
echo "Región: $AWS_REGION"
echo ""
echo "Este script eliminará:"
echo "  • ECS Services: '$SERVICE_NAME', '$FRONTEND_SERVICE_NAME'"
echo "  • ECS Cluster: '$CLUSTER_NAME'"
echo "  • ECS Task Definitions: '${APP_NAME}-task', '${APP_NAME}-frontend-task'"
echo "  • RDS Instance: '$DB_INSTANCE_NAME'"
echo "  • ECR Repositories: '$ECR_REPO_NAME', '$ECR_FRONTEND_REPO_NAME'"
echo "  • Secrets Manager: '${APP_NAME}/database-url'"
echo "  • CodeBuild Projects: '$CODEBUILD_PROJECT_BACKEND', '$CODEBUILD_PROJECT_FRONTEND'"
echo "  • CloudWatch Log Group: '/ecs/${APP_NAME}'"
echo "  • IAM Roles: '$TASK_EXEC_ROLE_NAME', '$TASK_ROLE_NAME', '$CODEBUILD_ROLE_NAME'"
echo "  • VPC, Subnets, Security Groups, Internet Gateway, Route Tables"
echo ""
read -p "¿Estás SEGURO de que quieres continuar? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Operación cancelada."
    exit 0
fi

echo ""

# ============================================================================
# PASO 1: Detener y eliminar ECS Services
# ============================================================================
print_status "Paso 1: Eliminando servicios ECS..."

# Backend service
aws ecs update-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --desired-count 0 --region $AWS_REGION 2>/dev/null || true
aws ecs delete-service --cluster $CLUSTER_NAME --service $SERVICE_NAME --force --region $AWS_REGION 2>/dev/null && \
    print_success "Servicio ECS backend eliminado" || print_warning "Servicio ECS backend no encontrado"

# Frontend service
aws ecs update-service --cluster $CLUSTER_NAME --service $FRONTEND_SERVICE_NAME --desired-count 0 --region $AWS_REGION 2>/dev/null || true
aws ecs delete-service --cluster $CLUSTER_NAME --service $FRONTEND_SERVICE_NAME --force --region $AWS_REGION 2>/dev/null && \
    print_success "Servicio ECS frontend eliminado" || print_warning "Servicio ECS frontend no encontrado"

# Esperar a que las tareas se detengan (necesario para liberar ENIs/Security Groups)
print_status "Esperando a que las tareas ECS se detengan..."
for i in $(seq 1 24); do
    RUNNING_TASKS=$(aws ecs list-tasks --cluster $CLUSTER_NAME --query "taskArns" --output text --region $AWS_REGION 2>/dev/null || echo "")
    if [ -z "$RUNNING_TASKS" ] || [ "$RUNNING_TASKS" == "None" ]; then
        break
    fi
    echo -n "."
    sleep 5
done
echo ""
print_success "Tareas ECS detenidas"

# ============================================================================
# PASO 2: Deregistrar Task Definitions
# ============================================================================
print_status "Paso 2: Deregistrando Task Definitions..."

# Backend task definitions
TASK_DEF_ARNS=$(aws ecs list-task-definitions --family-prefix ${APP_NAME}-task --query "taskDefinitionArns" --output text --region $AWS_REGION 2>/dev/null || echo "")
if [ -n "$TASK_DEF_ARNS" ] && [ "$TASK_DEF_ARNS" != "None" ]; then
    for ARN in $TASK_DEF_ARNS; do
        aws ecs deregister-task-definition --task-definition "$ARN" --region $AWS_REGION 2>/dev/null || true
    done
    print_success "Task Definitions backend deregistradas"
else
    print_warning "No se encontraron Task Definitions backend"
fi

# Frontend task definitions
FRONTEND_TASK_DEF_ARNS=$(aws ecs list-task-definitions --family-prefix ${APP_NAME}-frontend-task --query "taskDefinitionArns" --output text --region $AWS_REGION 2>/dev/null || echo "")
if [ -n "$FRONTEND_TASK_DEF_ARNS" ] && [ "$FRONTEND_TASK_DEF_ARNS" != "None" ]; then
    for ARN in $FRONTEND_TASK_DEF_ARNS; do
        aws ecs deregister-task-definition --task-definition "$ARN" --region $AWS_REGION 2>/dev/null || true
    done
    print_success "Task Definitions frontend deregistradas"
else
    print_warning "No se encontraron Task Definitions frontend"
fi

# ============================================================================
# PASO 3: Eliminar ECS Cluster
# ============================================================================
print_status "Paso 3: Eliminando cluster ECS..."
aws ecs delete-cluster --cluster $CLUSTER_NAME --region $AWS_REGION 2>/dev/null && \
    print_success "Cluster ECS eliminado" || print_warning "Cluster ECS no encontrado"

# ============================================================================
# PASO 4: Eliminar RDS (tarda varios minutos)
# ============================================================================
print_status "Paso 4: Eliminando instancia RDS..."
if aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE_NAME --region $AWS_REGION &>/dev/null; then
    aws rds delete-db-instance \
        --db-instance-identifier $DB_INSTANCE_NAME \
        --skip-final-snapshot \
        --delete-automated-backups \
        --region $AWS_REGION 2>/dev/null
    print_status "RDS eliminándose (puede tardar 5-10 min). Esperando..."
    aws rds wait db-instance-deleted --db-instance-identifier $DB_INSTANCE_NAME --region $AWS_REGION 2>/dev/null || true
    print_success "Instancia RDS eliminada"
else
    print_warning "Instancia RDS no encontrada"
fi

# ============================================================================
# PASO 5: Eliminar DB Subnet Group (después de que RDS se elimine)
# ============================================================================
print_status "Paso 5: Eliminando DB Subnet Group..."
aws rds delete-db-subnet-group --db-subnet-group-name ${APP_NAME}-db-subnet-group --region $AWS_REGION 2>/dev/null && \
    print_success "DB Subnet Group eliminado" || print_warning "DB Subnet Group no encontrado"

# ============================================================================
# PASO 6: Eliminar repositorios ECR
# ============================================================================
print_status "Paso 6: Eliminando repositorios ECR..."

aws ecr delete-repository --repository-name $ECR_REPO_NAME --force --region $AWS_REGION 2>/dev/null && \
    print_success "Repositorio ECR backend eliminado" || print_warning "Repositorio ECR backend no encontrado"

aws ecr delete-repository --repository-name $ECR_FRONTEND_REPO_NAME --force --region $AWS_REGION 2>/dev/null && \
    print_success "Repositorio ECR frontend eliminado" || print_warning "Repositorio ECR frontend no encontrado"

# ============================================================================
# PASO 7: Eliminar secretos (Secrets Manager)
# ============================================================================
print_status "Paso 7: Eliminando secretos..."
aws secretsmanager delete-secret \
    --secret-id ${APP_NAME}/database-url \
    --force-delete-without-recovery \
    --region $AWS_REGION 2>/dev/null && \
    print_success "Secreto eliminado" || print_warning "Secreto no encontrado"

# ============================================================================
# PASO 8: Eliminar proyectos CodeBuild
# ============================================================================
print_status "Paso 8: Eliminando proyectos CodeBuild..."

aws codebuild delete-project --name $CODEBUILD_PROJECT_BACKEND --region $AWS_REGION 2>/dev/null && \
    print_success "Proyecto CodeBuild backend eliminado" || print_warning "Proyecto CodeBuild backend no encontrado"

aws codebuild delete-project --name $CODEBUILD_PROJECT_FRONTEND --region $AWS_REGION 2>/dev/null && \
    print_success "Proyecto CodeBuild frontend eliminado" || print_warning "Proyecto CodeBuild frontend no encontrado"

# ============================================================================
# PASO 9: Eliminar CloudWatch Log Group
# ============================================================================
print_status "Paso 9: Eliminando CloudWatch Log Group..."
aws logs delete-log-group --log-group-name /ecs/${APP_NAME} --region $AWS_REGION 2>/dev/null && \
    print_success "Log Group eliminado" || print_warning "Log Group no encontrado"

# ============================================================================
# PASO 10: Eliminar IAM Roles y Policies
# ============================================================================
print_status "Paso 10: Eliminando IAM Roles..."

# --- CodeBuild Role ---
aws iam delete-role-policy --role-name $CODEBUILD_ROLE_NAME --policy-name CodeBuildPermissions 2>/dev/null || true
aws iam delete-role --role-name $CODEBUILD_ROLE_NAME 2>/dev/null && \
    print_success "CodeBuild Role eliminado" || print_warning "CodeBuild Role no encontrado"

# --- Task Execution Role ---
# Eliminar inline policies
aws iam delete-role-policy --role-name $TASK_EXEC_ROLE_NAME --policy-name SecretsManagerAccess 2>/dev/null || true
# Desadjuntar managed policies
aws iam detach-role-policy --role-name $TASK_EXEC_ROLE_NAME \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy 2>/dev/null || true
# Eliminar cualquier otra inline policy que pueda existir
INLINE_POLICIES=$(aws iam list-role-policies --role-name $TASK_EXEC_ROLE_NAME --query "PolicyNames" --output text 2>/dev/null || echo "")
if [ -n "$INLINE_POLICIES" ] && [ "$INLINE_POLICIES" != "None" ]; then
    for POLICY in $INLINE_POLICIES; do
        aws iam delete-role-policy --role-name $TASK_EXEC_ROLE_NAME --policy-name "$POLICY" 2>/dev/null || true
    done
fi
# Desadjuntar cualquier otra managed policy
ATTACHED_POLICIES=$(aws iam list-attached-role-policies --role-name $TASK_EXEC_ROLE_NAME --query "AttachedPolicies[*].PolicyArn" --output text 2>/dev/null || echo "")
if [ -n "$ATTACHED_POLICIES" ] && [ "$ATTACHED_POLICIES" != "None" ]; then
    for POLICY_ARN in $ATTACHED_POLICIES; do
        aws iam detach-role-policy --role-name $TASK_EXEC_ROLE_NAME --policy-arn "$POLICY_ARN" 2>/dev/null || true
    done
fi
aws iam delete-role --role-name $TASK_EXEC_ROLE_NAME 2>/dev/null && \
    print_success "Task Execution Role eliminado" || print_warning "Task Execution Role no encontrado"

# --- Task Role (Bedrock) ---
aws iam delete-role-policy --role-name $TASK_ROLE_NAME --policy-name BedrockAccess 2>/dev/null || true
# Eliminar cualquier otra inline policy
INLINE_POLICIES=$(aws iam list-role-policies --role-name $TASK_ROLE_NAME --query "PolicyNames" --output text 2>/dev/null || echo "")
if [ -n "$INLINE_POLICIES" ] && [ "$INLINE_POLICIES" != "None" ]; then
    for POLICY in $INLINE_POLICIES; do
        aws iam delete-role-policy --role-name $TASK_ROLE_NAME --policy-name "$POLICY" 2>/dev/null || true
    done
fi
ATTACHED_POLICIES=$(aws iam list-attached-role-policies --role-name $TASK_ROLE_NAME --query "AttachedPolicies[*].PolicyArn" --output text 2>/dev/null || echo "")
if [ -n "$ATTACHED_POLICIES" ] && [ "$ATTACHED_POLICIES" != "None" ]; then
    for POLICY_ARN in $ATTACHED_POLICIES; do
        aws iam detach-role-policy --role-name $TASK_ROLE_NAME --policy-arn "$POLICY_ARN" 2>/dev/null || true
    done
fi
aws iam delete-role --role-name $TASK_ROLE_NAME 2>/dev/null && \
    print_success "Task Role eliminado" || print_warning "Task Role no encontrado"

# ============================================================================
# PASO 11: Eliminar VPC y todos los recursos asociados
# ============================================================================
print_status "Paso 11: Eliminando VPC y recursos asociados..."

VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=${APP_NAME}-vpc" --query "Vpcs[0].VpcId" --output text --region $AWS_REGION 2>/dev/null || echo "None")

if [ "$VPC_ID" != "None" ] && [ -n "$VPC_ID" ]; then

    # Eliminar Network Interfaces (ENIs huérfanas de ECS/RDS)
    print_status "  Eliminando Network Interfaces..."
    for ENI_ID in $(aws ec2 describe-network-interfaces --filters "Name=vpc-id,Values=$VPC_ID" --query "NetworkInterfaces[*].NetworkInterfaceId" --output text --region $AWS_REGION 2>/dev/null); do
        # Primero desadjuntar si está adjunta
        ATTACHMENT_ID=$(aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --query "NetworkInterfaces[0].Attachment.AttachmentId" --output text --region $AWS_REGION 2>/dev/null || echo "None")
        if [ "$ATTACHMENT_ID" != "None" ] && [ -n "$ATTACHMENT_ID" ]; then
            aws ec2 detach-network-interface --attachment-id $ATTACHMENT_ID --force --region $AWS_REGION 2>/dev/null || true
            sleep 2
        fi
        aws ec2 delete-network-interface --network-interface-id $ENI_ID --region $AWS_REGION 2>/dev/null || true
    done

    # Eliminar Security Groups (excepto default)
    print_status "  Eliminando Security Groups..."
    for SG_ID in $(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$VPC_ID" --query "SecurityGroups[?GroupName!='default'].GroupId" --output text --region $AWS_REGION 2>/dev/null); do
        # Eliminar reglas de ingress que referencian otros SGs (evita dependencias circulares)
        aws ec2 revoke-security-group-ingress --group-id $SG_ID --ip-permissions \
            "$(aws ec2 describe-security-groups --group-ids $SG_ID --query "SecurityGroups[0].IpPermissions" --output json --region $AWS_REGION 2>/dev/null)" \
            --region $AWS_REGION 2>/dev/null || true
        aws ec2 delete-security-group --group-id $SG_ID --region $AWS_REGION 2>/dev/null || true
    done

    # Eliminar Subnets
    print_status "  Eliminando Subnets..."
    for SUBNET_ID in $(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text --region $AWS_REGION 2>/dev/null); do
        aws ec2 delete-subnet --subnet-id $SUBNET_ID --region $AWS_REGION 2>/dev/null || true
    done

    # Eliminar Route Tables (no-main)
    print_status "  Eliminando Route Tables..."
    for RTB_ID in $(aws ec2 describe-route-tables --filters "Name=vpc-id,Values=$VPC_ID" --query "RouteTables[?Associations[0].Main!=\`true\`].RouteTableId" --output text --region $AWS_REGION 2>/dev/null); do
        # Desasociar subnets primero
        for ASSOC_ID in $(aws ec2 describe-route-tables --route-table-ids $RTB_ID --query "RouteTables[0].Associations[?!Main].RouteTableAssociationId" --output text --region $AWS_REGION 2>/dev/null); do
            aws ec2 disassociate-route-table --association-id $ASSOC_ID --region $AWS_REGION 2>/dev/null || true
        done
        aws ec2 delete-route-table --route-table-id $RTB_ID --region $AWS_REGION 2>/dev/null || true
    done

    # Eliminar Internet Gateway
    print_status "  Eliminando Internet Gateway..."
    for IGW_ID in $(aws ec2 describe-internet-gateways --filters "Name=attachment.vpc-id,Values=$VPC_ID" --query "InternetGateways[*].InternetGatewayId" --output text --region $AWS_REGION 2>/dev/null); do
        aws ec2 detach-internet-gateway --internet-gateway-id $IGW_ID --vpc-id $VPC_ID --region $AWS_REGION 2>/dev/null || true
        aws ec2 delete-internet-gateway --internet-gateway-id $IGW_ID --region $AWS_REGION 2>/dev/null || true
    done

    # Eliminar VPC
    print_status "  Eliminando VPC..."
    aws ec2 delete-vpc --vpc-id $VPC_ID --region $AWS_REGION 2>/dev/null && \
        print_success "VPC eliminada" || print_error "VPC no se pudo eliminar (puede haber recursos dependientes pendientes)"
else
    print_warning "VPC no encontrada"
fi

# ============================================================================
# RESUMEN FINAL
# ============================================================================
echo ""
echo "=============================================="
echo "   ✅ LIMPIEZA COMPLETADA"
echo "=============================================="
echo ""
echo "Recursos eliminados:"
echo "  ✓ ECS Services (backend + frontend)"
echo "  ✓ ECS Task Definitions"
echo "  ✓ ECS Cluster"
echo "  ✓ RDS PostgreSQL"
echo "  ✓ DB Subnet Group"
echo "  ✓ ECR Repositories (backend + frontend)"
echo "  ✓ Secrets Manager"
echo "  ✓ CodeBuild Projects (backend + frontend)"
echo "  ✓ CloudWatch Log Group"
echo "  ✓ IAM Roles (execution, task, codebuild)"
echo "  ✓ VPC (subnets, SGs, IGW, route tables, ENIs)"
echo ""
echo "⚠️  Nota: Verifica en la consola AWS que no queden"
echo "   recursos huérfanos en la región $AWS_REGION"
echo ""
