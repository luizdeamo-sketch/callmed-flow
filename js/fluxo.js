/* CallMed Flow — tela principal no padrão do CRM Aliança: barra de topo, Jornada (linha do tempo) e Kanban; e Indicadores */
'use strict';

const F = {
  search: '', hospitals: [], setor: '', estado: '', stage: '', disc: '', statusEsp: '', app: '', procuracao: '', priority: '', slaVencido: false,
  next: '', resp: '', mine: false,
};
const FX = { sumOpen: true, mode: 'jornada', gran: 'dia', offset: 0, limit: 300, showDone: false, sort: 'sla', filtersOpen: false, cell: null };
try { FX.gran = localStorage.getItem('flow:gran') || 'dia'; FX.sumOpen = localStorage.getItem('flow:sum') !== 'false'; } catch (_) { /* ignora */ }
try { FX.mode = localStorage.getItem('flow:mode') || 'jornada'; } catch (_) { /* ignora */ }
const colLimit = {}; // etapa -> quantos cards mostrar no Kanban
let STAGE_EV = null;  // histórico de etapas por médico (para a Jornada)

function filteredDoctors() {
  const q = norm(F.search);
  return S.doctors.filter((d) => {
    if (q && !(norm(d.name).includes(q) || norm(d.crm).includes(q) || norm(d.cpf).includes(q) || norm(d.hospital).includes(q) || norm(d.whatsapp).includes(q) || norm((d.setores || []).join(' ')).includes(q))) return false;
    if (F.hospitals.length && !F.hospitals.includes(d.hospital)) return false;
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
  return [F.hospitals.length, F.setor, F.estado, F.stage, F.disc, F.statusEsp, F.app, F.procuracao, F.priority, F.slaVencido, F.next, F.resp, F.mine].filter(Boolean).length;
}

// ================= estrutura da tela =================
function renderFluxo() {
  const root = $('#view-fluxo');
  if (!root.dataset.built) {
    root.dataset.built = '1';
    root.innerHTML = `
      <div class="op-top">
        <div class="op-filters">
          <span id="fx-kpis" class="op-kpis" style="display:contents"></span>
          <input id="f-search" placeholder="Buscar por nome, CRM, CPF, hospital ou telefone...">
          <div style="position:relative" id="f-hosp-wrap"><div id="fx-hosp-top" style="display:contents"></div></div>
          <button id="f-toggle">⚙ Filtros<span id="f-count" class="op-fcount" hidden></span></button>
          <div class="seg-toggle" id="fx-mode"><button data-mode="jornada">🧭 Jornada</button><button data-mode="kanban">▦ Kanban</button></div>
          <div class="op-nav-pill" id="fx-nav">
            <button data-nav="-big" title="Voltar mais">«</button><button data-nav="-small" title="Voltar">‹</button>
            <span class="rng" id="fx-range"></span>
            <button data-nav="small" title="Avançar">›</button><button data-nav="big" title="Avançar mais">»</button><button data-nav="0" title="Voltar para hoje">Hoje</button>
          </div>
          <div class="seg-toggle" id="fx-gran" title="Resumo por dia ou por mês"><button data-gran="dia">Dia</button><button data-gran="mes">Mês</button></div>
          <span style="flex:1"></span>
          <button class="icon-a" id="fx-hot" title="🔥 Prioridades da semana — quem cobrar primeiro">🔥</button>
          <button class="icon-a" id="fx-hoje" title="Hoje — o que preciso fazer" style="position:relative">☀️<span class="badge-dot" id="fx-hoje-n" hidden></span></button>
          <button class="icon-a" id="fx-msg" title="Disparar cobranças / avisos">✉️</button>
          <button class="icon-a" id="fx-export" title="Exportar os médicos filtrados (você escolhe as colunas)">⬇</button>
          <button class="icon-a primary" id="fx-new" title="Novo médico">＋</button>
        </div>
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
    $$('#fx-nav [data-nav]').forEach((b) => b.onclick = () => {
      const k = b.dataset.nav, step = FX.gran === 'mes' ? { small: 1, big: 6 } : { small: 7, big: 21 };
      FX.offset = k === '0' ? 0 : FX.offset + (k.startsWith('-') ? -1 : 1) * step[k.replace('-', '')];
      refreshFluxo();
    });
    $$('#fx-gran button').forEach((b) => b.onclick = () => {
      FX.gran = b.dataset.gran; FX.offset = 0; FX.cell = null;
      try { localStorage.setItem('flow:gran', FX.gran); } catch (_) { /* ignora */ }
      refreshFluxo();
    });
    $('#fx-msg').onclick = () => openMessages();
    $('#fx-hoje').onclick = () => openHoje();
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
  $('#fx-nav').hidden = $('#fx-gran').hidden = FX.mode !== 'jornada';
  $$('#fx-gran button').forEach((b) => b.classList.toggle('active', b.dataset.gran === FX.gran));
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
  const hb = $('#fx-hoje-n'); if (hb) { hb.hidden = !(mine.late + mine.hoje); hb.textContent = mine.late + mine.hoje; }
  $('#fx-kpis').innerHTML = `
    <span class="op-kpi"><b>${all.length}</b> cadastros</span>
    <span class="op-kpi"><b>${open.length}</b> em andamento</span>
    <span class="op-kpi clk ${F.stage === 'aprovado' ? 'on' : ''}" data-k="aprovado"><b>${all.filter((d) => d.stage === 'aprovado').length}</b> aprovados</span>
    <span class="op-kpi clk ${F.stage === 'documentacao_pendente' ? 'on' : ''}" data-k="docpend"><b>${all.filter((d) => d.stage === 'documentacao_pendente').length}</b> doc. pendente</span>
    <span class="op-kpi clk bad ${F.slaVencido ? 'on' : ''}" data-k="sla"><b>${venc}</b> SLA vencido</span>
    <span class="op-kpi clk bad ${F.priority === 'urgente' ? 'on' : ''}" data-k="urg"><b>${all.filter((d) => d.priority === 'urgente' && !FINAL_STAGES.includes(d.stage)).length}</b> urgentes</span>
    <span class="op-kpi"><b>${pct}%</b> SLA cumprido</span>
    <span class="op-kpi clk bad ${F.next === 'ate_hoje' && F.resp === 'me' ? 'on' : ''}" data-k="minhas" title="Minhas ações de hoje e atrasadas"><b>${mine.late + mine.hoje}</b> minhas ações p/ hoje</span>
    <span class="op-kpi clk ${F.next === 'sem' ? 'on' : ''}" data-k="semacao" style="background:var(--amber-soft)" title="Médicos em andamento sem próxima ação definida"><b style="color:var(--amber-ink)">⚠ ${team.sem}</b> sem próxima ação</span>
    <span class="op-kpi" style="${n !== all.length ? 'background:var(--amber-soft)' : ''}">exibindo <b style="${n !== all.length ? 'color:var(--amber-ink)' : ''}">${n}</b></span>`;
  $$('#fx-kpis [data-k]').forEach((k) => k.onclick = () => {
    const v = k.dataset.k;
    if (v === 'aprovado') F.stage = F.stage === 'aprovado' ? '' : 'aprovado';
    if (v === 'docpend') F.stage = F.stage === 'documentacao_pendente' ? '' : 'documentacao_pendente';
    if (v === 'sla') F.slaVencido = !F.slaVencido;
    if (v === 'urg') F.priority = F.priority === 'urgente' ? '' : 'urgente';
    if (v === 'minhas') { const on = F.next === 'ate_hoje' && F.resp === 'me'; F.next = on ? '' : 'ate_hoje'; F.resp = on ? '' : 'me'; }
    if (v === 'semacao') { F.next = F.next === 'sem' ? '' : 'sem'; F.resp = ''; }
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
  bind('#f-next', 'next'); bind('#f-resp', 'resp');
  $('#f-sla').onchange = (e) => { F.slaVencido = !!e.target.value; refreshFluxo(); };
  $('#f-done').onchange = (e) => { FX.showDone = e.target.checked; refreshFluxo(); };
  $('#f-mine').onchange = (e) => { F.mine = e.target.checked; refreshFluxo(); };
  $('#f-clear').onclick = () => {
    Object.assign(F, { hospitals: [], setor: '', estado: '', stage: '', disc: '', statusEsp: '', app: '', procuracao: '', priority: '', slaVencido: false, next: '', resp: '', mine: false });
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
  ['status_esp', 'Formação', (d) => d.status_especialidade], ['rqe', 'RQE', (d) => d.rqe], ['disc', 'DISC', (d) => DISC_LABEL[d.disc] || ''],
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
    <div class="modal-head"><div><h2>⬇ Exportar médicos</h2><div class="om-sub">${n} médico(s) do filtro atual · escolha as colunas</div></div><button class="x" data-close>✕</button></div>
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
    if (d.priority === 'hospital_novo') add(35, 'hospital novo (SLA 3h)');
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
    <div class="modal-head"><div><h2>🔥 Prioridades da semana</h2><div class="om-sub">Lista calculada automaticamente — quem cobrar primeiro (urgência, SLA, ações atrasadas e quem está quase pronto).</div></div><button class="x" data-close>✕</button></div>
    <div class="modal-body"><table class="t"><thead><tr><th>#</th><th>Médico</th><th>Pontos</th><th>Por quê</th><th>Próxima ação</th><th></th></tr></thead><tbody>
      ${rows.map((r, i) => `<tr><td>${i + 1}</td><td><a href="#" data-openp="${r.d.id}" style="color:var(--brand);font-weight:600">${esc(r.d.name)}</a><br><small class="muted">${esc(r.d.hospital)} · ${esc(stageLabel(r.d.stage))}</small></td>
        <td><b>${r.sc}</b></td><td><small>${r.why.map(esc).join(' · ')}</small></td><td><small>${r.d.proxima_acao ? esc(r.d.proxima_acao) + ' ' + fmtYmd(r.d.proxima_data) : '—'}</small></td>
        <td><button class="btn btn-line btn-sm" data-ch="${r.d.id}">Cobrar hoje</button></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nada crítico agora. 👍</td></tr>'}
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

/** Colunas da janela: por dia (21 dias) ou por mês (12 meses). Cada coluna é um período [start, end). */
function jornadaCols() {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  if (FX.gran === 'mes') {
    const first = new Date(today.getFullYear(), today.getMonth() - 9 + FX.offset, 1);
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(first.getFullYear(), first.getMonth() + i, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      return { start, end, label: MES[start.getMonth()], sub: String(start.getFullYear()).slice(2), cur: now >= start && now < end, tag: `${MES[start.getMonth()]}/${String(start.getFullYear()).slice(2)}` };
    });
  }
  return Array.from({ length: 21 }, (_, i) => {
    const start = new Date(today); start.setDate(start.getDate() - 17 + i + FX.offset);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const lbl = `${pad(start.getDate())}/${pad(start.getMonth() + 1)}`;
    return { start, end, label: lbl, sub: WD[start.getDay()], cur: +start === +today, we: [0, 6].includes(start.getDay()), tag: lbl };
  });
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
    else { F[k] = ''; if (k === 'search') $('#f-search').value = ''; }
    buildFilters(); refreshFluxo();
  });
  const all = $('#fx-unall', box);
  if (all) all.onclick = () => {
    FX.cell = null; $('#f-search').value = '';
    Object.assign(F, { search: '', hospitals: [], setor: '', estado: '', stage: '', disc: '', statusEsp: '', app: '', procuracao: '', priority: '', slaVencido: false, next: '', resp: '', mine: false });
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
  $('#fx-range').textContent = FX.gran === 'mes' ? `${cols[0].tag} – ${cols[cols.length - 1].tag}` : `${cols[0].tag} – ${cols[cols.length - 1].tag}`;
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

  const head = `<div class="op-row op-head"><div class="op-left"><span id="fx-sumtoggle" style="cursor:pointer" title="Recolher / abrir o resumo">${FX.sumOpen ? '▾' : '▸'} Resumo ${FX.gran === 'mes' ? 'mensal' : 'diário'}</span><span class="info-ico" title="Cada número é quantos médicos passaram por aquela etapa naquele ${FX.gran === 'mes' ? 'mês' : 'dia'}. Clique no número para ver só esses médicos na lista.">ⓘ</span></div>
    <div class="op-right">${cols.map((c, i) => `<div class="op-mh ${c.cur ? 'cur' : ''} ${c.we ? 'we' : ''}" style="left:calc(${i} * var(--dw))"><span class="op-mt"><span>${c.label}<small>${c.sub}</small></span>${FX.gran === 'mes' && c.start <= now ? `<button class="op-mtoggle" data-expand="${i}" title="Abrir os dias de ${c.tag}">⤢</button>` : ''}</span></div>`).join('')}</div></div>`;

  const sum = `<div class="op-sumbox">${shownStages.map((s) => `<div class="op-sumrow"><div class="op-left ${F.stage === s.id ? 'sel' : ''}" data-sstage="${s.id}" title="${FINAL_STAGES.includes(s.id) ? 'Encerramentos: conta só no dia em que aconteceu' : 'Filtrar por quem está hoje nesta etapa'}"><span class="op-dot" style="background:${esc(s.color)}"></span>${esc(s.label)}<b style="margin-left:auto;font-family:Poppins">${FINAL_STAGES.includes(s.id) ? list.filter((d) => d.stage === s.id && closedInWindow(d)).length : list.filter((d) => d.stage === s.id).length}</b></div>
    <div class="op-right">${counts[s.id].map((n, i) => {
      const c = cols[i];
      if (c.start > now) return '';
      return `<div class="op-sumcell ${n ? 'clk' : 'z'} ${isSel(s.id, c) ? 'sel' : ''}" style="left:calc(${i} * var(--dw))" ${n ? `data-cell="${s.id}|${i}" title="${n} médico(s) em ${esc(s.label)} em ${c.tag}"` : ''}>${n || '·'}</div>`;
    }).join('')}</div></div>`).join('')}
    <div class="op-sumrow op-totalrow"><div class="op-left" title="Soma de todas as etapas acima (cada coluna = soma do dia/mês)">Σ Total<b style="margin-left:auto;font-family:Poppins">${shownStages.reduce((a, s) => a + (FINAL_STAGES.includes(s.id) ? list.filter((d) => d.stage === s.id && closedInWindow(d)).length : list.filter((d) => d.stage === s.id).length), 0)}</b></div>
      <div class="op-right">${cols.map((c, i) => (c.start > now ? '' : `<div class="op-sumcell" style="left:calc(${i} * var(--dw))">${shownStages.reduce((a, s) => a + counts[s.id][i], 0)}</div>`)).join('')}</div></div>
    <div class="op-sumrow"><div class="op-left" id="fx-closed" title="Aprovado ou reprovado encerra o credenciamento — por isso ficam fora da tela" style="color:var(--ink-faint)">✔ Encerrados antes: ${nApr} aprov. · ${nRep} reprov.<span class="btn-ghost" style="margin-left:auto;padding:0">${FX.showDone ? 'ocultar' : 'mostrar'}</span></div><div class="op-right"></div></div></div>`;

  const countRow = `<div class="op-row op-countrow"><div class="op-left">${rows.length} de ${list.length} médicos
      <select id="fx-sort" style="margin-left:auto;border:none;background:transparent;font:inherit;color:inherit;text-transform:uppercase;cursor:pointer">
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
      <div class="op-left"><div class="n"><span class="sdot s-${sla ? sla.status : 'none'}"></span>${esc(d.name)}${d.priority === 'urgente' ? '<span class="tagx bad">URG</span>' : d.priority === 'hospital_novo' ? '<span class="tagx warn">3h</span>' : ''}</div>
        <div class="m">${esc(d.hospital)}${d.crm ? ' · ' + esc(d.crm) : ''}${d.status_especialidade ? ' · ' + esc(d.status_especialidade) : ''}${(d.setores || []).length ? ' · ' + esc(d.setores.join(', ')) : ''} · ${daysIn(d)}d${sla ? ` · <span style="color:${sla.status === 'urgent' ? 'var(--red)' : sla.status === 'warning' ? 'var(--amber)' : 'inherit'}">${sla.status === 'urgent' ? 'SLA vencido' : 'SLA ' + fmtRemaining(sla.remaining)}</span>` : ` · ${esc(stageLabel(d.stage))}`}${nextInline(d)}</div></div>
      <div class="op-right">${todayPos >= 0 ? `<div class="op-today" style="left:calc(${todayPos} * var(--dw))"></div>` : ''}
        ${segs.map((s) => { const st = stageById(s.st); const w = s.end - s.start + 1; return `<div class="seg" style="left:calc(${s.start} * var(--dw) + 2px);width:calc(${w} * var(--dw) - 4px);background:${esc(st?.color || '#999')}" title="${esc(st?.label || s.st)}">${w >= 2 || FX.gran === 'mes' ? esc(st?.label || '') : ''}</div>`; }).join('')}</div></div>`;
  };

  body.innerHTML = `<div class="op-scroll" style="--ndays:${cols.length};--dw:${FX.gran === 'mes' ? '96px' : '56px'}"><div class="op-sticky">${head}${FX.sumOpen ? sum : ''}</div>${countRow}${rows.slice(0, FX.limit).map(rowHtml).join('') || '<div class="op-more">Nenhum médico com esses filtros.</div>'}
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
    FX.gran = 'dia'; FX.cell = null;
    FX.offset = Math.round((c.start - t) / 864e5) + 17; // janela diária começa no dia 1 do mês
    try { localStorage.setItem('flow:gran', 'dia'); } catch (_) { /* ignora */ }
    refreshFluxo();
  });
  renderCellChip();
}

// ================= KANBAN =================
function cardHtml(d) {
  const sla = FINAL_STAGES.includes(d.stage) ? null : doctorSla(d);
  const prog = S.docProgress[d.id] || 0;
  const t = (on, label) => `<span class="tag ${on ? 'on' : 'off'}">${label}</span>`;
  return `<div class="kcard" draggable="true" data-id="${d.id}">
    <div class="top"><span class="sdot s-${sla ? sla.status : 'none'}"></span><span class="nm" title="${esc(d.name)}">${esc(d.name)}</span>${d.priority === 'urgente' ? '<span class="tagx bad">URG</span>' : d.priority === 'hospital_novo' ? '<span class="tagx warn">3h</span>' : ''}</div>
    <div class="kgrid"><span title="${esc((d.setores || []).join(', '))}">${esc((d.setores || []).join(', ') || '—')}</span><span title="${esc(d.hospital)}">${esc(d.hospital)}</span><span>${esc(d.crm || '—')}</span><span>${esc(d.whatsapp || '—')}</span></div>
    <div class="tags">${d.status_especialidade ? `<span class="tag">${esc(d.status_especialidade)}</span>` : ''}${d.disc ? `<span class="tag ${DISC_CLASS[d.disc]}">${esc(DISC_LABEL[d.disc])}</span>` : ''}${t(d.link_enviado, 'Link')}${t(d.app, 'APP')}${t(d.procuracao, 'Proc.')}</div>
    ${d.doc_pendente ? `<div class="pend" title="${esc(d.doc_pendente)}">📄 ${esc(d.doc_pendente)}</div>` : ''}
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
        ${S.isAdmin && s.is_custom ? `<button class="del" data-delcol="${s.id}" title="Excluir coluna">🗑</button>` : ''}
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
  const patch = { stage: toStage, stage_entered_at: new Date().toISOString(), sla_hours: st?.sla_hours ?? 24 };
  // próxima ação sugerida para a nova etapa (encerrado = sem próxima ação)
  if (FINAL_STAGES.includes(toStage)) Object.assign(patch, { proxima_acao: null, proxima_data: null, proximo_responsavel_id: null });
  else if (ACAO_POR_ETAPA[toStage]) Object.assign(patch, { proxima_acao: ACAO_POR_ETAPA[toStage], proxima_data: addBusinessDays(1), proximo_responsavel_id: d.proximo_responsavel_id || S.user.id });
  const { error } = await sb.from('flow_doctors').update(patch).eq('id', d.id);
  if (error) { toast('Erro ao mover médico: ' + error.message, 'err'); return false; }
  Object.assign(d, patch);
  const { data: act } = await sb.from('flow_activities').insert({ doctor_id: d.id, description: `Movido para ${st?.label || toStage}`, type: 'stage_change' }).select().single();
  if (STAGE_EV && act) (STAGE_EV[d.id] ||= []).push({ at: new Date(act.created_at), stage: toStage });
  if (typeof ACTS !== 'undefined') ACTS = null;
  notifyPainel(d, toStage);
  toast(`${d.name} → ${st?.label || toStage}`, 'ok');
  afterDoctorChange();
  return true;
}

/** Aviso ao Painel CallMed Connect (WhatsApp automático). Só roda se a integração estiver configurada. */
function notifyPainel(d, stage) {
  const ETAPAS_PAINEL = ['aguardando_contato', 'aguardando_medico', 'enviar_documentos_juridico', 'aguardando_juridico', 'documentacao_pendente', 'aguardando_hospital', 'aprovado', 'reprovado'];
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
    <div class="pg-head"><h2>📊 Indicadores</h2><span class="sub">Funil do credenciamento, SLA e onde estão os gargalos.</span>
      <span class="right"><select class="inp" id="ind-h" style="width:260px"><option value="">Todos os hospitais</option>${hospitals.map((h) => `<option ${IND.hospital === h ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></span></div>
    <div class="kpis">
      <div class="kpi"><span class="l">Cadastros</span><span class="v">${total}</span><span class="s">${open.length} em andamento</span></div>
      <div class="kpi click" data-kgo="${esc(JSON.stringify({ ...hf, stage: 'aprovado' }))}"><span class="l">Aprovados</span><span class="v" style="color:var(--green)">${apr}</span><span class="s">${apr + rep ? Math.round((apr / (apr + rep)) * 100) : 0}% de aprovação</span></div>
      <div class="kpi click" data-kgo="${esc(JSON.stringify({ ...hf, stage: 'reprovado' }))}"><span class="l">Reprovados</span><span class="v" style="color:var(--red)">${rep}</span></div>
      <div class="kpi"><span class="l">SLA em dia</span><span class="v" style="color:${slaPct >= 80 ? 'var(--green)' : slaPct >= 50 ? 'var(--amber)' : 'var(--red)'}">${slaPct}%</span><div class="ind-bar"><div style="width:${slaPct}%;background:var(--green)"></div></div></div>
      <div class="kpi click" data-kgo="${esc(JSON.stringify({ ...hf, slaVencido: true }))}"><span class="l">SLA vencido</span><span class="v" style="color:var(--red)">${urgent}</span><span class="s">${warning} em alerta</span></div>
      <div class="kpi click" data-kgo="${esc(JSON.stringify({ ...hf, priority: 'urgente' }))}"><span class="l">Urgentes</span><span class="v">${open.filter((d) => d.priority === 'urgente').length}</span></div>
    </div>
    <div class="grid-3">
      <div class="es-box"><div class="ql">Funil — médicos em cada etapa</div>${hbars(funnel)}</div>
      <div class="es-box"><div class="ql">Tempo médio na etapa atual × SLA (horas úteis)</div>${hbars(tempo)}</div>
      <div class="es-box"><div class="ql">Em andamento por hospital</div>${hbars(byHosp, 'var(--brand)')}</div>
      <div class="es-box"><div class="ql">Setores</div>${hbars(topSet, 'var(--teal-deep)')}</div>
      <div class="es-box"><div class="ql">DISC</div>${hbars(DISC.map((k) => ({ l: DISC_LABEL[k], go: { ...hf, disc: k }, v: list.filter((d) => d.disc === k).length, c: k === 'ADERENTE' ? 'var(--green)' : k === 'REPROVADO' ? 'var(--red)' : k === 'AGUARDANDO RETORNO' ? '#e0a94f' : 'var(--ink-faint)' })))}</div>
      <div class="es-box"><div class="ql">Formação</div>${hbars(count(list, (d) => d.status_especialidade || 'Sem formação').map(([l, v]) => ({ l, v, go: l === 'Sem formação' ? null : { ...hf, statusEsp: l } })), 'var(--brand)')}</div>
    </div>`;
  $('#ind-h').onchange = (e) => { IND.hospital = e.target.value; renderIndicadores(); };
  $$('#view-indicadores [data-go], #view-indicadores [data-kgo]').forEach((el) => el.onclick = () => goFluxoFiltered(JSON.parse(el.dataset.go || el.dataset.kgo)));
}
VIEWS.indicadores = renderIndicadores;
