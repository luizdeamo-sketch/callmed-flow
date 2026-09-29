/* CallMed Flow — Relatórios e Auditoria (a linha do tempo virou a Jornada, em fluxo.js) */
'use strict';

let ACTS = null; // cache de todas as atividades (asc)
async function loadAllActivities(force) {
  if (ACTS && !force && Date.now() - ACTS.at < 60000) return ACTS.rows;
  const rows = await fetchAll('flow_activities', '*', { order: 'created_at', asc: true });
  ACTS = { rows, at: Date.now() };
  return rows;
}
/** Linha do tempo de etapas de cada médico a partir do histórico ("Cadastro criado" + "Movido para X"). */
function stageEvents(acts) {
  const byLabel = Object.fromEntries(S.stages.map((s) => [s.label, s.id]));
  const ev = {};
  acts.forEach((a) => {
    if (!a.doctor_id || a.type !== 'stage_change') return;
    let st = null;
    if (a.description === 'Cadastro criado no sistema') st = 'aguardando_contato';
    else if (a.description.startsWith('Movido para ')) st = byLabel[a.description.slice(12)] || null;
    if (st) (ev[a.doctor_id] ||= []).push({ at: new Date(a.created_at), stage: st });
  });
  return ev;
}

// ================= RELATÓRIOS =================
const RF = { period: '30', from: '', to: '', hospital: '', stage: '', setor: '', priority: '', owner: '', q: '', slaStatus: '', tab: 'geral' };

async function renderReports() {
  const root = $('#view-relatorios');
  root.innerHTML = '<div class="empty">Carregando relatórios…</div>';
  let acts, rqes;
  try {
    [acts] = await Promise.all([loadAllActivities(), R.list.length ? null : loadRqe()]);
    rqes = R.list;
  } catch (e) { root.innerHTML = `<div class="alert r">Erro: ${esc(e.message)}</div>`; return; }
  drawReports(acts, rqes);
}
VIEWS.relatorios = renderReports;

function periodRange() {
  const now = new Date();
  if (RF.period === 'all') return [new Date(2000, 0, 1), now];
  if (RF.period === 'custom') return [RF.from ? new Date(RF.from + 'T00:00') : new Date(2000, 0, 1), RF.to ? new Date(RF.to + 'T23:59:59') : now];
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - Number(RF.period));
  return [d, now];
}

function computeReport(acts, rqes) {
  const [start, end] = periodRange();
  const inP = (v) => { const t = new Date(v); return t >= start && t <= end; };
  const q = norm(RF.q);
  const docs = S.doctors.filter((d) =>
    (!RF.hospital || d.hospital === RF.hospital) && (!RF.stage || d.stage === RF.stage) && (!RF.setor || (d.setores || []).includes(RF.setor)) &&
    (!RF.priority || d.priority === RF.priority) && (!RF.owner || d.created_by === RF.owner) && (!q || norm(d.name).includes(q)));
  const ids = new Set(docs.map((d) => d.id));
  const byId = Object.fromEntries(S.doctors.map((d) => [d.id, d]));
  const actsF = acts.filter((a) => !a.doctor_id || ids.has(a.doctor_id));

  const approvedAt = {}, rejectedIds = new Set();
  actsF.forEach((a) => {
    if (a.type !== 'stage_change' || !a.doctor_id || !inP(a.created_at)) return;
    if (a.description === 'Movido para Aprovado') approvedAt[a.doctor_id] = a.created_at;
    if (a.description === 'Movido para Reprovado') rejectedIds.add(a.doctor_id);
  });
  const entered = docs.filter((d) => inP(d.entry_date));
  const aprIds = Object.keys(approvedAt);
  const tApr = aprIds.map((id) => businessHours(byId[id].entry_date, new Date(approvedAt[id])));

  // SLA atual
  const slaItems = docs.filter((d) => !FINAL_STAGES.includes(d.stage)).map((d) => ({ d, ...doctorSla(d) }));
  const rqeItems = rqes.filter((r) => !FINAL_STAGES.includes(r.stage) && ids.has(r.doctor_id)).map((r) => ({ r, ...rqeSla(r) })).filter((x) => x.status !== 'none');
  const allSla = [...slaItems, ...rqeItems];
  const conf = allSla.length ? Math.round((allSla.filter((x) => x.status === 'ok').length / allSla.length) * 100) : 100;

  // tempo médio por etapa (histórico): tempo entre eventos consecutivos, contado se o evento seguinte cai no período
  const ev = stageEvents(actsF);
  const perStage = {};
  Object.entries(ev).forEach(([id, list]) => {
    const d = byId[id];
    if (!d || !ids.has(id)) return;
    list.sort((a, b) => a.at - b.at);
    for (let i = 0; i < list.length - 1; i++) {
      if (FINAL_STAGES.includes(list[i].stage) || !inP(list[i + 1].at)) continue;
      (perStage[list[i].stage] ||= []).push(businessHours(list[i].at, list[i + 1].at));
    }
  });
  const stageAvg = S.stages.filter((s) => !FINAL_STAGES.includes(s.id)).map((s) => {
    const arr = perStage[s.id] || [];
    const avg = arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return { stage: s, avg, n: arr.length, over: avg > s.sla_hours };
  });

  // produtividade
  const prod = {};
  actsF.filter((a) => inP(a.created_at)).forEach((a) => {
    const k = a.created_by_name || 'Desconhecido';
    const p = (prod[k] ||= { total: 0, note: 0, stage_change: 0, doc: 0, contato: 0 });
    p.total++;
    if (a.type === 'note') p.note++; else if (a.type === 'stage_change') p.stage_change++; else if (a.type === 'doc') p.doc++; else if (a.type === 'contact' || a.type === 'cobranca') p.contato++;
  });

  // por hospital
  const hosp = {};
  docs.forEach((d) => {
    const h = (hosp[d.hospital] ||= { nome: d.hospital, total: 0, periodo: 0, apr: 0, rep: 0, pipe: 0, venc: 0, aten: 0, t: [] });
    h.total++;
    if (inP(d.entry_date)) h.periodo++;
    if (approvedAt[d.id]) { h.apr++; h.t.push(businessHours(d.entry_date, new Date(approvedAt[d.id]))); }
    if (rejectedIds.has(d.id)) h.rep++;
    if (!FINAL_STAGES.includes(d.stage)) {
      h.pipe++;
      const s = doctorSla(d).status;
      if (s === 'urgent') h.venc++; else if (s === 'warning') h.aten++;
    }
  });
  const form = {};
  docs.forEach((d) => {
    const k = d.status_especialidade || 'Sem formação';
    const f = (form[k] ||= { nome: k, total: 0, fluxo: 0, apr: 0, rep: 0, venc: 0 });
    f.total++;
    if (d.stage === 'aprovado') f.apr++; else if (d.stage === 'reprovado') f.rep++; else { f.fluxo++; if (doctorSla(d).status === 'urgent') f.venc++; }
  });

  return {
    entered: entered.length, apr: aprIds.length, rep: rejectedIds.size,
    conv: entered.length ? Math.round((aprIds.length / entered.length) * 100) : 0,
    tApr: tApr.length ? Math.round(tApr.reduce((a, b) => a + b, 0) / tApr.length) : 0,
    conf, slaItems, rqeItems, stageAvg, prod, hosp: Object.values(hosp), form: Object.values(form),
  };
}

const slaTxt = (s) => (s === 'urgent' ? 'Vencido' : s === 'warning' ? 'Atenção' : 'OK');
function drawReports(acts, rqes) {
  const root = $('#view-relatorios');
  const rep = computeReport(acts, rqes);
  const owners = uniq(S.doctors.map((d) => d.created_by).filter(Boolean));
  const hospitals = uniq(S.doctors.map((d) => d.hospital)).sort();
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
  const slaF = (arr) => arr.filter((x) => !RF.slaStatus || x.status === RF.slaStatus).sort((a, b) => a.remaining - b.remaining);
  const tabs = [['geral', 'Visão geral'], ['hosp', `Hospitais (${rep.hosp.length})`], ['form', 'Formação'], ['pipe', `SLA pipeline (${rep.slaItems.length})`], ['rqe', `SLA RQE (${rep.rqeItems.length})`], ['prod', 'Produtividade']];
  let body = '';
  if (RF.tab === 'geral') {
    const max = Math.max(1, ...rep.stageAvg.map((x) => Math.max(x.avg, x.stage.sla_hours)));
    body = `<div class="panel"><h3>Tempo médio por etapa (horas úteis, histórico no período) × SLA</h3>
      ${rep.stageAvg.map((x) => `<div class="hbar" style="grid-template-columns:220px 1fr 110px"><span class="t">${esc(x.stage.label)}</span>
        <span class="b" style="position:relative"><i style="width:${(x.avg / max) * 100}%;background:${x.over ? 'var(--red)' : 'var(--brand)'}"></i><em style="position:absolute;top:-2px;bottom:-2px;left:${(x.stage.sla_hours / max) * 100}%;border-left:2px dashed var(--amber)"></em></span>
        <span class="n">${Math.round(x.avg)}h / SLA ${x.stage.sla_hours}h <span class="muted">(${x.n})</span></span></div>`).join('')}
      <div class="muted small">Linha tracejada = SLA da etapa. Barra vermelha = média acima do SLA.</div></div>`;
  } else if (RF.tab === 'hosp') {
    body = `<table class="t"><thead><tr><th>Hospital</th><th>Total</th><th>No período</th><th>Aprovados</th><th>Reprovados</th><th>Em pipeline</th><th>Vencidos</th><th>Atenção</th><th>T. médio aprov.</th><th>SLA</th></tr></thead><tbody>
      ${rep.hosp.sort((a, b) => b.venc - a.venc || b.pipe - a.pipe).map((h) => `<tr><td><b>${esc(h.nome)}</b></td><td>${h.total}</td><td>${h.periodo}</td><td>${h.apr}</td><td>${h.rep}</td><td>${h.pipe}</td><td>${h.venc ? `<span class="tag r">${h.venc}</span>` : 0}</td><td>${h.aten}</td><td>${h.t.length ? Math.round(h.t.reduce((a, b) => a + b, 0) / h.t.length) + 'h' : '—'}</td><td>${h.pipe ? Math.round(((h.pipe - h.venc) / h.pipe) * 100) : 100}%</td></tr>`).join('')}</tbody></table>`;
  } else if (RF.tab === 'form') {
    body = `<table class="t"><thead><tr><th>Formação</th><th>Total</th><th>No fluxo</th><th>Aprovados</th><th>Reprovados</th><th>Vencidos</th></tr></thead><tbody>
      ${rep.form.sort((a, b) => b.fluxo - a.fluxo).map((f) => `<tr><td><b>${esc(f.nome)}</b></td><td>${f.total}</td><td>${f.fluxo}</td><td>${f.apr}</td><td>${f.rep}</td><td>${f.venc}</td></tr>`).join('')}</tbody></table>`;
  } else if (RF.tab === 'pipe') {
    body = `<table class="t"><thead><tr><th>Médico</th><th>Hospital</th><th>Etapa</th><th>Decorrido / SLA</th><th>Status</th></tr></thead><tbody>
      ${slaF(rep.slaItems).map((x) => `<tr class="clk" data-doc="${x.d.id}"><td>${esc(x.d.name)}</td><td>${esc(x.d.hospital)}</td><td>${esc(stageLabel(x.d.stage))}</td><td>${Math.round(x.elapsed)}h / ${x.sla}h</td><td><span class="slapill ${x.status}">${x.status === 'urgent' ? 'Vencido' : fmtRemaining(x.remaining)}</span></td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nada aqui</td></tr>'}</tbody></table>`;
  } else if (RF.tab === 'rqe') {
    body = `<table class="t"><thead><tr><th>Médico</th><th>Hospital</th><th>Etapa</th><th>Especialidade</th><th>Decorrido / SLA</th><th>Status</th></tr></thead><tbody>
      ${slaF(rep.rqeItems).map((x) => `<tr><td>${esc(x.r.doctor?.name)}</td><td>${esc(x.r.doctor?.hospital)}</td><td>${esc(RQE_STAGES.find((s) => s.id === x.r.stage)?.label)}</td><td>${esc(x.r.specialty)}</td><td>${Math.round(x.elapsed)}h / ${x.sla}h</td><td><span class="slapill ${x.status}">${slaTxt(x.status)}</span></td></tr>`).join('') || '<tr><td colspan="6" class="empty">Nada aqui</td></tr>'}</tbody></table>`;
  } else {
    const rows = Object.entries(rep.prod).sort((a, b) => b[1].total - a[1].total);
    const max = Math.max(1, ...rows.map(([, p]) => p.total));
    body = `<table class="t"><thead><tr><th>Usuário</th><th>Total</th><th>Notas / edições</th><th>Mudanças de etapa</th><th>Documentos</th><th>Contatos / cobranças</th><th style="width:30%"></th></tr></thead><tbody>
      ${rows.map(([n, p]) => `<tr><td><b>${esc(n)}</b></td><td>${p.total}</td><td>${p.note}</td><td>${p.stage_change}</td><td>${p.doc}</td><td>${p.contato}</td><td><span class="prog" style="display:block"><i style="width:${(p.total / max) * 100}%;background:var(--brand)"></i></span></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Sem atividade no período</td></tr>'}</tbody></table>`;
  }

  root.innerHTML = `
    <div class="pg-head"><h2>📑 Relatórios</h2><span class="sub">Conversão, tempo por etapa, SLA, hospitais e produtividade da equipe — com exportação.</span></div>
    <div class="toolbar">
      <select class="inp" id="rf-period">${opt('7', 'Últimos 7 dias', RF.period)}${opt('30', 'Últimos 30 dias', RF.period)}${opt('90', 'Últimos 90 dias', RF.period)}${opt('all', 'Todo o período', RF.period)}${opt('custom', 'Personalizado', RF.period)}</select>
      ${RF.period === 'custom' ? `<input type="date" class="inp" id="rf-from" value="${RF.from}"><input type="date" class="inp" id="rf-to" value="${RF.to}">` : ''}
      <select class="inp" id="rf-hosp"><option value="">Todos hospitais</option>${hospitals.map((h) => opt(h, h, RF.hospital)).join('')}</select>
      <select class="inp" id="rf-stage"><option value="">Todas etapas</option>${S.stages.map((s) => opt(s.id, s.label, RF.stage)).join('')}</select>
      <select class="inp" id="rf-setor"><option value="">Todos setores</option>${SETORES.map((s) => opt(s, s, RF.setor)).join('')}</select>
      <select class="inp" id="rf-prio"><option value="">Todas urgências</option>${opt('urgente', 'Urgente', RF.priority)}${opt('rotina', 'Rotina', RF.priority)}${opt('hospital_novo', 'Hospital novo', RF.priority)}</select>
      <select class="inp" id="rf-owner"><option value="">Todos responsáveis</option>${owners.map((o) => opt(o, S.profiles[o]?.display_name || 'Usuário removido', RF.owner)).join('')}</select>
      <select class="inp" id="rf-sla"><option value="">Status SLA: todos</option>${opt('urgent', 'Vencidos', RF.slaStatus)}${opt('warning', 'Atenção', RF.slaStatus)}${opt('ok', 'No prazo', RF.slaStatus)}</select>
      <input class="inp" id="rf-q" placeholder="Buscar médico" value="${esc(RF.q)}" style="width:160px">
      <button class="btn btn-line btn-sm" id="rf-csv">⬇ CSV</button><button class="btn btn-line btn-sm" id="rf-xlsx">⬇ XLSX</button>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="l">Médicos no período</div><div class="v">${rep.entered}</div></div>
      <div class="kpi"><div class="l">Aprovados</div><div class="v" style="color:var(--green)">${rep.apr}</div></div>
      <div class="kpi"><div class="l">Reprovados</div><div class="v" style="color:var(--red)">${rep.rep}</div></div>
      <div class="kpi"><div class="l">Conversão</div><div class="v">${rep.conv}%</div></div>
      <div class="kpi"><div class="l">Tempo médio aprovação</div><div class="v">${rep.tApr}h</div><div class="s">horas úteis</div></div>
      <div class="kpi"><div class="l">Conformidade SLA</div><div class="v" style="color:${rep.conf >= 80 ? 'var(--green)' : rep.conf >= 50 ? 'var(--amber)' : 'var(--red)'}">${rep.conf}%</div></div>
    </div>
    <div class="tabs">${tabs.map(([k, l]) => `<button data-rtab="${k}" class="${RF.tab === k ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>
    ${body}`;

  const redraw = () => drawReports(acts, rqes);
  const bind = (id, key) => { const e = $(id); if (e) e.onchange = (ev) => { RF[key] = ev.target.value; redraw(); }; };
  bind('#rf-period', 'period'); bind('#rf-from', 'from'); bind('#rf-to', 'to'); bind('#rf-hosp', 'hospital'); bind('#rf-stage', 'stage');
  bind('#rf-setor', 'setor'); bind('#rf-prio', 'priority'); bind('#rf-owner', 'owner'); bind('#rf-sla', 'slaStatus'); bind('#rf-q', 'q');
  $$('[data-rtab]').forEach((b) => b.onclick = () => { RF.tab = b.dataset.rtab; redraw(); });
  $$('#view-relatorios [data-doc]').forEach((tr) => tr.onclick = () => openDoctor(S.doctors.find((d) => d.id === tr.dataset.doc)));
  $('#rf-csv').onclick = () => exportReport(rep, 'csv');
  $('#rf-xlsx').onclick = () => exportReport(rep, 'xlsx');
}

async function exportReport(rep, kind) {
  const suf = { 7: '7d', 30: '30d', 90: '90d', all: 'todos', custom: 'custom' }[RF.period];
  const sheets = [
    ['KPIs', ['Métrica', 'Valor'], [['Médicos no período', rep.entered], ['Aprovados no período', rep.apr], ['Reprovados no período', rep.rep], ['Taxa de conversão (%)', rep.conv], ['Tempo médio aprovação (h)', rep.tApr], ['Conformidade SLA atual (%)', rep.conf]]],
    ['Tempo Medio Etapas', ['Etapa', 'Média (h)', 'SLA (h)', 'Registros', 'Status'], rep.stageAvg.map((x) => [x.stage.label, Math.round(x.avg), x.stage.sla_hours, x.n, x.over ? 'Acima do SLA' : 'OK'])],
    ['SLA Pipeline', ['Médico', 'Hospital', 'Etapa', 'SLA (h)', 'Decorrido (h)', 'Restante (h)', 'Status'], rep.slaItems.map((x) => [x.d.name, x.d.hospital, stageLabel(x.d.stage), x.sla, Math.round(x.elapsed), Math.round(x.remaining), slaTxt(x.status)])],
    ['SLA RQE', ['Médico', 'Hospital', 'Etapa', 'Especialidade', 'SLA (h)', 'Decorrido (h)', 'Status'], rep.rqeItems.map((x) => [x.r.doctor?.name, x.r.doctor?.hospital, x.r.stage, x.r.specialty, x.sla, Math.round(x.elapsed), slaTxt(x.status)])],
    ['Hospitais', ['Hospital', 'Total', 'No período', 'Aprovados', 'Reprovados', 'Em pipeline', 'Vencidos', 'Atenção'], rep.hosp.map((h) => [h.nome, h.total, h.periodo, h.apr, h.rep, h.pipe, h.venc, h.aten])],
    ['Produtividade', ['Usuário', 'Total', 'Notas', 'Mudanças etapa', 'Documentos', 'Contatos/Cobranças'], Object.entries(rep.prod).map(([n, p]) => [n, p.total, p.note, p.stage_change, p.doc, p.contato])],
  ];
  if (kind === 'csv') {
    sheets.forEach(([name, h, rows], i) => setTimeout(() => downloadCsv(`${name.toLowerCase().replace(/\s+/g, '_')}_${suf}.csv`, h, rows), i * 250));
    return;
  }
  try {
    const X = await loadXlsx();
    const wb = X.utils.book_new();
    sheets.forEach(([name, h, rows]) => X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([h, ...rows]), name));
    X.writeFile(wb, `relatorio_${suf}.xlsx`);
  } catch (e) { toast('Não foi possível gerar o XLSX: ' + e.message, 'err'); }
}

// ================= AUDITORIA =================
const AF = { q: '', user: '', type: '', mod: '' };
async function renderAudit() {
  const root = $('#view-auditoria');
  root.innerHTML = '<div class="empty">Carregando auditoria…</div>';
  const { data, error } = await sb.from('flow_activities').select('*, rqe:flow_rqe_requests(specialty, doctor:flow_doctors(name))').order('created_at', { ascending: false }).limit(1000);
  if (error) { root.innerHTML = `<div class="alert r">Erro: ${esc(error.message)}</div>`; return; }
  drawAudit(data);
}
VIEWS.auditoria = renderAudit;

function drawAudit(rows) {
  const root = $('#view-auditoria');
  const byId = Object.fromEntries(S.doctors.map((d) => [d.id, d]));
  const ref = (a) => (a.doctor_id ? byId[a.doctor_id]?.name || '(médico excluído)' : a.rqe ? `RQE · ${a.rqe.doctor?.name || ''}` : '—');
  const who = (a) => a.created_by_name || (a.created_by ? S.profiles[a.created_by]?.display_name : '') || 'Sistema';
  const TYPES = { stage_change: 'Movimentação', note: 'Nota / edição', doc: 'Documento', contact: 'Contato', cobranca: 'Cobrança', acao: 'Próxima ação', admin: 'Administração' };
  const q = norm(AF.q);
  const list = rows.filter((a) => (!q || norm(a.description).includes(q) || norm(who(a)).includes(q) || norm(ref(a)).includes(q)) &&
    (!AF.user || who(a) === AF.user) && (!AF.type || a.type === AF.type) && (!AF.mod || (AF.mod === 'RQE' ? a.rqe_request_id : !a.rqe_request_id)));
  const today = new Date().toDateString();
  const users = uniq(rows.map(who)).sort();
  root.innerHTML = `
    <div class="pg-head"><h2>🕓 Auditoria</h2><span class="sub">Quem fez o quê, e quando — o nome é registrado pelo banco, não pelo navegador.</span></div>
    <div class="kpis">
      <div class="kpi"><div class="l">Registros carregados</div><div class="v">${rows.length}</div><div class="s">últimas 1.000 ações</div></div>
      <div class="kpi"><div class="l">Hoje</div><div class="v">${rows.filter((a) => new Date(a.created_at).toDateString() === today).length}</div></div>
      <div class="kpi"><div class="l">Usuários</div><div class="v">${users.length}</div></div>
    </div>
    <div class="toolbar">
      <input class="inp search" id="au-q" placeholder="Buscar por ação, usuário ou médico..." value="${esc(AF.q)}">
      <select class="inp" id="au-u"><option value="">Todos usuários</option>${users.map((u) => `<option ${AF.user === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
      <select class="inp" id="au-t"><option value="">Todos tipos</option>${Object.entries(TYPES).map(([k, l]) => `<option value="${k}" ${AF.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <select class="inp" id="au-m"><option value="">Todos módulos</option><option ${AF.mod === 'CRM' ? 'selected' : ''}>CRM</option><option ${AF.mod === 'RQE' ? 'selected' : ''}>RQE</option></select>
      <span class="tag">${list.length} registro(s)</span>
    </div>
    <div class="panel" style="padding:0;overflow:auto;max-height:calc(100vh - 290px)"><table class="t"><thead><tr><th>Ação</th><th>Tipo</th><th>Usuário</th><th>Data / hora</th><th>Referência</th><th>Módulo</th></tr></thead><tbody>
      ${list.slice(0, 500).map((a) => `<tr><td>${esc(a.description)}</td><td>${TYPES[a.type] || a.type}</td><td>${esc(who(a))}</td><td class="mono small">${fmtDate(a.created_at, true)}</td><td>${a.doctor_id && byId[a.doctor_id] ? `<a href="#" data-doc="${a.doctor_id}">${esc(ref(a))}</a>` : esc(ref(a))}</td><td><span class="tag">${a.rqe_request_id ? 'RQE' : 'CRM'}</span></td></tr>`).join('')}
    </tbody></table></div>`;
  const redraw = () => drawAudit(rows);
  let t;
  $('#au-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { AF.q = e.target.value; redraw(); $('#au-q').focus(); }, 250); };
  $('#au-u').onchange = (e) => { AF.user = e.target.value; redraw(); };
  $('#au-t').onchange = (e) => { AF.type = e.target.value; redraw(); };
  $('#au-m').onchange = (e) => { AF.mod = e.target.value; redraw(); };
  $$('#view-auditoria [data-doc]').forEach((a) => a.onclick = (e) => { e.preventDefault(); openDoctor(byId[a.dataset.doc]); });
}
