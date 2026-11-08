/**
 * Camada de dados.
 * - Tudo fica no próprio dispositivo, em IndexedDB (com fallback para localStorage).
 * - Cada conta tem o SEU banco ("estudos-direito-u-<id>") e cada registro é gravado
 *   CRIPTOGRAFADO (AES-GCM) com a chave derivada da senha (ver core/auth.js).
 * - Na inicialização descriptografamos tudo para a memória (são poucos dados),
 *   assim as telas leem de forma síncrona e rápida; cada alteração é gravada no banco.
 * - Configurações ficam em localStorage, separadas por conta ("ed:u:<id>:settings");
 *   a chave da API da Anthropic ("apiKey") NUNCA entra no backup.
 */
import { encryptObj, decryptObj } from './auth.js';

export const LEGACY_DB_NAME = 'estudos-direito';   // versão sem contas (antes do login)
export const AUTH_DB_NAME = 'estudos-direito-auth'; // chaves das sessões "manter conectada"
const dbName = (userId) => `estudos-direito-u-${userId}`;
export const DB_VERSION = 2; // v2: coleção "routine" (compromissos fixos)
export const COLLECTIONS = ['subjects', 'events', 'guides', 'highlights', 'cards', 'reviews', 'sessions', 'routine'];
export const BACKUP_FORMAT = 'estudos-direito-backup';


/**
 * Acesso seguro ao localStorage: se o navegador bloquear o armazenamento
 * (aba anônima, prévia, dados bloqueados), usa a memória e o app continua funcionando.
 */
const memStore = new Map();
const rawLs = {
  get(k) { try { return localStorage.getItem(k); } catch { return memStore.has(k) ? memStore.get(k) : null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { memStore.set(k, String(v)); } },
  remove(k) { try { localStorage.removeItem(k); } catch { memStore.delete(k); } },
};
// Chaves do aparelho (iguais para todas as contas). As demais "ed:*" ficam separadas por conta.
const GLOBAL_KEYS = new Set(['ed:accounts', 'ed:session', 'ed:theme']);
let userId = null;
const scoped = (k) => (userId && k.startsWith('ed:') && !GLOBAL_KEYS.has(k) ? `ed:u:${userId}:${k.slice(3)}` : k);
export const ls = {
  get: (k) => rawLs.get(scoped(k)),
  set: (k, v) => rawLs.set(scoped(k), v),
  remove: (k) => rawLs.remove(scoped(k)),
  raw: rawLs,
};

const cache = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()]));
const listeners = new Set();
let idb = null;          // conexão IndexedDB (ou null se indisponível)
let useLocal = false;    // fallback localStorage
let cryptoKey = null;    // chave AES da conta conectada

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function openIDB(name = dbName(userId), stores = COLLECTIONS) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB indisponível'));
    const req = indexedDB.open(name, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const c of stores) if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(col, mode, fn, conn = idb) {
  return new Promise((resolve, reject) => {
    const t = conn.transaction(col, mode);
    const store = t.objectStore(col);
    const r = fn(store);
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

// ---------- criptografia de registros ----------
const seal = async (col, obj) => ({ id: obj.id, ...(await encryptObj(cryptoKey, obj, col + ':' + obj.id)) });
const open = (col, rec) => decryptObj(cryptoKey, rec, col + ':' + rec.id);

async function saveLocal(col) {
  const rows = await Promise.all([...cache[col].values()].map((o) => seal(col, o)));
  ls.set('ed:data:' + col, JSON.stringify(rows));
}

/** Abre o banco da conta e descriptografa tudo para a memória. */
export async function initDB(id, key) {
  userId = id; cryptoKey = key;
  for (const c of COLLECTIONS) cache[c] = new Map();
  try {
    idb = await openIDB();
    for (const c of COLLECTIONS) {
      const rows = (await tx(c, 'readonly', (s) => s.getAll())) || [];
      const objs = await Promise.all(rows.map((r) => open(c, r)));
      cache[c] = new Map(objs.map((o) => [o.id, o]));
    }
  } catch (e) {
    if (e?.name === 'OperationError') throw new Error('Não foi possível descriptografar os dados desta conta.');
    console.warn('Usando localStorage como armazenamento:', e);
    useLocal = true;
    for (const c of COLLECTIONS) {
      try {
        const rows = JSON.parse(ls.get('ed:data:' + c) || '[]');
        const objs = await Promise.all(rows.map((r) => open(c, r)));
        cache[c] = new Map(objs.map((o) => [o.id, o]));
      } catch { cache[c] = new Map(); }
    }
  }
  // Pede ao navegador para não apagar os dados em caso de pouco espaço.
  try { await navigator.storage?.persist?.(); } catch {}
}

/** Regrava todos os registros com uma nova chave (troca de senha). */
export async function rekey(newKey) {
  cryptoKey = newKey;
  for (const c of COLLECTIONS) {
    const sealed = await Promise.all(all(c).map((o) => seal(c, o)));
    if (useLocal) await saveLocal(c);
    else await tx(c, 'readwrite', (s) => { s.clear(); for (const r of sealed) s.put(r); });
  }
}

/** Apaga o banco inteiro de uma conta (ao excluir a conta). */
export async function deleteUserData(id) {
  if (id === userId && idb) { idb.close(); idb = null; }
  await new Promise((r) => { try { const q = indexedDB.deleteDatabase(dbName(id)); q.onsuccess = q.onerror = q.onblocked = () => r(); } catch { r(); } });
  try {
    const prefix = `ed:u:${id}:`;
    for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k?.startsWith(prefix)) localStorage.removeItem(k); }
  } catch {}
}

// ---------- dados da versão antiga (sem login) ----------
/** Lê os dados que existiam antes do login (em texto puro), se houver. */
export async function readLegacy() {
  const data = {};
  let n = 0;
  try {
    const dbs = await indexedDB.databases?.();
    if (dbs && !dbs.some((d) => d.name === LEGACY_DB_NAME)) return null;
    const conn = await openIDB(LEGACY_DB_NAME);
    for (const c of COLLECTIONS) { data[c] = (await tx(c, 'readonly', (s) => s.getAll(), conn)) || []; n += data[c].length; }
    conn.close();
  } catch { return null; }
  if (!n) return null;
  let settings = null;
  try { settings = JSON.parse(rawLs.get('ed:settings') || 'null'); } catch {}
  return { format: BACKUP_FORMAT, version: 1, data, settings, apiKey: rawLs.get('ed:apiKey') };
}
export async function deleteLegacy() {
  await new Promise((r) => { try { const q = indexedDB.deleteDatabase(LEGACY_DB_NAME); q.onsuccess = q.onerror = q.onblocked = () => r(); } catch { r(); } });
  for (const k of ['ed:settings', 'ed:apiKey', 'ed:pomo', 'ed:lastBackup', ...COLLECTIONS.map((c) => 'ed:data:' + c)]) rawLs.remove(k);
}

// ---------- chave da sessão ("manter conectada") ----------
// A chave AES é guardada como objeto CryptoKey NÃO exportável: dá para usar, mas não para copiar.
async function authDb() { return openIDB(AUTH_DB_NAME, ['keys']); }
export async function saveSessionKey(id, key) {
  try { const c = await authDb(); await tx('keys', 'readwrite', (s) => s.put({ id, key }), c); c.close(); return true; } catch { return false; }
}
export async function loadSessionKey(id) {
  try { const c = await authDb(); const r = await tx('keys', 'readonly', (s) => s.get(id), c); c.close(); return r?.key || null; } catch { return null; }
}
export async function clearSessionKey(id) {
  try { const c = await authDb(); await tx('keys', 'readwrite', (s) => s.delete(id), c); c.close(); } catch {}
}

// ---------- leitura (síncrona, da memória) ----------
export const all = (col) => [...cache[col].values()];
export const get = (col, id) => cache[col].get(id);
export const where = (col, pred) => all(col).filter(pred);

// ---------- escrita ----------
export async function put(col, obj) {
  if (!obj.id) obj.id = uid();
  if (!obj.createdAt) obj.createdAt = Date.now();
  obj.updatedAt = Date.now();
  cache[col].set(obj.id, obj);
  if (useLocal) await saveLocal(col);
  else { const rec = await seal(col, obj); await tx(col, 'readwrite', (s) => s.put(rec)); }
  emit(col);
  return obj;
}

export async function putMany(col, arr) {
  const now = Date.now();
  for (const o of arr) {
    if (!o.id) o.id = uid();
    if (!o.createdAt) o.createdAt = now;
    o.updatedAt = now;
    cache[col].set(o.id, o);
  }
  if (useLocal) await saveLocal(col);
  else { const recs = await Promise.all(arr.map((o) => seal(col, o))); await tx(col, 'readwrite', (s) => { for (const r of recs) s.put(r); }); }
  emit(col);
  return arr;
}

export async function remove(col, id) {
  cache[col].delete(id);
  if (useLocal) await saveLocal(col); else await tx(col, 'readwrite', (s) => s.delete(id));
  emit(col);
}

export async function removeMany(col, ids) {
  for (const id of ids) cache[col].delete(id);
  if (useLocal) await saveLocal(col);
  else await tx(col, 'readwrite', (s) => { for (const id of ids) s.delete(id); });
  emit(col);
}

export async function clearCollection(col) {
  cache[col].clear();
  if (useLocal) await saveLocal(col); else await tx(col, 'readwrite', (s) => s.clear());
}

export async function clearAll() {
  for (const c of COLLECTIONS) await clearCollection(c);
  emit('*');
}

// ---------- notificação de mudanças ----------
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(col) { for (const fn of listeners) { try { fn(col); } catch (e) { console.error(e); } } }

// ---------- configurações ----------
export const DEFAULT_SETTINGS = {
  theme: 'auto',            // 'auto' | 'light' | 'dark'
  readerSize: 19,           // px
  readerFont: 'serif',      // 'serif' | 'sans'
  readerLineHeight: 1.7,
  newCardsPerDay: 20,
  pomoFocus: 25, pomoShort: 5, pomoLong: 15, pomoCycles: 4,
  planDailyMinutes: 240, planBlockMinutes: 50, planBreakMinutes: 10, planStartTime: '08:00',
  planSkipWeekdays: [0],    // (antigo) dias sem estudo — substituído por dayWindows
  planReviewDayBefore: true,
  dayWindows: null,         // [{start, end, off}] por dia da semana (0 = dom); null = derivar dos campos antigos
  planMaxSession: 0,        // duração máxima de uma sessão sem pausa (0 = sem limite)
  planGenericMinutes: 60,   // duração das sessões "Estudar <matéria>" (sem guia)
  routineBuffer: 15,        // folga (min) antes e depois de cada compromisso da rotina
  showRoutine: true,        // mostrar a rotina na agenda
  apiModel: 'claude-opus-5-5',
};

export function getSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(ls.get('ed:settings') || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function setSettings(patch) {
  const s = { ...getSettings(), ...patch };
  ls.set('ed:settings', JSON.stringify(s));
  emit('settings');
  return s;
}

// ---------- backup ----------
export function exportData() {
  const data = {};
  for (const c of COLLECTIONS) data[c] = all(c);
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    settings: getSettings(),
    data,
  };
}

/**
 * Restaura um backup. mode = 'replace' (apaga tudo antes) ou 'merge'
 * (mantém o que existe e sobrescreve itens com o mesmo id).
 */
export async function importData(json, mode = 'replace') {
  if (!json || json.format !== BACKUP_FORMAT || typeof json.data !== 'object') {
    throw new Error('Arquivo não é um backup válido deste aplicativo.');
  }
  if (mode === 'replace') for (const c of COLLECTIONS) await clearCollection(c);
  for (const c of COLLECTIONS) {
    const rows = Array.isArray(json.data[c]) ? json.data[c].filter((r) => r && r.id) : [];
    for (const r of rows) cache[c].set(r.id, r);
    if (useLocal) await saveLocal(c);
    else if (rows.length) { const recs = await Promise.all(rows.map((r) => seal(c, r))); await tx(c, 'readwrite', (s) => { for (const r of recs) s.put(r); }); }
  }
  if (json.settings && typeof json.settings === 'object') {
    const { apiKey, ...rest } = json.settings; // nunca importar chave por engano
    ls.set('ed:settings', JSON.stringify({ ...getSettings(), ...rest }));
  }
  emit('*');
}
