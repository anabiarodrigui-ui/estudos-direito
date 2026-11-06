// Etapa 3 — flashcards.
export default async function ({ page, step, expect, shot, clickText, BASE }) {
  console.log('Etapa 3 — flashcards');
  const statVal = async (label) => (await page.locator('.stat', { hasText: label }).locator('.v').textContent()).trim();

  await step('tela de flashcards com estatísticas', async () => {
    await page.goto(BASE + '#/cartoes');
    await page.waitForSelector('.stat');
    expect(+(await statVal('pendentes hoje')) >= 0, 'pendentes');
    await shot('3-cartoes');
  });
  await step('estudar: virar com toque e avaliar com botões', async () => {
    await page.goto(BASE + '#/estudar');
    await page.waitForSelector('#flash');
    await shot('3-frente');
    await page.click('#flash');
    await page.waitForSelector('#grades:not([hidden])');
    await page.waitForTimeout(500);
    await shot('3-verso');
    const labels = await page.locator('#grades .btn').allTextContents();
    expect(labels.length === 4 && labels[0].startsWith('Errei') && labels[3].startsWith('Fácil'), 'botões: ' + labels);
    await page.click('[data-q="4"]');
    await page.waitForSelector('#flash:not(.flipped)');
  });
  await step('estudar: deslizar para a direita = Bom; "Errei" volta na sessão', async () => {
    await page.click('#flash');
    await page.waitForSelector('#grades:not([hidden])');
    const before = await page.textContent('#cnt');
    const box = await page.locator('#flash').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 200, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(150);
    expect((await page.textContent('#cnt')) !== before, 'não avançou com o gesto');
    await page.click('#showbtn');
    await page.click('[data-q="1"]'); // errei -> volta
    await page.waitForTimeout(150);
    expect((await page.textContent('#cnt')).includes('+1'), 'cartão errado deveria voltar: ' + await page.textContent('#cnt'));
    for (let i = 0; i < 40 && await page.locator('#flash').count(); i++) { await page.click('#showbtn'); await page.click('[data-q="4"]'); await page.waitForTimeout(60); }
    await page.waitForSelector('text=Sessão concluída');
    await shot('3-fim');
  });
  await step('após a sessão não há pendentes; revisões registradas', async () => {
    await page.goto(BASE + '#/cartoes');
    await page.waitForSelector('.stat');
    expect(await statVal('pendentes hoje') === '0', 'pendentes deveria ser 0');
    expect((await statVal('taxa de acerto')).endsWith('%'), 'taxa de acerto');
  });
  await step('revisão rápida (não altera agendamento)', async () => {
    await clickText('a', 'Revisão rápida');
    await page.waitForSelector('#flash');
    await page.click('#flash');
    const labels = await page.locator('#grades .btn').allTextContents();
    expect(labels.join() === 'Errei,Acertei', 'botões rápidos: ' + labels);
    await page.click('[data-q="4"]');
  });
  await step('criar cartão manualmente', async () => {
    await page.goto(BASE + '#/cartoes');
    await clickText('button', 'Novo cartão');
    await page.fill('[name=front]', 'Qual o prazo da ação redibitória para imóveis?');
    await page.fill('[name=back]', '1 ano');
    await page.selectOption('[name=subjectId]', { index: 1 });
    await page.fill('[name=tags]', 'prazos, vícios');
    await clickText('.sheet-foot button', 'Salvar');
    await page.waitForSelector('text=Qual o prazo da ação redibitória');
  });
  await step('importar cartões no formato P:/R:', async () => {
    const n0 = await page.locator('[data-card]').count();
    await clickText('button', 'Importar');
    await page.fill('[name=text]', '# Matéria: Direito Penal\n# Tópico: Teste\nP: Pergunta importada 1?\nR: Resposta 1\n\nP: Pergunta importada 2?\nR: Resposta 2');
    await page.waitForSelector('#preview:has-text("2 cartão")');
    await clickText('.sheet-foot button', 'Importar');
    await page.waitForTimeout(200);
    expect(await page.locator('[data-card]').count() === n0 + 2, 'importação');
  });
  await step('gerar flashcards localmente a partir do guia, revisar e salvar', async () => {
    await page.goto(BASE + '#/cartoes');
    const n0 = await page.locator('[data-card]').count();
    await clickText('button', 'Gerar de um guia');
    await page.locator('.sheet [data-g]', { hasText: 'Teoria Geral dos Contratos' }).click();
    await page.waitForSelector('.cand');
    const total = await page.locator('.cand').count();
    expect(total >= 20, 'candidatos: ' + total);
    await page.locator('.cand [data-on]').first().uncheck();
    await page.locator('.cand textarea[data-f="front"]').nth(1).fill('Pergunta editada na revisão?');
    await shot('3-revisao-gerados');
    const saveLabel = await page.textContent('#save');
    const n = +saveLabel.match(/\d+/)[0];
    await page.click('#save');
    await page.waitForTimeout(300);
    const n1 = await page.locator('[data-card]').count();
    expect(n1 > n0 && n1 <= n0 + n, `salvou ${n1 - n0} de ${n}`);
    expect(await page.locator('[data-card]', { hasText: 'Pergunta editada na revisão?' }).count() === 1, 'edição mantida');
  });
  await step('gerar com IA (API simulada): cabeçalhos e revisão', async () => {
    let req = null;
    await page.route('https://api.anthropic.com/v1/messages', async (route) => {
      req = route.request();
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ cards: [
          { pergunta: 'IA: o que é evicção?', resposta: 'Perda da coisa por decisão judicial (art. 447).', topico: 'Evicção' },
          { pergunta: 'IA: prazo do vício redibitório em móveis?', resposta: '30 dias (art. 445).', topico: 'Vícios' }] }) }] }) });
    });
    await page.goto(BASE + '#/config');
    await page.fill('[name=apiKey]', 'sk-ant-teste');
    await clickText('button', 'Salvar');
    await page.goto(BASE + '#/cartoes');
    await clickText('button', 'Gerar de um guia');
    await page.locator('.sheet [data-g]', { hasText: 'Teoria do Crime' }).click();
    await page.click('[data-mode="ai"]');
    await page.click('[data-run-ai]');
    await page.waitForSelector('.cand:has-text("IA: o que é evicção?")');
    const h = req.headers();
    expect(h['x-api-key'] === 'sk-ant-teste' && h['anthropic-dangerous-direct-browser-access'] === 'true' && h['anthropic-version'], 'cabeçalhos');
    const body = JSON.parse(req.postData());
    expect(body.model === 'claude-opus-5-5' && body.output_config.format.type === 'json_schema', 'corpo');
    await page.click('#save');
    await page.waitForSelector('text=IA: o que é evicção?');
    await page.unroute('https://api.anthropic.com/v1/messages');
    await page.goto(BASE + '#/config');
    await clickText('button', 'Remover chave');
  });
}
