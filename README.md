# PhysioTrainer - Asistente de Rehabilitación con IA

Aplicación de seguimiento de rehabilitación funcional que vincula la carga de entrenamiento con la respuesta de dolor, utilizando **AWS Bedrock (Claude 3.5)** para el procesamiento de lenguaje natural.

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
│   │   ├── bedrock_service.py   # Integración AWS Bedrock
│   │   └── progresion_service.py # Regla del semáforo
│   └── main.py             # Aplicación FastAPI
├── frontend-react/         # Frontend Next.js (completo)
├── tests/                  # Tests pytest
├── deploy-aws.sh          # 🚀 Script de despliegue automático AWS
├── cleanup-aws.sh         # 🗑️ Script de limpieza AWS
├── buildspec-backend.yml  # CI/CD Backend con AWS CodeBuild
├── buildspec-frontend.yml # CI/CD Frontend con AWS CodeBuild
├── Dockerfile             # Docker para API
├── docker-compose.yml     # Desarrollo local
└── README.md
```

---

## ☁️ DESPLIEGUE EN AMAZON WEB SERVICES

### 🚀 Opción 1: Despliegue Automático (Recomendado)

#### Requisitos Previos

1. **AWS CLI instalado** y configurado con credenciales:
   ```bash
   aws configure
   ```
2. **Docker instalado** en tu máquina local o usar AWS CloudShell
3. **Acceso a Bedrock habilitado** en tu cuenta AWS (para Claude 3.5)

#### Paso 1: Clonar el repositorio

```bash
git clone https://github.com/alexgonzalezz1/PhysioTrainer.git
cd PhysioTrainer
```

#### Paso 2: Ejecutar script de despliegue

```bash
# Dar permisos de ejecución
chmod +x deploy-aws.sh

# Ejecutar el despliegue
./deploy-aws.sh
```

El script automáticamente:
- ✅ Crea repositorio en Amazon ECR
- ✅ Configura VPC, Subnets y Security Groups
- ✅ Crea instancia Amazon RDS (PostgreSQL)
- ✅ Configura AWS Secrets Manager
- ✅ Crea roles IAM con permisos para Bedrock
- ✅ Construye y sube la imagen Docker a ECR
- ✅ Despliega en Amazon ECS Fargate

---

### 📋 Opción 2: Despliegue Manual Paso a Paso

#### Paso 1: Configurar variables

```bash
export AWS_REGION=us-east-1
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export APP_NAME=physiotrainer

echo "Cuenta: $AWS_ACCOUNT_ID"
echo "Región: $AWS_REGION"
```

#### Paso 2: Crear repositorio ECR

```bash
aws ecr create-repository \
    --repository-name $APP_NAME \
    --region $AWS_REGION \
    --image-scanning-configuration scanOnPush=true

# Login a ECR
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin \
    ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com
```

#### Paso 3: Crear VPC y Networking

```bash
# Crear VPC
VPC_ID=$(aws ec2 create-vpc --cidr-block 10.0.0.0/16 --query 'Vpc.VpcId' --output text)
aws ec2 create-tags --resources $VPC_ID --tags Key=Name,Value=${APP_NAME}-vpc
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-hostnames
aws ec2 modify-vpc-attribute --vpc-id $VPC_ID --enable-dns-support

# Crear Internet Gateway
IGW_ID=$(aws ec2 create-internet-gateway --query 'InternetGateway.InternetGatewayId' --output text)
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID

# Crear Subnets
SUBNET_1=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone ${AWS_REGION}a --query 'Subnet.SubnetId' --output text)
SUBNET_2=$(aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.2.0/24 --availability-zone ${AWS_REGION}b --query 'Subnet.SubnetId' --output text)
```

#### Paso 4: Crear RDS PostgreSQL

```bash
# Generar contraseña segura
export DB_PASSWORD=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
echo "Contraseña DB: $DB_PASSWORD"  # ¡GUARDAR!

# Crear DB Subnet Group
aws rds create-db-subnet-group \
    --db-subnet-group-name ${APP_NAME}-db-subnet-group \
    --db-subnet-group-description "Subnet group for PhysioTrainer" \
    --subnet-ids $SUBNET_1 $SUBNET_2

# Crear instancia RDS
aws rds create-db-instance \
    --db-instance-identifier ${APP_NAME}-db \
    --db-instance-class db.t3.micro \
    --engine postgres \
    --engine-version 15.4 \
    --master-username physiotrainer \
    --master-user-password $DB_PASSWORD \
    --allocated-storage 20 \
    --db-name physiotrainer
```

#### Paso 5: Crear secreto en Secrets Manager

```bash
# Obtener endpoint de RDS (después de que esté disponible)
DB_ENDPOINT=$(aws rds describe-db-instances \
    --db-instance-identifier ${APP_NAME}-db \
    --query "DBInstances[0].Endpoint.Address" --output text)

# Crear secreto
aws secretsmanager create-secret \
    --name ${APP_NAME}/database-url \
    --secret-string "postgresql+asyncpg://physiotrainer:${DB_PASSWORD}@${DB_ENDPOINT}:5432/physiotrainer"
```

#### Paso 6: Crear ECS Cluster y Task Definition

```bash
# Crear cluster
aws ecs create-cluster --cluster-name ${APP_NAME}-cluster

# Construir imagen
docker build -t ${APP_NAME}:latest .
docker tag ${APP_NAME}:latest ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${APP_NAME}:latest
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${APP_NAME}:latest
```

#### Paso 7: Desplegar en ECS Fargate

Registra una Task Definition y crea el servicio ECS. Ver `deploy-aws.sh` para los detalles completos.

---

### 🔄 Opción 3: CI/CD con AWS CodePipeline

1. Crear un proyecto en **AWS CodeBuild** apuntando a tu repositorio GitHub
2. Usar el archivo `buildspec.yml` incluido
3. Configurar **CodePipeline** para despliegue automático a ECS

---

## 🛠️ Desarrollo Local

### Requisitos

- Python 3.11+
- Docker y Docker Compose
- AWS CLI configurado (para Bedrock)

### Configuración

1. **Clonar repositorio**:
   ```bash
   git clone https://github.com/alexgonzalezz1/PhysioTrainer.git
   cd PhysioTrainer
   ```

2. **Crear archivo `.env`**:
   ```bash
   cp .env.example .env
   # Editar .env con tus credenciales AWS
   ```

3. **Iniciar con Docker Compose**:
   ```bash
   docker-compose up -d
   ```

4. **Acceder a la aplicación**:
   - API: http://localhost:8080
   - Docs: http://localhost:8080/docs
   - Frontend React: http://localhost:3000

### Sin Docker

```bash
# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
.\venv\Scripts\activate   # Windows

# Instalar dependencias
pip install -r requirements.txt

# Ejecutar
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 📊 API Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/v1/chat/` | Procesar mensaje y extraer ejercicio |
| GET | `/api/v1/ejercicios/` | Listar ejercicios |
| POST | `/api/v1/ejercicios/` | Crear ejercicio |
| GET | `/api/v1/registros/` | Listar registros |
| PUT | `/api/v1/registros/{id}/dolor24h` | Actualizar dolor 24h |
| GET | `/api/v1/informes/tendencias/{id}` | Obtener tendencias |
| GET | `/api/v1/informes/mensual/{year}/{month}` | Informe mensual |

---

## 🧹 Limpieza de Recursos AWS

Para eliminar todos los recursos y evitar costos:

```bash
chmod +x cleanup-aws.sh
./cleanup-aws.sh
```

---

## 💰 Estimación de Costos AWS

| Servicio | Configuración | Costo Estimado/mes |
|----------|---------------|-------------------|
| ECS Fargate | 0.25 vCPU, 0.5GB RAM | ~$10-15 |
| RDS PostgreSQL | db.t3.micro | ~$15-20 |
| ECR | <1GB imágenes | ~$0.10 |
| Secrets Manager | 1 secreto | ~$0.40 |
| Bedrock (Claude) | Por uso | Variable* |

*El costo de Bedrock depende del uso. Claude 3.5 Sonnet: ~$3/1M tokens input, ~$15/1M tokens output.

**Total estimado**: ~$25-40/mes (sin incluir uso intensivo de Bedrock)

---

## 🔧 Variables de Entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | URL de conexión PostgreSQL | `postgresql+asyncpg://...` |
| `AWS_REGION` | Región de AWS | `us-east-1` |
| `AWS_ACCESS_KEY_ID` | Access Key ID (local) | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | Secret Access Key (local) | `...` |
| `BEDROCK_MODEL_ID` | ID del modelo Bedrock | `anthropic.claude-3-5-sonnet-20241022-v2:0` |
| `DEBUG` | Modo debug | `True/False` |

---

## 🐛 Troubleshooting

### Error: "Access denied" al invocar Bedrock

1. Verifica que tienes acceso a Bedrock habilitado en tu cuenta
2. Ve a AWS Console → Bedrock → Model Access → Request Access para Claude
3. Verifica que el IAM Role tiene la política `BedrockAccess`

### Error: Conexión a RDS rechazada

1. Verifica que el Security Group permite tráfico desde ECS
2. Comprueba que RDS está en estado "Available"
3. Revisa los logs en CloudWatch: `/ecs/physiotrainer`

### Error: Task no inicia en ECS

1. Revisa CloudWatch Logs para ver el error específico
2. Verifica que la imagen existe en ECR
3. Comprueba los permisos del Task Execution Role

---

## 📜 Licencia

MIT License - ver [LICENSE](LICENSE) para más detalles.

---

## 👨‍💻 Autor

Desarrollado para facilitar el seguimiento de rehabilitación funcional con tecnología de IA.
