// Etapa 2 — biblioteca de resumos e leitor.
export default async function ({ page, step, expect, shot, clickText, BASE }) {
  console.log('Etapa 2 — biblioteca de resumos');
  await step('biblioteca lista guias por matéria', async () => {
    await page.goto(BASE + '#/resumos');
    await page.waitForSelector('.guide-row');
    expect(await page.locator('.guide-row').count() >= 2, 'guias de exemplo');
    await shot('2-biblioteca');
  });
  await step('importar guia colando Markdown (separando capítulos)', async () => {
    await clickText('button', 'Importar guia');
    await page.selectOption('[name=subjectId]', { index: 1 });
    await page.fill('[name=md]', '# Capítulo A\n\n**Posse** é o exercício de fato de poderes inerentes à propriedade.\n\n# Capítulo B\n\n## Usucapião\nTexto sobre usucapião.');
    await page.check('[name=split]');
    await page.uncheck('[name=gen]');
    await clickText('.sheet-foot button', 'Importar');
    await page.waitForSelector('text=Capítulo B');
    expect(await page.locator('.guide-row', { hasText: 'Capítulo A' }).count() === 1, 'capítulo A');
  });
  await step('busca em todo o conteúdo', async () => {
    await page.fill('#q', 'exceptio');
    await page.waitForSelector('.search-results mark');
    await shot('2-busca');
    await page.locator('.search-results [data-open]').first().click();
    await page.waitForSelector('#reader mark.find');
  });
  await step('leitor: índice, fonte ajustável', async () => {
    await page.goto(BASE + '#/resumos');
    await page.locator('.guide-row', { hasText: 'Teoria Geral dos Contratos' }).click();
    await page.waitForSelector('#reader h2');
    await page.click('[data-tocbtn]');
    await page.locator('.sheet [data-id]', { hasText: 'Extinção' }).click();
    await page.waitForTimeout(600);
    const before = await page.$eval('#reader', (el) => parseFloat(getComputedStyle(el).fontSize));
    await page.click('[data-font]');
    await page.click('[data-size="1"]'); await page.click('[data-size="1"]');
    await page.click('.sheet [data-x]');
    const after = await page.$eval('#reader', (el) => parseFloat(getComputedStyle(el).fontSize));
    expect(after === before + 2, `fonte ${before} -> ${after}`);
  });
  await step('destacar trecho com o dedo e anotar', async () => {
    await page.evaluate(() => {
      const p = [...document.querySelectorAll('#reader p')].find((x) => x.textContent.includes('negócio jurídico bilateral'));
      const node = [...p.childNodes].find((n) => n.nodeType === 3 && n.data.includes('negócio jurídico bilateral'));
      const i = node.data.indexOf('negócio jurídico bilateral');
      const r = document.createRange(); r.setStart(node, i); r.setEnd(node, i + 'negócio jurídico bilateral'.length);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.waitForSelector('#hlbar:not([hidden])');
    await shot('2-selecao');
    await page.click('#hlbar [data-color="green"]');
    await page.waitForSelector('#reader mark.hl.green');
    await page.click('#reader mark.hl.green');
    await page.fill('#note', 'Cai na prova!');
    await clickText('.sheet-foot button', 'Salvar');
    await page.waitForSelector('#reader mark.hl.has-note');
    await page.reload();
    await page.waitForSelector('#reader mark.hl.green.has-note');
    expect((await page.textContent('#reader mark.hl')).includes('negócio jurídico bilateral'), 'texto do destaque');
    await page.click('[data-notes]');
    await page.waitForSelector('.note-list .note');
    await shot('2-anotacoes');
    await page.click('.sheet [data-x]');
  });
  await step('marcar como lido atualiza progresso', async () => {
    await page.locator('.chips [data-status="lido"]').click();
    await page.waitForTimeout(100);
    await page.goto(BASE + '#/resumos');
    await page.waitForSelector('.guide-row');
    expect(await page.locator('.guide-row', { hasText: 'Teoria Geral dos Contratos' }).locator('.badge.ok').count() === 1, 'status lido');
    await page.goto(BASE + '#/guia/' + await page.locator('.guide-row', { hasText: 'Teoria Geral' }).getAttribute('data-open'));
    await page.waitForSelector('#reader');
    await shot('2-leitor');
    await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
    await shot('2-leitor-escuro');
    await page.evaluate(() => delete document.documentElement.dataset.theme);
  });
}
