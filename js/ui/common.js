/** Componentes e consultas compartilhados entre telas. */
import * as db from '../core/db.js';
import { esc } from './dom.js';

/** Paleta sóbria para as matérias (funciona no claro e no escuro). */
export const COLORS = ['#2f4f86', '#8a2d3b', '#2e7d4f', '#9a6400', '#6b3fa0', '#0f7b8a', '#b5523b', '#5b6b2f', '#a03f7a', '#4a5568'];

export const subjects = () => db.all('subjects').sort((a, b) => (a.examDate || '9999') < (b.examDate || '9999') ? -1 : (a.examDate || '9999') > (b.examDate || '9999') ? 1 : a.name.localeCompare(b.name));
export const subjectById = (id) => db.get('subjects', id);
export const subjectColor = (id) => subjectById(id)?.color || 'var(--muted)';
export const subjectName = (id) => subjectById(id)?.name || 'Sem matéria';

/** <option>s de matérias para um <select>. */
export function subjectOptions(selected = '', { allowNone = true, noneLabel = '— Sem matéria —' } = {}) {
  return (allowNone ? `<option value="">${noneLabel}</option>` : '') +
    subjects().map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}

/** Chips de filtro por matéria. selected = '' (todas) ou id. */
export function subjectChips(selected = '', attr = 'data-subject') {
  return `<div class="chips" role="group" aria-label="Filtrar por matéria">
    <button class="chip" ${attr}="" aria-pressed="${!selected}">Todas</button>
    ${subjects().map((s) => `<button class="chip" ${attr}="${s.id}" aria-pressed="${selected === s.id}"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</button>`).join('')}
  </div>`;
}

/** Datas com alguma atividade de estudo (para a sequência de dias). */
export function activeDates() {
  const set = new Set();
  for (const r of db.all('reviews')) set.add(r.date);
  for (const s of db.all('sessions')) set.add(s.date);
  for (const e of db.all('events')) {
    if (e.type !== 'task') continue;
    if (e.recurrence?.freq) (e.doneDates || []).forEach((d) => set.add(d));
    else if (e.done && e.doneAt) set.add(e.doneAt);
  }
  return [...set];
}
