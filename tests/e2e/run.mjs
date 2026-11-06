/**
 * Teste ponta a ponta (Playwright + Chromium) simulando um tablet.
 * Uso: node tests/e2e/run.mjs [etapa]   (etapa: 1, 2, 3, 4 ou "all"; padrão all)
 * Requer o pacote "playwright" disponível no ambiente. Screenshots vão para tests/e2e/shots/.
 */
import { createRequire } from 'node:module';
// require() respeita NODE_PATH (Playwright instalado globalmente); em projeto local: npm i -D playwright
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdir } from 'node:fs/promises';
import { serve } from '../../scripts/serve.mjs';

const STAGE = process.argv[2] || 'all';
const PORT = 8123;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = new URL('./shots/', import.meta.url).pathname;
await mkdir(SHOTS, { recursive: true });

const server = await serve(PORT);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());

let passed = 0;
async function step(name, fn) {
  try { await fn(); passed++; console.log('  ✓', name); }
  catch (e) { console.log('  ✗', name, '\n    ', e.message); await page.screenshot({ path: SHOTS + 'FAIL.png' }); throw e; }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const shot = (n) => page.screenshot({ path: SHOTS + n + '.png' });
const clickText = (sel, text) => page.locator(sel, { hasText: text }).first().click();
const run = (n) => STAGE === 'all' || STAGE === String(n);

try {
  await page.goto(BASE);
  await page.waitForSelector('.page-head');

  if (run(1)) {
    console.log('Etapa 1 — estrutura, matérias e calendário');
    await step('tela de boas-vindas e dados de exemplo', async () => {
      await page.getByText('Carregar dados de exemplo').click();
      await page.waitForSelector('.subject-card');
      expect(await page.locator('.subject-card').count() === 2, 'esperava 2 matérias');
      await shot('1-dashboard');
    });
    await step('cadastrar matéria', async () => {
      await page.goto(BASE + '#/materias');
      await clickText('button', 'Nova matéria');
      await page.fill('[name=name]', 'Processo Civil II');
      await page.fill('[name=examDate]', '2026-12-10');
      await clickText('.sheet-foot button', 'Salvar');
      await page.waitForSelector('text=Processo Civil II');
    });
    await step('visão mensal mostra provas', async () => {
      await page.goto(BASE + '#/agenda?view=month&date=2026-12-01');
      await page.waitForSelector('.month');
      expect(await page.locator('.ev.exam', { hasText: 'Processo Civil II' }).count() === 1, 'prova não aparece');
      await shot('1-mes');
    });
    await step('criar tarefa recorrente', async () => {
      await page.goto(BASE + '#/agenda?view=week&date=2026-12-07');
      await page.click('.fab');
      await page.fill('[name=title]', 'Leitura diária');
      await page.fill('[name=date]', '2026-12-07');
      await page.selectOption('[name=freq]', 'daily');
      await clickText('.sheet-foot button', 'Salvar');
      await page.waitForTimeout(150);
      expect(await page.locator('.wday .ev', { hasText: 'Leitura diária' }).count() === 7, 'esperava 7 ocorrências na semana');
      await shot('1-semana');
    });
    await step('arrastar evento para outro dia (toque longo)', async () => {
      await page.goto(BASE + '#/agenda?view=week&date=2026-12-07');
      await page.click('.fab');
      await page.fill('[name=title]', 'Arrastável');
      await page.fill('[name=date]', '2026-12-08');
      await clickText('.sheet-foot button', 'Salvar');
      await page.waitForTimeout(150);
      const src = await page.locator('.ev', { hasText: 'Arrastável' }).boundingBox();
      const dst = await page.locator('.wday[data-date-drop="2026-12-10"]').boundingBox();
      await page.mouse.move(src.x + 10, src.y + 10);
      await page.mouse.down();
      await page.waitForTimeout(300);
      await page.mouse.move(dst.x + 30, dst.y + 30, { steps: 8 });
      await page.mouse.up();
      await page.waitForTimeout(200);
      expect(await page.locator('.wday[data-date-drop="2026-12-10"] .ev', { hasText: 'Arrastável' }).count() === 1, 'não moveu');
    });
    await step('planejador diário: concluir tarefa atualiza progresso', async () => {
      await page.goto(BASE + '#/agenda?view=day');
      await page.waitForSelector('.task');
      const before = await page.locator('.task.done').count();
      await page.locator('.task:not(.done) .tick').first().click();
      await page.waitForTimeout(150);
      expect(await page.locator('.task.done').count() === before + 1, 'não marcou');
      await shot('1-dia');
    });
    await step('gerar plano de estudos', async () => {
      await page.goto(BASE + '#/agenda?view=month');
      await clickText('button', 'Gerar plano');
      await clickText('.sheet-foot button', 'Gerar');
      await page.waitForSelector('.week');
      expect(await page.locator('.ev', { hasText: 'Estudar:' }).count() + await page.locator('.ev', { hasText: 'Revisão' }).count() > 0, 'plano vazio');
      await shot('1-plano');
    });
    await step('tema escuro e backup', async () => {
      await page.goto(BASE + '#/config');
      await clickText('button', 'Escuro');
      expect(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'tema não aplicado');
      await page.waitForTimeout(200);
      await shot('1-config-escuro');
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('[data-export]')]);
      expect(/estudos-direito-backup/.test(dl.suggestedFilename()), 'nome do backup');
      await clickText('button', 'Automático');
    });
    await step('paisagem: navegação lateral', async () => {
      await page.setViewportSize({ width: 1180, height: 820 });
      await page.goto(BASE + '#/');
      await page.waitForSelector('.subject-card');
      const pos = await page.$eval('.nav', (n) => getComputedStyle(n).position);
      expect(pos === 'sticky', 'nav lateral esperada');
      await shot('1-paisagem');
      await page.setViewportSize({ width: 820, height: 1180 });
    });
    await step('funciona offline (service worker)', async () => {
      await page.goto(BASE);
      await page.evaluate(() => navigator.serviceWorker.ready);
      await page.waitForTimeout(500);
      await ctx.setOffline(true);
      await page.reload();
      await page.waitForSelector('.subject-card');
      await ctx.setOffline(false);
    });
  }

  if (!run(1)) { // rodando uma etapa isolada: carrega os dados de exemplo primeiro
    await page.getByText('Carregar dados de exemplo').click();
    await page.waitForSelector('.subject-card');
  }
  if (run(2)) await (await import('./stage2.mjs')).default({ page, step, expect, shot, clickText, BASE });
  if (run(3)) await (await import('./stage3.mjs')).default({ page, step, expect, shot, clickText, BASE });
  if (run(4)) await (await import('./stage4.mjs')).default({ page, step, expect, shot, clickText, BASE, ctx });

  if (errors.length) { console.log('Erros no console:\n' + errors.join('\n')); process.exitCode = 1; }
  else console.log(`\n${passed} verificações OK, sem erros no console.`);
} catch (e) {
  if (errors.length) console.log('Erros no console:\n' + errors.join('\n'));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
