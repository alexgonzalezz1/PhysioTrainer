# Guía Rápida de Despliegue en GCP

## ⚡ Despliegue en 5 minutos

### 1. Abre Cloud Shell
Ve a https://console.cloud.google.com y abre Cloud Shell (icono terminal arriba a la derecha)

### 2. Clona y despliega
```bash
# Clonar repositorio
git clone https://github.com/TU_USUARIO/PhysioTrainer.git
cd PhysioTrainer

# Ejecutar despliegue automático
chmod +x deploy-gcp.sh
./deploy-gcp.sh
```

### 3. ¡Listo!
El script te dará las URLs de tu aplicación al finalizar.

---

## 📝 Comandos Útiles

### Ver estado del servicio
```bash
gcloud run services describe physiotrainer-api --region us-central1
```

### Ver logs
```bash
gcloud run services logs read physiotrainer-api --region us-central1 --limit 50
```

### Actualizar despliegue
```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/$PROJECT_ID/physiotrainer/physiotrainer-api:latest
gcloud run deploy physiotrainer-api --image us-central1-docker.pkg.dev/$PROJECT_ID/physiotrainer/physiotrainer-api:latest --region us-central1
```

### Eliminar recursos
```bash
# Eliminar Cloud Run
gcloud run services delete physiotrainer-api --region us-central1

# Eliminar Cloud SQL (¡cuidado, elimina datos!)
gcloud sql instances delete physiotrainer-db

# Eliminar secretos
gcloud secrets delete physiotrainer-db-url
```

---

## 💡 Tips

1. **Costos**: Cloud Run solo cobra cuando hay tráfico. Con poco uso = casi gratis.
2. **Logs**: Si algo falla, revisa los logs con el comando de arriba.
3. **Escalado**: Por defecto escala de 0 a 10 instancias automáticamente.
4. **Base de datos**: Cloud SQL siempre está encendida (~$10/mes). Puedes pausarla si no la usas.
