# ESPECIFICACIÓN TÉCNICA: ASISTENTE REHAB AI (GCP & VERTEX AI)

## 1. VISIÓN GENERAL
Aplicación personal de seguimiento de rehabilitación funcional. El sistema vincula la carga de entrenamiento con la respuesta de dolor, utilizando **Gemini 1.5** vía **Vertex AI** para el procesamiento de lenguaje natural y **Cloud Run** para el despliegue.

## 2. STACK TECNOLÓGICO
- **Framework:** Next.js 14+ (App Router)
- **Base de Datos:** Cloud SQL (PostgreSQL) o SQLite con volumen persistente.
- **IA Interna:** Google Vertex AI (Modelo: `gemini-1.5-flash`)
- **Despliegue:** Google Cloud Platform (Cloud Run + Artifact Registry)
- **UI:** Tailwind CSS + ShadcnUI + Recharts

---

## 3. MODELO DE DATOS (Prisma Schema)

```prisma
datasource db {
  provider = "postgresql" // Optimizado para Cloud SQL
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-node"
}

model Ejercicio {
  id                String     @id @default(cuid())
  nombre            String     @unique
  categoria         String     
  umbralDolorMax    Int        @default(4)
  registros         Registro[]
}

model Registro {
  id              String   @id @default(cuid())
  fecha           DateTime @default(now())
  ejercicioId     String
  ejercicio       Ejercicio @relation(fields: [ejercicioId], references: [id])
  series          Int
  reps            Int
  peso            Float
  dolorIntra      Int      // Escala 0-10
  dolor24h        Int?     // Escala 0-10 (seguimiento diferido)
  notas           String?
}



## 4. REQUISITOS FUNCIONALES

### A. Interfaz de Chat (Vertex AI / Gemini)
El sistema utilizará el SDK oficial de **Google Cloud (@google-cloud/vertexai)** para procesar las entradas del usuario.
* **Acción:** El usuario envía un mensaje natural (ej: "Hoy búlgaras 3x10 con 12kg, dolor 2").
* **Prompt Interno:** El sistema instruye a **Gemini 1.5 Flash** para extraer datos en formato JSON estricto: `{ "ejercicio": string, "series": number, "reps": number, "peso": number, "dolorIntra": number }`.
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

## 6. DESPLIEGUE EN GOOGLE CLOUD (GCP)

* **Servicio de Cómputo:** **Cloud Run** (Dockerizado), configurado para escalado automático y alta disponibilidad.
* **Pipeline de CI/CD:** Uso de **Cloud Build** conectado al repositorio de GitHub para despliegues automáticos tras cada "push" a la rama principal.
* **Seguridad y Secretos:** Uso de **Secret Manager** para gestionar de forma segura las credenciales de Vertex AI y las variables de conexión a la base de datos.
* **Almacenamiento:** Conexión a una instancia de **Cloud SQL (PostgreSQL)** para garantizar la integridad y persistencia de los datos en el entorno cloud.