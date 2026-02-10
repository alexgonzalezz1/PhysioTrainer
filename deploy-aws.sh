#!/bin/bash
# ============================================================================
# PhysioTrainer - Script de Despliegue en Amazon Web Services
# ============================================================================
# Este script configura y despliega la aplicación completa en AWS
# Ejecutar con: ./deploy-aws.sh
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
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
APP_NAME="physiotrainer"
SERVICE_NAME="${APP_NAME}-api"
FRONTEND_SERVICE_NAME="${APP_NAME}-frontend"
CLUSTER_NAME="${APP_NAME}-cluster"
DB_INSTANCE_NAME="${APP_NAME}-db"
DB_NAME="physiotrainer"
DB_USER="physiotrainer"
DB_PASSWORD="${DB_PASSWORD:-$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)}"
ECR_REPO_NAME="${APP_NAME}"
ECR_FRONTEND_REPO_NAME="${APP_NAME}-frontend"
GITHUB_REPO="https://github.com/alexgonzalezz1/PhysioTrainer.git"
CODEBUILD_PROJECT_BACKEND="${APP_NAME}-backend-build"
CODEBUILD_PROJECT_FRONTEND="${APP_NAME}-frontend-build"
CODEBUILD_ROLE_NAME="${APP_NAME}-codebuild-role"
VPC_CIDR="10.0.0.0/16"

# ============================================================================
# VERIFICACIONES INICIALES
# ============================================================================
echo ""
echo "=============================================="
echo "   PhysioTrainer - Despliegue en AWS"
echo "=============================================="
echo ""

# Verificar AWS CLI
if ! command -v aws &> /dev/null; then
    print_error "AWS CLI no está instalado. Instálalo primero."
    exit 1
fi

# Verificar que estamos autenticados
if [ -z "$AWS_ACCOUNT_ID" ]; then
    print_error "No hay credenciales de AWS configuradas. Ejecuta: aws configure"
    exit 1
fi

print_status "Cuenta AWS: $AWS_ACCOUNT_ID"
print_status "Región: $AWS_REGION"
echo ""

# Confirmar despliegue
read -p "¿Continuar con el despliegue? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    print_warning "Despliegue cancelado"
    exit 0
fi

# ============================================================================
# PASO 1: Crear repositorio ECR
# ============================================================================
print_status "Configurando Amazon ECR..."

if ! aws ecr describe-repositories --repository-names $ECR_REPO_NAME --region $AWS_REGION &>/dev/null; then
    aws ecr create-repository \
        --repository-name $ECR_REPO_NAME \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=true
    print_success "Repositorio ECR creado"
else
    print_warning "Repositorio ECR ya existe"
fi

if ! aws ecr describe-repositories --repository-names $ECR_FRONTEND_REPO_NAME --region $AWS_REGION &>/dev/null; then
    aws ecr create-repository \
        --repository-name $ECR_FRONTEND_REPO_NAME \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=true
    print_success "Repositorio ECR frontend creado"
else
    print_warning "Repositorio ECR frontend ya existe"
fi

ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO_NAME}"
ECR_FRONTEND_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_FRONTEND_REPO_NAME}"

# ============================================================================
# PASO 2: Crear VPC y subnets (si no existen)
# ============================================================================
print_status "Configurando VPC..."

# Verificar si existe VPC con tag PhysioTrainer
VPC_ID=$(aws ec2 describe-vpcs --filters "Name=tag:Name,Values=${APP_NAME}-vpc" --query "Vpcs[0].VpcId" --output text --region $AWS_REGION 2>/dev/null)

if [ "$VPC_ID" == "None" ] || [ -z "$VPC_ID" ]; then
    print_status "Creando VPC..."
    
    # Crear VPC
    VPC_ID=$(aws ec2 create-vpc --cidr-block $VPC_CIDR --query 'Vpc.VpcId' --output text --region $AWS_REGION)
    aws ec2 create-tags --resources $VPC_ID --tags Key=Name,Value=${APP_NAME}-vpc --region $AWS_REGION
    aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames --region $AWS_REGION
    aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-support --region $AWS_REGION
    
    # Crear Internet Gateway
    IGW_ID=$(aws ec2 create-internet-gateway --query 'InternetGateway.InternetGatewayId' --output text --region $AWS_REGION)
    aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID --region $AWS_REGION
    aws ec2 create-tags --resources $IGW_ID --tags Key=Name,Value=${APP_NAME}-igw --region $AWS_REGION
    
    # Crear subnets públicas
    SUBNET_1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone ${AWS_REGION}a --query 'Subnet.SubnetId' --output text --region $AWS_REGION)
    SUBNET_2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.2.0/24 --availability-zone ${AWS_REGION}b --query 'Subnet.SubnetId' --output text --region $AWS_REGION)
    aws ec2 create-tags --resources $SUBNET_1 --tags Key=Name,Value=${APP_NAME}-subnet-1 --region $AWS_REGION
    aws ec2 create-tags --resources $SUBNET_2 --tags Key=Name,Value=${APP_NAME}-subnet-2 --region $AWS_REGION
    
    # Habilitar auto-assign public IP
    aws ec2 modify-subnet-attribute --subnet-id $SUBNET_1 --map-public-ip-on-launch --region $AWS_REGION
    aws ec2 modify-subnet-attribute --subnet-id $SUBNET_2 --map-public-ip-on-launch --region $AWS_REGION
    
    # Crear route table
    RTB_ID=$(aws ec2 create-route-table --vpc-id $VPC_ID --query 'RouteTable.RouteTableId' --output text --region $AWS_REGION)
    aws ec2 create-route --route-table-id $RTB_ID --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID --region $AWS_REGION
    aws ec2 associate-route-table --subnet-id $SUBNET_1 --route-table-id $RTB_ID --region $AWS_REGION
    aws ec2 associate-route-table --subnet-id $SUBNET_2 --route-table-id $RTB_ID --region $AWS_REGION
    
    print_success "VPC y subnets creadas"
else
    print_warning "VPC ya existe: $VPC_ID"
    SUBNET_1=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=${APP_NAME}-subnet-1" --query "Subnets[0].SubnetId" --output text --region $AWS_REGION)
    SUBNET_2=$(aws ec2 describe-subnets --filters "Name=tag:Name,Values=${APP_NAME}-subnet-2" --query "Subnets[0].SubnetId" --output text --region $AWS_REGION)
fi

# ============================================================================
# PASO 3: Crear Security Groups
# ============================================================================
print_status "Configurando Security Groups..."

# Security Group para ECS
ECS_SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${APP_NAME}-ecs-sg" "Name=vpc-id,Values=$VPC_ID" --query "SecurityGroups[0].GroupId" --output text --region $AWS_REGION 2>/dev/null)

if [ "$ECS_SG_ID" == "None" ] || [ -z "$ECS_SG_ID" ]; then
    ECS_SG_ID=$(aws ec2 create-security-group --group-name ${APP_NAME}-ecs-sg --description "Security group for PhysioTrainer ECS" --vpc-id $VPC_ID --query 'GroupId' --output text --region $AWS_REGION)
    aws ec2 authorize-security-group-ingress --group-id $ECS_SG_ID --protocol tcp --port 8080 --cidr 0.0.0.0/0 --region $AWS_REGION
    aws ec2 authorize-security-group-ingress --group-id $ECS_SG_ID --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region $AWS_REGION
    aws ec2 authorize-security-group-egress --group-id $ECS_SG_ID --protocol -1 --cidr 0.0.0.0/0 --region $AWS_REGION 2>/dev/null || true
    print_success "Security Group ECS creado"
else
    print_warning "Security Group ECS ya existe"
    aws ec2 authorize-security-group-ingress --group-id $ECS_SG_ID --protocol tcp --port 3000 --cidr 0.0.0.0/0 --region $AWS_REGION 2>/dev/null || true
fi

# Security Group para RDS
RDS_SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=${APP_NAME}-rds-sg" "Name=vpc-id,Values=$VPC_ID" --query "SecurityGroups[0].GroupId" --output text --region $AWS_REGION 2>/dev/null)

if [ "$RDS_SG_ID" == "None" ] || [ -z "$RDS_SG_ID" ]; then
    RDS_SG_ID=$(aws ec2 create-security-group --group-name ${APP_NAME}-rds-sg --description "Security group for PhysioTrainer RDS" --vpc-id $VPC_ID --query 'GroupId' --output text --region $AWS_REGION)
    aws ec2 authorize-security-group-ingress --group-id $RDS_SG_ID --protocol tcp --port 5432 --source-group $ECS_SG_ID --region $AWS_REGION
    print_success "Security Group RDS creado"
else
    print_warning "Security Group RDS ya existe"
fi

# ============================================================================
# PASO 4: Crear RDS PostgreSQL
# ============================================================================
print_status "Configurando Amazon RDS..."

# Crear DB Subnet Group
aws rds create-db-subnet-group \
    --db-subnet-group-name ${APP_NAME}-db-subnet-group \
    --db-subnet-group-description "Subnet group for PhysioTrainer DB" \
    --subnet-ids $SUBNET_1 $SUBNET_2 \
    --region $AWS_REGION 2>/dev/null || print_warning "DB Subnet Group ya existe"

if ! aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE_NAME --region $AWS_REGION &>/dev/null; then
    print_status "Creando instancia RDS (esto puede tardar varios minutos)..."
    
    aws rds create-db-instance \
        --db-instance-identifier $DB_INSTANCE_NAME \
        --db-instance-class db.t3.micro \
        --engine postgres \
        --engine-version 17.7 \
        --master-username $DB_USER \
        --master-user-password $DB_PASSWORD \
        --allocated-storage 20 \
        --db-name $DB_NAME \
        --vpc-security-group-ids $RDS_SG_ID \
        --db-subnet-group-name ${APP_NAME}-db-subnet-group \
        --publicly-accessible \
        --backup-retention-period 0 \
        --no-multi-az \
        --storage-type gp2 \
        --region $AWS_REGION
    
    print_status "Esperando a que RDS esté disponible..."
    aws rds wait db-instance-available --db-instance-identifier $DB_INSTANCE_NAME --region $AWS_REGION
    
    print_success "Instancia RDS creada"
else
    print_warning "Instancia RDS ya existe"
fi

# Obtener endpoint de RDS
DB_ENDPOINT=$(aws rds describe-db-instances --db-instance-identifier $DB_INSTANCE_NAME --query "DBInstances[0].Endpoint.Address" --output text --region $AWS_REGION)
DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@${DB_ENDPOINT}:5432/${DB_NAME}"

print_status "RDS Endpoint: $DB_ENDPOINT"

# ============================================================================
# PASO 5: Crear secreto en Secrets Manager
# ============================================================================
print_status "Configurando AWS Secrets Manager..."

SECRET_ARN=$(aws secretsmanager describe-secret --secret-id ${APP_NAME}/database-url --query "ARN" --output text --region $AWS_REGION 2>/dev/null || true)

if [ -z "$SECRET_ARN" ] || [ "$SECRET_ARN" == "None" ]; then
    SECRET_ARN=$(aws secretsmanager create-secret \
        --name ${APP_NAME}/database-url \
        --description "Database URL for PhysioTrainer" \
        --secret-string "$DATABASE_URL" \
        --query "ARN" --output text \
        --region $AWS_REGION)
    print_success "Secreto creado"
else
    aws secretsmanager put-secret-value \
        --secret-id ${APP_NAME}/database-url \
        --secret-string "$DATABASE_URL" \
        --region $AWS_REGION
    print_warning "Secreto actualizado"
fi

# ============================================================================
# PASO 6: Crear ECS Cluster
# ============================================================================
print_status "Configurando Amazon ECS..."

if ! aws ecs describe-clusters --clusters $CLUSTER_NAME --query "clusters[0].status" --output text --region $AWS_REGION 2>/dev/null | grep -q "ACTIVE"; then
    aws ecs create-cluster --cluster-name $CLUSTER_NAME --region $AWS_REGION
    print_success "Cluster ECS creado"
else
    print_warning "Cluster ECS ya existe"
fi

# ============================================================================
# PASO 7: Crear IAM Role para ECS Task
# ============================================================================
print_status "Configurando IAM Roles..."

# Task Execution Role
TASK_EXEC_ROLE_NAME="${APP_NAME}-ecs-task-execution-role"
TASK_EXEC_ROLE_ARN=$(aws iam get-role --role-name $TASK_EXEC_ROLE_NAME --query "Role.Arn" --output text 2>/dev/null || true)

ECS_TRUST_POLICY='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ecs-tasks.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

if [ -z "$TASK_EXEC_ROLE_ARN" ]; then
    aws iam create-role \
        --role-name $TASK_EXEC_ROLE_NAME \
        --assume-role-policy-document "$ECS_TRUST_POLICY"
    TASK_EXEC_ROLE_ARN=$(aws iam get-role --role-name $TASK_EXEC_ROLE_NAME --query "Role.Arn" --output text)
    print_success "IAM Task Execution Role creado"
else
    print_warning "IAM Task Execution Role ya existe"
fi

# Siempre asegurar que las policies estén adjuntas (idempotente)
aws iam attach-role-policy \
    --role-name $TASK_EXEC_ROLE_NAME \
    --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy 2>/dev/null || true

SECRETS_POLICY=$(printf '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["secretsmanager:GetSecretValue"],"Resource":"%s"}]}' "$SECRET_ARN")
aws iam put-role-policy \
    --role-name $TASK_EXEC_ROLE_NAME \
    --policy-name SecretsManagerAccess \
    --policy-document "$SECRETS_POLICY"

# Task Role (for Bedrock access)
TASK_ROLE_NAME="${APP_NAME}-ecs-task-role"
TASK_ROLE_ARN=$(aws iam get-role --role-name $TASK_ROLE_NAME --query "Role.Arn" --output text 2>/dev/null || true)

if [ -z "$TASK_ROLE_ARN" ]; then
    aws iam create-role \
        --role-name $TASK_ROLE_NAME \
        --assume-role-policy-document "$ECS_TRUST_POLICY"
    TASK_ROLE_ARN=$(aws iam get-role --role-name $TASK_ROLE_NAME --query "Role.Arn" --output text)
    print_success "IAM Task Role creado"
else
    print_warning "IAM Task Role ya existe"
fi

# Siempre asegurar que la policy de Bedrock esté adjunta (idempotente)
BEDROCK_POLICY='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream"],"Resource":"arn:aws:bedrock:*::foundation-model/anthropic.*"}]}'
aws iam put-role-policy \
    --role-name $TASK_ROLE_NAME \
    --policy-name BedrockAccess \
    --policy-document "$BEDROCK_POLICY"

# ============================================================================
# PASO 8: Crear CodeBuild y construir imágenes Docker en la nube
# ============================================================================
print_status "Configurando AWS CodeBuild..."

# Crear IAM Role para CodeBuild
CODEBUILD_ROLE_ARN=$(aws iam get-role --role-name $CODEBUILD_ROLE_NAME --query "Role.Arn" --output text 2>/dev/null || true)

if [ -z "$CODEBUILD_ROLE_ARN" ]; then
    CODEBUILD_TRUST='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"codebuild.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
    aws iam create-role \
        --role-name $CODEBUILD_ROLE_NAME \
        --assume-role-policy-document "$CODEBUILD_TRUST"

    CODEBUILD_PERMS='{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":["ecr:GetAuthorizationToken","ecr:BatchCheckLayerAvailability","ecr:GetDownloadUrlForLayer","ecr:BatchGetImage","ecr:PutImage","ecr:InitiateLayerUpload","ecr:UploadLayerPart","ecr:CompleteLayerUpload"],"Resource":"*"},{"Effect":"Allow","Action":["logs:CreateLogGroup","logs:CreateLogStream","logs:PutLogEvents"],"Resource":"*"}]}'
    aws iam put-role-policy \
        --role-name $CODEBUILD_ROLE_NAME \
        --policy-name CodeBuildPermissions \
        --policy-document "$CODEBUILD_PERMS"

    CODEBUILD_ROLE_ARN=$(aws iam get-role --role-name $CODEBUILD_ROLE_NAME --query "Role.Arn" --output text)

    print_success "IAM Role de CodeBuild creado"
    # Esperar propagación IAM
    sleep 10
else
    print_warning "IAM Role de CodeBuild ya existe"
fi

# --- Proyecto CodeBuild para BACKEND ---
if ! aws codebuild batch-get-projects --names $CODEBUILD_PROJECT_BACKEND --query "projects[0].name" --output text --region $AWS_REGION 2>/dev/null | grep -q $CODEBUILD_PROJECT_BACKEND; then
    print_status "Creando proyecto CodeBuild para backend..."
    BACKEND_PROJECT_JSON=$(printf '{"name":"%s","source":{"type":"GITHUB","location":"%s","buildspec":"buildspec-backend.yml"},"artifacts":{"type":"NO_ARTIFACTS"},"environment":{"type":"LINUX_CONTAINER","computeType":"BUILD_GENERAL1_SMALL","image":"aws/codebuild/amazonlinux2-x86_64-standard:5.0","privilegedMode":true,"environmentVariables":[{"name":"AWS_ACCOUNT_ID","value":"%s"},{"name":"AWS_DEFAULT_REGION","value":"%s"},{"name":"ECR_REPO_NAME","value":"%s"}]},"serviceRole":"%s"}' "$CODEBUILD_PROJECT_BACKEND" "$GITHUB_REPO" "$AWS_ACCOUNT_ID" "$AWS_REGION" "$ECR_REPO_NAME" "$CODEBUILD_ROLE_ARN")
    aws codebuild create-project --cli-input-json "$BACKEND_PROJECT_JSON" --region $AWS_REGION
    print_success "Proyecto CodeBuild backend creado"
else
    print_warning "Proyecto CodeBuild backend ya existe"
fi

# Lanzar build del backend
print_status "Construyendo imagen Docker del backend en CodeBuild (puede tardar 3-5 min)..."
BACKEND_BUILD_ID=$(aws codebuild start-build --project-name $CODEBUILD_PROJECT_BACKEND --region $AWS_REGION --query "build.id" --output text)
print_status "Build ID: $BACKEND_BUILD_ID"

# Esperar a que termine
while true; do
    BUILD_STATUS=$(aws codebuild batch-get-builds --ids $BACKEND_BUILD_ID --query "builds[0].buildStatus" --output text --region $AWS_REGION)
    if [ "$BUILD_STATUS" == "SUCCEEDED" ]; then
        print_success "Imagen backend construida y subida a ECR"
        break
    elif [ "$BUILD_STATUS" == "FAILED" ] || [ "$BUILD_STATUS" == "FAULT" ] || [ "$BUILD_STATUS" == "STOPPED" ] || [ "$BUILD_STATUS" == "TIMED_OUT" ]; then
        print_error "Build del backend falló: $BUILD_STATUS"
        print_error "Revisa los logs en: aws codebuild batch-get-builds --ids $BACKEND_BUILD_ID"
        exit 1
    fi
    echo -n "."
    sleep 15
done

# ============================================================================
# PASO 9: Crear CloudWatch Log Group
# ============================================================================
print_status "Configurando CloudWatch Logs..."

aws logs create-log-group --log-group-name /ecs/${APP_NAME} --region $AWS_REGION 2>/dev/null || print_warning "Log group ya existe"

# ============================================================================
# PASO 10: Registrar Task Definition
# ============================================================================
print_status "Registrando Task Definition..."

TASK_DEF_JSON=$(printf '{"family":"%s-task","networkMode":"awsvpc","requiresCompatibilities":["FARGATE"],"cpu":"256","memory":"512","executionRoleArn":"%s","taskRoleArn":"%s","containerDefinitions":[{"name":"%s","image":"%s:latest","portMappings":[{"containerPort":8080,"protocol":"tcp"}],"essential":true,"environment":[{"name":"AWS_REGION","value":"%s"},{"name":"BEDROCK_REGION","value":"us-east-1"},{"name":"PORT","value":"8080"}],"secrets":[{"name":"DATABASE_URL","valueFrom":"%s"}],"logConfiguration":{"logDriver":"awslogs","options":{"awslogs-group":"/ecs/%s","awslogs-region":"%s","awslogs-stream-prefix":"ecs"}},"healthCheck":{"command":["CMD-SHELL","curl -f http://localhost:8080/health || exit 1"],"interval":30,"timeout":5,"retries":3,"startPeriod":60}}]}' "$APP_NAME" "$TASK_EXEC_ROLE_ARN" "$TASK_ROLE_ARN" "$SERVICE_NAME" "$ECR_URI" "$AWS_REGION" "$SECRET_ARN" "$APP_NAME" "$AWS_REGION")
aws ecs register-task-definition --cli-input-json "$TASK_DEF_JSON" --region $AWS_REGION

print_success "Task Definition registrada"

# ============================================================================
# PASO 11: Crear ECS Service
# ============================================================================
print_status "Desplegando servicio en ECS Fargate..."

# Check if service exists (describe-services may return exit code 0 with empty services[])
SERVICE_ARN=$(aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --query "services[0].serviceArn" --output text --region $AWS_REGION 2>/dev/null || true)

if [ -z "$SERVICE_ARN" ] || [ "$SERVICE_ARN" == "None" ]; then
    aws ecs create-service \
        --cluster $CLUSTER_NAME \
        --service-name $SERVICE_NAME \
        --task-definition ${APP_NAME}-task \
        --desired-count 1 \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$ECS_SG_ID],assignPublicIp=ENABLED}" \
        --region $AWS_REGION
    print_success "Servicio ECS creado"
else
    aws ecs update-service \
        --cluster $CLUSTER_NAME \
        --service $SERVICE_NAME \
        --task-definition ${APP_NAME}-task \
        --force-new-deployment \
        --region $AWS_REGION
    print_warning "Servicio ECS actualizado"
fi

# ============================================================================
# PASO 12: Obtener IP pública de la tarea
# ============================================================================
print_status "Esperando a que el servicio esté disponible..."

PUBLIC_IP=""
API_URL=""

for i in $(seq 1 30); do
        TASK_ARN=$(aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $SERVICE_NAME --query "taskArns[0]" --output text --region $AWS_REGION 2>/dev/null || echo "None")
        if [ "$TASK_ARN" != "None" ] && [ -n "$TASK_ARN" ]; then
                ENI_ID=$(aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks $TASK_ARN --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text --region $AWS_REGION 2>/dev/null || echo "")
                if [ -n "$ENI_ID" ] && [ "$ENI_ID" != "None" ]; then
                        PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --query "NetworkInterfaces[0].Association.PublicIp" --output text --region $AWS_REGION 2>/dev/null || echo "")
                        if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "None" ]; then
                                API_URL="http://${PUBLIC_IP}:8080"
                                break
                        fi
                fi
        fi
        sleep 10
done

# ==========================================================================
# PASO 13: Desplegar Frontend (opcional)
# ==========================================================================
read -p "¿Desplegar también el frontend React (Next.js)? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
        if [ -z "$API_URL" ]; then
                print_error "No se pudo determinar la URL pública de la API. Reintenta cuando la tarea tenga IP pública."
        else
                print_status "Construyendo imagen del frontend en CodeBuild (puede tardar 3-5 min)..."

                # Crear proyecto CodeBuild para frontend (si no existe)
                if ! aws codebuild batch-get-projects --names $CODEBUILD_PROJECT_FRONTEND --query "projects[0].name" --output text --region $AWS_REGION 2>/dev/null | grep -q $CODEBUILD_PROJECT_FRONTEND; then
                    FRONTEND_PROJECT_JSON=$(printf '{"name":"%s","source":{"type":"GITHUB","location":"%s","buildspec":"buildspec-frontend.yml"},"artifacts":{"type":"NO_ARTIFACTS"},"environment":{"type":"LINUX_CONTAINER","computeType":"BUILD_GENERAL1_SMALL","image":"aws/codebuild/amazonlinux2-x86_64-standard:5.0","privilegedMode":true,"environmentVariables":[{"name":"AWS_ACCOUNT_ID","value":"%s"},{"name":"AWS_DEFAULT_REGION","value":"%s"},{"name":"ECR_FRONTEND_REPO_NAME","value":"%s"},{"name":"API_BASE_URL","value":"%s"}]},"serviceRole":"%s"}' "$CODEBUILD_PROJECT_FRONTEND" "$GITHUB_REPO" "$AWS_ACCOUNT_ID" "$AWS_REGION" "$ECR_FRONTEND_REPO_NAME" "${API_URL}/api/v1" "$CODEBUILD_ROLE_ARN")
                    aws codebuild create-project --cli-input-json "$FRONTEND_PROJECT_JSON" --region $AWS_REGION
                    print_success "Proyecto CodeBuild frontend creado"
                else
                    # Actualizar API_BASE_URL en el proyecto existente
                    aws codebuild update-project --name $CODEBUILD_PROJECT_FRONTEND \
                        --environment "type=LINUX_CONTAINER,computeType=BUILD_GENERAL1_SMALL,image=aws/codebuild/amazonlinux2-x86_64-standard:5.0,privilegedMode=true,environmentVariables=[{name=AWS_ACCOUNT_ID,value=${AWS_ACCOUNT_ID}},{name=AWS_DEFAULT_REGION,value=${AWS_REGION}},{name=ECR_FRONTEND_REPO_NAME,value=${ECR_FRONTEND_REPO_NAME}},{name=API_BASE_URL,value=${API_URL}/api/v1}]" \
                        --region $AWS_REGION >/dev/null
                    print_warning "Proyecto CodeBuild frontend actualizado con nueva API_BASE_URL"
                fi

                FRONTEND_BUILD_ID=$(aws codebuild start-build --project-name $CODEBUILD_PROJECT_FRONTEND --region $AWS_REGION --query "build.id" --output text)
                print_status "Build ID: $FRONTEND_BUILD_ID"

                while true; do
                    FBUILD_STATUS=$(aws codebuild batch-get-builds --ids $FRONTEND_BUILD_ID --query "builds[0].buildStatus" --output text --region $AWS_REGION)
                    if [ "$FBUILD_STATUS" == "SUCCEEDED" ]; then
                        print_success "Imagen frontend construida y subida a ECR"
                        break
                    elif [ "$FBUILD_STATUS" == "FAILED" ] || [ "$FBUILD_STATUS" == "FAULT" ] || [ "$FBUILD_STATUS" == "STOPPED" ] || [ "$FBUILD_STATUS" == "TIMED_OUT" ]; then
                        print_error "Build del frontend falló: $FBUILD_STATUS"
                        print_error "Revisa logs: aws codebuild batch-get-builds --ids $FRONTEND_BUILD_ID"
                        exit 1
                    fi
                    echo -n "."
                    sleep 15
                done
        
                print_status "Registrando Task Definition del frontend..."
                FRONTEND_TASK_DEF=$(printf '{"family":"%s-frontend-task","networkMode":"awsvpc","requiresCompatibilities":["FARGATE"],"cpu":"256","memory":"512","executionRoleArn":"%s","taskRoleArn":"%s","containerDefinitions":[{"name":"%s","image":"%s:latest","portMappings":[{"containerPort":3000,"protocol":"tcp"}],"essential":true,"environment":[{"name":"PORT","value":"3000"},{"name":"HOSTNAME","value":"0.0.0.0"},{"name":"API_BASE_URL","value":"%s"}],"logConfiguration":{"logDriver":"awslogs","options":{"awslogs-group":"/ecs/%s","awslogs-region":"%s","awslogs-stream-prefix":"frontend"}}}]}' "$APP_NAME" "$TASK_EXEC_ROLE_ARN" "$TASK_ROLE_ARN" "$FRONTEND_SERVICE_NAME" "$ECR_FRONTEND_URI" "${API_URL}/api/v1" "$APP_NAME" "$AWS_REGION")
                aws ecs register-task-definition --cli-input-json "$FRONTEND_TASK_DEF" --region $AWS_REGION
                print_success "Task Definition frontend registrada"
        
                print_status "Desplegando servicio frontend en ECS Fargate..."
                FRONTEND_SERVICE_ARN=$(aws ecs describe-services --cluster $CLUSTER_NAME --services $FRONTEND_SERVICE_NAME --query "services[0].serviceArn" --output text --region $AWS_REGION 2>/dev/null || true)
                if [ -z "$FRONTEND_SERVICE_ARN" ] || [ "$FRONTEND_SERVICE_ARN" == "None" ]; then
                        aws ecs create-service \
                            --cluster $CLUSTER_NAME \
                            --service-name $FRONTEND_SERVICE_NAME \
                            --task-definition ${APP_NAME}-frontend-task \
                            --desired-count 1 \
                            --launch-type FARGATE \
                            --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_1,$SUBNET_2],securityGroups=[$ECS_SG_ID],assignPublicIp=ENABLED}" \
                            --region $AWS_REGION
                        print_success "Servicio frontend ECS creado"
                else
                        aws ecs update-service \
                            --cluster $CLUSTER_NAME \
                            --service $FRONTEND_SERVICE_NAME \
                            --task-definition ${APP_NAME}-frontend-task \
                            --force-new-deployment \
                            --region $AWS_REGION
                        print_warning "Servicio frontend ECS actualizado"
                fi
        
                print_status "Obteniendo IP pública del frontend..."
                FRONTEND_PUBLIC_IP=""
                for i in $(seq 1 30); do
                        FRONTEND_TASK_ARN=$(aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $FRONTEND_SERVICE_NAME --query "taskArns[0]" --output text --region $AWS_REGION 2>/dev/null || echo "None")
                        if [ "$FRONTEND_TASK_ARN" != "None" ] && [ -n "$FRONTEND_TASK_ARN" ]; then
                                FRONTEND_ENI_ID=$(aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks $FRONTEND_TASK_ARN --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text --region $AWS_REGION 2>/dev/null || echo "")
                                if [ -n "$FRONTEND_ENI_ID" ] && [ "$FRONTEND_ENI_ID" != "None" ]; then
                                        FRONTEND_PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids $FRONTEND_ENI_ID --query "NetworkInterfaces[0].Association.PublicIp" --output text --region $AWS_REGION 2>/dev/null || echo "")
                                        if [ -n "$FRONTEND_PUBLIC_IP" ] && [ "$FRONTEND_PUBLIC_IP" != "None" ]; then
                                                break
                                        fi
                                fi
                        fi
                        sleep 10
                done

                if [ -n "$FRONTEND_PUBLIC_IP" ] && [ "$FRONTEND_PUBLIC_IP" != "None" ]; then
                        FRONTEND_URL="http://${FRONTEND_PUBLIC_IP}:3000"
                        print_success "Frontend URL: $FRONTEND_URL"
                else
                        print_warning "No se pudo determinar la IP pública del frontend aún. Revisa ECS tasks y reintenta."
                fi
        fi
fi

# ============================================================================
# RESUMEN FINAL
# ============================================================================
echo ""
echo "=============================================="
echo "   ✅ DESPLIEGUE COMPLETADO"
echo "=============================================="
echo ""
echo "📍 Cuenta AWS: $AWS_ACCOUNT_ID"
echo "📍 Región: $AWS_REGION"
echo ""
echo "🔗 URLs de la aplicación:"
if [ -n "$PUBLIC_IP" ] && [ "$PUBLIC_IP" != "None" ]; then
echo "   API:      $API_URL"
echo "   Docs:     $API_URL/docs"
echo "   Health:   $API_URL/health"
else
echo "   API:  (Esperando asignación de IP pública...)"
echo "   Ejecuta después: aws ecs list-tasks --cluster $CLUSTER_NAME"
fi
if [ -n "$FRONTEND_URL" ]; then
echo "   Frontend: $FRONTEND_URL"
fi
echo ""
echo "🗄️ Base de datos:"
echo "   Host:     $DB_ENDPOINT"
echo "   Database: $DB_NAME"
echo "   Usuario:  $DB_USER"
echo ""
echo "📦 Docker:"
echo "   ECR:      $ECR_URI"
echo ""
echo "⚠️  IMPORTANTE: Guarda la contraseña de la DB en un lugar seguro"
echo "   Password: $DB_PASSWORD"
echo ""
echo "💡 Para ver logs:"
echo "   aws logs tail /ecs/${APP_NAME} --follow --region $AWS_REGION"
echo ""
echo "=============================================="
