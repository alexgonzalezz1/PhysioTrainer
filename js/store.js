// Estado de la app: todo vive en localStorage del navegador (sin servidor).
const KEY = 'cuaderno-fallos.v1';

export const ERROR_TYPES = {
  concepto: 'No conocía el concepto',
  confusion: 'Confundí conceptos/servicios parecidos',
  lectura: 'Leí mal el enunciado',
  duda: 'Dudé entre dos y elegí mal',
  detalle: 'Se me olvidó un detalle (límite, número, nombre)',
  azar: 'Respondí al azar',
};

export const MODELS = [
  ['claude-opus-5-5', 'Claude Opus 5.5 (recomendado)'],
  ['claude-fable-5-2', 'Claude Fable 5.2 (el más capaz, más caro)'],
  ['claude-sonnet-5-5', 'Claude Sonnet 5.5 (más barato)'],
  ['claude-haiku-5-5', 'Claude Haiku 5.5 (el más barato y rápido)'],
];

const defaults = () => ({
  questions: [],
  summaries: [],
  activity: {}, // 'YYYY-MM-DD' -> nº de repasos ese día
  settings: { apiKey: '', model: MODELS[0][0], theme: 'auto' },
});

export let state = defaults();

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      state = { ...defaults(), ...d, settings: { ...defaults().settings, ...(d.settings || {}) } };
    }
  } catch (e) {
    console.error('No se pudo leer el almacenamiento local', e);
  }
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error(e);
    alert('No se pudo guardar: el almacenamiento del navegador está lleno o bloqueado. Exporta una copia desde Ajustes.');
    return false;
  }
}

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
export const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (n, from = new Date()) => {
  const d = new Date(from);
  d.setDate(d.getDate() + n);
  return today(d);
};

export function newQuestion(data = {}) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    type: 'test', // 'test' | 'concepto'
    deck: '',
    topic: '',
    tags: [],
    text: '',
    options: [], // {id, text}
    correct: [], // ids de opciones correctas
    mine: [], // ids de lo que marqué yo
    errorType: '',
    whyWrong: '',
    explanation: '',
    aiExplanation: '',
    source: '',
    srs: { box: 0, due: today(), reviews: 0, ok: 0, history: [] },
    ...data,
  };
}

export function upsertQuestion(q) {
  q.updatedAt = new Date().toISOString();
  const i = state.questions.findIndex((x) => x.id === q.id);
  if (i >= 0) state.questions[i] = q;
  else state.questions.unshift(q);
  save();
  return q;
}

export function deleteQuestion(id) {
  state.questions = state.questions.filter((q) => q.id !== id);
  save();
}

export const getQuestion = (id) => state.questions.find((q) => q.id === id);
export const decks = () => [...new Set(state.questions.map((q) => q.deck).filter(Boolean))].sort();
export const topics = (deck) =>
  [...new Set(state.questions.filter((q) => !deck || q.deck === deck).map((q) => q.topic).filter(Boolean))].sort();

// ---- Repetición espaciada (cajas de Leitner) ----
// Caja 0 = recién fallada. Cada acierto sube de caja y aleja el próximo repaso.
export const INTERVALS = [0, 1, 3, 7, 14, 30];
export const MASTERED_BOX = INTERVALS.length - 1;
export const isDue = (q) => q.srs.due <= today();
export const isMastered = (q) => q.srs.box >= MASTERED_BOX;

export function recordReview(q, ok) {
  const s = q.srs;
  s.reviews++;
  if (ok) {
    s.ok++;
    s.box = Math.min(MASTERED_BOX, s.box + 1);
  } else {
    s.box = Math.max(0, Math.min(1, s.box - 2)); // un fallo te devuelve casi al principio
  }
  s.due = addDays(ok ? INTERVALS[s.box] : 1);
  s.history.push({ d: today(), ok });
  if (s.history.length > 50) s.history.shift();
  state.activity[today()] = (state.activity[today()] || 0) + 1;
  upsertQuestion(q);
}

export function streak() {
  let n = 0;
  const d = new Date();
  if (!state.activity[today(d)]) d.setDate(d.getDate() - 1); // hoy aún no cuenta como roto
  while (state.activity[today(d)]) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// ---- Copias de seguridad ----
export function exportData() {
  const { settings, ...rest } = state;
  return JSON.stringify({ app: 'cuaderno-fallos', version: 1, exportedAt: new Date().toISOString(), ...rest }, null, 2);
}

export function importData(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.questions)) throw new Error('El archivo no parece una copia de Cuaderno de Fallos.');
  let added = 0;
  let updated = 0;
  for (const raw of d.questions) {
    if (!raw || typeof raw.text !== 'string') continue;
    const q = newQuestion(raw);
    q.srs = { ...newQuestion().srs, ...(raw.srs || {}) };
    const i = state.questions.findIndex((x) => x.id === q.id);
    if (i < 0) {
      state.questions.push(q);
      added++;
    } else if ((raw.updatedAt || '') > (state.questions[i].updatedAt || '')) {
      state.questions[i] = q;
      updated++;
    }
  }
  for (const s of d.summaries || []) {
    if (s && s.id && typeof s.md === 'string' && !state.summaries.some((x) => x.id === s.id)) state.summaries.push(s);
  }
  for (const [k, v] of Object.entries(d.activity || {})) {
    state.activity[k] = Math.max(state.activity[k] || 0, Number(v) || 0);
  }
  save();
  return { added, updated };
}

export function wipe() {
  const settings = state.settings;
  state = { ...defaults(), settings };
  save();
}
