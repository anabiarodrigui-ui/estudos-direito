/**
 * Tempo de estudo: cronômetro + cadastro manual de horas estudadas + histórico.
 *
 * O cronômetro guarda o HORÁRIO em que foi iniciado (em localStorage, separado por conta),
 * não um contador. Por isso o tempo continua certo mesmo trocando de aba, fechando o app
 * ou bloqueando o tablet: ao voltar, ele calcula agora − início.
 * Ao parar, a sessão é salva (com chance de corrigir o tempo antes) e entra nas estatísticas.
 */
import * as db from '../core/db.js';
import { ls } from '../core/db.js';
import { esc, toast, openModal, formData, confirmDialog } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectOptions, subjectName, subjectColor } from '../ui/common.js';
import { todayISO, addDays, fmtMinutes, fmtBR, fmtLong, timeToMin, minToTime, weekStart } from '../core/dates.js';

const KEY = 'ed:timer';

/** Estado: { running, startedAt (ms), accumulated (ms já contados antes de pausas), subjectId, firstStart (ms) } */
function load() {
  try { const s = JSON.parse(ls.get(KEY) || 'null'); if (s) return s; } catch {}
  return { running: false, startedAt: 0, accumulated: 0, subjectId: '', firstStart: 0 };
}
function save(s) { ls.set(KEY, JSON.stringify(s)); }
export const elapsedMs = (s) => s.accumulated + (s.running ? Date.now() - s.startedAt : 0);

const two = (n) => String(n).padStart(2, '0');
function fmtClock(ms) {
  const t = Math.floor(ms / 1000);
  return `${two(Math.floor(t / 3600))}:${two(Math.floor(t / 60) % 60)}:${two(t % 60)}`;
}
const hhmm = (ts) => { const d = new Date(ts); return `${two(d.getHours())}:${two(d.getMinutes())}`; };
const isoOf = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };

// ---------- relógio global + "pílula" visível nas outras telas ----------
let ticker = null;
const listeners = new Set();
export function initPill() {
  if (ticker) return;
  const pill = document.getElementById('timer-pill');
  pill.onclick = () => { location.hash = '#/cronometro'; };
  const tick = () => {
    const s = load();
    const onPage = /^#\/(cronometro|pomodoro)/.test(location.hash);
    const active = s.running || s.accumulated > 0;
    pill.hidden = !active || onPage;
    if (active && !onPage) pill.innerHTML = `${icon(s.running ? 'timer' : 'pause')} ${fmtClock(elapsedMs(s))}${s.subjectId ? ' · ' + esc(subjectName(s.subjectId)) : ''}`;
    listeners.forEach((fn) => fn(s));
  };
  tick();
  ticker = setInterval(tick, 1000);
  // ao voltar para o app, atualiza na hora
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  addEventListener('hashchange', tick); // esconde/mostra a pílula na hora de trocar de tela
}

/** Salva uma sessão de estudo. */
async function saveSession({ subjectId, date, minutes, startTime = '', source = 'manual', note = '' }) {
  if (!(minutes >= 1)) return null;
  const start = startTime ? new Date(`${date}T${startTime}`).getTime() : Date.now() - minutes * 60000;
  return db.put('sessions', { subjectId, date, minutes: Math.round(minutes), start, startTime, source, note });
}

export function render(root) {
  const today = todayISO();
  const st0 = load();
  const all = db.all('sessions').sort((a, b) => b.date.localeCompare(a.date) || (b.start || 0) - (a.start || 0));
  const sum = (arr) => arr.reduce((a, s) => a + (s.minutes || 0), 0);
  const todayMin = sum(all.filter((s) => s.date === today));
  const weekMin = sum(all.filter((s) => s.date >= weekStart(today) && s.date <= today));
  const recent = all.filter((s) => s.date >= addDays(today, -13));
  const byDay = {};
  for (const s of recent) (byDay[s.date] ||= []).push(s);

  root.innerHTML = `
    <div class="page-head"><h1>Tempo de estudo</h1></div>
    <div class="stat-row">
      <div class="stat"><div class="v">${fmtMinutes(todayMin)}</div><div class="l">estudados hoje</div></div>
      <div class="stat"><div class="v">${fmtMinutes(weekMin)}</div><div class="l">nesta semana</div></div>
    </div>

    <div class="card stopwatch mt">
      <h2>${icon('timer')} Cronômetro</h2>
      <div class="sw-clock" id="clock" aria-live="off">00:00:00</div>
      <p class="small muted sw-status" id="swstatus"></p>
      <label class="field sw-subject"><span>Matéria</span>
        <select class="input" id="subj">${subjectOptions(st0.subjectId)}</select></label>
      <div class="btn-row sw-actions">
        <button class="btn primary sw-main" id="play"></button>
        <button class="btn" id="stop">${icon('check')} Encerrar e salvar</button>
        <button class="btn ghost" id="discard">${icon('trash')} Descartar</button>
      </div>
      <p class="small muted mb0">O cronômetro continua contando mesmo se você sair desta aba, fechar o app ou bloquear o tablet.</p>
    </div>

    <div class="section"><h2>Horas estudadas</h2><button class="btn small primary" data-manual>${icon('plus')} Cadastrar horas</button></div>
    ${recent.length ? Object.entries(byDay).map(([d, list]) => `
      <div class="small muted day-label"><b>${d === today ? 'Hoje' : d === addDays(today, -1) ? 'Ontem' : cap(fmtLong(d))}</b> · ${fmtMinutes(sum(list))}</div>
      <div class="card"><ul class="list">${list.map((s) => `<li><button class="row" data-edit="${s.id}">
        <span class="dot" style="background:${subjectColor(s.subjectId)}"></span>
        <span class="grow"><span class="title">${esc(subjectName(s.subjectId))}</span><br>
          <span class="small muted">${s.startTime ? s.startTime + ' · ' : ''}${s.source === 'timer' ? 'cronômetro' : 'cadastrado'}${s.note ? ' · ' + esc(s.note) : ''}</span></span>
        <b class="nowrap">${fmtMinutes(s.minutes)}</b></button></li>`).join('')}</ul></div>`).join('')
      : `<div class="card empty"><p>Nenhum estudo registrado nos últimos 14 dias.</p><p class="small">Use o cronômetro ou cadastre as horas que você já estudou.</p></div>`}
    ${all.length > recent.length ? `<p class="small muted mt">Sessões mais antigas aparecem em Estatísticas.</p>` : ''}
  `;

  const draw = (s) => {
    const ms = elapsedMs(s);
    root.querySelector('#clock').textContent = fmtClock(ms);
    root.querySelector('#clock').classList.toggle('paused', !s.running && ms > 0);
    const active = s.running || ms > 0;
    root.querySelector('#play').innerHTML = s.running ? `${icon('pause')} Pausar` : `${icon('play')} ${ms > 0 ? 'Continuar' : 'Iniciar'}`;
    root.querySelector('#stop').hidden = !active;
    root.querySelector('#discard').hidden = !active;
    root.querySelector('#swstatus').textContent = s.running
      ? `Contando desde ${hhmm(s.firstStart)}${isoOf(s.firstStart) !== todayISO() ? ' de ' + fmtBR(isoOf(s.firstStart)) : ''}`
      : ms > 0 ? 'Pausado' : 'Escolha a matéria e toque em Iniciar';
    document.title = s.running ? `${fmtClock(ms)} · Estudos` : 'Estudos de Direito';
  };
  draw(st0);
  listeners.add(draw);

  root.querySelector('#subj').addEventListener('change', (e) => { const s = load(); s.subjectId = e.target.value; save(s); });

  root.addEventListener('click', async (e) => {
    const t = e.target;
    let s = load();
    if (t.closest('#play')) {
      if (s.running) { s.accumulated = elapsedMs(s); s.running = false; }
      else {
        s.subjectId = root.querySelector('#subj').value;
        s.startedAt = Date.now(); s.running = true;
        if (!s.firstStart || s.accumulated === 0) s.firstStart = s.startedAt;
      }
      save(s); return draw(s);
    }
    if (t.closest('#stop')) return finishTimer(root);
    if (t.closest('#discard')) {
      if (!(await confirmDialog(`Descartar ${fmtClock(elapsedMs(s))} do cronômetro sem salvar?`, { ok: 'Descartar', danger: true }))) return;
      save({ running: false, startedAt: 0, accumulated: 0, subjectId: s.subjectId, firstStart: 0 });
      return draw(load());
    }
    if (t.closest('[data-manual]')) return openManual({ subjectId: root.querySelector('#subj').value });
    const ed = t.closest('[data-edit]');
    if (ed) return openManual(db.get('sessions', ed.dataset.edit));
  });

  return { destroy() { listeners.delete(draw); } };
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Encerrar o cronômetro: confere o tempo e salva a sessão. */
function finishTimer(root) {
  const s = load();
  const ms = elapsedMs(s);
  const minutes = Math.round(ms / 60000);
  const long = ms > 6 * 3600000;
  openModal({
    title: 'Salvar tempo de estudo',
    body: `<form id="fin">
      ${long ? `<p class="warn-box">O cronômetro marcou <b>${fmtClock(ms)}</b>. Esqueceu de pausar? Corrija o tempo abaixo se precisar.</p>` : ''}
      <label class="field"><span>Matéria</span><select class="input" name="subjectId">${subjectOptions(root.querySelector('#subj').value || s.subjectId)}</select></label>
      <div class="field"><span>Tempo estudado</span><div class="hm">
        <label><input class="input" type="number" name="h" min="0" max="23" value="${Math.floor(minutes / 60)}"> h</label>
        <label><input class="input" type="number" name="m" min="0" max="59" value="${minutes % 60}"> min</label></div></div>
      <label class="field"><span>Anotação <span class="muted">(opcional)</span></span><input class="input" name="note" placeholder="Ex.: capítulo 3 de Contratos"></label>
    </form>`,
    actions: [{ label: 'Voltar' }, { label: `${icon('check')} Salvar`, cls: 'primary', onClick: async (c, el) => {
      const d = formData(el.querySelector('#fin'));
      const total = (+d.h || 0) * 60 + (+d.m || 0);
      if (total < 1) { toast('Informe pelo menos 1 minuto'); return false; }
      const start = s.firstStart || Date.now() - ms;
      await saveSession({ subjectId: d.subjectId, date: isoOf(start), minutes: total, startTime: hhmm(start), source: 'timer', note: d.note.trim() });
      save({ running: false, startedAt: 0, accumulated: 0, subjectId: d.subjectId, firstStart: 0 });
      toast(`${fmtMinutes(total)} de estudo salvos`);
    } }],
  });
}

/** Cadastrar (ou editar) horas estudadas. */
function openManual(session = {}) {
  const editing = !!session.id;
  const today = todayISO();
  const m = session.minutes || 60;
  openModal({
    title: editing ? 'Editar horas estudadas' : 'Cadastrar horas estudadas',
    body: `<form id="mf">
      <label class="field"><span>Matéria</span><select class="input" name="subjectId">${subjectOptions(session.subjectId || '')}</select></label>
      <div class="field-row">
        <label class="field"><span>Data</span><input class="input" type="date" name="date" value="${session.date || today}" max="${today}"></label>
        <label class="field"><span>Começou às <span class="muted">(opcional)</span></span><input class="input" type="time" name="startTime" value="${session.startTime || ''}"></label>
      </div>
      <div class="field"><span>Quanto tempo estudou</span><div class="hm">
        <label><input class="input" type="number" name="h" min="0" max="23" value="${Math.floor(m / 60)}"> h</label>
        <label><input class="input" type="number" name="m" min="0" max="59" step="5" value="${m % 60}"> min</label></div>
        <div class="btn-row mt">${[30, 60, 90, 120, 180].map((v) => `<button type="button" class="btn small" data-quick="${v}">${fmtMinutes(v)}</button>`).join('')}</div></div>
      <p class="small muted" id="endinfo"></p>
      <label class="field"><span>Anotação <span class="muted">(opcional)</span></span><input class="input" name="note" value="${esc(session.note || '')}" placeholder="Ex.: li o guia de Contratos"></label>
    </form>`,
    onOpen: (el) => {
      const f = el.querySelector('#mf');
      const upd = () => {
        const total = (+f.h.value || 0) * 60 + (+f.m.value || 0);
        const st = timeToMin(f.startTime.value);
        el.querySelector('#endinfo').textContent = st != null && total ? `Das ${f.startTime.value} às ${minToTime(st + total)}` : '';
      };
      f.addEventListener('input', upd);
      el.addEventListener('click', (e) => {
        const q = e.target.closest('[data-quick]');
        if (q) { f.h.value = Math.floor(+q.dataset.quick / 60); f.m.value = +q.dataset.quick % 60; upd(); }
      });
      upd();
    },
    actions: [
      ...(editing ? [{ label: `${icon('trash')} Excluir`, cls: 'danger', left: true, onClick: async () => {
        if (!(await confirmDialog('Excluir este registro de estudo?', { ok: 'Excluir', danger: true }))) return false;
        await db.remove('sessions', session.id); toast('Registro excluído');
      } }] : []),
      { label: 'Cancelar' },
      { label: 'Salvar', cls: 'primary', onClick: async (c, el) => {
        const d = formData(el.querySelector('#mf'));
        const total = (+d.h || 0) * 60 + (+d.m || 0);
        if (total < 1) { toast('Informe quanto tempo você estudou'); return false; }
        if (d.date > today) { toast('A data não pode ser no futuro'); return false; }
        if (editing) {
          await db.put('sessions', { ...session, subjectId: d.subjectId, date: d.date, minutes: total, startTime: d.startTime, note: d.note.trim(),
            start: d.startTime ? new Date(`${d.date}T${d.startTime}`).getTime() : session.start });
          toast('Registro atualizado');
        } else {
          await saveSession({ subjectId: d.subjectId, date: d.date || today, minutes: total, startTime: d.startTime, note: d.note.trim() });
          toast(`${fmtMinutes(total)} cadastrados em ${fmtBR(d.date || today)}`);
        }
      } },
    ],
  });
}
