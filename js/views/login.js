/**
 * Tela de entrada (login) e gerenciamento das contas deste aparelho.
 *
 * - Cada pessoa cria uma conta com e-mail e senha. As contas ficam só neste aparelho;
 *   em outro tablet a pessoa cria a conta lá (ou restaura um backup).
 * - Os dados de cada conta ficam separados e criptografados com a senha (core/auth.js).
 * - "Manter a sessão aberta" guarda a chave da sessão neste aparelho (não exportável)
 *   para não pedir a senha toda vez; "Sair" apaga essa chave.
 */
import * as db from '../core/db.js';
import { createAccount, unlock, validEmail, normEmail, passwordProblem } from '../core/auth.js';
import { esc, openModal, toast, confirmDialog, formData } from '../ui/dom.js';
import { icon } from '../ui/icons.js';

const ACCOUNTS = 'ed:accounts';
const SESSION = 'ed:session';

export function getAccounts() {
  try { return JSON.parse(db.ls.raw.get(ACCOUNTS) || '[]'); } catch { return []; }
}
function saveAccounts(list) { db.ls.raw.set(ACCOUNTS, JSON.stringify(list)); }
const findAccount = (email) => getAccounts().find((a) => a.email === normEmail(email));

let current = null; // conta conectada
export const currentAccount = () => current;

/** Abre a conta: carrega e descriptografa os dados. */
async function enter(account, key, remember) {
  await db.initDB(account.id, key);
  current = account;
  db.ls.raw.set(SESSION, JSON.stringify({ id: account.id, remember: !!remember }));
  if (remember) await db.saveSessionKey(account.id, key);
  else await db.clearSessionKey(account.id);
}

/** Tenta reabrir a sessão salva ("manter conectada"). Retorna true se entrou. */
export async function restoreSession() {
  let s = null;
  try { s = JSON.parse(db.ls.raw.get(SESSION) || 'null'); } catch {}
  if (!s?.remember) return false;
  const account = getAccounts().find((a) => a.id === s.id);
  const key = account && await db.loadSessionKey(account.id);
  if (!key) return false;
  try { await enter(account, key, true); return true; } catch { return false; }
}

export async function logout() {
  if (current) await db.clearSessionKey(current.id);
  db.ls.raw.remove(SESSION);
  location.hash = '#/';
  location.reload();
}

/**
 * Desenha a tela de login em `root`. Chama onDone() depois de entrar.
 */
export function renderLogin(root, onDone) {
  const accounts = getAccounts();
  let mode = accounts.length ? 'login' : 'signup';
  let fails = 0;
  let last = null;
  try { last = JSON.parse(db.ls.raw.get(SESSION) || 'null'); } catch {}
  const lastEmail = accounts.find((a) => a.id === last?.id)?.email || (accounts.length === 1 ? accounts[0].email : '');

  const draw = () => {
    root.innerHTML = `
      <div class="login">
        <div class="login-card card">
          <div class="login-brand"><img src="icons/icon.svg" alt="" width="56" height="56"><div><h1>Estudos de Direito</h1>
            <p class="muted small mb0">Seu organizador de estudos</p></div></div>
          <div class="seg login-tabs" role="tablist">
            <button role="tab" data-mode="login" aria-pressed="${mode === 'login'}">Entrar</button>
            <button role="tab" data-mode="signup" aria-pressed="${mode === 'signup'}">Criar conta</button>
          </div>
          <form id="lf" novalidate>
            <label class="field"><span>E-mail</span>
              <input class="input" id="lf-email" name="email" type="email" autocomplete="${mode === 'login' ? 'username' : 'email'}" inputmode="email" value="${esc(mode === 'login' ? lastEmail : '')}" required></label>
            <label class="field"><span>Senha</span>
              <div class="pw"><input class="input" id="lf-pw" name="password" type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required>
              <button type="button" class="btn icon ghost" data-show aria-label="Mostrar senha">${icon('eye')}</button></div></label>
            ${mode === 'signup' ? `<label class="field"><span>Confirme a senha</span>
              <input class="input" id="lf-pw2" name="password2" type="password" autocomplete="new-password" required></label>
              <p class="small muted">Mínimo de 8 caracteres, com letras e números.</p>` : ''}
            <label class="check"><input type="checkbox" name="remember" checked> Manter a sessão aberta neste aparelho</label>
            <p class="login-error" id="lf-err" role="alert" hidden></p>
            <button class="btn primary block mt" type="submit" id="lf-go">${mode === 'login' ? 'Entrar' : 'Criar conta e entrar'}</button>
          </form>
          ${mode === 'login' ? `<button class="btn ghost block small mt" data-forgot>Esqueci minha senha</button>` : ''}
          <p class="small muted login-note">${icon('lock')}<span>Seus dados ficam <b>somente neste aparelho</b>, protegidos com criptografia pela sua senha. Cada pessoa que usar este aparelho pode criar a própria conta, e uma não vê os dados da outra.</span></p>
        </div>
      </div>`;
    const f = root.querySelector('#lf');
    if (window.matchMedia('(pointer: fine)').matches) (f.email.value ? f.password : f.email).focus();
  };
  draw();

  const showError = (msg) => { const e = root.querySelector('#lf-err'); e.textContent = msg; e.hidden = !msg; };

  root.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) { mode = m.dataset.mode; draw(); return; }
    const sh = e.target.closest('[data-show]');
    if (sh) { const i = root.querySelector('#lf-pw'); i.type = i.type === 'password' ? 'text' : 'password'; sh.setAttribute('aria-label', i.type === 'password' ? 'Mostrar senha' : 'Esconder senha'); return; }
    if (e.target.closest('[data-forgot]')) openForgot(() => draw());
  });

  root.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = formData(e.target);
    const go = root.querySelector('#lf-go');
    showError('');
    if (!validEmail(d.email)) return showError('Digite um e-mail válido.');
    go.disabled = true;
    const label = go.textContent;
    go.textContent = mode === 'login' ? 'Entrando…' : 'Criando conta…';
    try {
      if (mode === 'signup') {
        if (findAccount(d.email)) throw new Error('Já existe uma conta com este e-mail neste aparelho. Use “Entrar”.');
        const prob = passwordProblem(d.password);
        if (prob) throw new Error(prob);
        if (d.password !== d.password2) throw new Error('As senhas não conferem.');
        const first = getAccounts().length === 0;
        const { account, key } = await createAccount(d.email, d.password);
        saveAccounts([...getAccounts(), account]);
        await enter(account, key, d.remember);
        // primeira conta do aparelho: traz os dados que já existiam antes do login
        if (first) {
          const legacy = await db.readLegacy();
          if (legacy) {
            await db.importData(legacy, 'merge');
            if (legacy.apiKey) db.ls.set('ed:apiKey', legacy.apiKey);
            await db.deleteLegacy();
            toast('Seus dados anteriores foram movidos para esta conta');
          }
        }
      } else {
        const account = findAccount(d.email);
        // espera crescente após erros, para dificultar tentativas de adivinhar a senha
        if (fails) await new Promise((r) => setTimeout(r, Math.min(5, fails) * 800));
        const key = account && await unlock(account, d.password);
        if (!key) { fails++; throw new Error('E-mail ou senha incorretos.'); }
        await enter(account, key, d.remember);
      }
      onDone();
    } catch (err) {
      showError(err.message || 'Não foi possível entrar.');
      go.disabled = false;
      go.textContent = label;
    }
  });
}

function openForgot(after) {
  openModal({
    title: 'Esqueci minha senha',
    body: `<p>Como seus dados são criptografados com a sua senha e ficam só neste aparelho, <b>não existe como recuperar a senha</b> (nem nós temos acesso a ela).</p>
      <p>Se você tem um <b>backup</b> (arquivo .json exportado em Configurações), pode:</p>
      <ol><li>excluir a conta esquecida abaixo;</li><li>criar uma conta nova;</li><li>em Configurações → <b>Importar backup</b>, restaurar seus dados.</li></ol>
      <label class="field"><span>E-mail da conta a excluir</span><input class="input" id="fg-email" type="email" inputmode="email"></label>`,
    actions: [
      { label: 'Cancelar' },
      { label: `${icon('trash')} Excluir esta conta`, cls: 'danger solid', onClick: async (c, el) => {
        const acc = findAccount(el.querySelector('#fg-email').value);
        if (!acc) { toast('Nenhuma conta com este e-mail neste aparelho'); return false; }
        if (!(await confirmDialog(`Excluir a conta <b>${esc(acc.email)}</b> e <b>todos os dados</b> dela neste aparelho? Não dá para desfazer.`, { ok: 'Excluir', danger: true }))) return false;
        await removeAccount(acc.id);
        toast('Conta excluída');
        after?.();
      } },
    ],
  });
}

async function removeAccount(id) {
  await db.clearSessionKey(id);
  await db.deleteUserData(id);
  saveAccounts(getAccounts().filter((a) => a.id !== id));
  try { const s = JSON.parse(db.ls.raw.get(SESSION) || 'null'); if (s?.id === id) db.ls.raw.remove(SESSION); } catch {}
}

/** Trocar a senha: confere a atual e regrava os dados com a nova chave. */
export function openChangePassword() {
  openModal({
    title: 'Trocar senha',
    body: `<form id="cp">
      <label class="field"><span>Senha atual</span><input class="input" type="password" name="old" autocomplete="current-password"></label>
      <label class="field"><span>Nova senha</span><input class="input" type="password" name="pw" autocomplete="new-password"></label>
      <label class="field"><span>Confirme a nova senha</span><input class="input" type="password" name="pw2" autocomplete="new-password"></label>
      <p class="small muted">Mínimo de 8 caracteres, com letras e números.</p></form>`,
    actions: [{ label: 'Cancelar' }, { label: 'Trocar senha', cls: 'primary', onClick: async (c, el) => {
      const d = formData(el.querySelector('#cp'));
      if (!(await unlock(current, d.old))) { toast('Senha atual incorreta'); return false; }
      const prob = passwordProblem(d.pw);
      if (prob) { toast(prob); return false; }
      if (d.pw !== d.pw2) { toast('As senhas não conferem'); return false; }
      const { account, key } = await createAccount(current.email, d.pw);
      const updated = { ...current, salt: account.salt, verifier: account.verifier, iterations: account.iterations };
      await db.rekey(key);
      saveAccounts(getAccounts().map((a) => (a.id === current.id ? updated : a)));
      current = updated;
      let s = null; try { s = JSON.parse(db.ls.raw.get(SESSION) || 'null'); } catch {}
      if (s?.remember) await db.saveSessionKey(current.id, key);
      toast('Senha alterada');
    } }],
  });
}

/** Excluir a própria conta (com confirmação da senha). */
export function openDeleteAccount() {
  openModal({
    title: 'Excluir minha conta',
    body: `<p>Isso apaga a conta <b>${esc(current.email)}</b> e <b>todos os seus dados</b> deste aparelho. Exporte um backup antes se quiser guardar algo.</p>
      <label class="field"><span>Digite sua senha para confirmar</span><input class="input" type="password" id="da-pw" autocomplete="current-password"></label>`,
    actions: [{ label: 'Cancelar' }, { label: 'Excluir conta', cls: 'danger solid', onClick: async (c, el) => {
      if (!(await unlock(current, el.querySelector('#da-pw').value))) { toast('Senha incorreta'); return false; }
      await removeAccount(current.id);
      location.hash = '#/';
      location.reload();
    } }],
  });
}

export { openForgot };
