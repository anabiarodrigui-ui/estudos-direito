/**
 * Ponto de entrada: inicializa o banco, desenha a navegação e faz o roteamento por hash.
 * Rotas: #/ (início), #/agenda, #/resumos, #/guia/<id>, #/cartoes, #/estudar,
 *        #/pomodoro, #/estatisticas, #/materias, #/config, #/mais
 */
import * as db from './core/db.js';
import { icon } from './ui/icons.js';
import { toast } from './ui/dom.js';

// Cada rota carrega sua tela sob demanda (import dinâmico).
const ROUTES = {
  '': () => import('./views/dashboard.js'),
  agenda: () => import('./views/calendar.js'),
  materias: () => import('./views/subjects.js'),
  resumos: () => import('./views/library.js'),
  guia: () => import('./views/reader.js'),
  cartoes: () => import('./views/flashcards.js'),
  estudar: () => import('./views/study.js'),
  pomodoro: () => import('./views/pomodoro.js'),
  estatisticas: () => import('./views/stats.js'),
  config: () => import('./views/settings.js'),
  mais: () => import('./views/more.js'),
};

const NAV = [
  { path: '', label: 'Início', icon: 'home' },
  { path: 'agenda', label: 'Agenda', icon: 'calendar' },
  { path: 'resumos', label: 'Resumos', icon: 'book' },
  { path: 'cartoes', label: 'Cartões', icon: 'cards' },
  { path: 'pomodoro', label: 'Pomodoro', icon: 'timer', extra: true },
  { path: 'estatisticas', label: 'Estatísticas', icon: 'chart', extra: true },
  { path: 'materias', label: 'Matérias', icon: 'subjects', extra: true },
  { path: 'config', label: 'Configurações', icon: 'settings', extra: true },
  { path: 'mais', label: 'Mais', icon: 'more', more: true },
];
// Telas acessadas a partir de "Mais" acendem o ícone "Mais" na barra inferior.
const UNDER_MORE = ['pomodoro', 'estatisticas', 'materias', 'config'];

/** Lê a rota atual: { path, id, params } */
export function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [p, q = ''] = raw.split('?');
  const [path, ...rest] = p.split('/');
  return { path: path || '', id: rest.length ? decodeURIComponent(rest.join('/')) : null, params: Object.fromEntries(new URLSearchParams(q)) };
}

/** Navega para uma rota (ex.: go('agenda', {view:'day', date:'2026-11-06'})). */
export function go(path, params = null, { replace = false } = {}) {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  const h = '#/' + path + q;
  if (replace) history.replaceState(null, '', h); else location.hash = h;
  if (replace) route();
}

function renderNav() {
  const { path } = currentRoute();
  const activePath = path === 'guia' ? 'resumos' : path === 'estudar' ? 'cartoes' : path;
  const nav = document.getElementById('nav');
  nav.innerHTML = `<div class="brand"><img src="icons/icon.svg" alt=""> Estudos</div>` + NAV.map((n) => {
    const cur = n.path === activePath || (n.more && UNDER_MORE.includes(activePath) && innerWidth < 900);
    return `<a href="#/${n.path}" class="${n.extra ? 'nav-extra' : ''} ${n.more ? 'nav-more' : ''}" ${cur ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></a>`;
  }).join('');
}

let current = null;     // { mod, handle } da tela atual

/** Substitui o contêiner da tela por um novo (descarta listeners da tela anterior). */
function freshRoot() {
  const old = document.getElementById('view');
  const el = old.cloneNode(false);
  old.replaceWith(el);
  return el;
}
let renderToken = 0;

/**
 * Monta a tela da rota r. Navegação e redesenhos passam todos por aqui, em ordem:
 * um pedido mais novo cancela um anterior que ainda esteja carregando.
 */
async function mount(r, { keepScroll = false } = {}) {
  const token = ++renderToken;
  const mod = await (ROUTES[r.path] || ROUTES[''])();
  if (token !== renderToken) return;
  try { current?.handle?.destroy?.(); } catch (e) { console.error(e); }
  const y = window.scrollY;
  const root = freshRoot();
  current = { mod, handle: {}, route: r };
  current.handle = mod.render(root, r) || {};
  window.scrollTo(0, keepScroll ? y : 0);
}

function route() {
  clearTimeout(refreshTimer);
  renderNav();
  return mount(currentRoute());
}

/** Redesenha a tela atual (após alterações nos dados), preservando a rolagem. */
let refreshTimer = null;
export function refresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (!current) return;
    if (current.handle.keep) { current.handle.onData?.(); return; }
    mount(currentRoute(), { keepScroll: true });
  }, 30);
}

export function applyTheme() {
  const t = db.getSettings().theme;
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name=theme-color]').forEach((m) => m.setAttribute('content', dark ? '#16181c' : '#f7f6f3'));
}

async function start() {
  await db.initDB();
  applyTheme();
  db.subscribe((col) => { if (col === 'settings') applyTheme(); refresh(); });
  addEventListener('hashchange', route);
  addEventListener('resize', () => renderNav());
  await route();
  // Pomodoro em andamento continua aparecendo em qualquer tela.
  import('./views/pomodoro.js').then((m) => m.initPill?.());

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').then((reg) => {
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) toast('Nova versão disponível — feche e abra o app para atualizar.', 5000);
        });
      });
    }).catch((e) => console.warn('SW', e));
  }
}

start().catch((e) => {
  console.error(e);
  document.getElementById('view').innerHTML = `<div class="card"><h2>Erro ao iniciar</h2><p>${String(e.message || e)}</p></div>`;
});
