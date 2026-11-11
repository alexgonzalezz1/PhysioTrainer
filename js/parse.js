// Detección local (sin IA) de una pregunta tipo test pegada como texto libre.
// Entiende formatos habituales: "A. texto", "B) texto", "(c) texto", "1. texto",
// y líneas como "Correct answer: B, D" / "Respuesta correcta: B" / "Tu respuesta: C".

const optRe = /^\s*(?:[-*•]\s*)?\(?([A-Ha-h]|[1-9])[).:\]-]\s+(\S.*)$/;
const correctRe = /^\s*(?:correct(?:\s+answers?)?|answers?|right\s+answers?|respuestas?(?:\s+correctas?)?|soluci[oó]n|correctas?)\s*(?:is|are|es|son)?\s*[:：-]\s*(.+)$/i;
const mineRe = /^\s*(?:your\s+answers?|you\s+(?:selected|answered|chose)|selected(?:\s+answers?)?|tu\s+respuesta|mi\s+respuesta|marqu[eé]|respond[ií]|eleg[ií])\s*[:：-]?\s*(.+)$/i;
const explRe = /^\s*(?:explanation|explicaci[oó]n|overall\s+explanation|rationale|justificaci[oó]n)\s*[:：-]?\s*(.*)$/i;

const letters = (s) => {
  const head = s.split(/[.;]|\s-\s/)[0];
  return [...new Set((head.match(/\b([A-Ha-h]|[1-9])\b/g) || []).map((x) => x.toUpperCase()))];
};

export function parseQuestion(raw) {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
  const stem = [];
  const options = []; // {label, text}
  const expl = [];
  let correct = [];
  let mine = [];
  let mode = 'stem';

  for (const line of lines) {
    const l = line.trimEnd();
    let m;
    if ((m = l.match(mineRe))) {
      mine = letters(m[1]);
      if (options.length) mode = 'after';
      continue;
    }
    if ((m = l.match(correctRe)) && letters(m[1]).length) {
      correct = letters(m[1]);
      if (options.length) mode = 'after';
      continue;
    }
    if ((m = l.match(explRe)) && (options.length || mode !== 'stem')) {
      mode = 'expl';
      if (m[1]) expl.push(m[1]);
      continue;
    }
    if (mode === 'expl') {
      expl.push(l);
      continue;
    }
    if ((m = l.match(optRe)) && mode !== 'after') {
      const label = m[1].toUpperCase();
      // Evita tomar una lista numerada del enunciado por opciones: deben ser consecutivas.
      const expected = options.length ? nextLabel(options[options.length - 1].label) : null;
      if (!options.length ? /^[A1]$/.test(label) : label === expected) {
        options.push({ label, text: m[2].trim() });
        mode = 'opts';
        continue;
      }
    }
    if (mode === 'opts' && l.trim()) {
      options[options.length - 1].text += ' ' + l.trim();
    } else if (mode === 'stem') {
      stem.push(l);
    } else if (mode === 'after' && l.trim()) {
      expl.push(l);
    }
  }

  // Marcas en la propia opción: "(correct)", "✓", "✅", "(tu respuesta)".
  for (const o of options) {
    if (/(\(correct[ao]?\)|✓|✅|✔)/i.test(o.text)) {
      if (!correct.includes(o.label)) correct.push(o.label);
      o.text = o.text.replace(/\s*(\(correct[ao]?\)|✓|✅|✔)\s*/gi, ' ').trim();
    }
    if (/(\(your answer\)|\(tu respuesta\)|❌|✗)/i.test(o.text)) {
      if (!mine.includes(o.label)) mine.push(o.label);
      o.text = o.text.replace(/\s*(\(your answer\)|\(tu respuesta\)|❌|✗)\s*/gi, ' ').trim();
    }
  }

  return {
    text: stem.join('\n').trim(),
    options,
    correct,
    mine,
    explanation: expl.join('\n').trim(),
  };
}

function nextLabel(l) {
  return /\d/.test(l) ? String(Number(l) + 1) : String.fromCharCode(l.charCodeAt(0) + 1);
}
