/**
 * "Minha rotina": horário em que o dia começa/termina (por dia da semana) e
 * compromissos fixos (aulas, deslocamento, terapia, cuidados pessoais…).
 * O gerador de plano só coloca estudo no tempo que sobra.
 */
import * as db from '../core/db.js';
import { esc, openModal, formData, toast, confirmDialog } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { dayWindows, ROUTINE_KINDS, routineKindLabel } from '../ui/common.js';
import { WEEKDAYS_SHORT, WEEKDAYS_LONG, fmtMinutes, timeToMin } from '../core/dates.js';
import { freeMinutesByWeekday } from '../core/planner.js';
import { go, refresh } from '../app.js';

const ORDER = [1, 2, 3, 4, 5, 6, 0]; // semana começando na segunda

export function render(root) {
  const s = db.getSettings();
  const windows = dayWindows();
  const routine = db.all('routine').sort((a, b) => (a.start < b.start ? -1 : 1));
  const free = freeMinutesByWeekday({ windows, routine, buffer: s.routineBuffer });

  root.innerHTML = `
    <div class="page-head"><h1>Minha rotina</h1>
      <div class="actions"><button class="btn" data-back>${icon('calendar')} Voltar à agenda</button></div></div>
    <p class="muted">Cadastre seus compromissos fixos. O “Gerar plano” só coloca estudo no tempo que sobra, com uma folga antes e depois de cada compromisso.</p>

    <div class="section"><h2>Compromissos fixos</h2><button class="btn small primary" data-add>${icon('plus')} Adicionar</button></div>
    ${routine.length ? `<div class="card"><ul class="list">${routine.map((r) => `<li><button class="row" data-edit="${r.id}">
        <span class="routine-swatch"></span>
        <span class="grow"><span class="title">${esc(r.title)}</span><br>
          <span class="small muted">${r.start}–${r.end} · ${daysLabel(r.weekdays)} · ${esc(routineKindLabel(r.kind))}</span></span>
        ${icon('edit')}</button></li>`).join('')}</ul></div>`
    : `<div class="card empty"><p>Nenhum compromisso ainda. Comece pelas aulas, o deslocamento e os horários que você não pode estudar.</p>
        <button class="btn primary" data-add>${icon('plus')} Adicionar compromisso</button></div>`}

    <div class="section"><h2>Meu dia</h2></div>
    <div class="card">
      <p class="small muted">Horário em que você pode começar e até quando pode estudar em cada dia. Marque “folga” nos dias em que não quer estudar.</p>
      <div class="day-windows">${ORDER.map((wd) => {
        const w = windows[wd];
        return `<div class="dw-row ${w.off ? 'off' : ''}" data-wd="${wd}">
          <b class="dw-day">${WEEKDAYS_SHORT[wd]}</b>
          <label class="dw-time"><span class="sr-only">Começa ${WEEKDAYS_LONG[wd]}</span><input class="input" type="time" data-f="start" value="${w.start}" ${w.off ? 'disabled' : ''}></label>
          <span class="muted">até</span>
          <label class="dw-time"><span class="sr-only">Termina ${WEEKDAYS_LONG[wd]}</span><input class="input" type="time" data-f="end" value="${w.end}" ${w.off ? 'disabled' : ''}></label>
          <label class="check dw-off"><input type="checkbox" data-f="off" ${w.off ? 'checked' : ''}> folga</label>
          <span class="small dw-free">${w.off ? '—' : fmtMinutes(free[wd]) + ' livres'}</span>
        </div>`;
      }).join('')}</div>
      <label class="field mt mb0"><span>Folga antes e depois de cada compromisso</span>
        <select class="input" id="buffer" style="max-width:220px">
          ${[0, 5, 10, 15, 20, 30, 45, 60].map((m) => `<option value="${m}" ${m === s.routineBuffer ? 'selected' : ''}>${m ? m + ' min' : 'sem folga'}</option>`).join('')}
        </select></label>
    </div>

    <div class="section"><h2>Tempo livre na semana</h2></div>
    <div class="card">
      <div class="bars" role="img" aria-label="Tempo livre por dia">${ORDER.map((wd) => {
        const max = Math.max(...free, 1);
        return `<div class="b"><span class="v">${free[wd] ? fmtMinutes(free[wd]) : ''}</span><span class="col" style="height:${(free[wd] / max) * 100}%"></span><span class="l">${WEEKDAYS_SHORT[wd]}</span></div>`;
      }).join('')}</div>
      <p class="small muted mb0 mt">Total: <b>${fmtMinutes(free.reduce((a, b) => a + b, 0))}</b> livres por semana. O plano usa até o limite de horas de estudo por dia que você escolher ao gerar.</p>
    </div>
  `;

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-back]')) return go('agenda');
    if (e.target.closest('[data-add]')) return openRoutineForm();
    const ed = e.target.closest('[data-edit]');
    if (ed) return openRoutineForm(db.get('routine', ed.dataset.edit));
  });

  // janelas do dia: salva ao mudar
  root.querySelector('.day-windows').addEventListener('change', (e) => {
    const row = e.target.closest('[data-wd]');
    if (!row) return;
    const ws = dayWindows().map((w) => ({ ...w }));
    const w = ws[+row.dataset.wd];
    const f = e.target.dataset.f;
    if (f === 'off') w.off = e.target.checked;
    else w[f] = e.target.value;
    if (!w.off && timeToMin(w.end) <= timeToMin(w.start)) { toast('O fim do dia precisa ser depois do início'); return refresh(); }
    db.setSettings({ dayWindows: ws });
  });
  root.querySelector('#buffer').addEventListener('change', (e) => db.setSettings({ routineBuffer: +e.target.value }));
}

function daysLabel(wds = []) {
  const set = [...wds].sort();
  const key = set.join(',');
  if (key === '1,2,3,4,5') return 'seg a sex';
  if (key === '0,1,2,3,4,5,6') return 'todos os dias';
  if (key === '0,6') return 'fins de semana';
  return ORDER.filter((d) => set.includes(d)).map((d) => WEEKDAYS_SHORT[d]).join(', ');
}

/** Formulário de compromisso fixo. */
export function openRoutineForm(item = null) {
  const r = item || { title: '', kind: 'aula', weekdays: [1, 2, 3, 4, 5], start: '08:00', end: '12:00' };
  openModal({
    title: item ? 'Editar compromisso' : 'Novo compromisso',
    body: `<form id="rf">
      <div class="field"><span>Tipo</span><div class="chips wrap">${ROUTINE_KINDS.map(([k, l]) =>
        `<button type="button" class="chip" data-kind="${k}" aria-pressed="${r.kind === k}">${l}</button>`).join('')}</div>
        <input type="hidden" name="kind" value="${r.kind}"></div>
      <label class="field"><span>Nome</span><input class="input" name="title" value="${esc(r.title)}" placeholder="Ex.: Aulas na faculdade"></label>
      <div class="field"><span>Dias</span><div class="weekday-picks">${ORDER.map((w) =>
        `<label><input type="checkbox" name="wd" value="${w}" ${r.weekdays.includes(w) ? 'checked' : ''}><span>${WEEKDAYS_SHORT[w]}</span></label>`).join('')}</div>
        <div class="btn-row mt"><button type="button" class="btn small" data-days="1,2,3,4,5">Seg a sex</button><button type="button" class="btn small" data-days="0,1,2,3,4,5,6">Todos</button><button type="button" class="btn small" data-days="">Nenhum</button></div></div>
      <div class="field-row">
        <label class="field"><span>Começa</span><input class="input" type="time" name="start" value="${r.start}" required></label>
        <label class="field"><span>Termina</span><input class="input" type="time" name="end" value="${r.end}" required></label>
      </div>
    </form>`,
    onOpen: (el) => {
      const f = el.querySelector('#rf');
      el.addEventListener('click', (e) => {
        const k = e.target.closest('[data-kind]');
        if (k) {
          const prevLabel = routineKindLabel(f.kind.value);
          f.kind.value = k.dataset.kind;
          el.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', b === k));
          if (!f.title.value.trim() || f.title.value === prevLabel) f.title.value = routineKindLabel(k.dataset.kind);
        }
        const d = e.target.closest('[data-days]');
        if (d) { const set = d.dataset.days.split(',').filter(Boolean); f.querySelectorAll('[name=wd]').forEach((c) => (c.checked = set.includes(c.value))); }
      });
      if (!item) f.title.value = routineKindLabel(r.kind);
    },
    actions: [
      ...(item ? [{ label: `${icon('trash')} Excluir`, cls: 'danger', left: true, onClick: async () => {
        if (!(await confirmDialog(`Excluir “${esc(item.title)}” da rotina?`, { ok: 'Excluir', danger: true }))) return false;
        await db.remove('routine', item.id); toast('Compromisso excluído');
      } }] : []),
      { label: 'Cancelar' },
      { label: 'Salvar', cls: 'primary', onClick: async (c, el) => {
        const d = formData(el.querySelector('#rf'));
        const weekdays = (d.wd || []).map(Number);
        if (!d.title.trim()) { toast('Dê um nome ao compromisso'); return false; }
        if (!weekdays.length) { toast('Escolha pelo menos um dia'); return false; }
        if (timeToMin(d.end) <= timeToMin(d.start)) { toast('O horário de término precisa ser depois do início'); return false; }
        await db.put('routine', { ...r, title: d.title.trim(), kind: d.kind, weekdays, start: d.start, end: d.end });
        toast(item ? 'Compromisso atualizado' : 'Compromisso adicionado');
      } },
    ],
  });
}
