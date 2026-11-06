// Etapa 4 — pomodoro, estatísticas, limpeza de dados e layout.
export default async function ({ page, step, expect, shot, clickText, BASE }) {
  console.log('Etapa 4 — extras');
  await step('pomodoro: iniciar, pílula em outras telas e registro ao concluir', async () => {
    await page.goto(BASE + '#/pomodoro');
    await page.waitForSelector('.pomo-ring');
    await page.selectOption('#subj', { index: 1 });
    await page.click('#play');
    await page.waitForFunction(() => document.querySelector('#time').textContent < '24:59', null, { timeout: 5000 });
    await shot('4-pomodoro');
    await page.goto(BASE + '#/');
    await page.waitForSelector('#timer-pill:not([hidden])');
    // simula o fim do foco
    await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('ed:pomo')); s.endsAt = Date.now() + 300; localStorage.setItem('ed:pomo', JSON.stringify(s)); });
    await page.waitForTimeout(1500);
    await page.goto(BASE + '#/pomodoro');
    await page.waitForSelector('text=estudados hoje');
    expect((await page.textContent('#phase')) === 'Pausa curta', 'deveria ir para pausa curta');
    expect(await page.locator('.list .row', { hasText: '25 min' }).count() >= 1, 'sessão de 25 min');
  });
  await step('registrar tempo manualmente', async () => {
    await clickText('button', 'Registrar tempo');
    await page.fill('[name=minutes]', '40');
    await clickText('.sheet-foot button', 'Registrar');
    await page.waitForSelector('.list .row:has-text("40 min")');
  });
  await step('estatísticas da semana', async () => {
    await page.goto(BASE + '#/estatisticas');
    await page.waitForSelector('.bars');
    expect(await page.locator('.hbar').count() >= 1, 'horas por matéria');
    await page.locator('.bars').first().locator('[data-day]').nth(2).click();
    expect((await page.textContent('#detail')).includes('estudados'), 'detalhe do dia');
    await shot('4-estatisticas');
    await page.click('[aria-label="Semana anterior"]');
    await page.waitForSelector('text=Esta semana');
  });
  await step('layout sem rolagem horizontal (celular e tablet)', async () => {
    for (const [w, h] of [[390, 844], [820, 1180], [1180, 820]]) {
      await page.setViewportSize({ width: w, height: h });
      for (const r of ['', 'agenda?view=month', 'agenda?view=week', 'resumos', 'cartoes', 'pomodoro', 'estatisticas', 'config']) {
        await page.goto(BASE + '#/' + r);
        await page.waitForSelector('.page-head');
        const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(over <= 0, `rolagem horizontal em ${w}px #/${r}: ${over}px`);
      }
    }
    await page.setViewportSize({ width: 820, height: 1180 });
  });
  await step('remover dados de exemplo e apagar tudo', async () => {
    await page.goto(BASE + '#/config');
    await page.locator('button', { hasText: 'Remover exemplos' }).click();
    await clickText('.sheet-foot button', 'Remover');
    await page.waitForTimeout(300);
    await page.goto(BASE + '#/materias');
    await page.waitForSelector('.page-head');
    expect(await page.locator('text=Direito Penal I').count() === 0, 'exemplo ainda aparece');
    await page.goto(BASE + '#/config');
    await clickText('button', 'Apagar tudo');
    await clickText('.sheet-foot button', 'Apagar tudo');
    await page.waitForTimeout(300);
    await page.goto(BASE + '#/');
    await page.waitForSelector('text=Carregar dados de exemplo');
  });
}
