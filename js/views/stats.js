/** Estatísticas semanais: horas estudadas, flashcards revisados e tarefas concluídas. */
import * as db from '../core/db.js';
import { esc } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjects, activeDates } from '../ui/common.js';
import { go } from '../app.js';
import { todayISO, weekStart, addDays, fmtShort, fmtMinutes, parseISO, WEEKDAYS_SHORT } from '../core/dates.js';
import { weeklyStats } from '../core/stats.js';
import { streak } from '../core/srs.js';

export function render(root, { params }) {
  const today = todayISO();
  const ws = weekStart(params.w || today);
  const st = weeklyStats({ sessions: db.all('sessions'), reviews: db.all('reviews'), events: db.all('events'), subjects: subjects(), weekStart: ws });
  const prev = weeklyStats({ sessions: db.all('sessions'), reviews: db.all('reviews'), events: db.all('events'), subjects: subjects(), weekStart: addDays(ws, -7) });
  const delta = st.totalMinutes - prev.totalMinutes;
  const maxMin = Math.max(...st.days.map((d) => d.minutes), 1);
  const maxRev = Math.max(...st.days.map((d) => d.reviews), 1);
  const maxSubj = Math.max(...st.bySubject.map((s) => s.minutes), 1);
  const isCurrent = ws === weekStart(today);

  const bars = (key, max, fmt) => {
    const top = st.days.reduce((a, d) => (d[key] > a[key] ? d : a), st.days[0]);
    return `<div class="bars" role="img" aria-label="Gráfico de barras por dia">${st.days.map((d) => {
      const v = d[key];
      const lbl = WEEKDAYS_SHORT[parseISO(d.date).getDay()];
      return `<button class="b" data-day="${d.date}" style="background:none;border:0;padding:0;cursor:pointer" aria-label="${lbl} ${fmtShort(d.date)}: ${fmt(v)}">
        <span class="v">${d === top && v ? fmt(v) : '&nbsp;'}</span>
        <span class="col" style="height:${(v / max) * 100}%;${d.date === today ? '' : 'opacity:.75'}"></span>
        <span class="l" style="${d.date === today ? 'font-weight:700;color:var(--text)' : ''}">${lbl}</span></button>`;
    }).join('')}</div>`;
  };

  root.innerHTML = `
    <div class="page-head"><h1>Estatísticas</h1></div>
    <div class="cal-toolbar">
      <button class="btn icon" data-w="${addDays(ws, -7)}" aria-label="Semana anterior">${icon('left')}</button>
      <div class="title" style="flex:none;min-width:0">Semana ${fmtShort(ws)} – ${fmtShort(addDays(ws, 6))}</div>
      <button class="btn icon" data-w="${addDays(ws, 7)}" aria-label="Próxima semana" ${isCurrent ? 'disabled' : ''}>${icon('right')}</button>
      ${isCurrent ? '' : `<button class="btn small" data-w="${today}">Esta semana</button>`}
    </div>
    <div class="stat-row">
      <div class="stat"><div class="v">${fmtMinutes(st.totalMinutes)}</div><div class="l">estudadas na semana ${prev.totalMinutes || st.totalMinutes ? `<br>${delta >= 0 ? '▲' : '▼'} ${fmtMinutes(Math.abs(delta))} vs. anterior` : ''}</div></div>
      <div class="stat"><div class="v">${st.reviewsTotal}</div><div class="l">flashcards revisados${st.cardsNew ? ` (${st.cardsNew} novos)` : ''}</div></div>
      <div class="stat"><div class="v">${st.accuracy == null ? '—' : st.accuracy + '%'}</div><div class="l">taxa de acerto</div></div>
      <div class="stat"><div class="v">${st.tasksDone}/${st.tasksTotal}</div><div class="l">tarefas concluídas</div></div>
      <div class="stat"><div class="v">${streak(activeDates(), today)}</div><div class="l">dias seguidos estudando</div></div>
    </div>

    <div class="section"><h2>Horas por dia</h2></div>
    <div class="card">${bars('minutes', maxMin, fmtMinutes)}<p class="small muted mb0 mt" id="detail">Toque numa barra para ver o dia.</p></div>

    <div class="section"><h2>Horas por matéria</h2></div>
    <div class="card">${st.bySubject.some((s) => s.minutes) ? st.bySubject.filter((s) => s.minutes || s.reviews).map((s) => `
      <div class="hbar" style="--c:${s.color || 'var(--muted)'}">
        <span class="name"><span class="dot" style="background:${s.color || 'var(--muted)'}"></span> ${esc(s.name)}</span>
        <span class="track"><span style="width:${(s.minutes / maxSubj) * 100}%"></span></span>
        <span class="small nowrap">${fmtMinutes(s.minutes)}${s.reviews ? ` · ${s.reviews} cartões` : ''}</span>
      </div>`).join('') : '<p class="muted mb0">Nenhum tempo registrado nesta semana. Use o cronômetro ou cadastre suas horas em “Tempo de estudo”.</p>'}</div>

    <div class="section"><h2>Flashcards revisados por dia</h2></div>
    <div class="card">${bars('reviews', maxRev, (v) => String(v))}</div>

    <details class="card mt"><summary><b>Ver tabela da semana</b></summary>
      <div class="reader" style="font-family:var(--font-ui);font-size:.95rem;max-width:none;margin-top:12px"><div class="table-wrap"><table>
        <thead><tr><th>Dia</th><th>Tempo</th><th>Flashcards</th><th>Tarefas</th></tr></thead>
        <tbody>${st.days.map((d) => `<tr><td>${WEEKDAYS_SHORT[parseISO(d.date).getDay()]} ${fmtShort(d.date)}</td><td>${fmtMinutes(d.minutes)}</td><td>${d.reviews}</td><td>${d.tasksDone}/${d.tasksTotal}</td></tr>`).join('')}</tbody>
      </table></div></div>
    </details>
  `;

  root.addEventListener('click', (e) => {
    const w = e.target.closest('[data-w]');
    if (w) return go('estatisticas', { w: w.dataset.w }, { replace: true });
    const b = e.target.closest('[data-day]');
    if (b) {
      const d = st.days.find((x) => x.date === b.dataset.day);
      root.querySelector('#detail').innerHTML = `<b>${WEEKDAYS_SHORT[parseISO(d.date).getDay()]} ${fmtShort(d.date)}</b>: ${fmtMinutes(d.minutes)} estudados · ${d.reviews} flashcards · ${d.tasksDone}/${d.tasksTotal} tarefas`;
    }
  });
}
