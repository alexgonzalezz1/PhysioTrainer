// Integración con Claude mediante el SDK oficial de Anthropic (empaquetado en
// /vendor para no depender de ningún CDN ni paso de compilación).
// La clave de API la pone el usuario en Ajustes y solo se guarda en su navegador.
import { state, ERROR_TYPES } from './store.js';

let sdk;
async function client() {
  if (!state.settings.apiKey) throw new Error('Falta la clave de API. Añádela en Ajustes o usa «Copiar prompt».');
  sdk ??= (await import('../vendor/anthropic-sdk.js')).default;
  // dangerouslyAllowBrowser: la app no tiene servidor; la clave es del propio usuario.
  return new sdk({ apiKey: state.settings.apiKey, dangerouslyAllowBrowser: true });
}

export const hasKey = () => !!state.settings.apiKey;

const SYSTEM = `Eres un tutor experto que ayuda a un estudiante a preparar exámenes (certificaciones como AWS, oposiciones, universidad...) a partir de las preguntas que HA FALLADO.

Cómo explicas:
- En español, claro y directo, "masticado": como se lo contarías a un compañero inteligente que todavía no domina el tema. Si la pregunta original está en inglés, mantén en inglés los nombres propios de servicios, productos y términos técnicos.
- Vas a la causa del error: qué idea equivocada lleva a elegir la opción mala y qué pista del enunciado debía haber disparado la correcta.
- Usas analogías cotidianas, reglas mnemotécnicas y tablas comparativas cuando ayudan de verdad, no por rellenar.
- Eres riguroso: si no estás seguro de un dato concreto (un límite, un número, un comportamiento reciente), dilo en vez de inventarlo. Si crees que la respuesta marcada como correcta está mal, avísalo explícitamente.
- Formato Markdown (títulos, listas, tablas, negritas). Sin preámbulos ni despedidas: empieza directamente por el contenido.`;

// ---- Serialización de preguntas para los prompts ----
export function questionToText(q, n) {
  const L = (i) => String.fromCharCode(65 + i);
  const lab = (ids) => q.options.map((o, i) => (ids.includes(o.id) ? L(i) : null)).filter(Boolean).join(', ') || '—';
  let s = `### Pregunta${n ? ' ' + n : ''}${q.topic ? ` · Tema: ${q.topic}` : ''}\n${q.text}\n`;
  if (q.type === 'test' && q.options.length) {
    s += q.options.map((o, i) => `${L(i)}. ${o.text}`).join('\n') + '\n';
    s += `Respuesta correcta: ${lab(q.correct)}\nLo que respondí yo: ${lab(q.mine)}\n`;
  }
  if (q.errorType) s += `Tipo de error (según yo): ${ERROR_TYPES[q.errorType] || q.errorType}\n`;
  if (q.whyWrong) s += `Por qué creo que fallé: ${q.whyWrong}\n`;
  if (q.explanation) s += `Explicación / apuntes que tengo: ${q.explanation}\n`;
  if (q.srs?.reviews) s += `Repasos posteriores: ${q.srs.ok}/${q.srs.reviews} aciertos\n`;
  return s;
}

export function explainPrompt(q) {
  return `He fallado esta pregunta${q.deck ? ` preparando «${q.deck}»` : ''}. Explícamela masticada.

${questionToText(q)}
Estructura la respuesta así:
## 🎯 La idea clave
Dos o tres frases con el concepto que hay que tener claro para no volver a fallarla.
## ✅ Por qué la correcta es correcta
## ❌ Por qué las demás no
Una línea por opción incorrecta. Detente más en la que marqué yo: por qué resulta tentadora y dónde está la trampa.
## 🔍 La pista del enunciado
Qué palabras o requisitos del enunciado delatan la respuesta.
## 🧠 Para recordarlo
Una analogía o regla mnemotécnica corta, y si aplica una mini tabla comparando los conceptos que se confunden.
## ⚡ Comprueba que lo has entendido
Una pregunta corta nueva sobre el mismo concepto, con su respuesta al final.${
    q.type !== 'test' ? '\n\n(Es un concepto/pregunta abierta, no tipo test: adapta las secciones y omite las que no apliquen.)' : ''
  }`;
}

export function summaryPrompt(questions, scope) {
  return `Estas son ${questions.length} preguntas que he fallado${scope ? ` preparando «${scope}»` : ''}. Hazme una guía de repaso basada en mis errores.

${questions.map((q, i) => questionToText(q, i + 1)).join('\n')}
Estructura la guía así:
# Guía de repaso${scope ? `: ${scope}` : ''}
## 1. Diagnóstico: dónde estoy fallando
Patrones que ves en mis errores (temas flojos, tipos de confusión, trampas en las que caigo). Concreto y honesto, citando las preguntas por número.
## 2. Conceptos clave, masticados
Agrupa por tema. Para cada concepto que me falla: explicación sencilla, cuándo se usa y cuándo NO, y la confusión típica. Usa analogías.
## 3. Tablas comparativas
Para los conceptos/servicios que confundo entre sí: una tabla con las diferencias que deciden la respuesta en el examen.
## 4. Palabras clave → respuesta
Lista del tipo «si el enunciado dice X, piensa en Y».
## 5. Reglas mnemotécnicas
## 6. Chuleta final
Lo imprescindible en 10–15 viñetas, para leer justo antes del examen.
## 7. Ponte a prueba
5 preguntas tipo test NUEVAS (no repitas las mías) sobre mis puntos débiles, con 4 opciones cada una. Pon las soluciones razonadas todas juntas al final, bajo un título «Soluciones».`;
}

const EXTRACT = `Extrae la pregunta de examen del contenido que te paso (texto pegado o captura de pantalla) y devuélvela como JSON. Responde SOLO con el objeto JSON, sin texto alrededor ni bloque de código.

Esquema:
{
  "text": "enunciado completo, tal cual, sin las opciones",
  "options": ["texto de la opción A sin la letra", "texto de la B", ...],
  "correct": [índices (empezando en 0) de las opciones correctas si el contenido las indica; si no, []],
  "mine": [índices de las opciones que marcó el estudiante si se ve; si no, []],
  "explanation": "explicación que aparezca en el contenido, o \\"\\"",
  "topic": "tema concreto en 1-3 palabras (p. ej. el servicio o concepto principal)",
  "type": "test" si tiene opciones, "concepto" si es una pregunta abierta o un apunte
}

No inventes nada que no esté en el contenido: no deduzcas tú la respuesta correcta. Transcribe en el idioma original.`;

// ---- Llamada genérica en streaming ----
async function run({ content, system = SYSTEM, maxTokens = 64000, onText, signal }) {
  const c = await client();
  try {
    const stream = c.beta.messages.stream(
      {
        model: state.settings.model,
        max_tokens: maxTokens,
        system,
        // Si el modelo declina por un filtro de seguridad, la API reintenta
        // sola con el modelo alternativo que tenga configurado por defecto.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        messages: [{ role: 'user', content }],
      },
      { signal },
    );
    if (onText) stream.on('text', (_delta, snapshot) => onText(snapshot));
    const msg = await stream.finalMessage();
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    if (msg.stop_reason === 'refusal') throw new Error('El modelo ha declinado responder a esta petición.');
    if (msg.stop_reason === 'max_tokens') return text + '\n\n> ⚠️ La respuesta se cortó por longitud.';
    return text;
  } catch (e) {
    throw friendly(e);
  }
}

function friendly(e) {
  if (e instanceof sdk.APIUserAbortError) return new Error('Cancelado.');
  if (e instanceof sdk.AuthenticationError) return new Error('La clave de API no es válida. Revísala en Ajustes.');
  if (e instanceof sdk.PermissionDeniedError) return new Error('Tu clave no tiene permiso para usar este modelo.');
  if (e instanceof sdk.NotFoundError) return new Error('Modelo no disponible para tu cuenta. Elige otro en Ajustes.');
  if (e instanceof sdk.RateLimitError) return new Error('Límite de uso alcanzado. Espera un momento y reintenta.');
  if (e instanceof sdk.APIConnectionError) return new Error('Sin conexión con la API de Anthropic. Comprueba tu red.');
  if (e instanceof sdk.APIError) return new Error(`Error de la API (${e.status ?? '?'}): ${e.message}`);
  return e;
}

export const explain = (q, opts) => run({ content: explainPrompt(q), ...opts });
export const summarize = (questions, scope, opts) => run({ content: summaryPrompt(questions, scope), ...opts });

// Convierte texto pegado o una captura en una pregunta estructurada.
export async function extract({ text, image }, opts = {}) {
  const content = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.type, data: image.data } });
  content.push({ type: 'text', text: text ? `Contenido:\n\n${text}` : 'El contenido es la imagen adjunta.' });
  const out = await run({ content, system: EXTRACT, maxTokens: 16000, ...opts });
  const a = out.indexOf('{');
  const b = out.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('No he podido interpretar la pregunta. Prueba a pegarla como texto.');
  let d;
  try {
    d = JSON.parse(out.slice(a, b + 1));
  } catch {
    throw new Error('No he podido interpretar la pregunta. Prueba a pegarla como texto.');
  }
  const options = (Array.isArray(d.options) ? d.options : []).map(String);
  const idx = (v) => (Array.isArray(v) ? v.filter((i) => Number.isInteger(i) && i >= 0 && i < options.length) : []);
  return {
    text: String(d.text || ''),
    options,
    correct: idx(d.correct),
    mine: idx(d.mine),
    explanation: String(d.explanation || ''),
    topic: String(d.topic || ''),
    type: d.type === 'concepto' || !options.length ? 'concepto' : 'test',
  };
}
