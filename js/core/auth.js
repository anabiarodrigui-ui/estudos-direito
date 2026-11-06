/**
 * Contas locais com e-mail e senha + criptografia dos dados.
 *
 * Não há servidor: as contas ficam no próprio aparelho. A senha nunca é guardada.
 * A partir dela (PBKDF2-SHA-256, 210 mil iterações, com "sal" aleatório) derivamos:
 *   - um verificador, para conferir se a senha está certa;
 *   - uma chave AES-GCM de 256 bits, que criptografa cada registro salvo no IndexedDB.
 * Sem a senha, os dados guardados são ilegíveis. Por isso uma senha esquecida
 * não pode ser recuperada: só dá para restaurar a partir de um backup.
 *
 * Usa apenas a Web Crypto API (disponível nos navegadores e no Node 18+).
 */

export const ITERATIONS = 210000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(e));

/** Regras mínimas de senha. Retorna mensagem de erro ou ''. */
export function passwordProblem(pw) {
  if (!pw || pw.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (!/[A-Za-zÀ-ú]/.test(pw) || !/\d/.test(pw)) return 'Use letras e números na senha.';
  return '';
}

/** Deriva verificador (base64) e chave AES-GCM a partir da senha. */
export async function deriveSecrets(password, saltB64, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations }, base, 512));
  const verifier = toB64(await crypto.subtle.digest('SHA-256', bits.slice(0, 32)));
  // chave não exportável: nem o próprio app consegue extraí-la
  const key = await crypto.subtle.importKey('raw', bits.slice(32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return { verifier, key };
}

/** Cria o registro de uma conta nova (sem guardar a senha). */
export async function createAccount(email, password) {
  const salt = toB64(crypto.getRandomValues(new Uint8Array(16)));
  const { verifier, key } = await deriveSecrets(password, salt);
  const id = toB64(crypto.getRandomValues(new Uint8Array(9))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
  return { account: { id, email: normEmail(email), salt, verifier, iterations: ITERATIONS, createdAt: Date.now() }, key };
}

/** Confere a senha. Retorna a chave AES se estiver certa, ou null. */
export async function unlock(account, password) {
  const { verifier, key } = await deriveSecrets(password, account.salt, account.iterations || ITERATIONS);
  return safeEqual(verifier, account.verifier) ? key : null;
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/** Criptografa um objeto: { iv, ct } em base64. O id do registro entra como dado autenticado. */
export async function encryptObj(key, obj, aad = '') {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, key, enc.encode(JSON.stringify(obj)));
  return { iv: toB64(iv), ct: toB64(ct) };
}

export async function decryptObj(key, { iv, ct }, aad = '') {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(iv), additionalData: enc.encode(aad) }, key, fromB64(ct));
  return JSON.parse(dec.decode(pt));
}
