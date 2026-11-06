/**
 * Timer Pomodoro vinculado a uma matéria. Cada ciclo de foco concluído vira uma
 * "sessão" (coleção sessions) com os minutos estudados, usada nas estatísticas.
 *
 * O estado fica em localStorage ("ed:pomo") com o horário de término, então o timer
 * continua certo mesmo trocando de tela, bloqueando o tablet ou fechando o app.
 */
import * as db from '../core/db.js';
import { ls } from '../core/db.js';
import { esc, toast, openModal, formData, confirmDialog } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectOptions, subjectName, subjectColor } from '../ui/common.js';
import { todayISO, fmtMinutes, fmtBR } from '../core/dates.js';

const KEY = 'ed:pomo';
const PHASES = { focus: 'Foco', short: 'Pausa curta', long: 'Pausa longa' };

function durations() {
  const s = db.getSettings();
  return { focus: s.pomoFocus, short: s.pomoShort, long: s.pomoLong, cycles: s.pomoCycles };
}
function load() {
  try { const st = JSON.parse(ls.get(KEY)); if (st && st.phase) return st; } catch {}
  return { phase: 'focus', running: false, remaining: durations().focus * 60000, endsAt: 0, subjectId: '', cycle: 0, focusStart: 0 };
}
function save(st) { ls.set(KEY, JSON.stringify(st)); }
export const remainingMs = (st) => (st.running ? Math.max(0, st.endsAt - Date.now()) : st.remaining);
const fmt = (ms) => { const t = Math.ceil(ms / 1000); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };

/** Registra minutos de estudo. */
async function logSession(subjectId, minutes, date = todayISO()) {
  if (minutes < 1) return;
  await db.put('sessions', { subjectId, minutes: Math.round(minutes), date, start: Date.now() - minutes * 60000 });
}

/** Termina a fase atual e prepara a próxima (sem iniciar automaticamente). */
async function completePhase(st, { silent = false } = {}) {
  const d = durations();
  const wasFocus = st.phase === 'focus';
  if (wasFocus) {
    st.cycle += 1;
    st.phase = st.cycle % d.cycles === 0 ? 'long' : 'short';
  } else st.phase = 'focus';
  st.running = false;
  st.remaining = d[st.phase] * 60000;
  st.focusStart = 0;
  save(st); // salva antes de gravar a sessão, para o relógio não concluir a fase duas vezes
  if (wasFocus) await logSession(st.subjectId, d.focus);
  if (!silent) notify(st.phase === 'focus' ? 'Pausa encerrada — hora de focar!' : `Foco concluído! ${PHASES[st.phase]} de ${d[st.phase]} min.`);
}

function notify(msg) {
  toast(msg, 5000);
  navigator.vibrate?.([200, 100, 200]);
  try { // bipe curto com Web Audio (não precisa de arquivo de som)
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; g.gain.value = 0.15;
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.15);
    });
  } catch {}
  try { if (Notification?.permission === 'granted' && document.hidden) new Notification('Pomodoro', { body: msg, icon: 'icons/icon-192.png' }); } catch {}
}

// ---------- relógio global + "pílula" visível nas outras telas ----------
let ticker = null;
const listeners = new Set();
export function initPill() {
  if (ticker) return;
  const pill = document.getElementById('timer-pill');
  pill.onclick = () => { location.hash = '#/pomodoro'; };
  const tick = async () => {
    const st = load();
    if (st.running && remainingMs(st) <= 0) await completePhase(st);
    const onPage = location.hash.startsWith('#/pomodoro');
    pill.hidden = !st.running || onPage;
    if (st.running && !onPage) pill.innerHTML = `${icon('timer')} ${fmt(remainingMs(st))} · ${PHASES[st.phase]}`;
    listeners.forEach((fn) => fn(st));
  };
  // ao abrir o app depois de um tempo, fecha a fase que terminou enquanto estava fechado
  tick();
  ticker = setInterval(tick, 500);
}

export function render(root) {
  const d = durations();
  const today = todayISO();
  const todaySes = db.where('sessions', (s) => s.date === today).sort((a, b) => b.start - a.start);
  const st0 = load();

  root.innerHTML = `
    <div class="page-head"><h1>Pomodoro</h1>
      <div class="actions"><button class="btn" data-cfg aria-label="Ajustar tempos">${icon('settings')} Tempos</button></div></div>
    <div class="pomo card">
      <div class="seg" role="group" aria-label="Fase">${Object.entries(PHASES).map(([k, v]) => `<button data-phase="${k}" aria-pressed="${st0.phase === k}">${v}</button>`).join('')}</div>
      <div class="pomo-ring">
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface-2)" stroke-width="8"/>
          <circle id="arc" cx="60" cy="60" r="54" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="339.3" stroke-dashoffset="0"/>
        </svg>
        <div class="time"><span id="time">--:--</span><small id="phase"></small></div>
      </div>
      <label class="field" style="max-width:360px;margin:0 auto 12px"><span>Matéria</span>
        <select class="input" id="subj">${subjectOptions(st0.subjectId)}</select></label>
      <div class="btn-row" style="justify-content:center">
        <button class="btn primary" id="play" style="min-width:140px"></button>
        <button class="btn" data-reset>${icon('reset')} Reiniciar</button>
        <button class="btn" data-skip>Pular ${icon('right')}</button>
      </div>
      <p class="small muted mt">Ciclo ${st0.cycle % d.cycles + 1} de ${d.cycles} · foco ${d.focus} min · pausa ${d.short}/${d.long} min</p>
    </div>

    <div class="section"><h2>Hoje</h2><button class="btn small ghost" data-manual>${icon('plus')} Registrar tempo</button></div>
    <div class="card">${todaySes.length ? `<p><b>${fmtMinutes(todaySes.reduce((a, s) => a + s.minutes, 0))}</b> estudados hoje</p>
      <ul class="list">${todaySes.map((s) => `<li><div class="row"><span class="dot" style="background:${subjectColor(s.subjectId)}"></span>
        <span class="grow">${esc(subjectName(s.subjectId))}</span><span>${fmtMinutes(s.minutes)}</span>
        <button class="btn icon ghost" data-del="${s.id}" aria-label="Apagar sessão">${icon('trash')}</button></div></li>`).join('')}</ul>`
      : '<p class="muted mb0">Nenhuma sessão registrada hoje.</p>'}</div>
  `;

  const draw = (st) => {
    const total = d[st.phase] * 60000;
    const rem = remainingMs(st);
    root.querySelector('#time').textContent = fmt(rem);
    root.querySelector('#phase').textContent = PHASES[st.phase];
    root.querySelector('#arc').setAttribute('stroke-dashoffset', String(339.3 * (1 - rem / total)));
    root.querySelector('#arc').setAttribute('stroke', st.phase === 'focus' ? 'var(--accent)' : 'var(--ok)');
    root.querySelector('#play').innerHTML = st.running ? `${icon('pause')} Pausar` : `${icon('play')} ${rem < total ? 'Continuar' : 'Iniciar'}`;
    root.querySelectorAll('[data-phase]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.phase === st.phase));
    document.title = st.running ? `${fmt(rem)} · ${PHASES[st.phase]}` : 'Estudos de Direito';
  };
  draw(st0);
  listeners.add(draw);

  root.querySelector('#subj').addEventListener('change', (e) => { const st = load(); st.subjectId = e.target.value; save(st); });

  root.addEventListener('click', async (e) => {
    const t = e.target;
    let st = load();
    if (t.closest('#play')) {
      if (st.running) { st.remaining = remainingMs(st); st.running = false; }
      else {
        st.subjectId = root.querySelector('#subj').value;
        st.endsAt = Date.now() + st.remaining; st.running = true;
        if (st.phase === 'focus' && !st.focusStart) st.focusStart = Date.now();
        if (window.Notification && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
      }
      save(st); return draw(st);
    }
    if (t.closest('[data-reset]')) { st.running = false; st.remaining = d[st.phase] * 60000; st.focusStart = 0; save(st); return draw(st); }
    if (t.closest('[data-skip]')) {
      // ao pular um foco, registra o tempo já estudado
      if (st.phase === 'focus') {
        const studied = (d.focus * 60000 - remainingMs(st)) / 60000;
        if (studied >= 1) await logSession(st.subjectId, studied);
        st.cycle += 1;
        st.phase = st.cycle % d.cycles === 0 ? 'long' : 'short';
      } else st.phase = 'focus';
      st.running = false; st.remaining = d[st.phase] * 60000; st.focusStart = 0;
      save(st); return draw(st);
    }
    const ph = t.closest('[data-phase]');
    if (ph) { st = { ...st, phase: ph.dataset.phase, running: false, remaining: d[ph.dataset.phase] * 60000 }; save(st); return draw(st); }
    if (t.closest('[data-cfg]')) return openConfig();
    if (t.closest('[data-manual]')) return openManual(root.querySelector('#subj').value);
    const del = t.closest('[data-del]');
    if (del && await confirmDialog('Apagar esta sessão de estudo?', { ok: 'Apagar', danger: true })) await db.remove('sessions', del.dataset.del);
  });

  return { destroy() { listeners.delete(draw); } };
}

function openConfig() {
  const s = db.getSettings();
  openModal({
    title: 'Tempos do Pomodoro',
    body: `<form id="pc"><div class="field-row">
      <label class="field"><span>Foco (min)</span><input class="input" type="number" name="pomoFocus" min="1" max="180" value="${s.pomoFocus}"></label>
      <label class="field"><span>Pausa curta (min)</span><input class="input" type="number" name="pomoShort" min="1" max="60" value="${s.pomoShort}"></label>
      <label class="field"><span>Pausa longa (min)</span><input class="input" type="number" name="pomoLong" min="1" max="90" value="${s.pomoLong}"></label>
      <label class="field"><span>Focos até a pausa longa</span><input class="input" type="number" name="pomoCycles" min="1" max="12" value="${s.pomoCycles}"></label>
    </div></form>`,
    actions: [{ label: 'Cancelar' }, { label: 'Salvar', cls: 'primary', onClick: (c, el) => {
      const d = formData(el.querySelector('#pc'));
      db.setSettings(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Math.max(1, +v || 1)])));
      const st = load();
      if (!st.running) { st.remaining = db.getSettings()[{ focus: 'pomoFocus', short: 'pomoShort', long: 'pomoLong' }[st.phase]] * 60000; save(st); }
      toast('Tempos salvos');
    } }],
  });
}

function openManual(subjectId) {
  openModal({
    title: 'Registrar tempo de estudo',
    body: `<form id="mf">
      <label class="field"><span>Matéria</span><select class="input" name="subjectId">${subjectOptions(subjectId)}</select></label>
      <div class="field-row">
        <label class="field"><span>Minutos</span><input class="input" type="number" name="minutes" min="1" max="720" value="50"></label>
        <label class="field"><span>Data</span><input class="input" type="date" name="date" value="${todayISO()}"></label>
      </div></form>`,
    actions: [{ label: 'Cancelar' }, { label: 'Registrar', cls: 'primary', onClick: async (c, el) => {
      const d = formData(el.querySelector('#mf'));
      await logSession(d.subjectId, +d.minutes || 0, d.date || todayISO());
      toast(`${fmtMinutes(+d.minutes)} registrados em ${fmtBR(d.date)}`);
    } }],
  });
}
