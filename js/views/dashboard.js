/** Painel inicial: hoje, provas e cartões por matéria. */
import * as db from '../core/db.js';
import { esc } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjects, activeDates } from '../ui/common.js';
import { go } from '../app.js';
import { todayISO, fmtLong, countdownText, fmtMinutes } from '../core/dates.js';
import { expand, nextExam, subjectProgress } from '../core/events.js';
import { isDue, isNew, streak } from '../core/srs.js';
import { taskRow, toggleDone, openEventForm } from './calendar.js';
import { openSubjectForm } from './subjects.js';

export function render(root) {
  const today = todayISO();
  const subs = subjects();
  const events = db.all('events');
  const cards = db.all('cards');
  const guides = db.all('guides');
  const occ = expand(events, subs, today, today);
  const tasks = occ.filter((o) => o.ev.type === 'task');
  const done = tasks.filter((o) => o.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const due = cards.filter((c) => isDue(c, today)).length;
  const newCount = cards.filter(isNew).length;
  const minsToday = db.where('sessions', (s) => s.date === today).reduce((a, s) => a + s.minutes, 0);
  const st = streak(activeDates(), today);
  const h = new Date().getHours();
  const hello = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  if (!subs.length) {
    root.innerHTML = `
      <div class="page-head"><h1>${hello}!</h1></div>
      <div class="card stack">
        <h2>Boas-vindas ao seu organizador de estudos</h2>
        <p>Comece cadastrando as matérias das provas finais com a data de cada prova. Depois importe seus resumos, gere flashcards e monte o plano de estudos.</p>
        <div class="btn-row">
          <button class="btn primary" data-new-subject>${icon('plus')} Cadastrar matéria</button>
          <button class="btn" data-sample>Carregar dados de exemplo</button>
        </div>
        <p class="small muted">Os dados de exemplo podem ser apagados depois em Configurações.</p>
      </div>`;
    root.querySelector('[data-new-subject]').onclick = () => openSubjectForm();
    root.querySelector('[data-sample]').onclick = async () => { const m = await import('../sample.js'); await m.loadSample(); };
    return;
  }

  root.innerHTML = `
    <div class="page-head"><h1>${hello}!</h1><span class="muted">${fmtLong(today)}</span></div>
    <div class="stat-row">
      <div class="stat"><div class="v">${due}</div><div class="l">flashcards para hoje</div></div>
      <div class="stat"><div class="v">${pct}%</div><div class="l">tarefas de hoje (${done}/${tasks.length})</div></div>
      <div class="stat"><div class="v">${fmtMinutes(minsToday)}</div><div class="l">estudados hoje</div></div>
      <div class="stat"><div class="v">${st} ${st === 1 ? 'dia' : 'dias'}</div><div class="l">sequência de estudo</div></div>
    </div>
    <div class="btn-row mt">
      ${due || newCount ? `<button class="btn primary" data-go="estudar">${icon('cards')} Estudar flashcards</button>` : ''}
      <button class="btn" data-go="cronometro">${icon('timer')} Cronômetro</button>
      <button class="btn" data-day>${icon('calendar')} Planejador de hoje</button>
    </div>

    <div class="section"><h2>Hoje</h2><button class="btn small ghost" data-add>${icon('plus')} Tarefa</button></div>
    <div id="today-list">${tasks.length ? tasks.map(taskRow).join('') : `<div class="card empty">Nenhuma tarefa para hoje. Use “Gerar plano” na Agenda ou adicione uma tarefa.</div>`}</div>

    <div class="section"><h2>Matérias</h2><button class="btn small ghost" data-go="materias">${icon('edit')} Gerenciar</button></div>
    <div class="grid">${subs.map((s) => {
      const ex = nextExam(s, events, today);
      const prog = subjectProgress(s, guides, events);
      const sc = cards.filter((c) => c.subjectId === s.id);
      const pend = sc.filter((c) => isDue(c, today)).length;
      const nw = sc.filter(isNew).length;
      return `<div class="card subject-card" style="--c:${s.color}" data-subject="${s.id}" role="button" tabindex="0">
        <h3>${esc(s.name)}</h3>
        <div class="small muted">${s.teacher ? esc(s.teacher) : '&nbsp;'}</div>
        <div class="meta">
          <div><b class="countdown ${ex && ex.days <= 7 ? 'soon' : ''}">${ex ? (ex.days === 0 ? 'HOJE' : ex.days) : '—'}</b><span class="small muted">${ex ? (ex.days === 0 ? 'é a prova' : ex.days === 1 ? 'dia p/ prova' : 'dias p/ prova') : 'sem prova'}</span></div>
          <div><b>${prog}%</b><span class="small muted">estudado</span></div>
          <div><b>${pend}</b><span class="small muted">cartões pendentes${nw ? ` · ${nw} novos` : ''}</span></div>
        </div>
        <div class="progress mt"><span style="width:${prog}%"></span></div>
      </div>`;
    }).join('')}</div>
  `;

  root.addEventListener('click', (e) => {
    const t = e.target;
    const g = t.closest('[data-go]');
    if (g) return go(g.dataset.go);
    if (t.closest('[data-day]')) return go('agenda', { view: 'day', date: today });
    if (t.closest('[data-add]')) return openEventForm(null, today);
    const tick = t.closest('[data-tick]');
    if (tick) return toggleDone(tick.dataset.tick, tick.dataset.date);
    const occ = t.closest('[data-occ]');
    if (occ) return openEventForm(db.get('events', occ.dataset.ev), occ.dataset.date);
    const sc = t.closest('[data-subject]');
    if (sc) return go('resumos', { s: sc.dataset.subject });
  });
}
