/** Tela "Matérias": cadastro, edição e exclusão. */
import * as db from '../core/db.js';
import { esc, openModal, formData, confirmDialog, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { COLORS, subjects } from '../ui/common.js';
import { fmtBR, todayISO, diffDays, countdownText } from '../core/dates.js';

export function render(root) {
  const list = subjects();
  root.innerHTML = `
    <div class="page-head"><h1>Matérias</h1>
      <div class="actions"><button class="btn primary" data-new>${icon('plus')} Nova matéria</button></div></div>
    ${list.length ? `<div class="card"><ul class="list">${list.map((s) => {
      const d = s.examDate ? diffDays(todayISO(), s.examDate) : null;
      return `<li><button class="row" data-edit="${s.id}">
        <span class="dot" style="background:${s.color};width:18px;height:18px"></span>
        <span class="grow"><span class="title">${esc(s.name)}</span><br>
          <span class="small muted">${s.teacher ? esc(s.teacher) + ' · ' : ''}${s.examDate ? 'Prova ' + fmtBR(s.examDate) + (s.examTime ? ' às ' + s.examTime : '') + ' (' + countdownText(d) + ')' : 'Sem data de prova'}</span></span>
        ${icon('edit')}</button></li>`;
    }).join('')}</ul></div>`
      : `<div class="empty card"><p>Nenhuma matéria cadastrada ainda.</p><button class="btn primary" data-new>${icon('plus')} Cadastrar primeira matéria</button></div>`}
  `;
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]')) openSubjectForm();
    const ed = e.target.closest('[data-edit]');
    if (ed) openSubjectForm(db.get('subjects', ed.dataset.edit));
  });
}

/** Formulário de matéria (novo ou edição). */
export function openSubjectForm(subject = null) {
  const s = subject || { name: '', color: COLORS[db.all('subjects').length % COLORS.length], teacher: '', examDate: '', examTime: '' };
  openModal({
    title: subject ? 'Editar matéria' : 'Nova matéria',
    body: `<form id="sf">
      <label class="field"><span>Nome da matéria</span><input class="input" name="name" required value="${esc(s.name)}" placeholder="Ex.: Direito Civil III"></label>
      <div class="field"><span>Cor</span><div class="swatches">${COLORS.map((c) => `<label><input type="radio" name="color" value="${c}" ${c === s.color ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></div>
      <label class="field"><span>Professor(a) <span class="muted">(opcional)</span></span><input class="input" name="teacher" value="${esc(s.teacher || '')}"></label>
      <div class="field-row">
        <label class="field"><span>Data da prova</span><input class="input" type="date" name="examDate" value="${s.examDate || ''}"></label>
        <label class="field"><span>Horário <span class="muted">(opcional)</span></span><input class="input" type="time" name="examTime" value="${s.examTime || ''}"></label>
      </div>
    </form>`,
    actions: [
      ...(subject ? [{ label: `${icon('trash')} Excluir`, cls: 'danger', left: true, onClick: async () => {
        const n = { g: db.where('guides', (g) => g.subjectId === s.id).length, c: db.where('cards', (c) => c.subjectId === s.id).length, e: db.where('events', (e) => e.subjectId === s.id).length };
        const ok = await confirmDialog(`Excluir <b>${esc(s.name)}</b>? Também serão apagados ${n.g} guia(s), ${n.c} flashcard(s) e ${n.e} evento(s) desta matéria.`, { ok: 'Excluir', danger: true });
        if (!ok) return false;
        await deleteSubject(s.id);
        toast('Matéria excluída');
      } }] : []),
      { label: 'Cancelar' },
      { label: 'Salvar', cls: 'primary', onClick: async (close, el) => {
        const f = el.querySelector('#sf');
        const d = formData(f);
        if (!d.name.trim()) { f.name.focus(); toast('Informe o nome da matéria'); return false; }
        await db.put('subjects', { ...s, name: d.name.trim(), color: d.color || s.color, teacher: d.teacher.trim(), examDate: d.examDate, examTime: d.examTime });
        toast(subject ? 'Matéria atualizada' : 'Matéria criada');
      } },
    ],
  });
}

export async function deleteSubject(id) {
  const guideIds = db.where('guides', (g) => g.subjectId === id).map((g) => g.id);
  await db.removeMany('highlights', db.where('highlights', (h) => guideIds.includes(h.guideId)).map((h) => h.id));
  await db.removeMany('guides', guideIds);
  await db.removeMany('cards', db.where('cards', (c) => c.subjectId === id).map((c) => c.id));
  await db.removeMany('events', db.where('events', (e) => e.subjectId === id).map((e) => e.id));
  await db.remove('subjects', id);
}
