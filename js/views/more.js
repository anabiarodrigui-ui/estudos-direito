/** Tela "Mais" (no celular/tablet em retrato): atalhos para as demais seções. */
import { icon } from '../ui/icons.js';

const ITEMS = [
  ['pomodoro', 'timer', 'Pomodoro', 'Timer de foco vinculado à matéria'],
  ['estatisticas', 'chart', 'Estatísticas', 'Horas, flashcards e tarefas da semana'],
  ['materias', 'subjects', 'Matérias', 'Cadastrar matérias e datas de prova'],
  ['config', 'settings', 'Configurações', 'Tema, backup, chave da API, dados de exemplo'],
];

export function render(root) {
  root.innerHTML = `<div class="page-head"><h1>Mais</h1></div>
    <div class="card"><ul class="list">${ITEMS.map(([p, i, t, d]) => `
      <li><a class="row" href="#/${p}" style="text-decoration:none;color:inherit">${icon(i)}
        <span class="grow"><span class="title">${t}</span><br><span class="small muted">${d}</span></span>${icon('right')}</a></li>`).join('')}
    </ul></div>`;
}
