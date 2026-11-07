// Etapa 6 — rotina: o plano respeita compromissos fixos; reorganizar atrasados.
export default async function ({ page, step, expect, shot, clickText, BASE }) {
  console.log('Etapa 6 — rotina e plano realista');
  const addRoutine = async (kind, title, days, start, end) => {
    await page.click('[data-add]');
    await page.click(`[data-kind="${kind}"]`);
    await page.fill('[name=title]', title);
    await page.click(`[data-days="${days}"]`);
    if (days === '') for (const d of [3]) await page.check(`[name=wd][value="${d}"]`);
    await page.fill('[name=start]', start);
    await page.fill('[name=end]', end);
    await clickText('.sheet-foot button', 'Salvar');
    await page.waitForSelector(`.row:has-text("${title}")`);
  };
  await step('cadastrar rotina (aulas, deslocamento, terapia)', async () => {
    await page.goto(BASE + '#/');
    await page.waitForSelector('.subject-card, [data-sample]');
    if (await page.locator('[data-sample]').count()) { await page.click('[data-sample]'); await page.waitForSelector('.subject-card'); }
    await page.goto(BASE + '#/agenda?view=week');
    await clickText('button', 'Minha rotina');
    await page.waitForSelector('text=Compromissos fixos');
    await addRoutine('aula', 'Aulas na faculdade', '1,2,3,4,5', '08:00', '12:00');
    await addRoutine('deslocamento', 'Volta para casa', '1,2,3,4,5', '12:00', '13:00');
    await addRoutine('terapia', 'Terapia', '', '18:00', '19:00');
    await page.selectOption('#buffer', '15');
    await page.waitForTimeout(100);
    // sábado de folga
    await page.check('[data-wd="6"] [data-f="off"]');
    await page.waitForTimeout(200);
    expect((await page.textContent('[data-wd="6"] .dw-free')).includes('—'), 'sábado de folga');
    await shot('6-rotina');
  });
  await step('gerar plano: nenhum bloco em cima da rotina nem na folga', async () => {
    await page.goto(BASE + '#/agenda?view=month');
    await clickText('button', 'Gerar plano');
    await page.waitForSelector('.plan-routine');
    await shot('6-gerar');
    await clickText('.sheet-foot button', 'Gerar');
    await page.waitForSelector('.week');
    const bad = await page.evaluate(async () => {
      const db = await import('/js/core/db.js');
      const routine = db.all('routine');
      const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
      const issues = [];
      const gen = db.all('events').filter((e) => e.generated);
      for (const e of gen) {
        const wd = new Date(e.date + 'T12:00').getDay();
        if (wd === 6) issues.push('sábado ' + e.date);
        const a = toMin(e.time), b = a + e.duration;
        for (const r of routine.filter((x) => x.weekdays.includes(wd))) {
          if (a < toMin(r.end) + 15 && b > toMin(r.start) - 15) issues.push(`${e.date} ${e.time} x ${r.title}`);
        }
        if (e.duration < 25) issues.push('bloco curto demais ' + e.duration);
      }
      return { n: gen.length, issues };
    });
    expect(bad.n > 0, 'nenhum bloco gerado');
    expect(!bad.issues.length, 'conflitos: ' + bad.issues.slice(0, 5).join('; '));
  });
  await step('rotina aparece discreta na semana e no dia, e pode ser escondida', async () => {
    await page.goto(BASE + '#/agenda?view=week&date=2026-11-16');
    await page.waitForSelector('.week');
    expect(await page.locator('.ev.routine', { hasText: 'Aulas na faculdade' }).count() === 5, 'aulas seg–sex');
    await shot('6-semana');
    await page.goto(BASE + '#/agenda?view=day&date=2026-11-18');
    await page.waitForSelector('.task.routine');
    expect(await page.locator('.task.routine', { hasText: 'Terapia' }).count() === 1, 'terapia na quarta');
    await shot('6-dia');
    await page.click('[data-toggle-routine]');
    await page.waitForTimeout(150);
    expect(await page.locator('.task.routine').count() === 0, 'rotina deveria sumir');
    await page.click('[data-toggle-routine]');
    await page.waitForSelector('.task.routine');
  });
  await step('reorganizar blocos atrasados', async () => {
    await page.evaluate(async () => {
      const db = await import('/js/core/db.js');
      const subj = db.all('subjects').find((s) => s.examDate);
      const d = new Date(); d.setDate(d.getDate() - 2);
      const iso = d.toISOString().slice(0, 10);
      await db.put('events', { type: 'task', title: 'Bloco esquecido', subjectId: subj.id, date: iso, time: '15:00', duration: 50, done: false, recurrence: null, generated: true });
    });
    await page.goto(BASE + '#/agenda?view=week');
    await page.waitForSelector('.missed-banner');
    await shot('6-atrasados');
    await page.click('[data-replan]');
    await page.waitForTimeout(300);
    const ev = await page.evaluate(async () => (await import('/js/core/db.js')).all('events').find((e) => e.title === 'Bloco esquecido'));
    const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    expect(ev.date >= today, 'bloco não foi remarcado: ' + ev.date);
    expect(await page.locator('.missed-banner').count() === 0, 'aviso continua');
  });
}
