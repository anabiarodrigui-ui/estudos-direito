/** Configurações: tema, backup, flashcards, chave da API, dados de exemplo e apagar tudo. */
import * as db from '../core/db.js';
import { ls } from '../core/db.js';
import { esc, toast, confirmDialog, downloadFile, pickFiles, openModal } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { todayISO, fmtBR } from '../core/dates.js';
import { API_MODELS } from '../core/ai.js';
import { refresh } from '../app.js';
import { currentAccount, logout, openChangePassword, openDeleteAccount, getAccounts } from './login.js';

export function render(root) {
  const s = db.getSettings();
  const hasKey = !!ls.get('ed:apiKey');
  const lastBackup = ls.get('ed:lastBackup');
  const counts = db.COLLECTIONS.map((c) => [c, db.all(c).length]);
  const sampleCount = db.COLLECTIONS.reduce((a, c) => a + db.where(c, (x) => x.sample).length, 0);

  root.innerHTML = `
    <div class="page-head"><h1>Configurações</h1></div>

    <div class="card stack">
      <h2>Conta</h2>
      <p class="mb0">${icon('user')} Conta: <b>${esc(currentAccount()?.email || '')}</b></p>
      <p class="small muted">Seus dados ficam só neste aparelho, criptografados com a sua senha. ${getAccounts().length > 1 ? `Este aparelho tem ${getAccounts().length} contas; cada uma só vê os próprios dados.` : 'Outras pessoas podem criar a própria conta neste aparelho na tela de entrada.'}</p>
      <div class="btn-row">
        <button class="btn" data-logout>${icon('logout')} Sair</button>
        <button class="btn" data-chpw>${icon('lock')} Trocar senha</button>
        <button class="btn danger" data-delacc>${icon('trash')} Excluir minha conta</button>
      </div>
    </div>

    <div class="card stack">
      <h2>Aparência</h2>
      <div class="seg" role="group" aria-label="Tema">
        ${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => `<button data-set-theme="${v}" aria-pressed="${s.theme === v}">${l}</button>`).join('')}
      </div>
    </div>

    <div class="card stack">
      <h2>Backup</h2>
      <p class="small muted">Exporte um backup com frequência e importe para restaurar ou passar para outro dispositivo. <b>Atenção:</b> o arquivo de backup não é protegido por senha — guarde-o num lugar só seu (como o seu Google Drive).
      ${lastBackup ? `Último backup: <b>${fmtBR(lastBackup)}</b>.` : '<b>Você ainda não fez nenhum backup.</b>'}</p>
      <div class="btn-row">
        <button class="btn primary" data-export>${icon('download')} Exportar backup (JSON)</button>
        <button class="btn" data-import>${icon('upload')} Importar backup</button>
      </div>
      <p class="small muted">Itens salvos: ${counts.map(([c, n]) => `${LABELS[c]} ${n}`).join(' · ')}</p>
    </div>

    <div class="card stack">
      <h2>Flashcards</h2>
      <label class="field mb0"><span>Cartões novos por dia</span>
        <input class="input" type="number" min="0" max="500" name="newCardsPerDay" value="${s.newCardsPerDay}" style="max-width:160px"></label>
    </div>

    <div class="card stack">
      <h2>Geração com IA (opcional)</h2>
      <p class="small muted">Cole sua chave da API da Anthropic para gerar flashcards de alta qualidade a partir de um guia com um toque.
      A chave fica <b>somente neste dispositivo</b> (não vai para o backup) e é enviada apenas para api.anthropic.com. O uso é cobrado na sua conta da Anthropic.</p>
      <label class="field"><span>Chave da API ${hasKey ? '<span class="badge ok">salva</span>' : ''}</span>
        <input class="input" type="password" name="apiKey" autocomplete="off" placeholder="${hasKey ? '•••••••• (deixe em branco para manter)' : 'sk-ant-...'}"></label>
      <label class="field"><span>Modelo</span><select class="input" name="apiModel">
        ${API_MODELS.map((m) => `<option value="${m.id}" ${m.id === s.apiModel ? 'selected' : ''}>${m.label}</option>`).join('')}
      </select></label>
      <div class="btn-row">
        <button class="btn primary" data-savekey>Salvar</button>
        ${hasKey ? `<button class="btn danger" data-delkey>Remover chave</button>` : ''}
      </div>
    </div>

    <div class="card stack">
      <h2>Dados de exemplo</h2>
      <p class="small muted">Duas matérias, um guia de estudo, eventos e alguns flashcards para testar o app.</p>
      <div class="btn-row">
        <button class="btn" data-sample>Carregar exemplos</button>
        ${sampleCount ? `<button class="btn danger" data-unsample>Remover exemplos (${sampleCount} itens)</button>` : ''}
      </div>
    </div>

    <div class="card stack">
      <h2>Zona de perigo</h2>
      <p class="small muted">Apaga todas as matérias, eventos, guias, destaques, flashcards e registros <b>da sua conta</b>. Faça um backup antes.</p>
      <button class="btn danger solid" data-wipe>${icon('trash')} Apagar tudo</button>
    </div>

    <p class="small muted mt">Estudos de Direito · funciona offline · dados locais e criptografados (IndexedDB + AES-GCM).</p>
  `;

  root.addEventListener('click', async (e) => {
    const t = e.target;
    const th = t.closest("[data-set-theme]");
    if (th) { db.setSettings({ theme: th.dataset.setTheme }); return; }
    if (t.closest('[data-export]')) {
      const data = db.exportData();
      downloadFile(`estudos-direito-backup-${todayISO()}.json`, JSON.stringify(data, null, 1));
      ls.set('ed:lastBackup', todayISO());
      toast('Backup exportado');
      return refresh();
    }
    if (t.closest('[data-import]')) return importBackup();
    if (t.closest('[data-logout]')) return logout();
    if (t.closest('[data-chpw]')) return openChangePassword();
    if (t.closest('[data-delacc]')) return openDeleteAccount();
    if (t.closest('[data-savekey]')) {
      const k = root.querySelector('[name=apiKey]').value.trim();
      if (k) ls.set('ed:apiKey', k);
      db.setSettings({ apiModel: root.querySelector('[name=apiModel]').value });
      return toast(k ? 'Chave salva neste dispositivo' : 'Modelo salvo');
    }
    if (t.closest('[data-delkey]')) { ls.remove('ed:apiKey'); db.setSettings({}); return toast('Chave removida'); }
    if (t.closest('[data-sample]')) { const m = await import('../sample.js'); return m.loadSample(); }
    if (t.closest('[data-unsample]')) {
      if (!(await confirmDialog('Remover todos os itens de exemplo? Seus próprios dados não serão afetados.', { ok: 'Remover', danger: true }))) return;
      const m = await import('../sample.js'); await m.removeSample(); return toast('Exemplos removidos');
    }
    if (t.closest('[data-wipe]')) {
      if (!(await confirmDialog('Tem certeza? <b>Todos os dados da sua conta</b> serão apagados. Isso não pode ser desfeito.', { ok: 'Apagar tudo', danger: true }))) return;
      await db.clearAll();
      toast('Todos os dados foram apagados');
    }
  });
  root.querySelector('[name=newCardsPerDay]').addEventListener('change', (e) => {
    db.setSettings({ newCardsPerDay: Math.max(0, +e.target.value || 0) });
    toast('Salvo');
  });
}

const LABELS = { subjects: 'matérias', events: 'eventos', guides: 'guias', highlights: 'destaques', cards: 'cartões', reviews: 'revisões', sessions: 'sessões' };

async function importBackup() {
  const [file] = await pickFiles('.json,application/json', false);
  if (!file) return;
  let json;
  try { json = JSON.parse(file.text); } catch { return toast('Arquivo JSON inválido'); }
  if (json.format !== db.BACKUP_FORMAT) return toast('Este arquivo não é um backup deste app');
  const n = Object.entries(json.data || {}).map(([c, rows]) => `${LABELS[c] || c}: ${rows.length}`).join(' · ');
  openModal({
    title: 'Importar backup',
    body: `<p>Backup de <b>${esc(new Date(json.exportedAt).toLocaleString('pt-BR'))}</b></p><p class="small muted">${esc(n)}</p>
      <p><b>Substituir</b> apaga os dados atuais e restaura o backup. <b>Mesclar</b> mantém os dados atuais e acrescenta/atualiza os do backup.</p>`,
    actions: [
      { label: 'Cancelar' },
      { label: 'Mesclar', onClick: async () => { await db.importData(json, 'merge'); toast('Backup mesclado'); } },
      { label: 'Substituir', cls: 'danger solid', onClick: async () => { await db.importData(json, 'replace'); toast('Backup restaurado'); } },
    ],
  });
}
