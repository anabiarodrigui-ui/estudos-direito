// Etapa 4 — cronômetro, horas estudadas, estatísticas, limpeza de dados e layout.
export default async function ({ page, step, expect, shot, clickText, BASE }) {
  console.log('Etapa 4 — extras');
  await step('cronômetro: conta fora da aba, aparece em outras telas e salva a sessão', async () => {
    await page.goto(BASE + '#/cronometro');
    await page.waitForSelector('#clock');
    await page.selectOption('#subj', { index: 1 });
    await page.click('#play');
    await page.waitForFunction(() => document.querySelector('#clock').textContent >= '00:00:02', null, { timeout: 5000 });
    // sai da aba: a pílula mostra o tempo em outras telas
    await page.goto(BASE + '#/');
    await page.waitForSelector('#timer-pill:not([hidden])');
    // simula o app fechado por 1h25: o início ficou no passado
    await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.endsWith(':timer'));
      const s = JSON.parse(localStorage.getItem(k));
      s.startedAt -= 85 * 60000; s.firstStart -= 85 * 60000;
      localStorage.setItem(k, JSON.stringify(s));
    });
    await page.reload();
    await page.waitForSelector('#timer-pill:not([hidden])');
    await page.waitForFunction(() => document.querySelector('#timer-pill').textContent.includes('01:25:'), null, { timeout: 5000 });
    await page.goto(BASE + '#/cronometro');
    await page.waitForSelector('#clock');
    expect((await page.textContent('#clock')).startsWith('01:25:'), 'tempo após "fechar" o app: ' + await page.textContent('#clock'));
    await shot('4-cronometro');
    await page.click('#play'); // pausa
    await page.waitForSelector('#clock.paused');
    await page.click('#stop');
    expect(await page.inputValue('[name=h]') === '1' && await page.inputValue('[name=m]') === '25', 'tempo sugerido ao salvar');
    await page.fill('[name=note]', 'Contratos');
    await clickText('.sheet-foot button', 'Salvar');
    await page.waitForSelector('.list .row:has-text("1h25")');
    expect((await page.textContent('#clock')) === '00:00:00', 'cronômetro deveria zerar');
  });
  await step('cadastrar horas estudadas manualmente e editar', async () => {
    await clickText('button', 'Cadastrar horas');
    await page.fill('[name=startTime]', '14:00');
    await page.click('[data-quick="120"]');
    await page.waitForSelector('#endinfo:has-text("Das 14:00 às 16:00")');
    await clickText('.sheet-foot button', 'Salvar');
    await page.waitForSelector('.list .row:has-text("2h")');
    await page.locator('.list .row', { hasText: '2h' }).first().click();
    await page.fill('[name=m]', '30');
    await clickText('.sheet-foot button', 'Salvar');
    await page.waitForSelector('.list .row:has-text("2h30")');
    await shot('4-horas');
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
      for (const r of ['', 'agenda?view=month', 'agenda?view=week', 'resumos', 'cartoes', 'cronometro', 'rotina', 'estatisticas', 'config']) {
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
