/**
 * Modo de estudo de flashcards.
 *  - Normal: repetição espaçada (SM-2) com os cartões vencidos + novos do dia.
 *  - Revisão rápida (?mode=rapida): todos os cartões do filtro, os mais difíceis primeiro,
 *    sem alterar o agendamento.
 * Toque no cartão para virar. Depois de virar, avalie com os botões ou deslize:
 *   ← esquerda = Errei · ↓ baixo = Difícil · → direita = Bom · ↑ cima = Fácil
 */
import * as db from '../core/db.js';
import { esc, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { subjectName } from '../ui/common.js';
import { go } from '../app.js';
import { todayISO } from '../core/dates.js';
import { GRADES, schedule, buildQueue, isNew, intervalLabel } from '../core/srs.js';
import { filterCards, newSeenToday } from './flashcards.js';

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export function render(root, { params }) {
  const today = todayISO();
  const quick = params.mode === 'rapida';
  const cards = filterCards(db.all('cards'), params);
  let queue;
  if (quick) {
    const hard = shuffle(cards.filter((c) => !isNew(c) && (c.srs.lapses > 0 || c.srs.ef < 2.3)));
    const rest = shuffle(cards.filter((c) => !hard.includes(c)));
    queue = [...hard, ...rest];
  } else {
    queue = buildQueue(cards, today, { newLimit: db.getSettings().newCardsPerDay, newSeenToday: newSeenToday(today) });
  }
  const total = queue.length;
  let done = 0, right = 0, flipped = false, card = null;
  const back = () => go('cartoes', Object.fromEntries(Object.entries({ s: params.s, g: params.g, t: params.t }).filter(([, v]) => v)));

  root.innerHTML = `<div class="study">
    <div class="study-top">
      <button class="btn icon ghost" data-close aria-label="Sair">${icon('x')}</button>
      <div class="progress"><span id="bar" style="width:0%"></span></div>
      <b id="cnt" class="nowrap"></b>
    </div>
    <div class="small muted" style="margin-bottom:8px">${quick ? `${icon('bolt')} Revisão rápida — não altera o agendamento` : 'Repetição espaçada (SM-2)'}</div>
    <div id="stage"></div>
  </div>`;
  const stage = root.querySelector('#stage');

  const finish = () => {
    stage.innerHTML = `<div class="card empty">
      <h2>${total ? 'Sessão concluída! 🎉' : 'Nada para revisar agora 🎉'}</h2>
      ${total ? `<p>${done} cartão(ões) revisado(s) · ${done ? Math.round((right / done) * 100) : 0}% de acerto</p>` : '<p>Volte amanhã, ou faça uma revisão rápida.</p>'}
      <div class="btn-row" style="justify-content:center">
        <button class="btn primary" data-close>Voltar aos flashcards</button>
        ${quick ? '' : `<a class="btn" href="#/estudar?${new URLSearchParams({ ...Object.fromEntries(Object.entries({ s: params.s, g: params.g }).filter(([, v]) => v)), mode: 'rapida' })}">${icon('bolt')} Revisão rápida</a>`}
      </div></div>`;
    root.querySelector('#bar').style.width = '100%';
  };

  const show = () => {
    root.querySelector('#cnt').textContent = `${Math.min(done + 1, total)} / ${total}${queue.length > total - done ? ' +' + (queue.length - (total - done)) : ''}`;
    root.querySelector('#bar').style.width = `${total ? (done / total) * 100 : 0}%`;
    card = queue[0];
    if (!card) return finish();
    flipped = false;
    const prev = Object.fromEntries(GRADES.map((g) => [g.q, schedule(card.srs, g.q, today).interval]));
    stage.innerHTML = `
      <div class="flash" id="flash" role="button" tabindex="0" aria-label="Virar cartão">
        <div class="flash-inner">
          <div class="flash-face front"><div class="lbl">${esc(subjectName(card.subjectId))}${card.topic ? ' · ' + esc(card.topic) : ''}${isNew(card) ? ' · novo' : ''}</div>
            <div class="content">${esc(card.front)}</div><div class="hint">Toque para ver a resposta</div></div>
          <div class="flash-face back"><div class="lbl">Resposta</div>
            <div class="content">${esc(card.back)}</div>
            <div class="hint">Deslize: ← errei · ↓ difícil · → bom · ↑ fácil</div></div>
        </div>
      </div>
      <div class="grades" id="grades" hidden>
        ${quick ? `
          <button class="btn g1" data-q="1" style="grid-column:span 2">Errei</button>
          <button class="btn g4" data-q="4" style="grid-column:span 2">Acertei</button>`
        : GRADES.map((g) => `<button class="btn ${g.cls}" data-q="${g.q}">${g.label}<small>${intervalLabel(prev[g.q])}</small></button>`).join('')}
      </div>
      <button class="btn block mt" id="showbtn">Mostrar resposta</button>
      <div class="btn-row mt" style="justify-content:center"><button class="btn small ghost" data-edit>${icon('edit')} Editar cartão</button></div>`;
    bindSwipe(stage.querySelector('#flash'));
  };

  const flip = () => {
    flipped = !flipped;
    stage.querySelector('#flash').classList.toggle('flipped', flipped);
    stage.querySelector('#grades').hidden = !flipped;
    stage.querySelector('#showbtn').hidden = flipped;
  };

  const grade = async (q) => {
    if (!card || !flipped) return;
    flipped = false; // evita avaliar duas vezes com toques rápidos
    const c = card;
    const wasNew = isNew(c);
    queue.shift();
    if (!quick) {
      c.srs = schedule(c.srs, q, today);
      await db.put('cards', c);
      if (q < 3) queue.splice(Math.min(queue.length, 3), 0, c); // volta daqui a pouco nesta sessão
    }
    await db.put('reviews', { cardId: c.id, subjectId: c.subjectId, guideId: c.guideId, date: today, ts: Date.now(), grade: q, wasNew, quick });
    done++;
    if (q >= 3) right++;
    navigator.vibrate?.(q < 3 ? [20, 40, 20] : 10);
    show();
  };

  // ---- gestos de deslizar ----
  function bindSwipe(el) {
    let sx = 0, sy = 0, dx = 0, dy = 0, active = false;
    el.addEventListener('pointerdown', (e) => { active = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!active) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      if (!flipped) return;
      el.style.transform = `translate(${dx * 0.6}px, ${dy * 0.6}px) rotate(${dx * 0.03}deg)`;
      el.classList.remove('swipe-left', 'swipe-right', 'swipe-up', 'swipe-down');
      const d = dir(dx, dy);
      if (d) el.classList.add('swipe-' + d);
    });
    const end = () => {
      if (!active) return;
      active = false;
      el.style.transform = '';
      el.classList.remove('swipe-left', 'swipe-right', 'swipe-up', 'swipe-down');
      const d = dir(dx, dy);
      if (Math.hypot(dx, dy) < 10) return flip();   // toque simples
      if (flipped && d) grade({ left: 1, down: 3, right: 4, up: 5 }[quick && d === 'down' ? 'left' : quick && d === 'up' ? 'right' : d]);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { active = false; el.style.transform = ''; });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') flip(); });
  }
  const dir = (dx, dy) => {
    const T = 90;
    if (Math.abs(dx) > Math.abs(dy)) return dx > T ? 'right' : dx < -T ? 'left' : null;
    return dy > T ? 'down' : dy < -T ? 'up' : null;
  };

  root.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) return back();
    if (e.target.closest('#showbtn')) return flip();
    const g = e.target.closest('[data-q]');
    if (g) return grade(+g.dataset.q);
    if (e.target.closest('[data-edit]') && card) {
      const m = await import('./flashcards.js');
      const c = card;
      m.openCardForm(c, {}, () => { Object.assign(c, db.get('cards', c.id) || {}); if (card === c) show(); });
    }
  });
  const onKey = (e) => {
    if (document.querySelector('.overlay')) return;
    if (e.key === ' ') { e.preventDefault(); flip(); }
    const map = quick ? { 1: 1, 2: 4 } : { 1: 1, 2: 3, 3: 4, 4: 5 };
    if (flipped && map[e.key]) grade(map[e.key]);
  };
  document.addEventListener('keydown', onKey);

  show();
  return {
    keep: true,
    destroy() { document.removeEventListener('keydown', onKey); },
  };
}
