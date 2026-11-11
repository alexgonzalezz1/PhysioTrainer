import * as S from './store.js';
import { md, esc } from './md.js';
import { parseQuestion } from './parse.js';
import * as AI from './ai.js';
import { DEMO } from './demo.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const view = $('#view');
const L = (i) => String.fromCharCode(65 + i);
const fmtDate = (iso) => new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// ---------- utilidades de interfaz ----------
let toastTimer;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = 'toast'), 3200);
}

async function copy(text, okMsg = 'Copiado al portapapeles') {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg, 'ok');
  } catch {
    const ta = Object.assign(document.createElement('textarea'), { value: text });
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast(okMsg, 'ok');
  }
}

function download(name, text, type = 'text/plain') {
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([text], { type })),
    download: name,
  });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function applyTheme() {
  const t = S.state.settings.theme;
  if (t === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
}

const go = (hash) => {
  if (location.hash === hash) route();
  else location.hash = hash;
};

const empty = (icon, title, text, cta = '') =>
  `<div class="empty"><div class="empty-icon">${icon}</div><h2>${title}</h2><p>${text}</p>${cta}</div>`;

const deckOptions = (sel, allLabel = 'Todos los exámenes') =>
  `<option value="">${allLabel}</option>` +
  S.decks().map((d) => `<option ${d === sel ? 'selected' : ''}>${esc(d)}</option>`).join('');

function statusBadge(q) {
  if (S.isMastered(q)) return '<span class="badge ok">Dominada</span>';
  if (S.isDue(q)) return '<span class="badge warn">Toca repasar</span>';
  return `<span class="badge">Repaso: ${fmtDate(q.srs.due)}</span>`;
}

const boxDots = (q) =>
  `<span class="dots" title="Nivel ${q.srs.box} de ${S.MASTERED_BOX}">${S.INTERVALS.slice(1)
    .map((_, i) => `<i class="${i < q.srs.box ? 'on' : ''}"></i>`)
    .join('')}</span>`;

// Ejecuta una tarea de IA mostrando el texto en streaming dentro de `box`.
let aiAbort;
async function streamInto(box, task) {
  aiAbort?.abort();
  aiAbort = new AbortController();
  const mine = aiAbort;
  box.hidden = false;
  box.innerHTML = `<div class="ai-status"><span class="spinner"></span> Pensando… <button class="btn small ghost" data-cancel>Cancelar</button></div><div class="md"></div>`;
  $('[data-cancel]', box).onclick = () => mine.abort();
  const out = $('.md', box);
  let pending = false;
  let last = '';
  try {
    const text = await task({
      signal: mine.signal,
      onText: (snap) => {
        last = snap;
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          if (!mine.signal.aborted) out.innerHTML = md(last);
        });
      },
    });
    $('.ai-status', box)?.remove();
    out.innerHTML = md(text);
    return text;
  } catch (e) {
    box.innerHTML = `<p class="error">${esc(e.message || e)}</p>`;
    return null;
  }
}

// ---------- INICIO ----------
function viewHome() {
  const qs = S.state.questions;
  if (!qs.length) {
    view.innerHTML = empty(
      '📓',
      'Tu cuaderno de fallos está vacío',
      'Cada vez que falles una pregunta en un test o simulacro, apúntala aquí. La app te la volverá a preguntar hasta que la domines y te preparará resúmenes con tus errores.',
      `<div class="row center"><a class="btn primary" href="#/anadir">＋ Añadir mi primera pregunta</a>
       <button class="btn" id="demo">Cargar ejemplos de AWS</button></div>`,
    );
    $('#demo').onclick = loadDemo;
    return;
  }
  const due = qs.filter(S.isDue).length;
  const mastered = qs.filter(S.isMastered).length;
  const reviews = qs.reduce((n, q) => n + q.srs.reviews, 0);
  const ok = qs.reduce((n, q) => n + q.srs.ok, 0);
  const st = S.streak();

  // puntos débiles: fallo original + fallos en repasos, por tema
  const weak = {};
  for (const q of qs) {
    const k = q.topic || 'Sin tema';
    weak[k] ??= { n: 0, fails: 0, deck: q.deck };
    weak[k].n++;
    weak[k].fails += 1 + (q.srs.reviews - q.srs.ok);
  }
  const weakList = Object.entries(weak).sort((a, b) => b[1].fails - a[1].fails).slice(0, 6);
  const maxFails = weakList[0]?.[1].fails || 1;

  const errs = {};
  for (const q of qs) if (q.errorType) errs[q.errorType] = (errs[q.errorType] || 0) + 1;
  const errList = Object.entries(errs).sort((a, b) => b[1] - a[1]);
  const maxErr = errList[0]?.[1] || 1;

  const days = [...Array(14)].map((_, i) => {
    const d = S.addDays(i - 13);
    return { d, n: S.state.activity[d] || 0 };
  });
  const maxDay = Math.max(1, ...days.map((x) => x.n));

  view.innerHTML = `
    <header class="page-head"><h1>Inicio</h1></header>
    <section class="hero ${due ? '' : 'done'}">
      <div>
        <h2>${due ? `Tienes ${plural(due, 'pregunta', 'preguntas')} para repasar hoy` : '¡Al día! No hay repasos pendientes'}</h2>
        <p>${due ? 'Un repaso corto cada día vale más que un atracón antes del examen.' : 'Vuelve mañana o añade las preguntas que hayas fallado hoy.'}</p>
      </div>
      <div class="row">
        ${due ? '<a class="btn primary big" href="#/repasar">Repasar ahora</a>' : '<a class="btn primary" href="#/anadir">＋ Añadir pregunta</a>'}
      </div>
    </section>
    <section class="stats">
      <div class="stat"><b>${qs.length}</b><span>Preguntas falladas</span></div>
      <div class="stat"><b>${mastered}</b><span>Dominadas</span></div>
      <div class="stat"><b>${reviews ? Math.round((ok / reviews) * 100) + '%' : '—'}</b><span>Acierto en repasos</span></div>
      <div class="stat"><b>${st} 🔥</b><span>${st === 1 ? 'Día seguido' : 'Días seguidos'}</span></div>
    </section>
    <div class="grid2">
      <section class="card">
        <h3>Por examen</h3>
        ${S.decks().concat(qs.some((q) => !q.deck) ? [''] : []).map((d) => {
          const list = qs.filter((q) => q.deck === d);
          const m = list.filter(S.isMastered).length;
          const du = list.filter(S.isDue).length;
          return `<a class="deck-row" href="#/preguntas?deck=${encodeURIComponent(d)}">
            <div class="deck-top"><strong>${esc(d || 'Sin examen')}</strong><span class="muted">${list.length} · ${du} pendientes</span></div>
            <div class="bar"><i style="width:${(m / list.length) * 100}%"></i></div>
            <small class="muted">${m} de ${list.length} dominadas</small></a>`;
        }).join('')}
      </section>
      <section class="card">
        <h3>Tus puntos débiles</h3>
        ${weakList.map(([k, v]) => `<div class="hbar"><span>${esc(k)}</span><div class="bar danger"><i style="width:${(v.fails / maxFails) * 100}%"></i></div><b>${v.fails}</b></div>`).join('')}
        <small class="muted">Fallos acumulados por tema (el original más los de los repasos).</small>
      </section>
      <section class="card">
        <h3>Por qué fallas</h3>
        ${errList.length
          ? errList.map(([k, n]) => `<div class="hbar"><span>${esc(S.ERROR_TYPES[k] || k)}</span><div class="bar accent"><i style="width:${(n / maxErr) * 100}%"></i></div><b>${n}</b></div>`).join('')
          : '<p class="muted">Indica el «tipo de error» al añadir preguntas y aquí verás tu patrón.</p>'}
      </section>
      <section class="card">
        <h3>Actividad (14 días)</h3>
        <div class="spark">${days.map((x) => `<i title="${x.d}: ${x.n} repasos" style="height:${Math.max(4, (x.n / maxDay) * 100)}%" class="${x.n ? 'on' : ''}"></i>`).join('')}</div>
        <small class="muted">Repasos por día.</small>
      </section>
    </div>`;
}

function loadDemo() {
  for (const d of DEMO) {
    const options = d.options.map((text) => ({ id: S.uid(), text }));
    S.state.questions.push(
      S.newQuestion({
        ...d,
        options,
        correct: d.correct.map((i) => options[i].id),
        mine: d.mine.map((i) => options[i].id),
      }),
    );
  }
  S.save();
  toast('Ejemplos cargados', 'ok');
  route();
}

// ---------- AÑADIR / EDITAR ----------
let lastMeta = { deck: '', topic: '' };

function viewForm(params) {
  const editing = params.get('id') ? S.getQuestion(params.get('id')) : null;
  const q = editing ? structuredClone(editing) : S.newQuestion({ ...lastMeta, options: [...Array(4)].map(() => ({ id: S.uid(), text: '' })) });

  view.innerHTML = `
    <header class="page-head"><h1>${editing ? 'Editar pregunta' : 'Añadir pregunta fallada'}</h1></header>
    <form id="f" class="form" autocomplete="off">
      ${editing ? '' : `
      <details class="card paste" open>
        <summary>⚡ Rápido: pega la pregunta entera o sube una captura</summary>
        <textarea id="raw" rows="6" placeholder="Pega aquí el enunciado con sus opciones (A. … B. … C. …). Si incluye «Correct answer: B» o la explicación, también se detecta."></textarea>
        <div class="row">
          <button type="button" class="btn" id="parse">Detectar opciones</button>
          <button type="button" class="btn" id="aiParse">✨ Estructurar con IA</button>
          <label class="btn">📷 Desde captura<input type="file" id="img" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
          <span class="muted" id="parseMsg"></span>
        </div>
      </details>`}
      <div class="grid2">
        <label>Examen / asignatura
          <input name="deck" list="dl-decks" value="${esc(q.deck)}" placeholder="p. ej. AWS Solutions Architect">
          <datalist id="dl-decks">${S.decks().map((d) => `<option value="${esc(d)}">`).join('')}</datalist>
        </label>
        <label>Tema
          <input name="topic" list="dl-topics" value="${esc(q.topic)}" placeholder="p. ej. S3, VPC, IAM…">
          <datalist id="dl-topics">${S.topics().map((d) => `<option value="${esc(d)}">`).join('')}</datalist>
        </label>
      </div>
      <div class="seg" role="radiogroup">
        <label><input type="radio" name="type" value="test" ${q.type === 'test' ? 'checked' : ''}><span>Tipo test</span></label>
        <label><input type="radio" name="type" value="concepto" ${q.type === 'concepto' ? 'checked' : ''}><span>Concepto / pregunta abierta</span></label>
      </div>
      <label><span id="textLabel">Enunciado</span>
        <textarea name="text" rows="4" required>${esc(q.text)}</textarea>
      </label>
      <fieldset id="optsBox">
        <legend>Opciones <small class="muted">— marca la correcta y la que respondiste tú</small></legend>
        <div class="opt-head"><span>Correcta</span><span>Marqué</span></div>
        <div id="opts"></div>
        <button type="button" class="btn small" id="addOpt">＋ Opción</button>
      </fieldset>
      <label>¿Por qué fallaste?
        <select name="errorType">
          <option value="">— Sin clasificar —</option>
          ${Object.entries(S.ERROR_TYPES).map(([k, v]) => `<option value="${k}" ${q.errorType === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label>¿Qué pensaste al responder? <small class="muted">(opcional, ayuda mucho al resumen)</small>
        <textarea name="whyWrong" rows="2" placeholder="p. ej. Creía que SQS garantizaba el orden siempre…">${esc(q.whyWrong)}</textarea>
      </label>
      <label><span id="explLabel">Explicación / apuntes</span> <small class="muted">(opcional)</small>
        <textarea name="explanation" rows="4" placeholder="La explicación del test, o lo que hayas entendido después.">${esc(q.explanation)}</textarea>
      </label>
      <div class="grid2">
        <label>Etiquetas <small class="muted">(separadas por comas)</small>
          <input name="tags" value="${esc(q.tags.join(', '))}" placeholder="simulacro 2, difícil">
        </label>
        <label>Fuente
          <input name="source" value="${esc(q.source)}" placeholder="p. ej. Udemy – Test 3, pregunta 41">
        </label>
      </div>
      <div class="row sticky-actions">
        <button class="btn primary big">${editing ? 'Guardar cambios' : 'Guardar pregunta'}</button>
        ${editing ? `<a class="btn" href="#/pregunta?id=${q.id}">Cancelar</a>` : ''}
      </div>
    </form>`;

  const f = $('#f');
  const optsEl = $('#opts');

  const readOpts = () => {
    $$('.opt', optsEl).forEach((row) => {
      const o = q.options.find((x) => x.id === row.dataset.id);
      if (o) o.text = $('textarea', row).value;
    });
  };
  const drawOpts = () => {
    optsEl.innerHTML = q.options
      .map(
        (o, i) => `<div class="opt" data-id="${o.id}">
          <label class="chk ok" title="Es la correcta"><input type="checkbox" data-k="correct" ${q.correct.includes(o.id) ? 'checked' : ''}><span>✓</span></label>
          <label class="chk bad" title="Es la que marqué"><input type="checkbox" data-k="mine" ${q.mine.includes(o.id) ? 'checked' : ''}><span>✗</span></label>
          <b>${L(i)}</b>
          <textarea rows="1" placeholder="Texto de la opción ${L(i)}">${esc(o.text)}</textarea>
          <button type="button" class="icon" data-del title="Quitar opción">×</button>
        </div>`,
      )
      .join('');
    $$('textarea', optsEl).forEach(autoGrow);
  };
  const syncType = () => {
    const test = f.type.value === 'test';
    $('#optsBox').hidden = !test;
    $('#textLabel').textContent = test ? 'Enunciado' : 'Pregunta o concepto que no sabías';
    $('#explLabel').textContent = test ? 'Explicación / apuntes' : 'Respuesta / explicación';
  };
  const fill = (d) => {
    f.text.value = d.text || f.text.value;
    if (d.explanation) f.explanation.value = d.explanation;
    if (d.topic && !f.topic.value) f.topic.value = d.topic;
    if (d.type) f.type.value = d.type;
    if (d.options?.length) {
      q.options = d.options.map((text) => ({ id: S.uid(), text }));
      q.correct = (d.correct || []).map((i) => q.options[i]?.id).filter(Boolean);
      q.mine = (d.mine || []).map((i) => q.options[i]?.id).filter(Boolean);
      drawOpts();
    }
    syncType();
    $$('textarea', f).forEach(autoGrow);
  };

  drawOpts();
  syncType();
  f.addEventListener('change', (e) => {
    if (e.target.name === 'type') syncType();
    const k = e.target.dataset.k;
    if (k) {
      const id = e.target.closest('.opt').dataset.id;
      q[k] = e.target.checked ? [...q[k], id] : q[k].filter((x) => x !== id);
    }
  });
  f.addEventListener('input', (e) => e.target.tagName === 'TEXTAREA' && autoGrow(e.target));
  optsEl.addEventListener('click', (e) => {
    if (!e.target.matches('[data-del]')) return;
    readOpts();
    const id = e.target.closest('.opt').dataset.id;
    q.options = q.options.filter((o) => o.id !== id);
    q.correct = q.correct.filter((x) => x !== id);
    q.mine = q.mine.filter((x) => x !== id);
    drawOpts();
  });
  $('#addOpt').onclick = () => {
    readOpts();
    q.options.push({ id: S.uid(), text: '' });
    drawOpts();
    $('.opt:last-child textarea', optsEl).focus();
  };

  if (!editing) {
    const msg = $('#parseMsg');
    $('#parse').onclick = () => {
      const p = parseQuestion($('#raw').value);
      if (!p.text && !p.options.length) return (msg.textContent = 'Pega primero la pregunta.');
      const idx = (labels) => labels.map((l) => p.options.findIndex((o) => o.label === l)).filter((i) => i >= 0);
      fill({ ...p, options: p.options.map((o) => o.text), correct: idx(p.correct), mine: idx(p.mine), type: p.options.length ? 'test' : undefined });
      msg.textContent = p.options.length
        ? `Detectadas ${p.options.length} opciones${p.correct.length ? ' y la respuesta correcta' : ''}. Revisa y completa.`
        : 'No he visto opciones; he copiado el texto al enunciado. Prueba «Estructurar con IA».';
    };
    const runExtract = async (input) => {
      if (!AI.hasKey()) return (msg.innerHTML = 'Necesitas una clave de API: <a href="#/ajustes">Ajustes</a>.');
      msg.innerHTML = '<span class="spinner"></span> Leyendo la pregunta…';
      try {
        fill(await AI.extract(input));
        msg.textContent = 'Hecho. Revisa que esté bien y marca tu respuesta.';
      } catch (e) {
        msg.textContent = e.message;
      }
    };
    $('#aiParse').onclick = () => {
      const text = $('#raw').value.trim();
      if (!text) return (msg.textContent = 'Pega primero la pregunta.');
      runExtract({ text });
    };
    $('#img').onchange = async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 4.5e6) return (msg.textContent = 'La imagen pesa demasiado (máx. 4,5 MB).');
      const data = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(',')[1]);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      runExtract({ image: { type: file.type, data }, text: $('#raw').value.trim() });
    };
  }

  f.onsubmit = (e) => {
    e.preventDefault();
    readOpts();
    q.type = f.type.value;
    q.deck = f.deck.value.trim();
    q.topic = f.topic.value.trim();
    q.text = f.text.value.trim();
    q.errorType = f.errorType.value;
    q.whyWrong = f.whyWrong.value.trim();
    q.explanation = f.explanation.value.trim();
    q.source = f.source.value.trim();
    q.tags = f.tags.value.split(',').map((t) => t.trim()).filter(Boolean);
    if (q.type === 'test') {
      q.options = q.options.filter((o) => o.text.trim()).map((o) => ({ ...o, text: o.text.trim() }));
      const ids = q.options.map((o) => o.id);
      q.correct = q.correct.filter((x) => ids.includes(x));
      q.mine = q.mine.filter((x) => ids.includes(x));
      if (q.options.length < 2) return toast('Añade al menos dos opciones (o cambia a «Concepto»).', 'err');
      if (!q.correct.length) return toast('Marca cuál es la respuesta correcta (✓).', 'err');
    } else {
      q.options = [];
      q.correct = [];
      q.mine = [];
      if (!q.explanation) return toast('Escribe la respuesta para poder repasarla.', 'err');
    }
    S.upsertQuestion(q);
    lastMeta = { deck: q.deck, topic: q.topic };
    if (editing) {
      toast('Cambios guardados', 'ok');
      go(`#/pregunta?id=${q.id}`);
    } else {
      toast('Pregunta guardada. ¡A por la siguiente!', 'ok');
      route();
      window.scrollTo(0, 0);
    }
  };
}

function autoGrow(t) {
  t.style.height = 'auto';
  t.style.height = t.scrollHeight + 2 + 'px';
}

// ---------- LISTA ----------
function viewList(params) {
  const flt = {
    deck: params.get('deck') ?? '',
    hasDeck: params.has('deck'),
    topic: params.get('topic') || '',
    status: params.get('status') || '',
    q: params.get('q') || '',
  };
  if (!S.state.questions.length) {
    view.innerHTML = empty('🗂️', 'Aún no hay preguntas', 'Añade las que vayas fallando y aparecerán aquí.', '<a class="btn primary" href="#/anadir">＋ Añadir pregunta</a>');
    return;
  }
  view.innerHTML = `
    <header class="page-head"><h1>Preguntas</h1><a class="btn primary" href="#/anadir">＋ Añadir</a></header>
    <div class="filters">
      <input type="search" id="q" placeholder="Buscar…" value="${esc(flt.q)}">
      <select id="deck">${deckOptions(flt.deck)}</select>
      <select id="topic"><option value="">Todos los temas</option>${S.topics(flt.deck).map((t) => `<option ${t === flt.topic ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
      <select id="status">
        ${[['', 'Cualquier estado'], ['due', 'Toca repasar'], ['learning', 'En progreso'], ['mastered', 'Dominadas']].map(([v, l]) => `<option value="${v}" ${v === flt.status ? 'selected' : ''}>${l}</option>`).join('')}
      </select>
    </div>
    <p class="muted" id="count"></p>
    <div id="list" class="list"></div>`;

  const draw = () => {
    const needle = $('#q').value.trim().toLowerCase();
    const deck = $('#deck').value;
    const topic = $('#topic').value;
    const status = $('#status').value;
    const list = S.state.questions.filter(
      (q) =>
        (!deck || q.deck === deck) &&
        (!(flt.hasDeck && flt.deck === '' && !deck) || !q.deck) &&
        (!topic || q.topic === topic) &&
        (!status || (status === 'due' ? S.isDue(q) : status === 'mastered' ? S.isMastered(q) : !S.isMastered(q))) &&
        (!needle || [q.text, q.topic, q.deck, q.explanation, q.tags.join(' '), ...q.options.map((o) => o.text)].join(' ').toLowerCase().includes(needle)),
    );
    $('#count').textContent = plural(list.length, 'pregunta', 'preguntas');
    $('#list').innerHTML =
      list
        .map(
          (q) => `<a class="item" href="#/pregunta?id=${q.id}">
            <div class="item-meta">${q.deck ? `<span class="tag deck">${esc(q.deck)}</span>` : ''}${q.topic ? `<span class="tag">${esc(q.topic)}</span>` : ''}${q.type === 'concepto' ? '<span class="tag">Concepto</span>' : ''}${statusBadge(q)}${boxDots(q)}</div>
            <p>${esc(q.text.length > 220 ? q.text.slice(0, 220) + '…' : q.text)}</p></a>`,
        )
        .join('') || '<p class="muted">Nada coincide con esos filtros.</p>';
  };
  $('#q').oninput = draw;
  $('#topic').onchange = draw;
  $('#status').onchange = draw;
  $('#deck').onchange = () => {
    flt.hasDeck = false;
    $('#topic').innerHTML = `<option value="">Todos los temas</option>${S.topics($('#deck').value).map((t) => `<option>${esc(t)}</option>`).join('')}`;
    draw();
  };
  draw();
}

// ---------- DETALLE ----------
function questionBody(q, { reveal = true } = {}) {
  const opts =
    q.type === 'test'
      ? `<ol class="options static">${q.options
          .map((o) => {
            const c = q.correct.includes(o.id);
            const m = q.mine.includes(o.id);
            return `<li class="${reveal && c ? 'correct' : ''} ${reveal && m && !c ? 'wrong' : ''}"><span>${esc(o.text)}</span>${reveal && c ? '<em>Correcta</em>' : ''}${reveal && m && !c ? '<em>Tu respuesta</em>' : ''}</li>`;
          })
          .join('')}</ol>`
      : '';
  return `<p class="stem">${esc(q.text)}</p>${opts}`;
}

function notes(q) {
  return `
    ${q.whyWrong || q.errorType ? `<div class="note bad"><h4>Por qué fallé</h4>${q.errorType ? `<p><strong>${esc(S.ERROR_TYPES[q.errorType] || q.errorType)}</strong></p>` : ''}${q.whyWrong ? `<p>${esc(q.whyWrong)}</p>` : ''}</div>` : ''}
    ${q.explanation ? `<div class="note"><h4>${q.type === 'test' ? 'Explicación' : 'Respuesta'}</h4><div class="md">${md(q.explanation)}</div></div>` : ''}`;
}

function viewDetail(params) {
  const q = S.getQuestion(params.get('id'));
  if (!q) return go('#/preguntas');
  view.innerHTML = `
    <header class="page-head"><a class="back" href="#/preguntas">← Preguntas</a>
      <div class="row"><a class="btn small" href="#/editar?id=${q.id}">Editar</a><button class="btn small danger" id="del">Borrar</button></div></header>
    <article class="card">
      <div class="item-meta">${q.deck ? `<span class="tag deck">${esc(q.deck)}</span>` : ''}${q.topic ? `<span class="tag">${esc(q.topic)}</span>` : ''}${q.tags.map((t) => `<span class="tag">#${esc(t)}</span>`).join('')}${statusBadge(q)}${boxDots(q)}</div>
      ${questionBody(q)}
      ${notes(q)}
      <div class="note ai">
        <h4>✨ Explicación masticada</h4>
        <div id="aiBox" class="md" ${q.aiExplanation ? '' : 'hidden'}>${md(q.aiExplanation)}</div>
        <div class="row">
          <button class="btn primary small" id="explain">${q.aiExplanation ? 'Regenerar con IA' : 'Explícamela con IA'}</button>
          <button class="btn small" id="copyPrompt">📋 Copiar prompt</button>
          <button class="btn small" id="paste">Pegar respuesta</button>
        </div>
        <small class="muted">Sin clave de API: copia el prompt, pégalo en claude.ai y guarda aquí la respuesta.</small>
      </div>
      <footer class="meta-foot muted">
        Añadida el ${fmtDate(q.createdAt)}${q.source ? ` · ${esc(q.source)}` : ''} · ${q.srs.reviews ? `${q.srs.ok}/${q.srs.reviews} aciertos en repasos` : 'Sin repasar todavía'} · Próximo repaso: ${S.isDue(q) ? 'hoy' : fmtDate(q.srs.due)}
        <div class="hist">${q.srs.history.map((h) => `<i class="${h.ok ? 'ok' : 'bad'}" title="${h.d}"></i>`).join('')}</div>
        <button class="btn small ghost" id="reset">Reiniciar progreso</button>
      </footer>
    </article>`;

  $('#del').onclick = () => {
    if (!confirm('¿Borrar esta pregunta? No se puede deshacer.')) return;
    S.deleteQuestion(q.id);
    toast('Pregunta borrada');
    go('#/preguntas');
  };
  $('#reset').onclick = () => {
    q.srs = S.newQuestion().srs;
    S.upsertQuestion(q);
    route();
  };
  $('#copyPrompt').onclick = () => copy(AI.explainPrompt(q), 'Prompt copiado. Pégalo en claude.ai');
  $('#paste').onclick = () => {
    const box = $('#aiBox');
    box.hidden = false;
    box.innerHTML = `<textarea id="pasted" rows="8" placeholder="Pega aquí la explicación (Markdown)">${esc(q.aiExplanation)}</textarea><button class="btn primary small" id="savePasted">Guardar</button>`;
    $('#savePasted').onclick = () => {
      q.aiExplanation = $('#pasted').value.trim();
      S.upsertQuestion(q);
      route();
    };
  };
  $('#explain').onclick = async () => {
    if (!AI.hasKey()) return toast('Añade tu clave de API en Ajustes, o usa «Copiar prompt».', 'err');
    const text = await streamInto($('#aiBox'), (o) => AI.explain(q, o));
    if (text) {
      q.aiExplanation = text;
      S.upsertQuestion(q);
      toast('Explicación guardada', 'ok');
    }
  };
}

// ---------- REPASAR ----------
let session = null;

function viewReview(params) {
  if (session && !params.has('nuevo')) return drawCard();
  session = null;
  const qs = S.state.questions;
  if (!qs.length) {
    view.innerHTML = empty('🎯', 'Nada que repasar', 'Añade primero alguna pregunta fallada.', '<a class="btn primary" href="#/anadir">＋ Añadir pregunta</a>');
    return;
  }
  view.innerHTML = `
    <header class="page-head"><h1>Repasar</h1></header>
    <form id="setup" class="card form">
      <label>Examen <select name="deck">${deckOptions('')}</select></label>
      <label>Tema <select name="topic"><option value="">Todos los temas</option></select></label>
      <label>Qué repasar
        <select name="mode">
          <option value="due">Lo que toca hoy (repetición espaciada)</option>
          <option value="weak">Las que más fallo</option>
          <option value="all">Todas, al azar</option>
          <option value="new">Las que aún no he repasado</option>
        </select>
      </label>
      <label>Máximo de preguntas
        <select name="limit"><option>10</option><option selected>20</option><option>40</option><option value="9999">Sin límite</option></select>
      </label>
      <p id="avail" class="muted"></p>
      <button class="btn primary big">Empezar</button>
    </form>
    <p class="muted small-print">Cada acierto aleja el siguiente repaso (1, 3, 7, 14 y 30 días). Un fallo la devuelve al principio. Tras ${S.MASTERED_BOX} aciertos seguidos se considera dominada.</p>`;
  const f = $('#setup');
  const pick = () => {
    let list = qs.filter((q) => (!f.deck.value || q.deck === f.deck.value) && (!f.topic.value || q.topic === f.topic.value));
    const mode = f.mode.value;
    if (mode === 'due') list = shuffle(list.filter(S.isDue)).sort((a, b) => a.srs.box - b.srs.box);
    else if (mode === 'new') list = shuffle(list.filter((q) => !q.srs.reviews));
    else if (mode === 'weak') list = list.filter((q) => q.srs.reviews > q.srs.ok || !q.srs.reviews).sort((a, b) => b.srs.reviews - b.srs.ok - (a.srs.reviews - a.srs.ok));
    else list = shuffle(list);
    return list;
  };
  const upd = () => {
    const n = pick().length;
    $('#avail').textContent = n ? `${plural(n, 'pregunta disponible', 'preguntas disponibles')} con estos filtros.` : 'No hay preguntas con estos filtros. Prueba «Todas, al azar».';
  };
  f.deck.onchange = () => {
    f.topic.innerHTML = `<option value="">Todos los temas</option>${S.topics(f.deck.value).map((t) => `<option>${esc(t)}</option>`).join('')}`;
    upd();
  };
  f.onchange = upd;
  upd();
  f.onsubmit = (e) => {
    e.preventDefault();
    const list = pick().slice(0, Number(f.limit.value));
    if (!list.length) return toast('No hay preguntas con esos filtros.', 'err');
    session = { ids: list.map((q) => q.id), i: 0, results: [], answered: null };
    drawCard();
  };
}

function drawCard() {
  const s = session;
  if (s.i >= s.ids.length) return drawResults();
  const q = S.getQuestion(s.ids[s.i]);
  if (!q) {
    s.i++;
    return drawCard();
  }
  const multi = q.correct.length > 1;
  s.order ??= q.type === 'test' ? shuffle(q.options.map((o) => o.id)) : [];
  const opts = s.order.map((id) => q.options.find((o) => o.id === id)).filter(Boolean);
  const done = s.answered;

  view.innerHTML = `
    <header class="page-head review-head">
      <button class="btn small ghost" id="quit">✕ Salir</button>
      <div class="progress"><i style="width:${(s.i / s.ids.length) * 100}%"></i></div>
      <span class="muted">${s.i + 1}/${s.ids.length}</span>
    </header>
    <article class="card review">
      <div class="item-meta">${q.deck ? `<span class="tag deck">${esc(q.deck)}</span>` : ''}${q.topic ? `<span class="tag">${esc(q.topic)}</span>` : ''}${boxDots(q)}</div>
      <p class="stem">${esc(q.text)}</p>
      ${q.type === 'test' ? `
        ${multi ? `<p class="muted">Elige ${q.correct.length} respuestas.</p>` : ''}
        <div class="options" id="choices">${opts.map((o, i) => {
          const c = q.correct.includes(o.id);
          const picked = done?.picked.includes(o.id);
          const cls = done ? (c ? 'correct' : picked ? 'wrong' : '') : '';
          return `<button class="choice ${cls} ${picked ? 'picked' : ''}" data-id="${o.id}" ${done ? 'disabled' : ''}><b>${L(i)}</b><span>${esc(o.text)}</span></button>`;
        }).join('')}</div>
        ${done ? '' : `<button class="btn primary big" id="check" ${multi ? '' : 'hidden'} disabled>Comprobar</button>`}`
      : done ? '' : '<button class="btn primary big" id="show">Mostrar respuesta</button>'}
      ${done ? `
        <div class="verdict ${done.ok === null ? '' : done.ok ? 'ok' : 'bad'}">${done.ok === null ? '¿La sabías?' : done.ok ? '✅ ¡Correcta!' : '❌ Incorrecta'}</div>
        ${q.type === 'concepto' && done.ok === null ? `<div class="note"><h4>Respuesta</h4><div class="md">${md(q.explanation)}</div></div>
          <div class="row"><button class="btn big danger" data-grade="0">No la sabía</button><button class="btn big primary" data-grade="1">La sabía</button></div>` : `
        ${q.type === 'test' ? notes(q) : `<div class="note"><h4>Respuesta</h4><div class="md">${md(q.explanation)}</div></div>`}
        ${q.aiExplanation ? `<details class="note ai"><summary>✨ Explicación masticada</summary><div class="md">${md(q.aiExplanation)}</div></details>` : ''}
        <div class="row"><button class="btn primary big" id="next">${s.i + 1 >= s.ids.length ? 'Ver resultados' : 'Siguiente →'}</button>
        <a class="btn" href="#/pregunta?id=${q.id}">Abrir ficha</a></div>`}` : ''}
    </article>`;

  $('#quit').onclick = () => {
    if (s.results.length && !confirm('¿Salir del repaso? Lo respondido ya está guardado.')) return;
    session = null;
    go('#/repasar?nuevo');
  };
  const finish = (ok, picked = []) => {
    S.recordReview(q, ok);
    s.results.push({ id: q.id, ok });
    s.answered = { ok, picked };
    drawCard();
  };
  if (!done && q.type === 'test') {
    const picked = new Set();
    $('#choices').onclick = (e) => {
      const b = e.target.closest('.choice');
      if (!b) return;
      if (!multi) return finish(sameSet([b.dataset.id], q.correct), [b.dataset.id]);
      picked.has(b.dataset.id) ? picked.delete(b.dataset.id) : picked.add(b.dataset.id);
      b.classList.toggle('picked');
      $('#check').disabled = !picked.size;
    };
    $('#check').onclick = () => finish(sameSet([...picked], q.correct), [...picked]);
  }
  if ($('#show')) $('#show').onclick = () => { s.answered = { ok: null, picked: [] }; drawCard(); };
  $$('[data-grade]').forEach((b) => (b.onclick = () => finish(b.dataset.grade === '1')));
  if ($('#next')) {
    $('#next').onclick = () => { s.i++; s.answered = null; s.order = null; drawCard(); window.scrollTo(0, 0); };
    $('#next').focus({ preventScroll: true });
  }
}

function drawResults() {
  const s = session;
  session = null;
  const ok = s.results.filter((r) => r.ok).length;
  const fails = s.results.filter((r) => !r.ok).map((r) => S.getQuestion(r.id)).filter(Boolean);
  const pct = s.results.length ? Math.round((ok / s.results.length) * 100) : 0;
  view.innerHTML = `
    <header class="page-head"><h1>Resultado</h1></header>
    <section class="card center">
      <div class="score">${pct}%</div>
      <p>${ok} de ${plural(s.results.length, 'pregunta', 'preguntas')} ${pct === 100 ? '— ¡perfecto! 🎉' : pct >= 70 ? '— vas bien 💪' : '— a seguir machacando'}</p>
      <div class="row center"><a class="btn primary" href="#/repasar?nuevo">Otro repaso</a><a class="btn" href="#/resumenes">Crear resumen de mis errores</a></div>
    </section>
    ${fails.length ? `<h3>Has vuelto a fallar</h3><div class="list">${fails.map((q) => `<a class="item" href="#/pregunta?id=${q.id}"><div class="item-meta">${q.topic ? `<span class="tag">${esc(q.topic)}</span>` : ''}</div><p>${esc(q.text.slice(0, 200))}</p></a>`).join('')}</div>` : ''}`;
}

// ---------- RESÚMENES ----------
function viewSummaries() {
  const qs = S.state.questions;
  view.innerHTML = `
    <header class="page-head"><h1>Resúmenes</h1></header>
    ${qs.length ? `
    <form id="gen" class="card form">
      <h3>Nuevo resumen de mis errores</h3>
      <div class="grid2">
        <label>Examen <select name="deck">${deckOptions('')}</select></label>
        <label>Tema <select name="topic"><option value="">Todos los temas</option></select></label>
      </div>
      <label class="inline"><input type="checkbox" name="pending" checked> Solo las que aún no domino</label>
      <p class="muted" id="n"></p>
      <div class="row">
        <button class="btn primary">✨ Generar con IA</button>
        <button type="button" class="btn" id="copyP">📋 Copiar prompt</button>
        <button type="button" class="btn" id="manual">Pegar un resumen</button>
      </div>
      <small class="muted">La guía incluye: diagnóstico de tus errores, conceptos masticados, tablas comparativas, palabras clave, mnemotecnias, chuleta final y preguntas nuevas para ponerte a prueba.</small>
      <div id="out" class="ai-out" hidden></div>
    </form>` : empty('🧠', 'Sin material todavía', 'Cuando tengas preguntas falladas podrás generar aquí guías de repaso a medida.', '<a class="btn primary" href="#/anadir">＋ Añadir pregunta</a>')}
    ${S.state.summaries.length ? `<h3>Guardados</h3><div class="list">${[...S.state.summaries].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => `<a class="item" href="#/resumen?id=${s.id}"><div class="item-meta"><span class="tag deck">${esc(s.scope || 'Todo')}</span><span class="badge">${fmtDate(s.createdAt)}</span><span class="badge">${plural(s.count || 0, 'pregunta', 'preguntas')}</span></div><p>${esc(s.title)}</p></a>`).join('')}</div>` : ''}`;
  const f = $('#gen');
  if (!f) return;
  const selection = () =>
    qs.filter((q) => (!f.deck.value || q.deck === f.deck.value) && (!f.topic.value || q.topic === f.topic.value) && (!f.pending.checked || !S.isMastered(q)));
  const scope = () => [f.deck.value, f.topic.value].filter(Boolean).join(' – ');
  const upd = () => ($('#n').textContent = `Se usarán ${plural(selection().length, 'pregunta', 'preguntas')}.`);
  f.deck.onchange = () => {
    f.topic.innerHTML = `<option value="">Todos los temas</option>${S.topics(f.deck.value).map((t) => `<option>${esc(t)}</option>`).join('')}`;
    upd();
  };
  f.onchange = upd;
  upd();
  const saveSummary = (text, count) => {
    const title = (text.match(/^#\s+(.+)$/m)?.[1] || `Guía de repaso${scope() ? ': ' + scope() : ''}`).replace(/[*_`]/g, '');
    const s = { id: S.uid(), createdAt: new Date().toISOString(), scope: scope(), title, md: text, count };
    S.state.summaries.push(s);
    S.save();
    return s;
  };
  $('#copyP').onclick = () => {
    const sel = selection();
    if (!sel.length) return toast('No hay preguntas con esos filtros.', 'err');
    copy(AI.summaryPrompt(sel, scope()), 'Prompt copiado. Pégalo en claude.ai');
  };
  $('#manual').onclick = () => {
    const out = $('#out');
    out.hidden = false;
    out.innerHTML = `<textarea id="pasted" rows="10" placeholder="Pega aquí el resumen (Markdown)"></textarea><button type="button" class="btn primary small" id="savePasted">Guardar resumen</button>`;
    $('#savePasted').onclick = () => {
      const text = $('#pasted').value.trim();
      if (!text) return;
      go(`#/resumen?id=${saveSummary(text, selection().length).id}`);
    };
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const sel = selection();
    if (!sel.length) return toast('No hay preguntas con esos filtros.', 'err');
    if (!AI.hasKey()) return toast('Añade tu clave de API en Ajustes, o usa «Copiar prompt».', 'err');
    const sc = scope();
    const text = await streamInto($('#out'), (o) => AI.summarize(sel, sc, o));
    if (text) {
      const s = saveSummary(text, sel.length);
      toast('Resumen guardado', 'ok');
      if (location.hash.startsWith('#/resumenes')) go(`#/resumen?id=${s.id}`);
    }
  };
}

function viewSummary(params) {
  const s = S.state.summaries.find((x) => x.id === params.get('id'));
  if (!s) return go('#/resumenes');
  view.innerHTML = `
    <header class="page-head no-print"><a class="back" href="#/resumenes">← Resúmenes</a>
      <div class="row"><button class="btn small" id="cp">Copiar</button><button class="btn small" id="dl">Descargar .md</button><button class="btn small" id="pr">Imprimir / PDF</button><button class="btn small danger" id="del">Borrar</button></div></header>
    <article class="card md doc">${md(s.md)}</article>`;
  $('#cp').onclick = () => copy(s.md);
  $('#dl').onclick = () => download(`${s.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'resumen'}.md`, s.md, 'text/markdown');
  $('#pr').onclick = () => window.print();
  $('#del').onclick = () => {
    if (!confirm('¿Borrar este resumen?')) return;
    S.state.summaries = S.state.summaries.filter((x) => x.id !== s.id);
    S.save();
    go('#/resumenes');
  };
}

// ---------- AJUSTES ----------
function allAsMarkdown() {
  const by = {};
  for (const q of S.state.questions) (by[q.deck || 'Sin examen'] ??= []).push(q);
  return Object.entries(by)
    .map(([d, list]) => `# ${d}\n\n${list.map((q, i) => AI.questionToText(q, i + 1) + (q.aiExplanation ? `\n${q.aiExplanation}\n` : '')).join('\n---\n\n')}`)
    .join('\n\n');
}

function viewSettings() {
  const st = S.state.settings;
  view.innerHTML = `
    <header class="page-head"><h1>Ajustes</h1></header>
    <section class="card form">
      <h3>Inteligencia artificial (opcional)</h3>
      <p class="muted">Con una clave de la API de Anthropic la app genera sola las explicaciones y los resúmenes, y lee preguntas desde capturas. Sin clave todo lo demás funciona igual, y puedes usar «Copiar prompt» con claude.ai.</p>
      <label>Clave de API
        <input type="password" id="key" value="${esc(st.apiKey)}" placeholder="sk-ant-…" autocomplete="off">
      </label>
      <label>Modelo
        <select id="model">${S.MODELS.map(([id, l]) => `<option value="${id}" ${id === st.model ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </label>
      <small class="muted">🔒 La clave se guarda solo en este navegador y se envía únicamente a api.anthropic.com. No la uses en un ordenador compartido. Consíguela en console.anthropic.com; el uso se factura en tu cuenta.</small>
    </section>
    <section class="card form">
      <h3>Apariencia</h3>
      <div class="seg">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([v, l]) => `<label><input type="radio" name="theme" value="${v}" ${st.theme === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
    </section>
    <section class="card form">
      <h3>Tus datos</h3>
      <p class="muted">Todo se guarda en este navegador (${S.state.questions.length} preguntas, ${S.state.summaries.length} resúmenes). Haz una copia de vez en cuando, y úsala para pasar tus datos a otro dispositivo.</p>
      <div class="row">
        <button class="btn" id="exp">⬇️ Exportar copia (.json)</button>
        <label class="btn">⬆️ Importar copia<input type="file" id="imp" accept="application/json,.json" hidden></label>
        <button class="btn" id="expMd">Exportar preguntas (.md)</button>
      </div>
      <div class="row">
        <button class="btn" id="demo">Cargar ejemplos de AWS</button>
        <button class="btn danger" id="wipe">Borrar todo</button>
      </div>
    </section>
    <p class="muted small-print">Cuaderno de Fallos · funciona sin conexión · sin cuentas ni servidores.</p>`;
  $('#key').onchange = (e) => { st.apiKey = e.target.value.trim(); S.save(); toast(st.apiKey ? 'Clave guardada' : 'Clave eliminada', 'ok'); };
  $('#model').onchange = (e) => { st.model = e.target.value; S.save(); };
  $$('[name=theme]').forEach((r) => (r.onchange = () => { st.theme = r.value; S.save(); applyTheme(); }));
  $('#exp').onclick = () => download(`cuaderno-fallos-${S.today()}.json`, S.exportData(), 'application/json');
  $('#expMd').onclick = () => download(`preguntas-falladas-${S.today()}.md`, allAsMarkdown(), 'text/markdown');
  $('#imp').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const r = S.importData(await file.text());
      toast(`Importado: ${r.added} nuevas, ${r.updated} actualizadas`, 'ok');
      route();
    } catch (err) {
      toast(err.message || 'Archivo no válido', 'err');
    }
  };
  $('#demo').onclick = () => { loadDemo(); };
  $('#wipe').onclick = () => {
    if (!confirm('¿Borrar TODAS las preguntas y resúmenes de este navegador? No se puede deshacer.')) return;
    S.wipe();
    toast('Datos borrados');
    route();
  };
}

// ---------- router ----------
const routes = {
  inicio: viewHome,
  anadir: viewForm,
  editar: viewForm,
  preguntas: viewList,
  pregunta: viewDetail,
  repasar: viewReview,
  resumenes: viewSummaries,
  resumen: viewSummary,
  ajustes: viewSettings,
};
const navGroup = { editar: 'preguntas', pregunta: 'preguntas', resumen: 'resumenes' };

function route() {
  aiAbort?.abort();
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const name = routes[path] ? path : 'inicio';
  $$('nav a').forEach((a) => a.classList.toggle('active', a.dataset.nav === (navGroup[name] || name)));
  const due = S.state.questions.filter(S.isDue).length;
  const b = $('#dueBadge');
  b.textContent = due > 99 ? '99+' : due;
  b.hidden = !due;
  routes[name](new URLSearchParams(query));
}

S.load();
applyTheme();
window.addEventListener('hashchange', () => { route(); window.scrollTo(0, 0); });
route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
