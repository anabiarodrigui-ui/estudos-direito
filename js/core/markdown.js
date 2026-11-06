/**
 * Renderizador de Markdown leve, sem dependências (funciona offline e no Node).
 * Suporta: títulos (#…######), parágrafos, **negrito**, *itálico*, ~~riscado~~, `código`,
 * links, listas (com e sem número, aninhadas por recuo), citações (>), tabelas (GFM),
 * blocos de código (```), linhas horizontais (---) e quebras de linha.
 *
 * Além do HTML, devolve o índice (títulos com ids) e uma lista de blocos
 * estruturados usados pelo gerador local de flashcards.
 */

export function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/** Formatação dentro da linha. */
export function inline(text) {
  const codes = [];
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => safeUrl(url) ? `<img alt="${alt}" src="${url}">` : alt)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, url) => safeUrl(url) ? `<a href="${url}" target="_blank" rel="noopener">${t}</a>` : t)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/(^|[^\w])_(?!\s)(.+?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/ {2,}$/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}
const safeUrl = (u) => /^(https?:|mailto:|#|\.{0,2}\/)/i.test(u.replace(/&amp;/g, '&'));

/** Remove marcações de Markdown, deixando o texto puro. */
export function stripInline(text) {
  return String(text)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*\*|\*\*|__|~~|`)/g, '')
    .replace(/(^|[^\w])[*_](?!\s)(.+?)[*_](?!\w)/g, '$1$2')
    .trim();
}

/** Transforma um título em id para âncora ("2.1 Funções" -> "2-1-funcoes"). */
export function slugify(s) {
  return stripInline(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'secao';
}

const RE = {
  heading: /^(#{1,6})\s+(.+?)\s*#*\s*$/,
  hr: /^\s{0,3}([-*_])(\s*\1){2,}\s*$/,
  fence: /^\s*(```|~~~)/,
  quote: /^\s{0,3}>\s?/,
  ul: /^(\s*)[-*+]\s+(.*)$/,
  ol: /^(\s*)(\d+)[.)]\s+(.*)$/,
  tableSep: /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/,
};

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

/**
 * Converte Markdown em { html, toc, blocks }.
 *  toc:    [{ level, text, id }]
 *  blocks: [{ type: 'heading'|'paragraph'|'list'|'quote'|'table'|'code', text, items?, rows?, header?, section }]
 */
export function parseMarkdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const toc = [];
  const blocks = [];
  const ids = new Map();
  let section = '';
  let i = 0;

  const uniqueId = (text) => {
    const base = slugify(text);
    const n = ids.get(base) || 0;
    ids.set(base, n + 1);
    return n ? `${base}-${n + 1}` : base;
  };

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    // bloco de código
    if (RE.fence.test(line)) {
      const fence = line.trim().slice(0, 3);
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence)) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      blocks.push({ type: 'code', text: buf.join('\n'), section });
      continue;
    }

    // título
    const h = line.match(RE.heading);
    if (h) {
      const level = h[1].length, text = h[2];
      const id = uniqueId(text);
      out.push(`<h${level} id="${id}">${inline(text)}</h${level}>`);
      toc.push({ level, text: stripInline(text), id });
      section = stripInline(text);
      blocks.push({ type: 'heading', level, text: stripInline(text), id, section });
      i++;
      continue;
    }

    if (RE.hr.test(line)) { out.push('<hr>'); i++; continue; }

    // tabela
    if (line.includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1])) {
      const header = splitRow(line);
      const aligns = splitRow(lines[i + 1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''));
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]));
      const al = (k) => (aligns[k] ? ` style="text-align:${aligns[k]}"` : '');
      out.push(`<div class="table-wrap"><table><thead><tr>${header.map((c, k) => `<th${al(k)}>${inline(c)}</th>`).join('')}</tr></thead><tbody>${
        rows.map((r) => `<tr>${header.map((_, k) => `<td${al(k)}>${inline(r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      blocks.push({ type: 'table', header: header.map(stripInline), rows: rows.map((r) => r.map(stripInline)), section });
      continue;
    }

    // citação
    if (RE.quote.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim() && RE.quote.test(lines[i])) buf.push(lines[i++].replace(RE.quote, ''));
      const inner = parseMarkdown(buf.join('\n'));
      out.push(`<blockquote>${inner.html}</blockquote>`);
      blocks.push({ type: 'quote', text: stripInline(buf.join(' ')), section });
      continue;
    }

    // listas
    if (RE.ul.test(line) || RE.ol.test(line)) {
      const { html, items, next } = parseList(lines, i);
      out.push(html);
      blocks.push({ type: 'list', items, section });
      i = next;
      continue;
    }

    // parágrafo
    const buf = [];
    while (i < lines.length && lines[i].trim() && !RE.heading.test(lines[i]) && !RE.fence.test(lines[i]) &&
      !RE.quote.test(lines[i]) && !RE.ul.test(lines[i]) && !RE.ol.test(lines[i]) && !RE.hr.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && RE.tableSep.test(lines[i + 1]))) buf.push(lines[i++]);
    const raw = buf.map((l) => l.replace(/^\s+/, '')).join('\n');
    out.push(`<p>${raw.split('\n').map(inline).join(' ')}</p>`);
    blocks.push({ type: 'paragraph', text: raw.replace(/\n/g, ' '), section });
  }

  return { html: out.join('\n'), toc, blocks };
}

/** Lista (possivelmente aninhada) a partir da linha i. */
function parseList(lines, i) {
  const first = lines[i];
  const ordered = RE.ol.test(first) && !RE.ul.test(first);
  const baseIndent = (first.match(/^\s*/)[0] || '').length;
  const start = ordered ? +first.match(RE.ol)[2] : 1;
  const items = [];   // texto bruto de cada item (para os flashcards)
  const htmlItems = [];
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) {
      // linha em branco: continua a lista só se a próxima for item no mesmo nível
      const nx = lines[i + 1];
      if (nx && (RE.ul.test(nx) || RE.ol.test(nx)) && (nx.match(/^\s*/)[0].length >= baseIndent)) { i++; continue; }
      break;
    }
    const indent = l.match(/^\s*/)[0].length;
    const m = l.match(RE.ul) || l.match(RE.ol);
    const sameKind = m && (ordered ? !RE.ul.test(l) : RE.ul.test(l));
    if (m && indent === baseIndent && !sameKind) break; // outro tipo de lista começa
    if (m && indent === baseIndent) {
      const text = (l.match(RE.ol) && !l.match(RE.ul)) ? l.match(RE.ol)[3] : l.match(RE.ul)[2];
      items.push(text);
      htmlItems.push({ text, sub: '' });
      i++;
      continue;
    }
    if (m && indent > baseIndent) {
      const sub = parseList(lines, i);
      if (htmlItems.length) htmlItems.at(-1).sub += sub.html;
      i = sub.next;
      continue;
    }
    if (indent > baseIndent && htmlItems.length) { // continuação do item
      htmlItems.at(-1).text += ' ' + l.trim();
      items[items.length - 1] += ' ' + l.trim();
      i++;
      continue;
    }
    break;
  }
  const tag = ordered ? 'ol' : 'ul';
  const html = `<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>${htmlItems.map((it) => `<li>${inline(it.text.replace(/^\[( |x)\]\s+/i, (_, c) => (c === ' ' ? '☐ ' : '☑ ')))}${it.sub}</li>`).join('')}</${tag}>`;
  return { html, items, next: i };
}

/** Texto puro do Markdown (para busca). */
export function plainText(src) {
  return parseMarkdown(src).blocks.map((b) => b.type === 'table' ? [b.header, ...b.rows].map((r) => r.join(' · ')).join('\n')
    : b.type === 'list' ? b.items.map(stripInline).join('\n') : stripInline(b.text)).join('\n');
}
