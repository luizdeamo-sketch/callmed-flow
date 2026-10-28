/* CallMed Flow — tela principal no padrão do CRM Aliança: barra de topo, Jornada (linha do tempo) e Kanban; e Indicadores */
'use strict';

const F = {
  search: '', hospitals: [], setor: '', estado: '', stage: '', disc: '', statusEsp: '', app: '', procuracao: '', priority: '', slaVencido: false,
  next: '', resp: '', mine: false, entDe: '', entAte: '',
};
/** Dia de entrada do médico no fluxo (data do cadastro), no fuso local, como 'aaaa-mm-dd'. */
function entradaYmd(d) { const v = d.entry_date || d.created_at; return v ? ymd(new Date(v)) : ''; }
const dataBr = (s) => String(s || '').split('-').reverse().join('/');
const FX = { sumOpen: true, mode: 'jornada', gran: 'dia', offset: 0, limit: 300, showDone: false, sort: 'sla', filtersOpen: false, cell: null };
try { FX.sumOpen = localStorage.getItem('flow:sum') !== 'false'; } catch (_) { /* ignora */ }

// ---------- período da Jornada (atalhos, início/fim e "visualizar por") ----------
const PER_PRESETS = [
  ['7d', 'Últimos 7 dias', 'dia'], ['mes', 'Este mês', 'dia'], ['30d', 'Últimos 30 dias', 'dia'],
  ['mespassado', 'Mês passado', 'dia'], ['3m', 'Últimos 3 meses', 'semana'], ['12m', 'Últimos 12 meses', 'mes'], ['ano', 'Este ano', 'mes'],
];
const GRAN_LABEL = { dia: 'por dia', semana: 'por semana', mes: 'por mês' };
function presetRange(key) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const d = (y, m, dd) => new Date(y, m, dd);
  const back = (n) => { const x = new Date(t); x.setDate(x.getDate() - n); return x; };
  switch (key) {
    case '7d': return [back(6), t];
    case 'mes': return [d(t.getFullYear(), t.getMonth(), 1), t];
    case 'mespassado': return [d(t.getFullYear(), t.getMonth() - 1, 1), d(t.getFullYear(), t.getMonth(), 0)];
    case '3m': return [d(t.getFullYear(), t.getMonth() - 3, t.getDate() + 1), t];
    case '12m': return [d(t.getFullYear() - 1, t.getMonth() + 1, 1), t];
    case 'ano': return [d(t.getFullYear(), 0, 1), t];
    default: return [back(29), t];
  }
}
function ymdToDate(v) { const [y, m, dd] = String(v).split('-').map(Number); return new Date(y, m - 1, dd); }
FX.per = { preset: '30d', start: null, end: null, gran: 'dia' };
try { const saved = JSON.parse(localStorage.getItem('flow:periodo') || 'null'); if (saved && saved.gran) FX.per = saved; } catch (_) { /* ignora */ }
/** Datas efetivas: atalhos são recalculados a cada dia ("últimos 30 dias" acompanha o calendário). */
function perRange() {
  if (FX.per.preset !== 'custom' || !FX.per.start || !FX.per.end) return presetRange(FX.per.preset);
  return [ymdToDate(FX.per.start), ymdToDate(FX.per.end)];
}
function savePer() { try { localStorage.setItem('flow:periodo', JSON.stringify(FX.per)); } catch (_) { /* ignora */ } }
Object.defineProperty(FX, 'gran', { get() { return FX.per.gran; }, configurable: true });
try { FX.mode = localStorage.getItem('flow:mode') || 'jornada'; } catch (_) { /* ignora */ }
const colLimit = {}; // etapa -> quantos cards mostrar no Kanban
let STAGE_EV = null;  // histórico de etapas por médico (para a Jornada)

function filteredDoctors() {
  const q = norm(F.search);
  return S.doctors.filter((d) => {
    if (q && !(norm(d.name).includes(q) || norm(d.crm).includes(q) || norm(d.cpf).includes(q) || norm(d.hospital).includes(q) || norm(d.whatsapp).includes(q) || norm((d.setores || []).join(' ')).includes(q))) return false;
    if (F.hospitals.length && !F.hospitals.includes(d.hospital)) return false;
    if (F.entDe || F.entAte) { const e = entradaYmd(d); if (!e || (F.entDe && e < F.entDe) || (F.entAte && e > F.entAte)) return false; }
    if (F.setor && !(d.setores || []).includes(F.setor)) return false;
    if (F.estado && d.estado !== F.estado) return false;
    if (F.stage && d.stage !== F.stage) return false;
    if (F.disc && d.disc !== F.disc) return false;
    if (F.statusEsp && d.status_especialidade !== F.statusEsp) return false;
    if (F.app && String(d.app) !== F.app) return false;
    if (F.procuracao && String(d.procuracao) !== F.procuracao) return false;
    if (F.priority && d.priority !== F.priority) return false;
    if (F.slaVencido && (FINAL_STAGES.includes(d.stage) || doctorSla(d).status !== 'urgent')) return false;
    if (F.next) {
      if (FINAL_STAGES.includes(d.stage)) return false;
      const n = daysTo(d.proxima_data);
      if (F.next === 'sem' && d.proxima_acao) return false;
      if (F.next !== 'sem' && (!d.proxima_acao || n === null)) return false;
      if (F.next === 'atrasada' && n >= 0) return false;
      if (F.next === 'hoje' && n !== 0) return false;
      if (F.next === 'ate_hoje' && n > 0) return false;
      if (F.next === 'semana' && (n < 0 || n > 7)) return false;
    }
    if (F.mine && d.created_by !== S.user.id) return false;
    if (F.resp && (F.resp === 'me' ? d.proximo_responsavel_id !== S.user.id : d.proximo_responsavel_id !== F.resp)) return false;
    return true;
  });
}
function activeFilterCount() {
  return [F.hospitals.length, F.entDe || F.entAte, F.setor, F.estado, F.stage, F.disc, F.statusEsp, F.app, F.procuracao, F.priority, F.slaVencido, F.next, F.resp, F.mine].filter(Boolean).length;
}

// ================= estrutura da tela =================
function renderFluxo() {
  const root = $('#view-fluxo');
  if (!root.dataset.built) {
    root.dataset.built = '1';
    root.innerHTML = `
      <div class="op-top">
        <div class="op-filters">
          <input id="f-search" placeholder="Buscar nome, CRM, CPF, hospital ou telefone" aria-label="Buscar médico">
          <div style="position:relative" id="f-hosp-wrap"><div id="fx-hosp-top" style="display:contents"></div></div>
          <button id="f-toggle">${ic('sliders', 15)}Filtros<span id="f-count" class="op-fcount" hidden></span></button>
          <div class="seg-toggle" id="fx-mode"><button data-mode="jornada">Jornada</button><button data-mode="kanban">Kanban</button></div>
          <div style="position:relative" id="fx-per-wrap">
            <button id="fx-per-btn" class="per-btn" title="Escolher o período da Jornada">${ic('calendar', 15)}<span id="fx-range"></span></button>
            <div class="per-pop" id="fx-per-pop" hidden></div>
          </div>
          <span style="flex:1"></span>
          <button id="fx-hot" title="Prioridades da semana: quem cobrar primeiro">${ic('flame', 15)}Prioridades</button>
          <button id="fx-msg" title="Disparar cobranças e avisos" aria-label="Disparar cobranças">${ic('mail', 15)}</button>
          <button id="fx-export" title="Exportar os médicos filtrados (você escolhe as colunas)">${ic('download', 15)}Exportar</button>
          <button class="btn-new" id="fx-new">${ic('plus', 15)}Novo médico</button>
        </div>
        <div class="op-kpirow" id="fx-kpis"></div>
        <div class="op-filters" id="fx-chip" hidden></div>
        <div class="op-filters-more" id="fx-more"></div>
      </div>
      <div id="fx-body"></div>`;
    let t;
    $('#f-search').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { F.search = e.target.value; refreshFluxo(); }, 180); };
    $('#f-toggle').onclick = () => { FX.filtersOpen = !FX.filtersOpen; $('#fx-more').classList.toggle('open', FX.filtersOpen); };
    $$('#fx-mode button').forEach((b) => b.onclick = () => {
      FX.mode = b.dataset.mode;
      try { localStorage.setItem('flow:mode', FX.mode); } catch (_) { /* ignora */ }
      refreshFluxo();
    });
    $('#fx-per-btn').onclick = (e) => { e.stopPropagation(); const p = $('#fx-per-pop'); p.hidden = !p.hidden; if (!p.hidden) renderPerPop(); };
    document.addEventListener('click', (e) => { const p = $('#fx-per-pop'); if (p && !p.hidden && !e.target.closest('#fx-per-wrap')) p.hidden = true; });
    $('#fx-msg').onclick = () => openMessages();
    $('#fx-new').onclick = () => openNewDoctor();
    $('#fx-export').onclick = exportDialog;
    $('#fx-hot').onclick = openPrioridades;
    buildFilters();
    document.addEventListener('click', (e) => { const p = $('#f-hosp-pop'); if (p && !e.target.closest('#f-hosp-wrap')) p.hidden = true; });
  }
  refreshFluxo();
}
VIEWS.fluxo = renderFluxo;

async function refreshFluxo() {
  if (!$('#fx-body')) return;
  renderKpis();
  syncFilterWidgets();
  $$('#fx-mode button').forEach((b) => b.classList.toggle('active', b.dataset.mode === FX.mode));
  $('#fx-per-wrap').hidden = FX.mode !== 'jornada';
  { const [a, b] = perRange(); $('#fx-range').textContent = `${fmtDate(a)} – ${fmtDate(b)} · ${GRAN_LABEL[FX.gran]}`; }
  renderCellChip();
  const body = $('#fx-body');
  body.classList.toggle('kb', FX.mode === 'kanban');
  const list = filteredDoctors();
  if (FX.mode === 'kanban') { renderBoard(list); return; }
  if (!STAGE_EV) {
    body.innerHTML = '<div class="op-more">Carregando jornada...</div>';
    try { STAGE_EV = stageEvents(await loadAllActivities()); } catch (e) { body.innerHTML = `<div class="op-more">Erro ao carregar histórico: ${esc(e.message)}</div>`; return; }
  }
  renderJornada(list);
}

// ---------- KPIs em pílula ----------
function renderKpis() {
  const all = S.doctors;
  const open = all.filter((d) => !FINAL_STAGES.includes(d.stage));
  const venc = open.filter((d) => doctorSla(d).status === 'urgent').length;
  const pct = open.length ? Math.round(((open.length - venc) / open.length) * 100) : 100;
  const n = filteredDoctors().length;
  const mine = nextCounts(true), team = nextCounts(false);
  ['#fx-hoje-n', '#rail-hoje-n'].forEach((sel) => { const hb = $(sel); if (hb) { hb.hidden = !(mine.late + mine.hoje); hb.textContent = mine.late + mine.hoje; } });
  $('#fx-kpis').innerHTML = `
    <span class="op-kpi clk ${F.next === 'ate_hoje' && F.resp === 'me' ? 'on' : ''}" data-k="minhas" title="Minhas ações de hoje e atrasadas">Minhas ações <b>${mine.late + mine.hoje}</b></span>
    <span class="op-kpi clk bad ${F.next === 'atrasada' && !F.resp ? 'on' : ''}" data-k="atrasadas" title="Ações atrasadas de toda a equipe">Atrasadas <b>${team.late}</b></span>
    <span class="op-kpi clk bad ${F.slaVencido ? 'on' : ''}" data-k="sla" title="Em andamento com o SLA da etapa vencido">SLA vencido <b>${venc}</b></span>
    <span class="op-kpi clk ${team.sem ? 'warn' : ''} ${F.next === 'sem' ? 'on' : ''}" data-k="semacao" title="Médicos em andamento sem próxima ação definida">Sem próxima ação <b>${team.sem}</b></span>
    <span style="flex:1"></span>
    <span class="op-kpi dim ${n !== open.length ? 'warn' : ''}" title="${all.length} cadastros no total · ${pct}% dentro do SLA">Exibindo <b>${n}</b></span>`;
  $$('#fx-kpis [data-k]').forEach((k) => k.onclick = () => {
    const v = k.dataset.k;
    if (v === 'aprovado') F.stage = F.stage === 'aprovado' ? '' : 'aprovado';
    if (v === 'docpend') F.stage = F.stage === 'documentacao_pendente' ? '' : 'documentacao_pendente';
    if (v === 'sla') F.slaVencido = !F.slaVencido;
    if (v === 'urg') F.priority = F.priority === 'urgente' ? '' : 'urgente';
    if (v === 'minhas') { const on = F.next === 'ate_hoje' && F.resp === 'me'; F.next = on ? '' : 'ate_hoje'; F.resp = on ? '' : 'me'; }
    if (v === 'semacao') { F.next = F.next === 'sem' ? '' : 'sem'; F.resp = ''; }
    if (v === 'atrasadas') { const on = F.next === 'atrasada' && !F.resp; F.next = on ? '' : 'atrasada'; F.resp = ''; }
    buildFilters(); refreshFluxo();
  });
}

// ---------- filtros ----------
function buildFilters() {
  const estados = uniq(S.doctors.map((d) => d.estado).filter(Boolean)).sort();
  const setores = uniq([...SETORES, ...S.doctors.flatMap((d) => d.setores || [])]);
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel === v ? 'selected' : ''}>${esc(l)}</option>`;
  $('#fx-hosp-top').innerHTML = `
    <button id="f-hosp-btn" title="Filtrar por hospital (pode escolher vários)"></button>
    <div class="pop" id="f-hosp-pop" hidden style="top:38px;left:0;right:auto;width:340px;padding:8px"></div>`;
  $('#fx-more').innerHTML = `
    <span class="small" style="display:flex;gap:6px;align-items:center" title="Data em que o médico foi cadastrado (entrou no fluxo)">Cadastrados de <input type="date" id="f-entde" value="${esc(F.entDe)}"> até <input type="date" id="f-entate" value="${esc(F.entAte)}"></span>
    <select id="f-stage"><option value="">Qualquer etapa</option>${S.stages.map((s) => opt(s.id, s.label, F.stage)).join('')}</select>
    <select id="f-setor"><option value="">Todos os setores</option>${setores.map((s) => opt(s, s, F.setor)).join('')}</select>
    <select id="f-prio"><option value="">Qualquer prioridade</option>${Object.entries(PRIORITIES).map(([k, l]) => opt(k, l, F.priority)).join('')}</select>
    <select id="f-status"><option value="">Formação: todas</option>${STATUS_ESP.map((s) => opt(s, s, F.statusEsp)).join('')}</select>
    <select id="f-disc"><option value="">DISC: todos</option>${DISC.map((s) => opt(s, DISC_LABEL[s], F.disc)).join('')}</select>
    <select id="f-app"><option value="">APP: todos</option>${opt('true', 'Com APP', F.app)}${opt('false', 'Sem APP', F.app)}</select>
    <select id="f-proc"><option value="">Procuração: todas</option>${opt('true', 'Com procuração', F.procuracao)}${opt('false', 'Sem procuração', F.procuracao)}</select>
    <select id="f-estado"><option value="">UF: todas</option>${estados.map((s) => opt(s, s, F.estado)).join('')}</select>
    <select id="f-next"><option value="">Próxima ação: todas</option>${opt('ate_hoje', 'Hoje e atrasadas', F.next)}${opt('atrasada', 'Atrasadas', F.next)}${opt('hoje', 'Para hoje', F.next)}${opt('semana', 'Nos próximos 7 dias', F.next)}${opt('sem', 'Sem próxima ação', F.next)}</select>
    <select id="f-resp"><option value="">Responsável: qualquer</option>${opt('me', 'Eu', F.resp)}${Object.values(S.profiles).filter((p) => p.ativo && p.user_id !== S.user.id).map((p) => opt(p.user_id, p.display_name, F.resp)).join('')}</select>
    <label class="small" style="display:flex;gap:5px;align-items:center"><input type="checkbox" id="f-mine" ${F.mine ? 'checked' : ''}> Cadastrados por mim</label>
    <select id="f-sla"><option value="">SLA: qualquer</option>${opt('1', 'Só SLA vencido', F.slaVencido ? '1' : '')}</select>
    <label class="small" style="display:flex;gap:5px;align-items:center"><input type="checkbox" id="f-done" ${FX.showDone ? 'checked' : ''}> Mostrar encerrados (aprovados/reprovados)</label>
    <button id="f-clear">Limpar filtros</button>`;
  const bind = (id, key) => { $(id).onchange = (e) => { F[key] = e.target.value; refreshFluxo(); }; };
  bind('#f-setor', 'setor'); bind('#f-estado', 'estado'); bind('#f-stage', 'stage'); bind('#f-disc', 'disc');
  bind('#f-status', 'statusEsp'); bind('#f-app', 'app'); bind('#f-proc', 'procuracao'); bind('#f-prio', 'priority');
  bind('#f-next', 'next'); bind('#f-resp', 'resp'); bind('#f-entde', 'entDe'); bind('#f-entate', 'entAte');
  $('#f-sla').onchange = (e) => { F.slaVencido = !!e.target.value; refreshFluxo(); };
  $('#f-done').onchange = (e) => { FX.showDone = e.target.checked; refreshFluxo(); };
  $('#f-mine').onchange = (e) => { F.mine = e.target.checked; refreshFluxo(); };
  $('#f-clear').onclick = () => {
    Object.assign(F, { hospitals: [], setor: '', estado: '', stage: '', disc: '', statusEsp: '', app: '', procuracao: '', priority: '', slaVencido: false, next: '', resp: '', mine: false, entDe: '', entAte: '' });
    buildFilters(); refreshFluxo();
  };
  $('#f-hosp-btn').onclick = (e) => { e.stopPropagation(); const p = $('#f-hosp-pop'); p.hidden = !p.hidden; if (!p.hidden) renderHospPop(); };
}
function renderHospPop() {
  const names = uniq([...S.hospitals.map((h) => h.nome), ...S.doctors.map((d) => d.hospital)]).sort((a, b) => a.localeCompare(b));
  const pop = $('#f-hosp-pop');
  const cnt = {};
  S.doctors.forEach((d) => { if (!FINAL_STAGES.includes(d.stage)) cnt[d.hospital] = (cnt[d.hospital] || 0) + 1; });
  pop.innerHTML = `<input class="inp" id="hp-q" placeholder="Buscar hospital..." style="margin-bottom:6px">
    <div style="display:flex;justify-content:space-between;padding:2px 4px 6px"><button class="btn-ghost" id="hp-all">Selecionar todos</button><button class="btn-ghost" id="hp-none">Limpar</button></div>
    <div id="hp-list" style="max-height:320px;overflow:auto">` +
    names.map((n) => `<label data-h="${esc(norm(n))}" style="display:flex;gap:8px;padding:4px;font-size:12.5px;cursor:pointer"><input type="checkbox" value="${esc(n)}" ${F.hospitals.includes(n) ? 'checked' : ''}> <span style="flex:1">${esc(n)}</span><span class="muted">${cnt[n] || 0}</span></label>`).join('') + '</div>';
  $('#hp-q', pop).oninput = (e) => { const q = norm(e.target.value); $$('#hp-list label', pop).forEach((l) => { l.hidden = q && !l.dataset.h.includes(q); }); };
  $('#hp-q', pop).focus();
  $$('input[type=checkbox]', pop).forEach((c) => c.onchange = () => { F.hospitals = $$('input[type=checkbox]:checked', pop).map((x) => x.value); refreshFluxo(); });
  $('#hp-all', pop).onclick = () => { F.hospitals = names.slice(); renderHospPop(); refreshFluxo(); };
  $('#hp-none', pop).onclick = () => { F.hospitals = []; renderHospPop(); refreshFluxo(); };
}
function syncFilterWidgets() {
  const b = $('#f-hosp-btn');
  if (!b) return;
  b.textContent = !F.hospitals.length ? 'Todos os hospitais ▾' : F.hospitals.length === 1 ? F.hospitals[0] + ' ▾' : `${F.hospitals.length} hospitais ▾`;
  const c = activeFilterCount();
  $('#f-count').hidden = !c; $('#f-count').textContent = c;
  $('#f-stage').value = F.stage; $('#f-prio').value = F.priority; $('#f-sla').value = F.slaVencido ? '1' : '';
}

const EXPORT_COLS = [
  ['name', 'Médico', (d) => d.name], ['hospital', 'Hospital', (d) => d.hospital], ['setores', 'Setores', (d) => (d.setores || []).join(', ')],
  ['crm', 'CRM', (d) => d.crm], ['cpf', 'CPF', (d) => d.cpf], ['whatsapp', 'WhatsApp', (d) => d.whatsapp], ['estado', 'UF', (d) => d.estado],
  ['stage', 'Etapa', (d) => stageLabel(d.stage)], ['dias', 'Dias no fluxo', (d) => Math.floor((Date.now() - new Date(d.entry_date)) / 864e5) + 1],
  ['sla', 'SLA', (d) => { if (FINAL_STAGES.includes(d.stage)) return '—'; const s = doctorSla(d); return s.status === 'urgent' ? 'Vencido' : fmtRemaining(s.remaining); }],
  ['priority', 'Prioridade', (d) => PRIORITIES[d.priority] || d.priority], ['entry', 'Entrada', (d) => fmtDate(d.entry_date)],
  ['acao', 'Próxima ação', (d) => d.proxima_acao || ''], ['acao_data', 'Data da ação', (d) => (d.proxima_data ? fmtYmd(d.proxima_data) : '')],
  ['acao_resp', 'Responsável', (d) => (d.proxima_acao ? respName(d.proximo_responsavel_id) : '')],
  ['status_esp', 'Formação', (d) => d.status_especialidade], ['rqe', 'RQE', (d) => d.rqe], ['disc', 'DISC', (d) => DISC_LABEL[d.disc] || ''], ['parecer_jur', 'Parecer jurídico', (d) => (PARECER_JUR[d.parecer_juridico] || [''])[0]], ['parecer_jur_obs', 'Restrição / observação do jurídico', (d) => d.parecer_juridico_obs], ['motivo_rep', 'Motivo da reprovação', (d) => d.motivo_reprovacao], ['origem_rep', 'Reprovação informada por', (d) => d.reprovacao_origem],
  ['app', 'APP', (d) => (d.app ? 'Sim' : 'Não')], ['proc', 'Procuração', (d) => (d.procuracao ? 'Sim' : 'Não')], ['link', 'Link enviado', (d) => (d.link_enviado ? 'Sim' : 'Não')],
  ['docs', 'Docs %', (d) => S.docProgress[d.id] || 0], ['doc_pend', 'Doc. pendente', (d) => d.doc_pendente],
  ['cobranca', 'Cobrança', (d) => d.cobranca], ['obs', 'Observações', (d) => d.observations],
];
function exportDialog() {
  let sel;
  try { sel = JSON.parse(localStorage.getItem('flow:exportcols') || 'null'); } catch (_) { sel = null; }
  sel = new Set(sel || ['name', 'hospital', 'setores', 'crm', 'whatsapp', 'stage', 'sla', 'acao', 'acao_data', 'acao_resp', 'docs']);
  const n = filteredDoctors().length;
  const m = openModal(`
    <div class="modal-head"><div><h2>Exportar médicos</h2><div class="om-sub">${n} médico(s) do filtro atual · escolha as colunas</div></div><button class="x" data-close>✕</button></div>
    <div class="modal-body"><div class="checks" id="ex-cols">${EXPORT_COLS.map(([k, l]) => `<label class="${sel.has(k) ? 'on' : ''}"><input type="checkbox" value="${k}" ${sel.has(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      <div class="actions-row"><button class="btn-ghost" id="ex-all">Marcar todas</button><button class="btn-ghost" id="ex-none">Desmarcar todas</button></div></div>
    <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-line" id="ex-csv">CSV</button><button class="btn btn-primary" id="ex-xlsx">Excel (.xlsx)</button></div>`);
  const el = m.el;
  const sync = () => $$('#ex-cols input', el).forEach((c) => c.parentElement.classList.toggle('on', c.checked));
  $$('#ex-cols input', el).forEach((c) => c.onchange = sync);
  $('#ex-all', el).onclick = () => { $$('#ex-cols input', el).forEach((c) => { c.checked = true; }); sync(); };
  $('#ex-none', el).onclick = () => { $$('#ex-cols input', el).forEach((c) => { c.checked = false; }); sync(); };
  const go = async (kind) => {
    const keys = $$('#ex-cols input:checked', el).map((c) => c.value);
    if (!keys.length) return toast('Escolha pelo menos uma coluna.', 'err');
    try { localStorage.setItem('flow:exportcols', JSON.stringify(keys)); } catch (_) { /* ignora */ }
    const cols = EXPORT_COLS.filter((c) => keys.includes(c[0]));
    const rows = filteredDoctors().map((d) => cols.map((c) => c[2](d) ?? ''));
    const nome = `medicos_flow_${new Date().toISOString().slice(0, 10)}`;
    if (kind === 'csv') downloadCsv(nome + '.csv', cols.map((c) => c[1]), rows);
    else {
      try { const X = await loadXlsx(); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([cols.map((c) => c[1]), ...rows]), 'Médicos'); X.writeFile(wb, nome + '.xlsx'); } catch (e) { return toast('Erro ao gerar Excel: ' + e.message, 'err'); }
    }
    m.close(); toast(`${rows.length} médico(s) exportado(s)`, 'ok');
  };
  $('#ex-csv', el).onclick = () => go('csv');
  $('#ex-xlsx', el).onclick = () => go('xlsx');
}

// ---------- 🔥 Prioridades da semana (equivalente ao Call Hot do Aliança) ----------
function openPrioridades() {
  const rows = S.doctors.filter((d) => !FINAL_STAGES.includes(d.stage)).map((d) => {
    const why = []; let sc = 0;
    const add = (n, t) => { sc += n; why.push(t); };
    if (d.priority === 'urgente') add(40, 'urgente');
    const s = doctorSla(d);
    if (s.status === 'urgent') add(Math.min(30, 10 + Math.round(-s.remaining / 24) * 2), `SLA vencido há ${Math.max(1, Math.round(-s.remaining / 24))}d úteis`);
    else if (s.status === 'warning') add(15, 'SLA vencendo');
    const n = daysTo(d.proxima_data);
    if (d.proxima_acao && n !== null) { if (n < 0) add(15, `ação atrasada ${-n}d`); else if (n === 0) add(10, 'ação para hoje'); else add(-20, 'já agendado'); }
    if (!d.proxima_acao) add(12, 'sem próxima ação');
    const docs = S.docProgress[d.id] || 0;
    if (docs >= 80 && docs < 100) add(10, `documentação ${docs}% — falta pouco`);
    if (d.doc_pendente) add(5, 'doc. pendente anotado');
    return { d, sc, why };
  }).filter((r) => r.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 40);
  const m = openModal(`
    <div class="modal-head"><div><h2>Prioridades da semana</h2><div class="om-sub">Lista calculada automaticamente — quem cobrar primeiro (urgência, SLA, ações atrasadas e quem está quase pronto).</div></div><button class="x" data-close>✕</button></div>
    <div class="modal-body"><table class="t"><thead><tr><th>#</th><th>Médico</th><th>Pontos</th><th>Por quê</th><th>Próxima ação</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td>${i + 1}</td><td><a href="#" data-openp="${r.d.id}" style="color:var(--brand);font-weight:600">${esc(r.d.name)}</a><br><small class="muted">${esc(r.d.hospital)} · ${esc(stageLabel(r.d.stage))}</small></td>
        <td><b>${r.sc}</b></td><td><small>${r.why.map(esc).join(' · ')}</small></td><td><small>${r.d.proxima_acao ? esc(r.d.proxima_acao) + ' ' + fmtYmd(r.d.proxima_data) : '—'}</small></td>
        <td><button class="btn btn-line btn-sm" data-ch="${r.d.id}">Cobrar hoje</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nada crítico agora.</td></tr>'}
    </tbody></table></div>`, { size: 'lg', onClose: () => refreshFluxo() });
  const byId = (id) => S.doctors.find((x) => x.id === id);
  $$('[data-openp]', m.el).forEach((a) => a.onclick = (e) => { e.preventDefault(); m.close(); openDoctor(byId(a.dataset.openp)); });
  $$('[data-ch]', m.el).forEach((b) => b.onclick = async () => {
    const d = byId(b.dataset.ch);
    if (await saveNextAction(d, d.proxima_acao || ACAO_POR_ETAPA[d.stage] || 'Outra', ymdToday(), S.user.id, { quiet: true })) {
      b.textContent = '✔ na sua lista de hoje'; b.disabled = true;
    }
  });
}

// ================= JORNADA (linha do tempo, igual à tela Aliança) =================
const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

/** Colunas do período escolhido: por dia, semana (seg–dom) ou mês. Cada coluna é um período [start, end). */
function jornadaCols() {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const [ini, fim] = perRange();
  const last = new Date(fim); last.setDate(last.getDate() + 1); // fim inclusivo
  const cols = [];
  if (FX.gran === 'mes') {
    for (let m = new Date(ini.getFullYear(), ini.getMonth(), 1); m < last; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) {
      const end = new Date(m.getFullYear(), m.getMonth() + 1, 1);
      cols.push({ start: m, end, label: MES[m.getMonth()], sub: String(m.getFullYear()).slice(2), cur: now >= m && now < end, tag: `${MES[m.getMonth()]}/${String(m.getFullYear()).slice(2)}`, expand: true });
    }
  } else if (FX.gran === 'semana') {
    let w = new Date(ini); w.setDate(w.getDate() - ((w.getDay() + 6) % 7)); // segunda-feira
    for (; w < last; w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) {
      const end = new Date(w); end.setDate(end.getDate() + 7);
      const lbl = `${pad(w.getDate())}/${pad(w.getMonth() + 1)}`;
      cols.push({ start: new Date(w), end, label: lbl, sub: 'sem', cur: now >= w && now < end, tag: `semana de ${lbl}`, expand: true });
    }
  } else {
    for (let dd = new Date(ini); dd < last; dd = new Date(dd.getFullYear(), dd.getMonth(), dd.getDate() + 1)) {
      const end = new Date(dd); end.setDate(end.getDate() + 1);
      const lbl = `${pad(dd.getDate())}/${pad(dd.getMonth() + 1)}`;
      cols.push({ start: new Date(dd), end, label: lbl, sub: WD[dd.getDay()], cur: +dd === +today, we: [0, 6].includes(dd.getDay()), tag: lbl });
    }
  }
  return cols;
}

/** Janelinha de período, igual ao exemplo: atalhos, início/fim, visualizar por, contador e Aplicar. */
function renderPerPop() {
  const pop = $('#fx-per-pop');
  let draft = { ...FX.per };
  const [a0, b0] = perRange();
  const draw = (ini, fim) => {
    const dias = Math.round((ymdToDate(fim) - ymdToDate(ini)) / 864e5) + 1;
    pop.innerHTML = `
      <div class="per-chips">${PER_PRESETS.map(([k, l]) => `<button class="per-chip ${draft.preset === k ? 'on' : ''}" data-pre="${k}">${l}</button>`).join('')}</div>
      <div class="per-dates"><label class="lbl">Início<input type="date" class="inp" id="per-ini" value="${ini}"></label><label class="lbl">Fim<input type="date" class="inp" id="per-fim" value="${fim}"></label></div>
      <label class="lbl" style="display:block;margin-top:10px">Visualizar por
        <select class="inp" id="per-gran"><option value="dia" ${draft.gran === 'dia' ? 'selected' : ''}>Dias</option><option value="semana" ${draft.gran === 'semana' ? 'selected' : ''}>Semanas</option><option value="mes" ${draft.gran === 'mes' ? 'selected' : ''}>Meses</option></select></label>
      <div class="small muted" style="margin:8px 0" id="per-info">${dias > 0 ? `${dias} dia(s) no período.` : 'O fim precisa ser depois do início.'}${draft.gran === 'dia' && dias > 120 ? ' <b style="color:var(--amber-ink)">Muitos dias — prefira Semanas ou Meses.</b>' : ''}</div>
      <button class="btn btn-line btn-block" id="per-ok" ${dias > 0 ? '' : 'disabled'}>Aplicar</button>`;
    $$('[data-pre]', pop).forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const pr = PER_PRESETS.find((x) => x[0] === b.dataset.pre);
      const [a, z] = presetRange(pr[0]);
      draft = { preset: pr[0], start: null, end: null, gran: pr[2] };
      draw(ymd(a), ymd(z));
    });
    const custom = () => { draft.preset = 'custom'; draft.start = $('#per-ini', pop).value; draft.end = $('#per-fim', pop).value; draft.gran = $('#per-gran', pop).value; draw(draft.start, draft.end); };
    $('#per-ini', pop).onchange = custom; $('#per-fim', pop).onchange = custom;
    $('#per-gran', pop).onchange = (e) => { draft.gran = e.target.value; draw($('#per-ini', pop).value, $('#per-fim', pop).value); };
    $('#per-ok', pop).onclick = () => {
      if (draft.preset === 'custom') { draft.start = $('#per-ini', pop).value; draft.end = $('#per-fim', pop).value; }
      FX.per = draft; FX.cell = null; FX.limit = 300; savePer();
      pop.hidden = true; refreshFluxo();
    };
  };
  draw(ymd(a0), ymd(b0));
}

/** Linha do tempo de etapas do médico: [{at, stage}] em ordem, começando na entrada. */
function timelineOf(d) {
  const ev = (STAGE_EV[d.id] || []).slice().sort((a, b) => a.at - b.at);
  const entry = new Date(d.entry_date);
  if (!ev.length) return [{ at: entry, stage: d.stage }];
  if (ev[0].at > entry) ev.unshift({ at: entry, stage: 'aguardando_contato' });
  return ev;
}
function stageAt(tl, t) {
  if (t < tl[0].at) return null;
  let st = null;
  for (const e of tl) { if (e.at <= t) st = e.stage; else break; }
  return st;
}
/** Etapa do médico no fim do período [s, e). Aprovado/reprovado só aparecem no período em que aconteceram:
 *  depois disso o credenciamento está encerrado e o médico sai da linha do tempo. */
function stageInPeriod(tl, s, e) {
  const st = stageAt(tl, new Date(e - 1));
  if (!st || !FINAL_STAGES.includes(st)) return st;
  return tl.some((ev) => ev.stage === st && ev.at >= s && ev.at < e) ? st : null;
}
/** Etapas em que o médico esteve em algum momento do período [s, e) (encerramento conta só no período em que ocorreu). */
function stagesDuring(tl, s, e) {
  const out = new Set();
  const first = stageAt(tl, s);
  if (first && !FINAL_STAGES.includes(first)) out.add(first);
  for (const ev of tl) if (ev.at >= s && ev.at < e) out.add(ev.stage);
  return out;
}

function cellFilterIds(list) {
  if (!FX.cell) return null;
  const { stage, s, e } = FX.cell;
  return new Set(list.filter((d) => stagesDuring(timelineOf(d), s, e).has(stage)).map((d) => d.id));
}
/** Etiquetas dos filtros ativos (inclusive o filtro do resumo), cada uma com ✕ — igual ao Aliança. */
function renderCellChip() {
  const box = $('#fx-chip');
  if (!box) return;
  const chips = [];
  const chip = (html, key) => chips.push(`<span class="op-chip">${html}<button data-unf="${key}" title="Tirar este filtro">✕</button></span>`);
  if (FX.cell && FX.mode === 'jornada') {
    const n = STAGE_EV ? cellFilterIds(filteredDoctors()).size : '…';
    chip(`Filtro do resumo: <b>${esc(stageLabel(FX.cell.stage))}</b> em <b>${esc(FX.cell.tag)}</b> · ${n} médico(s)`, 'cell');
  }
  if (F.slaVencido) chip('<b>SLA vencido</b>', 'slaVencido');
  if (F.stage) chip(`Etapa atual: <b>${esc(stageLabel(F.stage))}</b>`, 'stage');
  if (F.priority) chip(`Prioridade: <b>${esc(PRIORITIES[F.priority] || F.priority)}</b>`, 'priority');
  if (F.hospitals.length) chip(`Hospital: <b>${esc(F.hospitals.length === 1 ? F.hospitals[0] : F.hospitals.length + ' selecionados')}</b>`, 'hospitals');
  if (F.entDe || F.entAte) chip(`Cadastrados <b>${F.entDe && F.entAte ? `de ${dataBr(F.entDe)} até ${dataBr(F.entAte)}` : F.entDe ? `a partir de ${dataBr(F.entDe)}` : `até ${dataBr(F.entAte)}`}</b>`, 'ent');
  if (F.setor) chip(`Setor: <b>${esc(F.setor)}</b>`, 'setor');
  if (F.statusEsp) chip(`Formação: <b>${esc(F.statusEsp)}</b>`, 'statusEsp');
  if (F.disc) chip(`DISC: <b>${esc(DISC_LABEL[F.disc])}</b>`, 'disc');
  if (F.app) chip(`<b>${F.app === 'true' ? 'Com' : 'Sem'} APP</b>`, 'app');
  if (F.procuracao) chip(`<b>${F.procuracao === 'true' ? 'Com' : 'Sem'} procuração</b>`, 'procuracao');
  if (F.estado) chip(`UF: <b>${esc(F.estado)}</b>`, 'estado');
  if (F.search) chip(`Busca: <b>${esc(F.search)}</b>`, 'search');
  if (F.next) chip(`Próxima ação: <b>${esc({ ate_hoje: 'hoje e atrasadas', atrasada: 'atrasadas', hoje: 'para hoje', semana: 'próximos 7 dias', sem: 'sem próxima ação' }[F.next])}</b>`, 'next');
  if (F.mine) chip('<b>Cadastrados por mim</b>', 'mine');
  if (F.resp) chip(`Responsável: <b>${esc(F.resp === 'me' ? 'eu' : respName(F.resp))}</b>`, 'resp');
  box.hidden = !chips.length;
  if (!chips.length) { box.innerHTML = ''; return; }
  const n = filteredDoctors().length;
  box.innerHTML = chips.join('') + `<span class="small muted">${n} de ${S.doctors.length} médicos no filtro</span>` +
    (chips.length > 1 ? '<button class="btn-ghost" id="fx-unall">Limpar tudo</button>' : '');
  $$('[data-unf]', box).forEach((b) => b.onclick = () => {
    const k = b.dataset.unf;
    if (k === 'cell') FX.cell = null;
    else if (k === 'hospitals') F.hospitals = [];
    else if (k === 'slaVencido') F.slaVencido = false;
    else if (k === 'mine') F.mine = false;
    else if (k === 'ent') { F.entDe = ''; F.entAte = ''; }
    else { F[k] = ''; if (k === 'search') $('#f-search').value = ''; }
    buildFilters(); refreshFluxo();
  });
  const all = $('#fx-unall', box);
  if (all) all.onclick = () => {
    FX.cell = null; $('#f-search').value = '';
    Object.assign(F, { search: '', hospitals: [], setor: '', estado: '', stage: '', disc: '', statusEsp: '', app: '', procuracao: '', priority: '', slaVencido: false, next: '', resp: '', mine: false, entDe: '', entAte: '' });
    buildFilters(); refreshFluxo();
  };
}

/** Abre o Fluxo já filtrado (usado pelos números clicáveis dos Indicadores). */
function goFluxoFiltered(patch) {
  FX.cell = null;
  Object.assign(F, { hospitals: [], setor: '', estado: '', stage: '', disc: '', statusEsp: '', app: '', procuracao: '', priority: '', slaVencido: false, next: '', resp: '', mine: false }, patch);
  if ($('#fx-more')) buildFilters();
  go('fluxo');
}

function renderJornada(list) {
  const body = $('#fx-body');
  const cols = jornadaCols();
  const now = new Date();
  const tls = new Map(list.map((d) => [d.id, timelineOf(d)]));

  // resumo: quantos médicos passaram por cada etapa em cada coluna
  const counts = {};
  S.stages.forEach((s) => { counts[s.id] = cols.map(() => 0); });
  list.forEach((d) => {
    const tl = tls.get(d.id);
    cols.forEach((c, i) => { if (c.start <= now) stagesDuring(tl, c.start, c.end).forEach((st) => { if (counts[st]) counts[st][i]++; }); });
  });

  // lista: filtro do resumo (célula) ou só quem está em andamento
  const cellIds = cellFilterIds(list);
  const daysIn = (d) => Math.floor((Date.now() - new Date(d.entry_date)) / 864e5) + 1;
  const slaKey = (d) => (FINAL_STAGES.includes(d.stage) ? 1e9 : doctorSla(d).remaining);
  const winS = cols[0].start, winE = cols[cols.length - 1].end;
  // encerrado (aprovado/reprovado) só aparece se o encerramento caiu dentro do período da tela
  const closedInWindow = (d) => tls.get(d.id).some((ev) => ev.stage === d.stage && ev.at >= winS && ev.at < winE);
  const showFinal = (d) => FX.showDone || FINAL_STAGES.includes(F.stage) || !FINAL_STAGES.includes(d.stage) || closedInWindow(d);
  const rows = list.filter((d) => showFinal(d) && (!cellIds || cellIds.has(d.id)));
  const shownStages = S.stages;
  const oldClosed = list.filter((d) => FINAL_STAGES.includes(d.stage) && !closedInWindow(d));
  const nApr = oldClosed.filter((d) => d.stage === 'aprovado').length, nRep = oldClosed.filter((d) => d.stage === 'reprovado').length;
  rows.sort((a, b) => (FX.sort === 'nome' ? a.name.localeCompare(b.name) : FX.sort === 'dias' ? daysIn(b) - daysIn(a) : slaKey(a) - slaKey(b)));
  const curIdx = cols.findIndex((c) => c.cur);
  const isSel = (st, c) => FX.cell && FX.cell.stage === st && +FX.cell.s === +c.start && FX.cell.gran === FX.gran;

  const head = `<div class="op-row op-head"><div class="op-left"><span id="fx-sumtoggle" style="cursor:pointer" title="Recolher / abrir o resumo">${FX.sumOpen ? '▾' : '▸'} Resumo ${{ dia: 'diário', semana: 'semanal', mes: 'mensal' }[FX.gran]}</span><span class="info-ico" title="Cada número é quantos médicos passaram por aquela etapa naquele ${{ dia: 'dia', semana: 'semana', mes: 'mês' }[FX.gran]}. Clique no número para ver só esses médicos na lista.">ⓘ</span></div>
    <div class="op-right">${cols.map((c, i) => `<div class="op-mh ${c.cur ? 'cur' : ''} ${c.we ? 'we' : ''}" style="left:calc(${i} * var(--dw))"><span class="op-mt"><span>${c.label}<small>${c.sub}</small></span>${c.expand && c.start <= now ? `<button class="op-mtoggle" data-expand="${i}" title="Abrir os dias de ${c.tag}">⤢</button>` : ''}</span></div>`).join('')}</div></div>`;

  const sum = `<div class="op-sumbox">${shownStages.map((s) => `<div class="op-sumrow"><div class="op-left ${F.stage === s.id ? 'sel' : ''}" data-sstage="${s.id}" title="${FINAL_STAGES.includes(s.id) ? 'Encerramentos: conta só no dia em que aconteceu' : 'Filtrar por quem está hoje nesta etapa'}"><span class="op-dot" style="background:${esc(s.color)}"></span>${esc(s.label)}<b style="margin-left:auto;font-variant-numeric:tabular-nums">${FINAL_STAGES.includes(s.id) ? list.filter((d) => d.stage === s.id && closedInWindow(d)).length : list.filter((d) => d.stage === s.id).length}</b></div>
    <div class="op-right">${counts[s.id].map((n, i) => {
      const c = cols[i];
      if (c.start > now) return '';
      return `<div class="op-sumcell ${n ? 'clk' : 'z'} ${isSel(s.id, c) ? 'sel' : ''}" style="left:calc(${i} * var(--dw))" ${n ? `data-cell="${s.id}|${i}" title="${n} médico(s) em ${esc(s.label)} em ${c.tag}"` : ''}>${n || '·'}</div>`;
    }).join('')}</div></div>`).join('')}
    <div class="op-sumrow op-totalrow"><div class="op-left" title="Soma de todas as etapas acima (cada coluna = soma do dia/mês)">Σ Total<b style="margin-left:auto;font-variant-numeric:tabular-nums">${shownStages.reduce((a, s) => a + (FINAL_STAGES.includes(s.id) ? list.filter((d) => d.stage === s.id && closedInWindow(d)).length : list.filter((d) => d.stage === s.id).length), 0)}</b></div>
      <div class="op-right">${cols.map((c, i) => (c.start > now ? '' : `<div class="op-sumcell" style="left:calc(${i} * var(--dw))">${shownStages.reduce((a, s) => a + counts[s.id][i], 0)}</div>`)).join('')}</div></div>
    <div class="op-sumrow"><div class="op-left" id="fx-closed" title="Aprovado ou reprovado encerra o credenciamento — por isso ficam fora da tela" style="color:var(--ink-faint)">✔ Encerrados antes: ${nApr} aprov. · ${nRep} reprov.<span class="btn-ghost" style="margin-left:auto;padding:0">${FX.showDone ? 'ocultar' : 'mostrar'}</span></div><div class="op-right"></div></div></div>`;

  const countRow = `<div class="op-row op-countrow"><div class="op-left">${rows.length} de ${list.length} médicos
      <select id="fx-sort" style="margin-left:auto;border:none;background:transparent;font:inherit;color:inherit;font-weight:500;cursor:pointer">
        <option value="sla" ${FX.sort === 'sla' ? 'selected' : ''}>SLA mais crítico</option><option value="dias" ${FX.sort === 'dias' ? 'selected' : ''}>Mais dias no fluxo</option><option value="nome" ${FX.sort === 'nome' ? 'selected' : ''}>Nome</option></select></div>
    <div class="op-right" style="min-height:30px"></div></div>`;

  const rowHtml = (d) => {
    const tl = tls.get(d.id);
    const segs = [];
    cols.forEach((c, i) => {
      if (c.start > now) return;
      const st = stageInPeriod(tl, c.start, new Date(Math.min(+c.end, +now + 1)));
      if (!st) return;
      const last = segs[segs.length - 1];
      if (last && last.st === st && last.end === i - 1) last.end = i; else segs.push({ st, start: i, end: i });
    });
    const sla = FINAL_STAGES.includes(d.stage) ? null : doctorSla(d);
    const todayPos = curIdx >= 0 ? curIdx + (now - cols[curIdx].start) / (cols[curIdx].end - cols[curIdx].start) : -1;
    return `<div class="op-row" data-doc="${d.id}">
      <div class="op-left"><div class="n"><span class="sdot s-${sla ? sla.status : 'none'}"></span>${esc(d.name)}${d.priority === 'urgente' ? '<span class="tagx bad">URG</span>' : d.priority === 'hospital_novo' ? '<span class="tagx warn">3h</span>' : ''}${parecerChip(d)}</div>
        <div class="m">${esc(d.hospital)}${d.crm ? ' · ' + esc(d.crm) : ''}${d.status_especialidade ? ' · ' + esc(d.status_especialidade) : ''}${(d.setores || []).length ? ' · ' + esc(d.setores.join(', ')) : ''} · ${daysIn(d)}d${sla ? ` · <span style="color:${sla.status === 'urgent' ? 'var(--red)' : sla.status === 'warning' ? 'var(--amber)' : 'inherit'}">${sla.status === 'urgent' ? 'SLA vencido' : 'SLA ' + fmtRemaining(sla.remaining)}</span>` : ` · ${esc(stageLabel(d.stage))}`}${nextInline(d)}</div></div>
      <div class="op-right">${todayPos >= 0 ? `<div class="op-today" style="left:calc(${todayPos} * var(--dw))"></div>` : ''}
        ${segs.map((s) => { const st = stageById(s.st); const w = s.end - s.start + 1; return `<div class="seg" style="left:calc(${s.start} * var(--dw) + 2px);width:calc(${w} * var(--dw) - 4px);background:${esc(st?.color || '#999')}" title="${esc(st?.label || s.st)}">${w >= 2 || FX.gran !== 'dia' ? esc(st?.label || '') : ''}</div>`; }).join('')}</div></div>`;
  };

  body.innerHTML = `<div class="op-scroll" style="--ndays:${cols.length};--dw:${{ dia: '56px', semana: '70px', mes: '96px' }[FX.gran]}"><div class="op-sticky">${head}${FX.sumOpen ? sum : ''}</div>${countRow}${rows.slice(0, FX.limit).map(rowHtml).join('') || '<div class="op-more">Nenhum médico com esses filtros.</div>'}
    ${rows.length > FX.limit ? `<div class="op-more"><button class="btn btn-line btn-sm" id="fx-morerows">Mostrar mais ${Math.min(300, rows.length - FX.limit)} de ${rows.length - FX.limit}</button></div>` : `<div class="op-more">Fim da lista (${rows.length})</div>`}</div>`;

  $$('#fx-body [data-doc]').forEach((r) => r.onclick = () => openDoctor(S.doctors.find((x) => x.id === r.dataset.doc)));
  const fxc = $('#fx-closed'); if (fxc) fxc.onclick = () => { FX.showDone = !FX.showDone; buildFilters(); refreshFluxo(); };
  $$('#fx-body [data-sstage]').forEach((c) => c.onclick = () => { F.stage = F.stage === c.dataset.sstage ? '' : c.dataset.sstage; FX.cell = null; buildFilters(); refreshFluxo(); });
  $$('#fx-body [data-cell]').forEach((c) => c.onclick = () => {
    const [stage, i] = c.dataset.cell.split('|');
    const col = cols[+i];
    FX.cell = isSel(stage, col) ? null : { stage, s: col.start, e: col.end, tag: col.tag, gran: FX.gran };
    FX.limit = 300;
    refreshFluxo();
    $('#fx-body').scrollTop = 0;
  });
  $('#fx-sort').onclick = (e) => e.stopPropagation();
  $('#fx-sort').onchange = (e) => { FX.sort = e.target.value; refreshFluxo(); };
  const mr = $('#fx-morerows'); if (mr) mr.onclick = () => { FX.limit += 300; refreshFluxo(); };
  $('#fx-sumtoggle').onclick = () => { FX.sumOpen = !FX.sumOpen; try { localStorage.setItem('flow:sum', FX.sumOpen); } catch (_) { /* ignora */ } refreshFluxo(); };
  $$('#fx-body [data-expand]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const c = cols[+b.dataset.expand];
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const fim = new Date(c.end); fim.setDate(fim.getDate() - 1);
    FX.per = { preset: 'custom', start: ymd(c.start), end: ymd(fim < t ? fim : t), gran: 'dia' };
    FX.cell = null; savePer();
    refreshFluxo();
  });
  renderCellChip();
}

// ================= KANBAN =================
/** Etiqueta colorida do parecer jurídico (verde / amarelo / vermelho). */
function parecerChip(d) {
  const p = PARECER_JUR[d.parecer_juridico];
  if (!p) return '';
  const curto = { aprovado: 'Jur. OK', aprovado_restricao: 'Jur. restrição', nao_aprovado: 'Jur. NÃO' }[d.parecer_juridico];
  return `<span class="tagx ${p[1]}" title="Parecer jurídico: ${esc(p[0])}${d.parecer_juridico_obs ? ' — ' + esc(d.parecer_juridico_obs) : ''}">${curto}</span>`;
}
function cardHtml(d) {
  const sla = FINAL_STAGES.includes(d.stage) ? null : doctorSla(d);
  const prog = S.docProgress[d.id] || 0;
  const t = (on, label) => `<span class="tag ${on ? 'on' : 'off'}">${label}</span>`;
  return `<div class="kcard" draggable="true" data-id="${d.id}">
    <div class="top"><span class="sdot s-${sla ? sla.status : 'none'}"></span><span class="nm" title="${esc(d.name)}">${esc(d.name)}</span>${d.priority === 'urgente' ? '<span class="tagx bad">URG</span>' : d.priority === 'hospital_novo' ? '<span class="tagx warn">3h</span>' : ''}${parecerChip(d)}</div>
    <div class="kgrid"><span title="${esc((d.setores || []).join(', '))}">${esc((d.setores || []).join(', ') || '—')}</span><span title="${esc(d.hospital)}">${esc(d.hospital)}</span><span>${esc(d.crm || '—')}</span><span>${esc(d.whatsapp || '—')}</span></div>
    <div class="tags">${d.status_especialidade ? `<span class="tag">${esc(d.status_especialidade)}</span>` : ''}${d.disc ? `<span class="tag ${DISC_CLASS[d.disc]}">${esc(DISC_LABEL[d.disc])}</span>` : ''}${t(d.link_enviado, 'Link')}${t(d.app, 'APP')}${t(d.procuracao, 'Proc.')}</div>
    ${d.doc_pendente ? `<div class="pend" title="${esc(d.doc_pendente)}">${esc(d.doc_pendente)}</div>` : ''}
    ${isOpen(d) ? `<div class="small" style="margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nextInline(d).replace(/^ · /, '')}</div>` : ''}
    <div class="foot"><span class="prog"><i style="width:${prog}%;background:${prog >= 100 ? 'var(--green)' : prog >= 50 ? '#e0a94f' : 'var(--ink-faint)'}"></i></span>${prog}%
      <span>${fmtDate(d.entry_date)}</span>${sla ? `<span class="slapill ${sla.status}">${fmtRemaining(sla.remaining)}</span>` : ''}</div>
  </div>`;
}

let dragDoctor = null, dragCol = null;
function renderBoard(list) {
  const body = $('#fx-body');
  const byStage = {};
  list.forEach((d) => { (byStage[d.stage] ||= []).push(d); });
  body.innerHTML = `<div class="kanban-wrap"><div class="kanban-board" id="fx-board">${S.stages.map((s) => {
    const items = byStage[s.id] || [];
    const lim = colLimit[s.id] || 80;
    if (FINAL_STAGES.includes(s.id) && !FX.showDone && F.stage !== s.id) {
      return `<div class="kanban-col closed" data-stage="${s.id}" title="Solte um card aqui para ${s.id === 'aprovado' ? 'aprovar' : 'reprovar'} — o médico sai da tela">
        <div class="kanban-col-head"><span class="cdot" style="background:${esc(s.color)}"></span><span class="lbl2">${esc(s.label)}</span></div>
        <div class="closed-body"><b>${items.length}</b><span>encerrados</span><em>Solte aqui para ${s.id === 'aprovado' ? 'aprovar' : 'reprovar'}</em></div></div>`;
    }
    return `<div class="kanban-col" data-stage="${s.id}">
      <div class="kanban-col-head" ${S.isAdmin ? 'draggable="true"' : ''} data-colhead="${s.id}">
        ${S.isAdmin ? '<span class="grip" title="Arraste para reordenar">⋮⋮</span>' : ''}
        <span class="cdot" style="background:${esc(s.color)}"></span><span class="lbl2">${esc(s.label)}</span><span class="cnt">${items.length}</span>
        ${S.isAdmin && s.is_custom ? `<button class="del" data-delcol="${s.id}" title="Excluir coluna" aria-label="Excluir coluna">${ic('trash', 13)}</button>` : ''}
      </div>
      <div class="kanban-col-body">${items.slice(0, lim).map(cardHtml).join('') || '<div class="empty">Nenhum médico</div>'}
        ${items.length > lim ? `<button class="more-btn" data-more="${s.id}">Mostrar mais ${items.length - lim} médico(s)</button>` : ''}
        ${lim > 80 ? `<button class="more-btn" data-less="${s.id}">Mostrar menos</button>` : ''}</div>
    </div>`;
  }).join('')}${S.isAdmin ? '<button class="newcol" id="fx-newcol">＋ Nova coluna</button>' : ''}</div></div>`;
  const board = $('#fx-board');
  $$('.kcard', board).forEach((c) => {
    c.onclick = () => { const d = S.doctors.find((x) => x.id === c.dataset.id); if (d) openDoctor(d); };
    c.ondragstart = (e) => { dragDoctor = c.dataset.id; dragCol = null; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; };
    c.ondragend = () => { c.classList.remove('dragging'); dragDoctor = null; };
  });
  $$('[data-colhead]', board).forEach((h) => {
    h.ondragstart = (e) => { if (!S.isAdmin) return; dragCol = h.dataset.colhead; dragDoctor = null; h.parentElement.classList.add('col-drag'); e.dataTransfer.effectAllowed = 'move'; };
    h.ondragend = () => { h.parentElement.classList.remove('col-drag'); dragCol = null; };
  });
  $$('.kanban-col', board).forEach((col) => {
    col.ondragover = (e) => { if (dragDoctor || dragCol) { e.preventDefault(); col.classList.add('drop'); } };
    col.ondragleave = () => col.classList.remove('drop');
    col.ondrop = async (e) => {
      e.preventDefault(); col.classList.remove('drop');
      const to = col.dataset.stage;
      if (dragDoctor) {
        const d = S.doctors.find((x) => x.id === dragDoctor);
        if (d && d.stage !== to) await moveDoctor(d, to);
      } else if (dragCol && dragCol !== to) {
        await reorderStages(dragCol, to);
      }
    };
  });
  $$('[data-more]', board).forEach((b) => b.onclick = () => { colLimit[b.dataset.more] = (colLimit[b.dataset.more] || 80) + 80; refreshFluxo(); });
  $$('[data-less]', board).forEach((b) => b.onclick = () => { colLimit[b.dataset.less] = 80; refreshFluxo(); });
  $$('[data-delcol]', board).forEach((b) => b.onclick = (e) => { e.stopPropagation(); deleteStage(b.dataset.delcol); });
  const nc = $('#fx-newcol');
  if (nc) nc.onclick = openNewStage;
}

/** Move o médico de etapa e registra no histórico (o banco gera as notificações). */
async function moveDoctor(d, toStage) {
  const st = stageById(toStage);
  let rep = null;
  if (toStage === 'reprovado') { rep = await reprovacaoDialog(d); if (!rep) return false; }
  if (toStage === 'aprovado' && d.stage !== 'aprovado') {
    // aprovar é definitivo para o médico: confirma e avisa se ainda há documento pendente
    const pct = S.docProgress[d.id];
    const aviso = pct != null && pct < 100 ? ` Atenção: os documentos estão em ${pct}% (ainda há pendências na aba Documentos).` : '';
    if (!(await confirmDlg('Aprovar o médico', `Aprovar ${d.name} em ${d.hospital}? Isso cria a ação de informar a aprovação ao médico.${aviso}`, { okText: 'Aprovar' }))) return false;
  }
  const patch = { stage: toStage, stage_entered_at: new Date().toISOString(), sla_hours: st?.sla_hours ?? 24 };
  // próxima ação sugerida para a nova etapa (encerrado = sem próxima ação; reprovado = comunicar o médico)
  if (rep) Object.assign(patch, { motivo_reprovacao: rep.motivo, reprovacao_origem: rep.origem, proxima_acao: rep.comunicar ? 'Informar resultado ao médico' : null, proxima_data: rep.comunicar ? ymdToday() : null, proximo_responsavel_id: rep.comunicar ? rep.resp : null });
  else if (toStage === 'aprovado') {
    // aprovado: avisar o médico (por padrão quem é do Jurídico; senão o responsável atual)
    const jur = Object.values(S.profiles).find((p) => p.ativo && p.setor === 'juridico');
    Object.assign(patch, { proxima_acao: 'Informar aprovação e próximos passos', proxima_data: ymdToday(), proximo_responsavel_id: jur ? jur.user_id : (d.proximo_responsavel_id || S.user.id) });
  } else if (FINAL_STAGES.includes(toStage)) Object.assign(patch, { proxima_acao: null, proxima_data: null, proximo_responsavel_id: null });
  else if (ACAO_POR_ETAPA[toStage]) Object.assign(patch, { proxima_acao: ACAO_POR_ETAPA[toStage], proxima_data: addBusinessDays(1), proximo_responsavel_id: d.proximo_responsavel_id || S.user.id });
  const { error } = await sb.from('flow_doctors').update(patch).eq('id', d.id);
  if (error) { toast('Erro ao mover médico: ' + error.message, 'err'); return false; }
  Object.assign(d, patch);
  const { data: act } = await sb.from('flow_activities').insert({ doctor_id: d.id, description: `Movido para ${st?.label || toStage}`, type: 'stage_change' }).select().single();
  if (STAGE_EV && act) (STAGE_EV[d.id] ||= []).push({ at: new Date(act.created_at), stage: toStage });
  if (rep) await sb.from('flow_activities').insert({ doctor_id: d.id, type: 'note', description: `Motivo da reprovação: ${rep.motivo} (informado por: ${rep.origem})${rep.comunicar ? ` · comunicar o médico: ${respName(rep.resp)}` : ''}` });
  if (typeof ACTS !== 'undefined') ACTS = null;
  notifyPainel(d, toStage);
  toast(`${d.name} → ${st?.label || toStage}`, 'ok');
  afterDoctorChange();
  return true;
}

const MOTIVOS_REPROVACAO = ['Reprovado pelo jurídico', 'Reprovado pelo hospital', 'Documentação incompleta ou vencida', 'Pendência no CRM / ético-profissional', 'Médico desistiu', 'Sem retorno do médico', 'Outro'];
/** Janela obrigatória ao reprovar: motivo, quem informou e quem comunica o médico. Resolve com os dados ou null (cancelado). */
function reprovacaoDialog(d) {
  return new Promise((resolve) => {
    let done = false;
    const pessoas = Object.values(S.profiles).filter((p) => p.ativo).sort((a, b) => a.display_name.localeCompare(b.display_name));
    const jur = pessoas.find((p) => p.setor === 'juridico');
    const respDef = jur ? jur.user_id : (d.proximo_responsavel_id || S.user.id);
    const m = openModal(`
      <div class="modal-head"><div><h2>Reprovar ${esc(d.name)}</h2><div class="om-sub">${esc(d.hospital)} · registre o porquê e quem vai avisar o médico</div></div><button class="x" data-close>✕</button></div>
      <div class="modal-body"><div class="form-grid">
        <div class="field"><label>Motivo *</label><select class="inp" id="rp-mot"><option value="">Selecione</option>${MOTIVOS_REPROVACAO.map((x) => `<option>${esc(x)}</option>`).join('')}</select></div>
        <div class="field"><label>Quem informou *</label><select class="inp" id="rp-org"><option value="">Selecione</option>${['Jurídico', 'Hospital', 'Médico', 'Equipe interna'].map((x) => `<option>${x}</option>`).join('')}</select></div>
        <div class="field full"><label>Detalhes *</label><textarea class="inp" id="rp-det" rows="3" placeholder="Ex.: hospital recusou por falta de RQE em anestesiologia"></textarea></div>
        <div class="field full"><label class="small" style="display:flex;gap:8px;align-items:center;text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink)"><input type="checkbox" id="rp-com" checked> Criar a ação "Informar resultado ao médico" para hoje</label></div>
        <div class="field full" id="rp-resp-w"><label>Quem comunica o médico</label><select class="inp" id="rp-resp">${pessoas.map((p) => `<option value="${p.user_id}" ${p.user_id === respDef ? 'selected' : ''}>${esc(p.display_name)}${p.setor ? ' · ' + esc(SETOR_USUARIO[p.setor] || p.setor) : ''}</option>`).join('')}</select></div>
      </div><div class="err" id="rp-err"></div></div>
      <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-danger" id="rp-ok">Reprovar</button></div>`,
    { size: 'sm', onClose: () => { if (!done) resolve(null); } });
    const el = m.el;
    $('#rp-com', el).onchange = (e) => { $('#rp-resp-w', el).hidden = !e.target.checked; };
    $('#rp-ok', el).onclick = () => {
      const mot = $('#rp-mot', el).value, org = $('#rp-org', el).value, det = $('#rp-det', el).value.trim();
      const falta = [!mot && 'motivo', !org && 'quem informou', det.length < 5 && 'detalhes'].filter(Boolean);
      if (falta.length) { $('#rp-err', el).textContent = 'Falta: ' + falta.join(', ') + '.'; return; }
      done = true; m.close();
      resolve({ motivo: `${mot} — ${det}`, origem: org, comunicar: $('#rp-com', el).checked, resp: $('#rp-resp', el).value });
    };
  });
}

/** Aviso ao Painel CallMed Connect (WhatsApp automático). Só roda se a integração estiver configurada. */
function notifyPainel(d, stage) {
  const ETAPAS_PAINEL = ['aguardando_contato', 'aguardando_medico', 'aguardando_juridico', 'documentacao_pendente', 'aguardando_hospital', 'aprovado', 'reprovado'];
  if (!window.FLOW_CONFIG.painelWebhook || !d.whatsapp || !ETAPAS_PAINEL.includes(stage)) return;
  sb.functions.invoke('flow-notify-painel', { body: { doctor_id: d.id } }).catch(() => { /* não bloqueia o fluxo */ });
}

async function reorderStages(fromId, toId) {
  const ids = S.stages.map((s) => s.id);
  const from = ids.indexOf(fromId), to = ids.indexOf(toId);
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  const before = S.stages.slice();
  S.stages = ids.map((id, i) => ({ ...S.stages.find((s) => s.id === id), position: i }));
  refreshFluxo();
  const { error } = await sb.from('flow_stages').upsert(S.stages.map((s) => ({ id: s.id, label: s.label, color: s.color, position: s.position, sla_hours: s.sla_hours, is_custom: s.is_custom, updated_at: new Date().toISOString() })));
  if (error) { S.stages = before; refreshFluxo(); toast('Não foi possível reordenar colunas.', 'err'); }
}

function openNewStage() {
  const m = openModal(`
    <div class="modal-head"><div><h2>Nova coluna</h2><div class="om-sub">Etapa extra do fluxo de credenciamento</div></div><button class="x" data-close>✕</button></div>
    <div class="modal-body">
      <div class="field"><label>Nome</label><input class="inp" id="ns-nome" placeholder="Ex: Em revisão"></div>
      <div class="form-grid"><div class="field"><label>Cor</label><input type="color" id="ns-cor" value="#6366f1" style="height:38px;width:100%"></div>
      <div class="field"><label>SLA (horas úteis)</label><input class="inp" type="number" id="ns-sla" value="24" min="1"></div></div>
    </div>
    <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-primary" id="ns-ok">Criar</button></div>`, { size: 'sm' });
  $('#ns-ok', m.el).onclick = async () => {
    const label = $('#ns-nome', m.el).value.trim();
    if (!label) return toast('Informe o nome da coluna.', 'err');
    const row = { id: 'custom_' + Date.now().toString(36), label, color: $('#ns-cor', m.el).value, position: 0, sla_hours: +$('#ns-sla', m.el).value || 24, is_custom: true };
    const shifted = S.stages.map((s) => ({ id: s.id, label: s.label, color: s.color, sla_hours: s.sla_hours, is_custom: s.is_custom, position: s.position + 1 }));
    const { error } = await sb.from('flow_stages').upsert([row, ...shifted]);
    if (error) return toast('Não foi possível criar coluna: ' + error.message, 'err');
    S.stages = [row, ...shifted];
    m.close(); toast('Coluna criada', 'ok'); buildFilters(); refreshFluxo();
  };
}
async function deleteStage(id) {
  const s = stageById(id);
  if (!s?.is_custom) return toast('Etapas padrão não podem ser removidas.', 'err');
  if (S.doctors.some((d) => d.stage === id)) return toast('Mova os médicos desta coluna antes de excluir.', 'err');
  if (!(await confirmDlg('Excluir coluna', `Excluir a coluna "${s.label}"?`, { okText: 'Excluir', danger: true }))) return;
  const { error } = await sb.from('flow_stages').delete().eq('id', id);
  if (error) return toast('Sem permissão para excluir coluna.', 'err');
  S.stages = S.stages.filter((x) => x.id !== id);
  toast('Coluna removida', 'ok'); buildFilters(); refreshFluxo();
}

// ================= INDICADORES =================
const IND = { hospital: '' };
function hbars(rows, color) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return rows.map((r) => `<div class="hbar ${r.go ? 'clk' : ''}" ${r.go ? `data-go="${esc(JSON.stringify(r.go))}" title="Ver estes médicos no Fluxo"` : ''}><span class="t" title="${esc(r.l)}">${esc(r.l)}</span><span class="b"><i style="width:${(r.v / max) * 100}%;background:${r.c || color}"></i></span><span class="n">${esc(r.txt ?? r.v)}</span></div>`).join('') || '<div class="empty">Sem dados</div>';
}
function renderIndicadores() {
  const root = $('#view-indicadores');
  const list = S.doctors.filter((d) => !IND.hospital || d.hospital === IND.hospital);
  const total = list.length;
  const apr = list.filter((d) => d.stage === 'aprovado').length;
  const rep = list.filter((d) => d.stage === 'reprovado').length;
  const open = list.filter((d) => !FINAL_STAGES.includes(d.stage));
  const slas = open.map(doctorSla);
  const urgent = slas.filter((s) => s.status === 'urgent').length, warning = slas.filter((s) => s.status === 'warning').length, okS = slas.filter((s) => s.status === 'ok').length;
  const slaPct = open.length ? Math.round((okS / open.length) * 100) : 100;
  const count = (arr, key) => { const m = {}; arr.forEach((x) => { const k = key(x); if (k) m[k] = (m[k] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const hf = IND.hospital ? { hospitals: [IND.hospital] } : {};
  const funnel = S.stages.map((s) => ({ l: s.label, v: list.filter((d) => d.stage === s.id).length, c: s.color, go: { ...hf, stage: s.id } }));
  const tempo = S.stages.filter((s) => !FINAL_STAGES.includes(s.id)).map((s) => {
    const ds = open.filter((d) => d.stage === s.id);
    const avg = ds.length ? ds.reduce((a, d) => a + businessHours(d.stage_entered_at), 0) / ds.length : 0;
    return { l: s.label, v: Math.round(avg), txt: `${Math.round(avg)}h / ${s.sla_hours}h`, c: avg > s.sla_hours ? 'var(--red)' : 'var(--brand)', go: { ...hf, stage: s.id } };
  });
  const setoresCount = {};
  list.forEach((d) => (d.setores || []).forEach((s) => { setoresCount[s] = (setoresCount[s] || 0) + 1; }));
  const topSet = Object.entries(setoresCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, v]) => ({ l, v, go: { ...hf, setor: l } }));
  const byHosp = count(open, (d) => d.hospital).slice(0, 10).map(([l, v]) => ({ l, v, go: { hospitals: [l] }, txt: `${v} (${open.filter((d) => d.hospital === l && doctorSla(d).status === 'urgent').length} venc.)` }));
  const hospitals = uniq(S.doctors.map((d) => d.hospital)).sort();
  root.innerHTML = `
    <div class="pg-head"><h2>Indicadores</h2><span class="sub">Funil do credenciamento, SLA e onde estão os gargalos.</span>
      <span class="right"><button class="btn btn-line btn-sm" data-goview="relatorios">${ic('file', 14)}Relatórios detalhados</button><select class="inp" id="ind-h" style="width:260px"><option value="">Todos os hospitais</option>${hospitals.map((h) => `<option ${IND.hospital === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></span></div>
    <div class="kpis">
      <div class="kpi"><span class="l">Cadastros</span><span class="v">${total}</span><span class="s">${open.length} em andamento</span></div>
      <div class="kpi click" data-kgo="${esc(JSON.stringify({ ...hf, stage: 'aprovado' }))}"><span class="l">Aprovados</span><span class="v" style="color:var(--green)">${apr}</span><span class="s">${apr + rep ? Math.round((apr / (apr + rep)) * 100) : 0}% de aprovação (desde o início)</span></div>
      <div class="kpi click" data-kgo="${esc(JSON.stringify({ ...hf, stage: 'reprovado' }))}"><span class="l">Reprovados</span><span class="v" style="color:var(--red)">${rep}</span></div>
      <div class="kpi" title="Médicos em andamento com o prazo da etapa em dia, agora"><span class="l">SLA em dia agora</span><span class="v" style="color:${slaPct >= 80 ? 'var(--green)' : slaPct >= 50 ? 'var(--amber)' : 'var(--red)'}">${slaPct}%</span><div class="ind-bar"><div style="width:${slaPct}%;background:var(--green)"></div></div></div>
      <div class="kpi click" data-kgo="${esc(JSON.stringify({ ...hf, slaVencido: true }))}"><span class="l">SLA vencido</span><span class="v" style="color:var(--red)">${urgent}</span><span class="s">${warning} em alerta</span></div>
      <div class="kpi click" data-kgo="${esc(JSON.stringify({ ...hf, priority: 'urgente' }))}"><span class="l">Urgentes</span><span class="v">${open.filter((d) => d.priority === 'urgente').length}</span></div>
    </div>
    <div class="grid-3">
      <div class="es-box"><div class="ql">Funil — médicos em cada etapa</div>${hbars(funnel)}</div>
      <div class="es-box"><div class="ql" title="Quanto tempo os médicos que estão em cada etapa hoje já estão nela. O tempo que as etapas levaram num período fica em Relatórios.">Há quanto tempo estão na etapa atual × SLA (horas úteis)</div>${hbars(tempo)}</div>
      <div class="es-box"><div class="ql">Em andamento por hospital</div>${hbars(byHosp, 'var(--brand)')}</div>
      <div class="es-box"><div class="ql">Setores</div>${hbars(topSet, 'var(--teal-deep)')}</div>
      <div class="es-box"><div class="ql">DISC</div>${hbars(DISC.map((k) => ({ l: DISC_LABEL[k], go: { ...hf, disc: k }, v: list.filter((d) => d.disc === k).length, c: k === 'ADERENTE' ? 'var(--green)' : k === 'REPROVADO' ? 'var(--red)' : k === 'AGUARDANDO RETORNO' ? '#e0a94f' : 'var(--ink-faint)' })))}</div>
      <div class="es-box"><div class="ql">Formação</div>${hbars(count(list, (d) => d.status_especialidade || 'Sem formação').map(([l, v]) => ({ l, v, go: l === 'Sem formação' ? null : { ...hf, statusEsp: l } })), 'var(--brand)')}</div>
    </div>`;
  $('#ind-h').onchange = (e) => { IND.hospital = e.target.value; renderIndicadores(); };
  $$('#view-indicadores [data-go], #view-indicadores [data-kgo]').forEach((el) => el.onclick = () => goFluxoFiltered(JSON.parse(el.dataset.go || el.dataset.kgo)));
}
VIEWS.indicadores = renderIndicadores;
