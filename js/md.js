// Mini-renderizador de Markdown seguro: primero escapa todo el HTML y después
// aplica el formato. Cubre lo que devuelven los resúmenes: títulos, listas,
// tablas, citas, código, negrita/cursiva y enlaces http(s).

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function inline(s) {
  const codes = [];
  s = esc(s).replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l || '');
const listRe = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function renderList(lines) {
  // Lista (posiblemente anidada) a partir de la sangría.
  let html = '';
  const stack = []; // {indent, tag}
  for (const l of lines) {
    const m = l.match(listRe);
    if (!m) {
      html += ' ' + inline(l.trim()); // línea de continuación del elemento anterior
      continue;
    }
    const indent = m[1].replace(/\t/g, '    ').length;
    const tag = /\d/.test(m[2]) ? 'ol' : 'ul';
    while (stack.length && indent < stack[stack.length - 1].indent) html += `</li></${stack.pop().tag}>`;
    if (!stack.length || indent > stack[stack.length - 1].indent) {
      stack.push({ indent, tag });
      html += `<${tag}><li>`;
    } else {
      html += '</li><li>';
    }
    const task = m[3].match(/^\[( |x|X)\]\s+(.*)$/);
    html += task ? `<span class="task">${task[1] === ' ' ? '☐' : '☑'}</span> ${inline(task[2])}` : inline(m[3]);
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

export function md(src) {
  const lines = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  let out = '';
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      i++;
      continue;
    }
    const fence = l.match(/^\s*(```|~~~)/);
    if (fence) {
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) buf.push(lines[i++]);
      i++;
      out += `<pre><code>${esc(buf.join('\n'))}</code></pre>`;
      continue;
    }
    const h = l.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      out += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`;
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      out += '<hr>';
      i++;
      continue;
    }
    if (l.includes('|') && isTableSep(lines[i + 1])) {
      const head = cells(l);
      i += 2;
      let t = `<div class="table-wrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>`;
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
        const row = cells(lines[i++]);
        t += `<tr>${head.map((_, k) => `<td>${inline(row[k] ?? '')}</td>`).join('')}</tr>`;
      }
      out += t + '</tbody></table></div>';
      continue;
    }
    if (/^\s*>/.test(l)) {
      const buf = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out += `<blockquote>${md(buf.join('\n'))}</blockquote>`;
      continue;
    }
    if (listRe.test(l)) {
      const buf = [];
      while (i < lines.length && lines[i].trim() && (listRe.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) buf.push(lines[i++]);
      out += renderList(buf);
      continue;
    }
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(```|~~~|#{1,6}\s|>)/.test(lines[i]) &&
      !listRe.test(lines[i]) &&
      !(lines[i].includes('|') && isTableSep(lines[i + 1]))
    )
      buf.push(lines[i++]);
    out += `<p>${buf.map(inline).join('<br>')}</p>`;
  }
  return out;
}
