/**
 * Calendário: visões Mês / Semana / Dia (planejador diário).
 * - Tocar num dia abre a visão diária; tocar num evento abre a edição.
 * - Toque longo num evento + arrastar move para outro dia.
 * - Botão "Gerar plano" distribui blocos de estudo até as provas.
 */
import * as db from '../core/db.js';
import { esc, openModal, formData, toast, confirmDialog, enableLongPressDrag } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectOptions, subjectColor, subjectName, subjects } from '../ui/common.js';
import { go } from '../app.js';
import {
  todayISO, addDays, addMonths, weekStart, monthStart, range, fmtLong, fmtMonth, fmtShort,
  WEEKDAYS_SHORT, diffDays, countdownText, fmtMinutes, parseISO, fmtBR,
} from '../core/dates.js';
import { expand, subjectProgress } from '../core/events.js';
import { generatePlan } from '../core/planner.js';

export function render(root, { params }) {
  const today = todayISO();
  const view = params.view || (innerWidth < 600 ? 'day' : 'month');
  const date = params.date || today;
  const filter = params.s || '';

  const nav = (v, d) => go('agenda', { view: v, date: d, ...(filter ? { s: filter } : {}) }, { replace: true });
  const step = view === 'month' ? (n) => addMonths(date, n) : view === 'week' ? (n) => addDays(date, 7 * n) : (n) => addDays(date, n);
  const title = view === 'month' ? fmtMonth(date) : view === 'week'
    ? `${fmtShort(weekStart(date))} – ${fmtShort(addDays(weekStart(date), 6))}` : fmtLong(date);

  root.innerHTML = `
    <div class="page-head"><h1>Agenda</h1>
      <div class="actions">
        <button class="btn" data-plan>${icon('wand')} Gerar plano</button>
      </div></div>
    <div class="cal-toolbar">
      <div class="seg" role="group" aria-label="Visão">
        ${[['month', 'Mês'], ['week', 'Semana'], ['day', 'Dia']].map(([v, l]) => `<button data-view="${v}" aria-pressed="${v === view}">${l}</button>`).join('')}
      </div>
      <button class="btn icon" data-step="-1" aria-label="Anterior">${icon('left')}</button>
      <button class="btn small" data-today>Hoje</button>
      <button class="btn icon" data-step="1" aria-label="Próximo">${icon('right')}</button>
      <div class="title">${title}</div>
    </div>
    <div id="cal-body"></div>
    <button class="fab" data-add aria-label="Nova tarefa">${icon('plus')}</button>
  `;
  const body = root.querySelector('#cal-body');
  const occFilter = (o) => !filter || o.ev.subjectId === filter;

  if (view === 'month') renderMonth(body, date, today, occFilter);
  else if (view === 'week') renderWeek(body, date, today, occFilter);
  else renderDay(body, date, today);

  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-view]')) return nav(t.closest('[data-view]').dataset.view, date);
    if (t.closest('[data-step]')) return nav(view, step(+t.closest('[data-step]').dataset.step));
    if (t.closest('[data-today]')) return nav(view, today);
    if (t.closest('[data-plan]')) return openPlanDialog();
    if (t.closest('[data-add]')) return openEventForm(null, view === 'day' ? date : (date < today && view !== 'month' ? today : date));
    const occ = t.closest('[data-occ]');
    if (occ) { e.stopPropagation(); return openOccurrence(occ.dataset.ev, occ.dataset.date); }
    const tick = t.closest('[data-tick]');
    if (tick) return toggleDone(tick.dataset.tick, tick.dataset.date);
    const addOn = t.closest('[data-add-on]');
    if (addOn) return openEventForm(null, addOn.dataset.addOn);
    const day = t.closest('[data-goday]');
    if (day) return go('agenda', { view: 'day', date: day.dataset.goday });
  });

  enableLongPressDrag(body, '[data-occ]', '[data-date-drop]', (item, drop) => {
    moveOccurrence(item.dataset.ev, item.dataset.date, drop.dataset.dateDrop);
  });
}

// ---------------------------------------------------------------------------
function chip(o) {
  const ev = o.ev;
  const c = ev.type === 'exam' ? 'var(--danger)' : subjectColor(ev.subjectId);
  return `<div class="ev ${ev.type === 'exam' ? 'exam' : ''} ${o.done ? 'done' : ''}" style="--c:${c}" data-occ data-ev="${ev.id}" data-date="${o.date}" title="${esc(ev.title)}">
    ${ev.time ? `<span>${ev.time}</span>` : ''}${esc(ev.title)}</div>`;
}

function renderMonth(el, date, today, occFilter) {
  const first = monthStart(date);
  const gridStart = weekStart(first);
  const days = range(gridStart, addDays(gridStart, 41));
  const occ = expand(db.all('events'), subjects(), days[0], days.at(-1)).filter(occFilter);
  const byDay = groupBy(occ, (o) => o.date);
  const month = date.slice(0, 7);
  // remove a última semana se ela for toda do mês seguinte
  const weeks = days.slice(35, 42).every((d) => d.slice(0, 7) !== month) ? days.slice(0, 35) : days;
  el.innerHTML = `<div class="month">
    ${[1, 2, 3, 4, 5, 6, 0].map((w) => `<div class="wd">${WEEKDAYS_SHORT[w]}</div>`).join('')}
    ${weeks.map((d) => {
      const list = byDay[d] || [];
      const max = 3;
      return `<div class="mcell ${d.slice(0, 7) !== month ? 'other' : ''} ${d === today ? 'today' : ''}" data-goday="${d}" data-date-drop="${d}">
        <span class="n">${+d.slice(8)}</span>
        ${list.slice(0, max).map(chip).join('')}
        ${list.length > max ? `<span class="more">+${list.length - max}</span>` : ''}
      </div>`;
    }).join('')}
  </div>
  <p class="small muted mt">Dica: toque num dia para ver o planejador; segure um evento e arraste para outro dia.</p>`;
}

function renderWeek(el, date, today, occFilter) {
  const ws = weekStart(date);
  const days = range(ws, addDays(ws, 6));
  const occ = expand(db.all('events'), subjects(), days[0], days[6]).filter(occFilter);
  const byDay = groupBy(occ, (o) => o.date);
  el.innerHTML = `<div class="week">${days.map((d) => {
    const dt = parseISO(d);
    return `<div class="wday ${d === today ? 'today' : ''}" data-date-drop="${d}">
      <h3 data-goday="${d}">${WEEKDAYS_SHORT[dt.getDay()]} ${dt.getDate()}</h3>
      ${(byDay[d] || []).map(chip).join('')}
      <button class="btn small ghost add" data-add-on="${d}" aria-label="Adicionar em ${fmtShort(d)}">${icon('plus')}</button>
    </div>`;
  }).join('')}</div>
  <p class="small muted mt">Segure um evento e arraste para mudar o dia.</p>`;
}

/** Planejador diário: provas do dia, checklist e barra de progresso. */
function renderDay(el, date, today) {
  const occ = expand(db.all('events'), subjects(), date, date);
  const exams = occ.filter((o) => o.ev.type === 'exam');
  const tasks = occ.filter((o) => o.ev.type === 'task');
  const done = tasks.filter((o) => o.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const mins = tasks.reduce((a, o) => a + (o.ev.duration || 0), 0);
  // próximas provas (contagem regressiva)
  const upcoming = expand(db.all('events'), subjects(), date, addDays(date, 60)).filter((o) => o.ev.type === 'exam' && o.date > date).slice(0, 3);

  el.innerHTML = `
    ${exams.map((o) => `<div class="exam-banner">${icon('bolt')}<span class="grow">${esc(o.ev.title)}${o.ev.time ? ' às ' + o.ev.time : ''}</span><span>${countdownText(diffDays(today, date))}</span></div>`).join('')}
    <div class="card">
      <div class="spread"><div><b>${done} de ${tasks.length}</b> tarefas concluídas <span class="muted">· ${fmtMinutes(mins)} planejados</span></div><b>${pct}%</b></div>
      <div class="progress mt" style="--c:var(--ok)"><span style="width:${pct}%"></span></div>
    </div>
    <div class="mt" data-date-drop="${date}">
      ${tasks.length ? tasks.map((o) => taskRow(o)).join('') : `<div class="empty">Nada planejado para este dia.<br><button class="btn primary" data-add-on="${date}">${icon('plus')} Adicionar tarefa</button></div>`}
    </div>
    ${upcoming.length ? `<div class="section"><h2>Próximas provas</h2></div>
      <div class="card"><ul class="list">${upcoming.map((o) => `<li><button class="row" data-goday="${o.date}">
        <span class="dot" style="background:${subjectColor(o.ev.subjectId)}"></span>
        <span class="grow"><span class="title">${esc(o.ev.title)}</span><br><span class="small muted">${fmtBR(o.date)}</span></span>
        <span class="countdown ${diffDays(today, o.date) <= 7 ? 'soon' : ''}">${countdownText(diffDays(today, o.date))}</span></button></li>`).join('')}</ul></div>` : ''}
  `;
}

export function taskRow(o) {
  const ev = o.ev;
  return `<div class="task ${o.done ? 'done' : ''}" style="--c:${subjectColor(ev.subjectId)}">
    <button class="tick" data-tick="${ev.id}" data-date="${o.date}" aria-label="${o.done ? 'Desmarcar' : 'Concluir'}">${icon('check')}</button>
    <div class="grow" data-occ data-ev="${ev.id}" data-date="${o.date}">
      <div class="t">${esc(ev.title)}</div>
      <div class="s">${ev.time ? ev.time + ' · ' : ''}${ev.duration ? fmtMinutes(ev.duration) + ' · ' : ''}${esc(subjectName(ev.subjectId))}${ev.recurrence?.freq ? ' · repete' : ''}</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------------
// Ações sobre eventos

export async function toggleDone(id, date) {
  const ev = db.get('events', id);
  if (!ev) return;
  if (ev.recurrence?.freq) {
    const set = new Set(ev.doneDates || []);
    set.has(date) ? set.delete(date) : set.add(date);
    ev.doneDates = [...set];
  } else {
    ev.done = !ev.done;
    ev.doneAt = ev.done ? todayISO() : null;
  }
  await db.put('events', ev);
  if (navigator.vibrate) navigator.vibrate(10);
}

async function moveOccurrence(id, fromDate, toDate) {
  if (fromDate === toDate) return;
  if (id.startsWith('exam:')) {
    const s = db.get('subjects', id.slice(5));
    s.examDate = toDate;
    await db.put('subjects', s);
    return toast('Data da prova alterada para ' + fmtBR(toDate));
  }
  const ev = db.get('events', id);
  if (!ev) return;
  if (ev.recurrence?.freq) {
    // Move só esta ocorrência: pula a data original e cria uma cópia avulsa.
    ev.skipDates = [...(ev.skipDates || []), fromDate];
    await db.put('events', ev);
    const { id: _, createdAt, updatedAt, ...rest } = ev;
    await db.put('events', { ...rest, date: toDate, recurrence: null, skipDates: [], doneDates: [], done: (ev.doneDates || []).includes(fromDate) });
    return toast('Ocorrência movida (só esta)');
  }
  ev.date = toDate;
  await db.put('events', ev);
  toast('Movido para ' + fmtBR(toDate));
}

function openOccurrence(id, date) {
  if (id.startsWith('exam:')) {
    return import('./subjects.js').then((m) => m.openSubjectForm(db.get('subjects', id.slice(5))));
  }
  openEventForm(db.get('events', id), date);
}

/** Formulário de evento (tarefa/bloco de estudo ou prova). */
export function openEventForm(ev = null, date = todayISO(), preset = {}) {
  const e = ev || { type: 'task', title: '', subjectId: '', date, time: '', duration: 50, notes: '', recurrence: null, ...preset };
  const rec = e.recurrence?.freq || '';
  openModal({
    title: ev ? 'Editar evento' : 'Novo evento',
    body: `<form id="ef">
      <div class="field"><span>Tipo</span><div class="seg" role="radiogroup">
        <label><input type="radio" name="type" value="task" ${e.type === 'task' ? 'checked' : ''} hidden><button type="button" data-type="task" aria-pressed="${e.type === 'task'}">Tarefa / estudo</button></label>
        <label><input type="radio" name="type" value="exam" ${e.type === 'exam' ? 'checked' : ''} hidden><button type="button" data-type="exam" aria-pressed="${e.type === 'exam'}">Prova</button></label>
      </div></div>
      <label class="field"><span>Título</span><input class="input" name="title" value="${esc(e.title)}" placeholder="Ex.: Ler capítulo de contratos" required></label>
      <label class="field"><span>Matéria</span><select class="input" name="subjectId">${subjectOptions(e.subjectId)}</select></label>
      <div class="field-row">
        <label class="field"><span>Data</span><input class="input" type="date" name="date" value="${e.date}" required></label>
        <label class="field"><span>Horário</span><input class="input" type="time" name="time" value="${e.time || ''}"></label>
      </div>
      <div class="field-row task-only">
        <label class="field"><span>Duração (min)</span><input class="input" type="number" min="0" step="5" name="duration" value="${e.duration ?? 50}"></label>
        <label class="field"><span>Repetir</span><select class="input" name="freq">
          <option value="" ${!rec ? 'selected' : ''}>Não repete</option>
          <option value="daily" ${rec === 'daily' ? 'selected' : ''}>Todos os dias</option>
          <option value="weekdays" ${rec === 'weekdays' ? 'selected' : ''}>Dias úteis (seg–sex)</option>
          <option value="weekly" ${rec === 'weekly' ? 'selected' : ''}>Toda semana</option>
        </select></label>
      </div>
      <label class="field task-only until" ${rec ? '' : 'hidden'}><span>Repetir até</span><input class="input" type="date" name="until" value="${e.recurrence?.until || ''}"></label>
      <label class="field"><span>Anotações</span><textarea class="input" name="notes" rows="2">${esc(e.notes || '')}</textarea></label>
      ${ev?.recurrence?.freq ? `<p class="small muted">Este evento se repete. As alterações valem para toda a série.</p>` : ''}
    </form>`,
    onOpen: (el) => {
      const f = el.querySelector('#ef');
      const sync = () => {
        const isExam = f.querySelector('[name=type]:checked').value === 'exam';
        el.querySelectorAll('.task-only').forEach((x) => (x.style.display = isExam ? 'none' : ''));
        if (!isExam) el.querySelector('.until').hidden = !f.freq.value;
      };
      el.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
        f.querySelector(`[name=type][value=${b.dataset.type}]`).checked = true;
        el.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', x === b));
        sync();
      }));
      f.freq.addEventListener('change', sync);
      sync();
    },
    actions: [
      ...(ev ? [{ label: `${icon('trash')} Excluir`, cls: 'danger', left: true, onClick: () => deleteEvent(ev, date) }] : []),
      { label: 'Cancelar' },
      { label: 'Salvar', cls: 'primary', onClick: async (close, el) => {
        const d = formData(el.querySelector('#ef'));
        if (!d.title.trim()) {
          if (d.type === 'exam' && d.subjectId) d.title = 'Prova — ' + subjectName(d.subjectId);
          else { toast('Dê um título ao evento'); return false; }
        }
        if (!d.date) { toast('Escolha a data'); return false; }
        const out = {
          ...e, type: d.type, title: d.title.trim(), subjectId: d.subjectId, date: d.date, time: d.time,
          duration: d.type === 'exam' ? 0 : Math.max(0, +d.duration || 0), notes: d.notes,
          recurrence: d.type === 'task' && d.freq ? { freq: d.freq, until: d.until || '' } : null,
          doneDates: e.doneDates || [], skipDates: e.skipDates || [], done: !!e.done,
        };
        await db.put('events', out);
        toast(ev ? 'Evento atualizado' : 'Evento criado');
      } },
    ],
  });
}

async function deleteEvent(ev, date) {
  if (ev.recurrence?.freq) {
    return new Promise((resolve) => {
      openModal({
        title: 'Excluir evento recorrente',
        body: `<p>Excluir só a ocorrência de <b>${fmtBR(date)}</b> ou a série inteira?</p>`,
        actions: [
          { label: 'Cancelar', onClick: () => resolve(false) },
          { label: 'Só esta', onClick: async () => { ev.skipDates = [...(ev.skipDates || []), date]; await db.put('events', ev); resolve(); } },
          { label: 'Série inteira', cls: 'danger solid', onClick: async () => { await db.remove('events', ev.id); resolve(); } },
        ],
      });
    });
  }
  const ok = await confirmDialog(`Excluir “${esc(ev.title)}”?`, { ok: 'Excluir', danger: true });
  if (!ok) return false;
  await db.remove('events', ev.id);
  toast('Evento excluído');
}

// ---------------------------------------------------------------------------
// Gerar plano de estudos

function openPlanDialog() {
  const s = db.getSettings();
  const today = todayISO();
  const subs = subjects().filter((x) => x.examDate && x.examDate > today);
  if (!subs.length) {
    return openModal({ title: 'Gerar plano de estudos', body: `<p>Para gerar o plano, cadastre as matérias com a <b>data da prova</b> (em Matérias).</p>`, actions: [{ label: 'Ir para Matérias', cls: 'primary', onClick: () => go('materias') }] });
  }
  const prevGenerated = db.where('events', (e) => e.generated && !e.done && e.date >= today).length;
  openModal({
    title: 'Gerar plano de estudos',
    body: `<form id="pf">
      <p class="muted small">Distribui blocos de estudo nos dias livres até cada prova, priorizando as provas mais próximas e as matérias com menos conteúdo estudado. Os títulos seguem seus guias ainda não lidos. A véspera de cada prova é reservada para revisão final.</p>
      <div class="card" style="box-shadow:none">${subs.map((x) => `<div class="spread small"><span><span class="dot" style="background:${x.color}"></span> ${esc(x.name)}</span><span class="muted">${fmtBR(x.examDate)} · ${countdownText(diffDays(today, x.examDate))}</span></div>`).join('')}</div>
      <div class="field-row mt">
        <label class="field"><span>Começar em</span><input class="input" type="date" name="start" value="${today}"></label>
        <label class="field"><span>Início do dia</span><input class="input" type="time" name="startTime" value="${s.planStartTime}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Horas de estudo por dia</span><input class="input" type="number" name="hours" min="0.5" max="14" step="0.5" value="${s.planDailyMinutes / 60}"></label>
        <label class="field"><span>Duração do bloco (min)</span><input class="input" type="number" name="block" min="15" max="180" step="5" value="${s.planBlockMinutes}"></label>
      </div>
      <label class="field"><span>Intervalo entre blocos (min)</span><input class="input" type="number" name="brk" min="0" max="60" step="5" value="${s.planBreakMinutes}"></label>
      <div class="field"><span>Não estudar em</span><div class="weekday-picks">
        ${[1, 2, 3, 4, 5, 6, 0].map((w) => `<label><input type="checkbox" name="skip" value="${w}" ${s.planSkipWeekdays.includes(w) ? 'checked' : ''}><span>${WEEKDAYS_SHORT[w]}</span></label>`).join('')}
      </div></div>
      <label class="check"><input type="checkbox" name="review" ${s.planReviewDayBefore ? 'checked' : ''}> Reservar a véspera de cada prova para revisão final</label>
      ${prevGenerated ? `<label class="check"><input type="checkbox" name="replace" checked> Substituir o plano gerado anteriormente (${prevGenerated} blocos futuros não concluídos)</label>` : ''}
    </form>`,
    actions: [
      { label: 'Cancelar' },
      { label: `${icon('wand')} Gerar`, cls: 'primary', onClick: async (close, el) => {
        const d = formData(el.querySelector('#pf'));
        const opts = {
          dailyMinutes: Math.round((+d.hours || 4) * 60), blockMinutes: +d.block || 50, breakMinutes: +d.brk || 0,
          startTime: d.startTime || '08:00', skipWeekdays: (d.skip || []).map(Number), reviewDayBefore: !!d.review,
        };
        db.setSettings({ planDailyMinutes: opts.dailyMinutes, planBlockMinutes: opts.blockMinutes, planBreakMinutes: opts.breakMinutes, planStartTime: opts.startTime, planSkipWeekdays: opts.skipWeekdays, planReviewDayBefore: opts.reviewDayBefore });
        if (d.replace) await db.removeMany('events', db.where('events', (e) => e.generated && !e.done && e.date >= today).map((e) => e.id));
        const start = d.start || today;
        const lastExam = subs.map((x) => x.examDate).sort().at(-1);
        const guides = db.all('guides').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const plan = generatePlan({
          subjects: subs,
          occurrences: expand(db.all('events'), [], start, lastExam),
          guidesBySubject: Object.fromEntries(subs.map((x) => [x.id, guides.filter((g) => g.subjectId === x.id)])),
          progressBySubject: Object.fromEntries(subs.map((x) => [x.id, subjectProgress(x, db.all('guides'), db.all('events'))])),
          start, opts,
        });
        if (!plan.length) { toast('Não há tempo livre para planejar com essas opções.'); return false; }
        await db.putMany('events', plan);
        toast(`Plano criado: ${plan.length} blocos de estudo`);
        go('agenda', { view: 'week', date: start });
      } },
    ],
  });
}

function groupBy(arr, fn) {
  const out = {};
  for (const x of arr) (out[fn(x)] ||= []).push(x);
  return out;
}
