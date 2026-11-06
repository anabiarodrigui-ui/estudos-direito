// Testes das contas locais e da criptografia (Web Crypto do Node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAccount, unlock, encryptObj, decryptObj, passwordProblem, validEmail } from '../js/core/auth.js';

test('conta: senha certa abre, errada não; senha não fica guardada', async () => {
  const { account, key } = await createAccount('  Ana@Exemplo.com ', 'direito2026');
  assert.equal(account.email, 'ana@exemplo.com');
  assert.ok(!JSON.stringify(account).includes('direito2026'));
  assert.ok(await unlock(account, 'direito2026'));
  assert.equal(await unlock(account, 'Direito2026'), null);
  const obj = { id: 'x', front: 'O que é evicção?' };
  const sealed = await encryptObj(key, obj, 'cards:x');
  assert.ok(!sealed.ct.includes('evic'));
  const again = await unlock(account, 'direito2026');
  assert.deepEqual(await decryptObj(again, sealed, 'cards:x'), obj);
});

test('criptografia: dados de outra conta ou adulterados não abrem', async () => {
  const a = await createAccount('a@a.com', 'senhaforte1');
  const b = await createAccount('b@b.com', 'senhaforte1'); // mesma senha, sal diferente
  assert.notEqual(a.account.verifier, b.account.verifier);
  const sealed = await encryptObj(a.key, { id: 1 }, 'cards:1');
  await assert.rejects(decryptObj(b.key, sealed, 'cards:1'));
  await assert.rejects(decryptObj(a.key, sealed, 'cards:2'), 'registro movido para outro id');
});

test('regras de senha e e-mail', () => {
  assert.ok(passwordProblem('curta1'));
  assert.ok(passwordProblem('somenteletras'));
  assert.equal(passwordProblem('letras123'), '');
  assert.ok(validEmail('ana@uni.br'));
  assert.ok(!validEmail('ana@'));
});
