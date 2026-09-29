/* CallMed Flow — tela principal: métricas, filtros, dashboard e Kanban */
'use strict';

const F = {
  search: '', hospitals: [], setor: '', estado: '', stage: '', disc: '', statusEsp: '', app: '', procuracao: '', priority: '', slaVencido: false,
};
const colLimit = {}; // etapa -> quantos cards mostrar
let dashOpen = true;
try { dashOpen = localStorage.getItem('flow:dash') !== 'false'; } catch (_) { /* ignora */ }

function filteredDoctors() {
  const q = norm(F.search);
  return S.doctors.filter((d) => {
    if (q && !(norm(d.name).includes(q) || norm(d.crm).includes(q) || norm(d.cpf).includes(q) || norm(d.hospital).includes(q) || norm((d.setores || []).join(' ')).includes(q))) return false;
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
    return true;
  });
}

function renderFluxo() {
  const root = $('#view-fluxo');
  if (!root.dataset.built) {
    root.dataset.built = '1';
    root.innerHTML = `
      <div class="kpis" id="fx-metrics"></div>
      <div class="toolbar" id="fx-filters"></div>
      <div class="collapser" id="fx-dash-toggle"></div>
      <div id="fx-dash"></div>
      <div class="kanban-wrap"><div class="kanban-board" id="fx-board"></div></div>`;
    buildFilters();
    $('#fx-dash-toggle').onclick = () => {
      dashOpen = !dashOpen;
      try { localStorage.setItem('flow:dash', dashOpen); } catch (_) { /* ignora */ }
      refreshFluxo();
    };
  }
  refreshFluxo();
}
VIEWS.fluxo = renderFluxo;

function refreshFluxo() {
  if (!$('#fx-board')) return;
  renderMetrics();
  syncFilterWidgets();
  const list = filteredDoctors();
  $('#fx-dash-toggle').innerHTML = `${dashOpen ? '▾' : '▸'} Dashboard Analytics <span class="muted small">(${list.length} médico(s) no filtro)</span>`;
  $('#fx-dash').innerHTML = dashOpen ? dashboardHtml(list) : '';
  bindDashboard();
  renderBoard(list);
}

// ---------- métricas (sobre todos) ----------
function renderMetrics() {
  const all = S.doctors;
  const open = all.filter((d) => !FINAL_STAGES.includes(d.stage));
  const okCount = open.filter((d) => doctorSla(d).status !== 'urgent').length;
  const pct = open.length ? Math.round((okCount / open.length) * 100) : 100;
  $('#fx-metrics').innerHTML = `
    <div class="kpi"><div class="l">Total cadastros</div><div class="v">${all.length}</div></div>
    <div class="kpi"><div class="l">Aprovados</div><div class="v" style="color:var(--green)">${all.filter((d) => d.stage === 'aprovado').length}</div></div>
    <div class="kpi"><div class="l">Doc. pendente</div><div class="v" style="color:var(--amber)">${all.filter((d) => d.stage === 'documentacao_pendente').length}</div></div>
    <div class="kpi"><div class="l">SLA cumprido</div><div class="v" style="color:${pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)'}">${pct}%</div><div class="s">${open.length} em andamento</div></div>
    <div class="kpi"><div class="l">Ações</div><div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" id="fx-new">＋ Novo médico</button>
      <button class="btn btn-line btn-sm" id="fx-msg">✉ Cobranças</button></div></div>`;
  $('#fx-new').onclick = () => openNewDoctor();
  $('#fx-msg').onclick = () => openMessages();
}

// ---------- filtros ----------
function buildFilters() {
  const estados = uniq(S.doctors.map((d) => d.estado).filter(Boolean)).sort();
  const setores = uniq([...SETORES, ...S.doctors.flatMap((d) => d.setores || [])]);
  const opt = (v, l, sel) => `<option value="${esc(v)}" ${sel === v ? 'selected' : ''}>${esc(l)}</option>`;
  $('#fx-filters').innerHTML = `
    <input class="inp search" id="f-search" placeholder="Buscar médico, CRM, CPF, hospital..." value="${esc(F.search)}">
    <div style="position:relative">
      <button class="btn btn-line btn-sm" id="f-hosp-btn"></button>
      <div class="pop" id="f-hosp-pop" hidden style="top:36px;left:0;right:auto;width:320px;padding:8px"></div>
    </div>
    <select class="inp" id="f-setor"><option value="">Todos setores</option>${setores.map((s) => opt(s, s, F.setor)).join('')}</select>
    <select class="inp" id="f-estado"><option value="">Todos estados</option>${estados.map((s) => opt(s, s, F.estado)).join('')}</select>
    <select class="inp" id="f-stage"><option value="">Todas etapas</option>${S.stages.map((s) => opt(s.id, s.label, F.stage)).join('')}</select>
    <select class="inp" id="f-disc"><option value="">Todos DISC</option>${DISC.map((s) => opt(s, DISC_LABEL[s], F.disc)).join('')}</select>
    <select class="inp" id="f-status"><option value="">Todos status</option>${STATUS_ESP.map((s) => opt(s, s, F.statusEsp)).join('')}</select>
    <select class="inp" id="f-app"><option value="">Todos APP</option>${opt('true', 'Com APP', F.app)}${opt('false', 'Sem APP', F.app)}</select>
    <select class="inp" id="f-proc"><option value="">Todas proc.</option>${opt('true', 'Com procuração', F.procuracao)}${opt('false', 'Sem procuração', F.procuracao)}</select>
    <select class="inp" id="f-prio"><option value="">Todas prior.</option>${Object.entries(PRIORITIES).map(([k, l]) => opt(k, l, F.priority)).join('')}</select>
    <label class="small" style="display:flex;gap:5px;align-items:center;font-weight:600"><input type="checkbox" id="f-sla" ${F.slaVencido ? 'checked' : ''}> SLA vencido</label>
    <button class="btn-ghost" id="f-clear" hidden>Limpar filtros</button>`;
  let t;
  $('#f-search').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { F.search = e.target.value; refreshFluxo(); }, 180); };
  const bind = (id, key) => { $(id).onchange = (e) => { F[key] = e.target.value; refreshFluxo(); }; };
  bind('#f-setor', 'setor'); bind('#f-estado', 'estado'); bind('#f-stage', 'stage'); bind('#f-disc', 'disc');
  bind('#f-status', 'statusEsp'); bind('#f-app', 'app'); bind('#f-proc', 'procuracao'); bind('#f-prio', 'priority');
  $('#f-sla').onchange = (e) => { F.slaVencido = e.target.checked; refreshFluxo(); };
  $('#f-clear').onclick = () => {
    Object.assign(F, { hospitals: [], setor: '', estado: '', stage: '', disc: '', statusEsp: '', app: '', procuracao: '', priority: '', slaVencido: false });
    buildFilters(); refreshFluxo();
  };
  $('#f-hosp-btn').onclick = (e) => {
    e.stopPropagation();
    const pop = $('#f-hosp-pop');
    pop.hidden = !pop.hidden;
    if (!pop.hidden) renderHospPop();
  };
  document.addEventListener('click', (e) => { if (!e.target.closest('#f-hosp-pop') && $('#f-hosp-pop')) $('#f-hosp-pop').hidden = true; });
}
function renderHospPop() {
  const names = uniq([...S.hospitals.map((h) => h.nome), ...S.doctors.map((d) => d.hospital)]).sort((a, b) => a.localeCompare(b));
  const pop = $('#f-hosp-pop');
  pop.innerHTML = `<div style="display:flex;justify-content:space-between;padding:2px 4px 8px"><button class="btn-ghost" id="hp-all">Selecionar todos</button><button class="btn-ghost" id="hp-none">Limpar</button></div>` +
    names.map((n) => `<label style="display:flex;gap:8px;padding:4px;font-size:12.5px;cursor:pointer"><input type="checkbox" value="${esc(n)}" ${F.hospitals.includes(n) ? 'checked' : ''}> ${esc(n)}</label>`).join('');
  $$('input', pop).forEach((c) => c.onchange = () => {
    F.hospitals = $$('input:checked', pop).map((x) => x.value);
    refreshFluxo();
  });
  $('#hp-all', pop).onclick = () => { F.hospitals = names.slice(); renderHospPop(); refreshFluxo(); };
  $('#hp-none', pop).onclick = () => { F.hospitals = []; renderHospPop(); refreshFluxo(); };
}
function syncFilterWidgets() {
  const b = $('#f-hosp-btn');
  if (!b) return;
  b.textContent = !F.hospitals.length ? 'Todos hospitais ▾' : F.hospitals.length === 1 ? F.hospitals[0] + ' ▾' : `${F.hospitals.length} hospitais ▾`;
  const active = F.hospitals.length || F.setor || F.estado || F.stage || F.disc || F.statusEsp || F.app || F.procuracao || F.priority || F.slaVencido;
  $('#f-clear').hidden = !active;
  $('#f-stage').value = F.stage; $('#f-prio').value = F.priority; $('#f-sla').checked = F.slaVencido;
}

// ---------- dashboard (sobre filtrados) ----------
function hbars(rows, color) {
  const max = Math.max(1, ...rows.map((r) => r.v));
  return rows.map((r) => `<div class="hbar"><span class="t" title="${esc(r.l)}">${esc(r.l)}</span><span class="b"><i style="width:${(r.v / max) * 100}%;background:${r.c || color}"></i></span><span class="n">${esc(r.txt ?? r.v)}</span></div>`).join('') || '<div class="empty">Sem dados</div>';
}
function dashboardHtml(list) {
  if (!list.length) return '';
  const total = list.length;
  const apr = list.filter((d) => d.stage === 'aprovado').length;
  const rep = list.filter((d) => d.stage === 'reprovado').length;
  const open = list.filter((d) => !FINAL_STAGES.includes(d.stage));
  const slas = open.map(doctorSla);
  const urgent = slas.filter((s) => s.status === 'urgent').length;
  const warning = slas.filter((s) => s.status === 'warning').length;
  const okS = slas.filter((s) => s.status === 'ok').length;
  const count = (arr, key) => {
    const m = {};
    arr.forEach((x) => { const k = key(x); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  };
  const funnel = ['aguardando_contato', 'documentacao_pendente', 'aguardando_medico', 'aguardando_hospital', 'aprovado', 'reprovado']
    .map((id) => ({ l: stageLabel(id).replace('Aguardando ', 'Ag. ').replace('Documentação ', 'Doc. ').replace('Retorno ', 'Ret. '), v: list.filter((d) => d.stage === id).length, c: stageById(id)?.color }));
  const tempo = S.stages.filter((s) => s.id !== 'reprovado').map((s) => {
    const ds = list.filter((d) => d.stage === s.id);
    const avg = ds.length ? ds.reduce((a, d) => a + (Date.now() - new Date(d.stage_entered_at)) / 3.6e6, 0) / ds.length : 0;
    return { l: s.label, v: Math.round(avg), txt: Math.round(avg) + 'h', c: s.color };
  });
  const setoresCount = {};
  list.forEach((d) => (d.setores || []).forEach((s) => { setoresCount[s] = (setoresCount[s] || 0) + 1; }));
  const topSet = Object.entries(setoresCount).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([l, v]) => ({ l, v }));
  const topHosp = count(list, (d) => d.hospital).slice(0, 6).map(([l, v]) => ({ l, v }));
  const slaPct = open.length ? Math.round((okS / open.length) * 100) : 100;
  const on = (k) => (k ? 'on' : '');
  return `
    <div class="kpis">
      <div class="kpi"><div class="l">Em andamento</div><div class="v">${open.length}</div><div class="s">de ${total} total</div></div>
      <div class="kpi click ${on(F.stage === 'aprovado')}" data-dash="aprovado"><div class="l">Taxa de aprovação</div><div class="v">${apr + rep ? Math.round((apr / (apr + rep)) * 100) : 0}%</div><div class="s">${apr} aprovados</div></div>
      <div class="kpi click ${on(F.priority === 'urgente')}" data-dash="urgente"><div class="l">Urgentes</div><div class="v" style="color:var(--red)">${list.filter((d) => d.priority === 'urgente').length}</div><div class="s">${list.some((d) => d.priority === 'urgente') ? 'precisam atenção' : 'tudo ok'}</div></div>
      <div class="kpi click ${on(F.slaVencido)}" data-dash="sla"><div class="l">SLA vencido</div><div class="v" style="color:var(--red)">${urgent}</div><div class="s">${warning} em alerta</div></div>
      <div class="kpi"><div class="l">Hospitais</div><div class="v">${uniq(list.map((d) => d.hospital)).length}</div></div>
      <div class="kpi"><div class="l">Setores</div><div class="v">${Object.keys(setoresCount).length}</div></div>
    </div>
    <div class="grid-3">
      <div class="panel"><h3>Funil de conversão</h3>${hbars(funnel)}</div>
      <div class="panel"><h3>SLA em dia</h3>
        <div style="display:flex;align-items:center;gap:18px">
          <div style="width:110px;height:110px;border-radius:50%;background:conic-gradient(var(--green) ${slaPct * 3.6}deg, var(--border-soft) 0);display:grid;place-items:center">
            <div style="width:80px;height:80px;border-radius:50%;background:var(--surface);display:grid;place-items:center;font-family:Poppins;font-weight:700;font-size:1.3rem">${slaPct}%</div></div>
          <div class="small"><div><span class="slapill ok">${okS} ok</span></div><div style="margin:6px 0"><span class="slapill warning">${warning} !</span></div><div><span class="slapill urgent">${urgent} !!</span></div></div>
        </div></div>
      <div class="panel"><h3>Tempo médio na etapa atual (horas corridas)</h3>${hbars(tempo)}</div>
      <div class="panel"><h3>Top hospitais</h3>${hbars(topHosp, 'var(--brand)')}</div>
      <div class="panel"><h3>Top setores</h3>${hbars(topSet, 'var(--teal-deep)')}</div>
      <div class="panel"><h3>DISC</h3>${hbars(DISC.map((k) => ({ l: DISC_LABEL[k], v: list.filter((d) => d.disc === k).length, c: k === 'ADERENTE' ? 'var(--green)' : k === 'REPROVADO' ? 'var(--red)' : k === 'AGUARDANDO RETORNO' ? '#e0a94f' : 'var(--ink-faint)' })))}</div>
    </div>`;
}
function bindDashboard() {
  $$('[data-dash]').forEach((el) => el.onclick = () => {
    const k = el.dataset.dash;
    if (k === 'aprovado') { F.stage = F.stage === 'aprovado' ? '' : 'aprovado'; }
    if (k === 'urgente') { F.priority = F.priority === 'urgente' ? '' : 'urgente'; F.stage = ''; F.slaVencido = false; }
    if (k === 'sla') { F.slaVencido = !F.slaVencido; F.stage = ''; F.priority = ''; }
    refreshFluxo();
  });
}

// ---------- kanban ----------
function cardHtml(d) {
  const sla = FINAL_STAGES.includes(d.stage) ? null : doctorSla(d);
  const prog = S.docProgress[d.id] || 0;
  const t = (on, label) => `<span class="tag ${on ? 'on' : 'off'}">${label}</span>`;
  return `<div class="kcard" draggable="true" data-id="${d.id}">
    <div class="top"><span class="sdot s-${sla ? sla.status : 'none'}"></span><span class="nm" title="${esc(d.name)}">${esc(d.name)}</span>${d.priority === 'urgente' ? '<span class="tag r">URG</span>' : d.priority === 'hospital_novo' ? '<span class="tag a">NOVO 3h</span>' : ''}</div>
    <div class="kgrid"><span title="${esc((d.setores || []).join(', '))}">${esc((d.setores || []).join(', ') || '—')}</span><span title="${esc(d.hospital)}">${esc(d.hospital)}</span><span>${esc(d.estado || '—')}</span><span>${esc(d.whatsapp || '—')}</span></div>
    <div class="tags">${d.crm ? `<span class="tag">${esc(d.crm)}</span>` : ''}${d.status_especialidade ? `<span class="tag">${esc(d.status_especialidade)}</span>` : ''}${d.disc ? `<span class="tag ${DISC_CLASS[d.disc]}">${esc(DISC_LABEL[d.disc])}</span>` : ''}${t(d.link_enviado, 'Link')}${t(d.app, 'APP')}${t(d.procuracao, 'Proc.')}</div>
    ${d.doc_pendente ? `<div class="pend" title="${esc(d.doc_pendente)}">📄 ${esc(d.doc_pendente)}</div>` : ''}
    <div class="foot"><span class="prog"><i style="width:${prog}%;background:${prog >= 100 ? 'var(--green)' : prog >= 50 ? '#e0a94f' : 'var(--ink-faint)'}"></i></span>${prog}%
      <span>${fmtDate(d.entry_date)}</span>${sla ? `<span class="slapill ${sla.status}">${fmtRemaining(sla.remaining)}</span>` : ''}</div>
  </div>`;
}

let dragDoctor = null, dragCol = null;
function renderBoard(list) {
  const board = $('#fx-board');
  const byStage = {};
  list.forEach((d) => { (byStage[d.stage] ||= []).push(d); });
  board.innerHTML = S.stages.map((s) => {
    const items = byStage[s.id] || [];
    const lim = colLimit[s.id] || 80;
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
  }).join('') + (S.isAdmin ? '<button class="newcol" id="fx-newcol">＋ Nova coluna</button>' : '');

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

/** Move o médico de etapa, registra no histórico (o banco gera as notificações). */
async function moveDoctor(d, toStage) {
  const st = stageById(toStage);
  const patch = { stage: toStage, stage_entered_at: new Date().toISOString(), sla_hours: st?.sla_hours ?? 24 };
  const { error } = await sb.from('flow_doctors').update(patch).eq('id', d.id);
  if (error) { toast('Erro ao mover médico: ' + error.message, 'err'); return false; }
  Object.assign(d, patch);
  await sb.from('flow_activities').insert({ doctor_id: d.id, description: `Movido para ${st?.label || toStage}`, type: 'stage_change' });
  notifyPainel(d, toStage);
  refreshFluxo();
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
    <div class="modal-head"><h2>Nova coluna</h2><button class="x" data-close>×</button></div>
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
    m.close(); toast('Coluna criada', 'ok'); refreshFluxo();
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
  toast('Coluna removida', 'ok'); refreshFluxo();
}
