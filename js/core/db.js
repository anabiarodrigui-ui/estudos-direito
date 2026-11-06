/**
 * Camada de dados.
 * - Tudo fica no próprio dispositivo, em IndexedDB (com fallback para localStorage).
 * - Na inicialização carregamos todas as coleções para a memória (são poucos dados),
 *   assim as telas leem de forma síncrona e rápida; cada alteração é gravada no banco.
 * - Configurações ficam em localStorage (chave "ed:settings"); a chave da API da
 *   Anthropic fica separada ("ed:apiKey") e NUNCA entra no backup.
 */

export const DB_NAME = 'estudos-direito';
export const DB_VERSION = 1;
export const COLLECTIONS = ['subjects', 'events', 'guides', 'highlights', 'cards', 'reviews', 'sessions'];
export const BACKUP_FORMAT = 'estudos-direito-backup';

const cache = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()]));
const listeners = new Set();
let idb = null;          // conexão IndexedDB (ou null se indisponível)
let useLocal = false;    // fallback localStorage

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function openIDB() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('IndexedDB indisponível'));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const c of COLLECTIONS) if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(col, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = idb.transaction(col, mode);
    const store = t.objectStore(col);
    const r = fn(store);
    t.oncomplete = () => resolve(r?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

function saveLocal(col) {
  localStorage.setItem('ed:data:' + col, JSON.stringify([...cache[col].values()]));
}

/** Abre o banco e carrega tudo para a memória. */
export async function initDB() {
  try {
    idb = await openIDB();
    for (const c of COLLECTIONS) {
      const rows = await tx(c, 'readonly', (s) => s.getAll());
      cache[c] = new Map((rows || []).map((r) => [r.id, r]));
    }
  } catch (e) {
    console.warn('Usando localStorage como armazenamento:', e);
    useLocal = true;
    for (const c of COLLECTIONS) {
      try {
        const rows = JSON.parse(localStorage.getItem('ed:data:' + c) || '[]');
        cache[c] = new Map(rows.map((r) => [r.id, r]));
      } catch { cache[c] = new Map(); }
    }
  }
  // Pede ao navegador para não apagar os dados em caso de pouco espaço.
  try { await navigator.storage?.persist?.(); } catch {}
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
  if (useLocal) saveLocal(col); else await tx(col, 'readwrite', (s) => s.put(obj));
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
  if (useLocal) saveLocal(col);
  else await tx(col, 'readwrite', (s) => { for (const o of arr) s.put(o); });
  emit(col);
  return arr;
}

export async function remove(col, id) {
  cache[col].delete(id);
  if (useLocal) saveLocal(col); else await tx(col, 'readwrite', (s) => s.delete(id));
  emit(col);
}

export async function removeMany(col, ids) {
  for (const id of ids) cache[col].delete(id);
  if (useLocal) saveLocal(col);
  else await tx(col, 'readwrite', (s) => { for (const id of ids) s.delete(id); });
  emit(col);
}

export async function clearCollection(col) {
  cache[col].clear();
  if (useLocal) saveLocal(col); else await tx(col, 'readwrite', (s) => s.clear());
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
  planSkipWeekdays: [0],    // não planejar aos domingos
  planReviewDayBefore: true,
  apiModel: 'claude-opus-5-5',
};

export function getSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('ed:settings') || '{}') }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}
export function setSettings(patch) {
  const s = { ...getSettings(), ...patch };
  localStorage.setItem('ed:settings', JSON.stringify(s));
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
    if (useLocal) saveLocal(c);
    else if (rows.length) await tx(c, 'readwrite', (s) => { for (const r of rows) s.put(r); });
  }
  if (json.settings && typeof json.settings === 'object') {
    const { apiKey, ...rest } = json.settings; // nunca importar chave por engano
    localStorage.setItem('ed:settings', JSON.stringify({ ...getSettings(), ...rest }));
  }
  emit('*');
}
