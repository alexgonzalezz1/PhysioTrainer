# PhysioTrainer Frontend (React/Next.js)

Frontend moderno para PhysioTrainer construido con Next.js 14, TypeScript y Tailwind CSS.

## 🚀 Características

- **Dashboard interactivo** con métricas en tiempo real
- **Chat con IA** para registro de entrenamientos en lenguaje natural
- **Gráficos de tendencias** con Recharts (volumen vs dolor)
- **Gestión de registros** con filtros y búsqueda
- **Sistema de semáforo** visual (🟢🟡🔴)
- **Diseño responsive** con Tailwind CSS

## 📁 Estructura

```
frontend-react/
├── src/
│   ├── app/
│   │   ├── layout.tsx      # Layout principal
│   │   ├── page.tsx        # Dashboard
│   │   ├── chat/           # Chat con IA
│   │   ├── tendencias/     # Gráficos y análisis
│   │   ├── registros/      # CRUD de registros
│   │   └── ejercicios/     # Biblioteca de ejercicios
│   ├── components/
│   │   └── layout/
│   │       └── Sidebar.tsx # Navegación lateral
│   └── lib/
│       ├── api.ts          # Cliente API
│       └── utils.ts        # Utilidades
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

## 🛠️ Instalación

```bash
cd frontend-react

# Instalar dependencias
npm install

# Ejecutar en desarrollo
npm run dev

# Construir para producción
npm run build

# Ejecutar producción
npm start
```

## ⚙️ Configuración

Crear archivo `.env.local`:

```env
API_BASE_URL=http://localhost:8000/api/v1
```

## 🎨 Stack Tecnológico

- **Framework**: Next.js 14 (App Router)
- **Lenguaje**: TypeScript
- **Estilos**: Tailwind CSS
- **Gráficos**: Recharts
- **Iconos**: Lucide React
- **Fechas**: date-fns

## 📱 Páginas

| Ruta | Descripción |
|------|-------------|
| `/` | Dashboard con métricas y alertas |
| `/chat` | Chat con IA para registrar entrenamientos |
| `/tendencias` | Gráficos de progreso e informes mensuales |
| `/registros` | Historial y gestión de registros |
| `/ejercicios` | Biblioteca de ejercicios |

## 🐳 Docker

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
EXPOSE 3000
CMD ["node", "server.js"]
```
