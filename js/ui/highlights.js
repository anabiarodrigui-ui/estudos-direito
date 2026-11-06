/**
 * Destaques (marca-texto) e anotações no leitor.
 * Cada destaque é salvo como posição no texto puro do guia renderizado
 * ({start, end} em caracteres de container.textContent) + o trecho, para conferência.
 * Se o guia for editado e o trecho mudar de lugar, procuramos o texto de novo.
 */

/** Lista de nós de texto do contêiner com seus deslocamentos acumulados. */
function textNodes(container) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let pos = 0, n;
  while ((n = walker.nextNode())) { nodes.push({ node: n, start: pos, end: pos + n.data.length }); pos += n.data.length; }
  return nodes;
}

/** Envolve o intervalo [start, end) do texto do contêiner em <mark>. */
function wrapRange(container, start, end, makeMark) {
  for (const t of textNodes(container)) {
    if (t.end <= start || t.start >= end) continue;
    const s = Math.max(start, t.start) - t.start;
    const e = Math.min(end, t.end) - t.start;
    if (!t.node.data.slice(s, e).trim()) continue; // não marca só espaços/quebras
    const r = document.createRange();
    r.setStart(t.node, s); r.setEnd(t.node, e);
    const mark = makeMark();
    r.surroundContents(mark);
  }
}

/** Resolve a posição atual de um destaque (corrige se o texto mudou de lugar). */
function locate(full, h) {
  if (full.slice(h.start, h.end) === h.text) return [h.start, h.end];
  let best = -1, idx = full.indexOf(h.text);
  while (idx !== -1) { if (best === -1 || Math.abs(idx - h.start) < Math.abs(best - h.start)) best = idx; idx = full.indexOf(h.text, idx + 1); }
  return best === -1 ? null : [best, best + h.text.length];
}

/** Aplica os destaques salvos ao HTML já renderizado. */
export function applyHighlights(container, highlights) {
  const full = container.textContent;
  for (const h of [...highlights].sort((a, b) => a.start - b.start)) {
    const pos = locate(full, h);
    if (!pos) continue;
    wrapRange(container, pos[0], pos[1], () => {
      const m = document.createElement('mark');
      m.className = `hl ${h.color || ''} ${h.note ? 'has-note' : ''}`;
      m.dataset.hl = h.id;
      return m;
    });
  }
}

/** Marca ocorrências de um termo de busca; devolve a primeira. */
export function markFind(container, term) {
  if (!term) return null;
  const full = container.textContent;
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hay = norm(full), needle = norm(term);
  const ranges = [];
  let i = hay.indexOf(needle);
  while (i !== -1 && ranges.length < 200) { ranges.push([i, i + needle.length]); i = hay.indexOf(needle, i + needle.length); }
  for (const [s, e] of ranges.reverse()) wrapRange(container, s, e, () => { const m = document.createElement('mark'); m.className = 'find'; return m; });
  return container.querySelector('mark.find');
}

/** Converte a seleção atual em {start, end, text} relativos ao contêiner (ou null). */
export function selectionOffsets(container) {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const pre = document.createRange();
  pre.selectNodeContents(container);
  pre.setEnd(range.startContainer, range.startOffset);
  let start = pre.toString().length;
  let text = range.toString();
  // remove espaços nas pontas
  const lead = text.length - text.trimStart().length;
  start += lead;
  text = text.trim();
  if (text.length < 2) return null;
  return { start, end: start + text.length, text };
}
