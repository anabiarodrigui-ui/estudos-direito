// Etapa 7 — plano pelo tempo dos guias, divisão em partes e excluir plano.
export default async function ({ page, step, expect, shot, clickText, BASE }) {
  console.log('Etapa 7 — tempo dos guias e excluir plano');
  const events = () => page.evaluate(async () => (await import('/js/core/db.js')).all('events'));
  await step('ajustar o tempo de um guia e gerar o plano', async () => {
    await page.goto(BASE + '#/');
    await page.waitForSelector('.subject-card, [data-sample]');
    if (await page.locator('[data-sample]').count()) { await page.click('[data-sample]'); await page.waitForSelector('.subject-card'); }
    await page.goto(BASE + '#/resumos');
    await page.waitForSelector('.guide-row');
    expect((await page.textContent('.guide-row')).includes('de estudo'), 'tempo de estudo na biblioteca');
    await page.goto(BASE + '#/agenda?view=month');
    await clickText('button', 'Gerar plano');
    await page.click('[data-guidetimes]');
    await page.waitForSelector('.guide-time');
    await shot('7-tempos');
    // guia de Civil: 5h — maior que qualquer horário livre, vai precisar de partes
    await page.locator('.guide-time', { hasText: 'Teoria Geral dos Contratos' }).locator('input').fill('300');
    await clickText('.sheet-foot button', 'Salvar tempos');
    await page.waitForSelector('#pf'); // volta para o Gerar plano
    await page.selectOption('[name=hours]', { index: 0 }).catch(() => {});
    await page.fill('[name=hours]', '6');
    await shot('7-gerar');
    await clickText('.sheet-foot button', 'Gerar');
    await page.waitForTimeout(400);
    const ev = (await events()).filter((e) => e.generated);
    const guide = ev.filter((e) => e.title.startsWith('Estudar: Teoria Geral dos Contratos'));
    const total = guide.reduce((a, e) => a + e.duration, 0);
    expect(total === 300, 'guia deveria ocupar 300 min, ocupou ' + total);
    expect(guide.length >= 2 && guide.every((e) => /\(parte \d de \d\)$/.test(e.title)), 'partes numeradas: ' + guide.map((e) => e.title).join(' | '));
    expect(ev.some((e) => e.title === 'Estudar Direito Penal I'), '"Estudar <matéria>" para matéria sem guia pendente');
    expect(!ev.some((e) => /flashcard/i.test(e.title)), 'flashcards não entram no plano');
    const first = guide.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : 1))[0];
    await page.goto(BASE + `#/agenda?view=day&date=${first.date}`);
    await page.waitForSelector('.task');
    await shot('7-dia-partes');
  });
  await step('excluir o plano sem gerar outro', async () => {
    await page.goto(BASE + '#/agenda?view=week');
    await page.waitForSelector('[data-delplan]');
    // marca uma sessão como concluída para conferir que ela fica
    const keep = await page.evaluate(async () => {
      const db = await import('/js/core/db.js');
      const e = db.all('events').find((x) => x.generated);
      e.done = true; await db.put('events', e); return e.id;
    });
    await page.click('[data-delplan]');
    await shot('7-excluir');
    await clickText('.sheet-foot button', 'Excluir plano');
    await page.waitForTimeout(300);
    const ev = await events();
    expect(ev.filter((e) => e.generated && !e.done).length === 0, 'sessões não concluídas deveriam sumir');
    expect(ev.some((e) => e.id === keep), 'a concluída deveria ficar');
    expect(ev.some((e) => !e.generated && e.title === 'Flashcards de Penal'), 'tarefas manuais não podem ser apagadas');
    // segunda vez: apagar tudo do plano
    await page.click('[data-delplan]');
    await page.check('[name=what][value=all]');
    await clickText('.sheet-foot button', 'Excluir plano');
    await page.waitForTimeout(300);
    expect(!(await events()).some((e) => e.generated), 'plano inteiro deveria sumir');
    expect(await page.locator('[data-delplan]').count() === 0, 'botão some sem plano');
  });
}
