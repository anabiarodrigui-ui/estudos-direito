// Etapa 5 — contas com e-mail e senha, separação e criptografia dos dados.
const login = async (page, email, pw, { remember = true } = {}) => {
  await page.waitForSelector('#lf');
  if (await page.locator('[data-mode="login"][aria-pressed="false"]').count()) await page.click('[data-mode="login"]');
  await page.fill('#lf-email', email);
  await page.fill('#lf-pw', pw);
  if (!remember) await page.uncheck('[name=remember]');
  await page.click('#lf-go');
};
const signup = async (page, email, pw) => {
  await page.waitForSelector('#lf');
  await page.click('[data-mode="signup"]');
  await page.fill('#lf-email', email);
  await page.fill('#lf-pw', pw);
  await page.fill('#lf-pw2', pw);
  await page.click('#lf-go');
};
const logout = async (page, BASE) => {
  await page.goto(BASE + '#/config');
  await page.waitForSelector('[data-logout]');
  await Promise.all([page.waitForEvent('load'), page.click('[data-logout]')]);
};

export default async function ({ page, step, expect, shot, clickText, BASE, ctx, browser }) {
  console.log('Etapa 5 — contas e privacidade');
  await step('sessão continua aberta após recarregar', async () => {
    await page.goto(BASE + '#/materias');
    await page.reload();
    await page.waitForSelector('.page-head');
    expect(await page.locator('#lf').count() === 0, 'pediu senha de novo');
  });
  await step('dados ficam criptografados no aparelho', async () => {
    await page.goto(BASE + '#/');
    await page.waitForSelector('.subject-card, [data-sample]');
    if (await page.getByText('Carregar dados de exemplo').count()) {
      await page.getByText('Carregar dados de exemplo').click();
      await page.waitForSelector('.subject-card');
    }
    const raw = await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      const name = dbs.map((d) => d.name).find((n) => n.startsWith('estudos-direito-u-'));
      const db = await new Promise((r) => { const q = indexedDB.open(name); q.onsuccess = () => r(q.result); });
      const rows = await new Promise((r) => { const q = db.transaction('subjects').objectStore('subjects').getAll(); q.onsuccess = () => r(q.result); });
      return JSON.stringify(rows);
    });
    expect(raw.length > 50 && !raw.includes('Direito') && raw.includes('"ct"'), 'registro legível: ' + raw.slice(0, 120) + ' | dbs=' + await page.evaluate(async () => JSON.stringify((await indexedDB.databases()).map((d) => d.name))) + ' | cards=' + await page.locator('.subject-card').count());
  });
  await step('sair e entrar: senha errada é recusada', async () => {
    await logout(page, BASE);
    await page.waitForSelector('#lf');
    await shot('5-login');
    await login(page, 'ana@exemplo.com', 'senhaerrada1');
    await page.waitForSelector('#lf-err:not([hidden])');
    expect((await page.textContent('#lf-err')).includes('incorretos'), 'mensagem de erro');
    await page.fill('#lf-pw', 'direito2026');
    await page.click('#lf-go');
    await page.waitForSelector('.page-head');
    expect(await page.locator('.subject-card').count() >= 2, 'dados da Ana voltaram');
  });
  await step('outra pessoa cria conta e não vê os dados da primeira', async () => {
    await logout(page, BASE);
    await signup(page, 'bia@exemplo.com', 'penal2026x');
    await page.waitForSelector('text=Carregar dados de exemplo');
    expect(await page.locator('.subject-card').count() === 0, 'Bia está vendo dados da Ana');
    await page.goto(BASE + '#/materias');
    await clickText('button', 'Nova matéria');
    await page.fill('[name=name]', 'Matéria da Bia');
    await clickText('.sheet-foot button', 'Salvar');
    await page.waitForSelector('text=Matéria da Bia');
    await page.goto(BASE + '#/config');
    await clickText('button', 'Escuro');
    await page.waitForTimeout(150);
  });
  await step('cadastro recusa e-mail repetido e senha fraca', async () => {
    await logout(page, BASE);
    await signup(page, 'ana@exemplo.com', 'outrasenha9');
    await page.waitForSelector('#lf-err:not([hidden])');
    expect((await page.textContent('#lf-err')).includes('Já existe'), 'e-mail repetido');
    await page.fill('#lf-email', 'cris@exemplo.com'); await page.fill('#lf-pw', 'abc'); await page.fill('#lf-pw2', 'abc');
    await page.click('#lf-go');
    await page.waitForSelector('#lf-err:has-text("8 caracteres")');
  });
  await step('Ana entra de novo: só vê os próprios dados e o próprio tema', async () => {
    await login(page, 'ana@exemplo.com', 'direito2026');
    await page.waitForSelector('.subject-card');
    await page.goto(BASE + '#/materias');
    await page.waitForSelector('.page-head');
    expect(await page.locator('text=Matéria da Bia').count() === 0, 'Ana vê matéria da Bia');
    expect(await page.evaluate(() => document.documentElement.dataset.theme) !== 'dark', 'tema da Bia vazou');
  });
  await step('trocar senha mantém os dados', async () => {
    await page.goto(BASE + '#/config');
    await clickText('button', 'Trocar senha');
    await page.fill('[name=old]', 'direito2026');
    await page.fill('[name=pw]', 'novaSenha2027');
    await page.fill('[name=pw2]', 'novaSenha2027');
    await clickText('.sheet-foot button', 'Trocar senha');
    await page.waitForTimeout(500);
    await logout(page, BASE);
    await login(page, 'ana@exemplo.com', 'direito2026');
    await page.waitForSelector('#lf-err:not([hidden])');
    await page.fill('#lf-pw', 'novaSenha2027');
    await page.click('#lf-go');
    await page.waitForSelector('.subject-card');
  });
  await step('sem "manter a sessão aberta", pede a senha ao reabrir', async () => {
    await logout(page, BASE);
    await login(page, 'ana@exemplo.com', 'novaSenha2027', { remember: false });
    await page.waitForSelector('.subject-card');
    await page.reload();
    await page.waitForSelector('#lf');
    await login(page, 'ana@exemplo.com', 'novaSenha2027');
    await page.waitForSelector('.subject-card');
  });
  await step('dados de antes do login são migrados para a primeira conta', async () => {
    const c2 = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    const p2 = await c2.newPage();
    await p2.goto(BASE + 'scripts/../');
    await p2.waitForSelector('#lf');
    // cria um banco "antigo" (sem login) com uma matéria, como na versão anterior do app
    await p2.evaluate(async () => {
      const db = await new Promise((r) => { const q = indexedDB.open('estudos-direito', 1); q.onupgradeneeded = () => { for (const c of ['subjects', 'events', 'guides', 'highlights', 'cards', 'reviews', 'sessions']) q.result.createObjectStore(c, { keyPath: 'id' }); }; q.onsuccess = () => r(q.result); });
      await new Promise((r) => { const t = db.transaction('subjects', 'readwrite'); t.objectStore('subjects').put({ id: 'old1', name: 'Matéria antiga', color: '#b83a6e', examDate: '' }); t.oncomplete = r; });
      db.close();
    });
    await signup(p2, 'nova@exemplo.com', 'direito2026');
    await p2.waitForSelector('.page-head');
    await p2.goto(BASE + '#/materias');
    await p2.waitForSelector('text=Matéria antiga');
    const legacyGone = await p2.evaluate(async () => !(await indexedDB.databases()).some((d) => d.name === 'estudos-direito'));
    expect(legacyGone, 'banco antigo (sem criptografia) deveria ser apagado');
    await c2.close();
  });
}
