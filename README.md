# 📓 Cuaderno de Fallos

App para estudiar a partir de **las preguntas que has fallado** (tests de certificaciones como AWS, oposiciones, exámenes…). Las apuntas, la app te las vuelve a preguntar hasta que las dominas y te genera **resúmenes masticados de tus errores**.

Es una web estática: sin servidor, sin cuentas y sin instalación. Tus datos se guardan en tu navegador.

## Qué hace

- **Añadir preguntas falladas** en segundos: pega la pregunta entera y se detectan solas las opciones, la respuesta correcta y la explicación; o súbela desde una **captura de pantalla** (con IA). También admite conceptos / preguntas abiertas.
- **Registrar el porqué del fallo**: tipo de error (no conocía el concepto, confundí servicios, leí mal…) y qué pensaste al responder.
- **Repasar con repetición espaciada**: cada acierto aleja el siguiente repaso (1, 3, 7, 14 y 30 días); un fallo la devuelve al principio. Las opciones se barajan para que no memorices la letra.
- **Explicación masticada** de cada pregunta: por qué la correcta lo es, por qué las demás no, la pista del enunciado y una regla para recordarlo.
- **Resúmenes de tus errores** por examen o tema: diagnóstico, conceptos clave, tablas comparativas, palabras clave → respuesta, mnemotecnias, chuleta final y preguntas nuevas. Se guardan, se descargan en Markdown o se imprimen a PDF.
- **Panel**: pendientes de hoy, puntos débiles por tema, por qué fallas, racha y actividad.
- **Copias de seguridad**: exportar/importar en JSON (sirve para pasar los datos a otro dispositivo) y exportar las preguntas en Markdown.
- Modo claro/oscuro, pensada para móvil, instalable y funciona sin conexión.

## Inteligencia artificial (opcional)

Hay dos formas de usar las funciones de IA:

1. **Con clave de API de Anthropic** (Ajustes → Clave de API): la app llama a Claude directamente y guarda el resultado. La clave se queda solo en tu navegador y solo se envía a `api.anthropic.com`.
2. **Sin clave**: botón **Copiar prompt** → lo pegas en [claude.ai](https://claude.ai) → **Pegar respuesta** para guardarla en la app.

Todo lo demás (añadir, repasar, estadísticas) funciona sin IA.

## Usarla

**En local**

```bash
python3 -m http.server 8000   # o cualquier servidor estático
# abre http://localhost:8000
```

**Publicada con GitHub Pages** (gratis, para usarla desde el móvil): en el repositorio, *Settings → Pages → Deploy from a branch*, elige la rama `main` y la carpeta `/ (root)`. En el móvil, «Añadir a pantalla de inicio» la instala como app.

> Los datos viven en el navegador de cada dispositivo. Si borras los datos del navegador se pierden: exporta una copia de vez en cuando desde Ajustes.

## Estructura

```
index.html            Página única
css/styles.css        Estilos (claro/oscuro, móvil y escritorio)
js/app.js             Pantallas y navegación
js/store.js           Datos, repetición espaciada, copias de seguridad
js/ai.js              Prompts y llamadas a Claude (SDK oficial de Anthropic)
js/parse.js           Detección de preguntas pegadas como texto
js/md.js              Renderizador de Markdown seguro
js/demo.js            Preguntas de ejemplo
sw.js                 Funcionamiento sin conexión
vendor/               SDK de Anthropic empaquetado para navegador
```

No hay paso de compilación. `vendor/anthropic-sdk.js` es `@anthropic-ai/sdk` 1.8.0 empaquetado con esbuild; para regenerarlo:

```bash
npm i @anthropic-ai/sdk esbuild
echo "import A from '@anthropic-ai/sdk'; export default A;" > entry.mjs
npx esbuild entry.mjs --bundle --format=esm --platform=browser --minify --outfile=vendor/anthropic-sdk.js
```
