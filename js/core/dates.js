/**
 * Utilitários de data — sem dependência do DOM (testáveis no Node).
 * Datas do app são guardadas como texto ISO local "AAAA-MM-DD" para evitar
 * problemas de fuso horário. Horários como "HH:MM".
 */

const pad = (n) => String(n).padStart(2, '0');

/** Date -> "AAAA-MM-DD" (horário local). */
export function toISO(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "AAAA-MM-DD" -> Date à meia-noite local. */
export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now = new Date()) { return toISO(now); }

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function addMonths(iso, n) {
  const d = parseISO(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toISO(d);
}

/** Número de dias de a até b (b - a). Usa UTC para ignorar horário de verão. */
export function diffDays(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

/** Dia da semana: 0 = domingo ... 6 = sábado. */
export function weekday(iso) { return parseISO(iso).getDay(); }

/** Segunda-feira da semana que contém iso. */
export function weekStart(iso) {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function monthStart(iso) { return iso.slice(0, 8) + '01'; }

/** Lista de datas ISO de a até b (inclusive). */
export function range(a, b) {
  const out = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

/** "HH:MM" -> minutos desde meia-noite. */
export function timeToMin(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}
export function minToTime(min) { return `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`; }

// ---------- formatação pt-BR ----------
export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const WEEKDAYS_LONG = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "sexta-feira, 6 de novembro" */
export function fmtLong(iso) {
  const d = parseISO(iso);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}
/** "06/11" */
export function fmtShort(iso) { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; }
/** "06/11/2026" */
export function fmtBR(iso) { return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`; }
export function fmtMonth(iso) { const d = parseISO(iso); return `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`; }

/** Texto amigável de contagem regressiva. */
export function countdownText(days) {
  if (days < 0) return days === -1 ? 'ontem' : `há ${-days} dias`;
  if (days === 0) return 'HOJE';
  if (days === 1) return 'amanhã';
  return `em ${days} dias`;
}

/** Minutos -> "1h30" / "45 min". */
export function fmtMinutes(min) {
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h}h${pad(m)}` : `${h}h`;
}
