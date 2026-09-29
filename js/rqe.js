/* CallMed Flow — módulo RQE (Registro de Qualificação de Especialista no CREMESP) */
'use strict';

const R = { list: [], docs: {}, search: '' };

async function loadRqe() {
  const [reqs, docs] = await Promise.all([
    fetchAll('flow_rqe_requests', '*, doctor:flow_doctors(name, hospital, crm)'),
    fetchAll('flow_rqe_documents', '*', { order: 'created_at' }),
  ]);
  R.list = reqs;
  R.docs = {};
  docs.forEach((d) => { (R.docs[d.rqe_request_id] ||= []).push(d); });
}

async function renderRqe() {
  const root = $('#view-rqe');
  root.innerHTML = '<div class="empty">Carregando RQE…</div>';
  try { await loadRqe(); } catch (e) { root.innerHTML = `<div class="alert r">Erro ao carregar RQE: ${esc(e.message)}</div>`; return; }
  drawRqe();
}
VIEWS.rqe = renderRqe;

function drawRqe() {
  const root = $('#view-rqe');
  const q = norm(R.search);
  const list = R.list.filter((r) => !q || norm(r.doctor?.name).includes(q) || norm(r.specialty).includes(q) || norm(r.doctor?.hospital).includes(q));
  root.innerHTML = `
    <div class="pg-head"><h2>🎓 Solicitações de RQE</h2><span class="sub">Registro de Qualificação de Especialista no CREMESP — do pedido ao protocolo.</span></div>
    <div class="kpis">
      <div class="kpi"><div class="l">Total</div><div class="v">${R.list.length}</div></div>
      <div class="kpi"><div class="l">Aprovados</div><div class="v" style="color:var(--green)">${R.list.filter((r) => r.stage === 'aprovado').length}</div></div>
      <div class="kpi"><div class="l">Em andamento</div><div class="v">${R.list.filter((r) => !FINAL_STAGES.includes(r.stage)).length}</div></div>
    </div>
    <div class="toolbar"><input class="inp search" id="rq-q" placeholder="Buscar por médico, especialidade ou hospital..." value="${esc(R.search)}">
      <button class="btn btn-primary btn-sm" id="rq-new">＋ Nova solicitação</button></div>
    <div class="kanban-wrap"><div class="kanban-board">${RQE_STAGES.map((s) => {
      const items = list.filter((r) => r.stage === s.id);
      return `<div class="kanban-col" data-rstage="${s.id}"><div class="kanban-col-head"><span class="cdot" style="background:${s.color}"></span>
        <span class="lbl2">${esc(s.label)}<br><span style="text-transform:none;font-weight:500;color:var(--ink-faint);font-family:Inter">${esc(s.desc)}</span></span><span class="cnt">${items.length}</span></div>
        <div class="kanban-col-body">${items.map(rqeCard).join('') || '<div class="empty">—</div>'}</div></div>`;
    }).join('')}</div></div>`;
  let t;
  $('#rq-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => { R.search = e.target.value; drawRqe(); $('#rq-q').focus(); }, 200); };
  $('#rq-new').onclick = openNewRqe;
  let drag = null;
  $$('#view-rqe .kcard').forEach((c) => {
    c.onclick = () => openRqe(R.list.find((r) => r.id === c.dataset.id));
    c.ondragstart = () => { drag = c.dataset.id; };
  });
  $$('#view-rqe .kanban-col').forEach((col) => {
    col.ondragover = (e) => { if (drag) { e.preventDefault(); col.classList.add('drop'); } };
    col.ondragleave = () => col.classList.remove('drop');
    col.ondrop = async (e) => {
      e.preventDefault(); col.classList.remove('drop');
      const r = R.list.find((x) => x.id === drag); drag = null;
      if (r && r.stage !== col.dataset.rstage) await moveRqe(r, col.dataset.rstage);
    };
  });
}

function rqeCard(r) {
  const s = rqeSla(r);
  let badge, border = '';
  if (s.status === 'none') {
    const late = r.stage === 'em_analise' && s.days > 30;
    badge = `<span class="slapill ${late ? 'urgent' : 'none'}">${s.days}d</span>`;
    if (late) border = 'border-left:3px solid var(--red)';
  } else {
    badge = `<span class="slapill ${s.status}">${s.status === 'urgent' ? 'SLA !!' : Math.round(s.remaining) + 'h'}</span>`;
    if (s.status !== 'ok') border = `border-left:3px solid ${s.status === 'urgent' ? 'var(--red)' : '#e0a94f'}`;
  }
  return `<div class="kcard" draggable="true" data-id="${r.id}" style="${border}">
    <div class="top"><span class="nm">${esc(r.doctor?.name || '—')}</span>${badge}</div>
    <div class="muted small">${esc(r.doctor?.hospital || '')}</div>
    <div class="tags" style="margin-top:4px"><span class="tag on">${esc(r.specialty)}</span></div>
    <div class="foot"><span>${fmtDate(r.created_at)}</span></div>
    ${r.observations ? `<div class="small muted" style="font-style:italic;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${esc(r.observations)}</div>` : ''}
  </div>`;
}

async function moveRqe(r, stage) {
  const patch = { stage, stage_entered_at: new Date().toISOString() };
  const { error } = await sb.from('flow_rqe_requests').update(patch).eq('id', r.id);
  if (error) return toast('Erro ao mover solicitação: ' + error.message, 'err');
  Object.assign(r, patch);
  await sb.from('flow_activities').insert({ rqe_request_id: r.id, type: 'stage_change', description: `Movido para ${RQE_STAGES.find((s) => s.id === stage).label}` });
  drawRqe();
}

function openNewRqe() {
  let doctor = null;
  const checked = new Set();
  const m = openModal(`<div class="modal-head"><h2>Nova solicitação RQE</h2><button class="x" data-close>✕</button></div><div class="modal-body" id="nr-body"></div>
    <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-primary" id="nr-ok" disabled>Criar solicitação</button></div>`);
  const el = m.el;
  const step1 = () => {
    $('#nr-body', el).innerHTML = `<div class="lbl">Passo 1 · Médico</div><input class="inp" id="nr-q" placeholder="Buscar por nome, hospital ou CRM..." style="margin:8px 0"><div id="nr-list" style="max-height:340px;overflow:auto"></div>`;
    const list = () => {
      const q = norm($('#nr-q', el).value);
      const found = S.doctors.filter((d) => !q || norm(d.name).includes(q) || norm(d.hospital).includes(q) || norm(d.crm).includes(q)).slice(0, 60);
      $('#nr-list', el).innerHTML = `<div class="muted small">${found.length} médico(s) encontrado(s)${found.length === 60 ? ' (refine a busca)' : ''}</div>` + found.map((d) => `<div class="doc-row" data-pick="${d.id}" style="cursor:pointer"><span class="dn"><b>${esc(d.name)}</b> <span class="muted small">· ${esc(d.hospital)} · ${esc(d.crm || '—')}</span></span>${(d.setores || []).length ? `<span class="tag">${esc(d.setores.join(', '))}</span>` : ''}</div>`).join('');
      $$('[data-pick]', el).forEach((r) => r.onclick = () => { doctor = S.doctors.find((d) => d.id === r.dataset.pick); step2(); });
    };
    $('#nr-q', el).oninput = list; list(); $('#nr-q', el).focus();
    $('#nr-ok', el).disabled = true;
  };
  const step2 = () => {
    $('#nr-body', el).innerHTML = `<div class="lbl">Passo 2 · Detalhes</div>
      <div class="panel" style="margin:8px 0;display:flex;justify-content:space-between;align-items:center"><div><b>${esc(doctor.name)}</b><div class="muted small">${esc(doctor.hospital)} · ${esc(doctor.crm || '—')}</div></div><button class="btn btn-line btn-sm" id="nr-back">Trocar</button></div>
      <div class="field"><label>Especialidade *</label><input class="inp" id="nr-esp" placeholder="Ex: Anestesiologia, Cardiologia..." value=""></div>
      <div class="field"><label>Observações</label><textarea class="inp" id="nr-obs"></textarea></div>
      <div class="lbl">Documentos necessários (CREMESP)</div>
      ${RQE_DOCUMENTS.map((n) => `<label class="doc-row"><input type="checkbox" value="${esc(n)}" ${checked.has(n) ? 'checked' : ''}><span class="dn">${esc(n)}</span></label>`).join('')}`;
    $('#nr-back', el).onclick = step1;
    const chk = () => { $('#nr-ok', el).disabled = !$('#nr-esp', el).value.trim(); };
    $('#nr-esp', el).oninput = chk; chk();
    $$('.doc-row input', el).forEach((c) => c.onchange = () => (c.checked ? checked.add(c.value) : checked.delete(c.value)));
  };
  step1();
  $('#nr-ok', el).onclick = async () => {
    const { data, error } = await sb.from('flow_rqe_requests').insert({ doctor_id: doctor.id, specialty: $('#nr-esp', el).value.trim(), observations: $('#nr-obs', el).value.trim(), created_by: S.user.id }).select().single();
    if (error) return toast('Erro ao criar solicitação RQE: ' + error.message, 'err');
    await sb.from('flow_rqe_documents').insert(RQE_DOCUMENTS.map((n) => ({ rqe_request_id: data.id, document_name: n, checked: checked.has(n) })));
    await sb.from('flow_activities').insert({ rqe_request_id: data.id, type: 'stage_change', description: 'Solicitação RQE criada' });
    toast('Solicitação RQE criada!', 'ok');
    m.close(); renderRqe();
  };
}

async function openRqe(r) {
  let editing = false;
  const m = openModal('<div class="modal-body"><div class="empty">Carregando…</div></div>', { size: 'lg' });
  const el = m.el;
  let acts = [];
  const load = async () => {
    const { data } = await sb.from('flow_activities').select('*').eq('rqe_request_id', r.id).order('created_at', { ascending: false });
    acts = data || [];
  };
  const draw = () => {
    const st = RQE_STAGES.find((s) => s.id === r.stage);
    const idx = RQE_STAGES.findIndex((s) => s.id === r.stage);
    const next = RQE_STAGES[idx + 1] && !FINAL_STAGES.includes(RQE_STAGES[idx + 1].id) ? RQE_STAGES[idx + 1] : null;
    const docs = Object.fromEntries((R.docs[r.id] || []).map((d) => [d.document_name, d]));
    const done = RQE_DOCUMENTS.filter((n) => docs[n]?.checked).length;
    $('.modal', el).innerHTML = `
      <div class="modal-head hero"><div><h2>${esc(r.doctor?.name)}</h2><div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
        <span class="tag">${esc(r.doctor?.hospital)}</span><span class="tag">${esc(r.specialty)}</span><span class="tag" style="background:${st.color}">${esc(st.label)}</span><span class="tag">Criado em ${fmtDate(r.created_at)}</span></div></div>
        <button class="x" data-close2>×</button></div>
      <div class="modal-body">
        ${editing ? `<div class="field"><label>Especialidade</label><input class="inp" id="rq-esp" value="${esc(r.specialty)}"></div><div class="field"><label>Observações</label><textarea class="inp" id="rq-obs">${esc(r.observations)}</textarea></div>
          <div class="actions-row"><button class="btn btn-primary btn-sm" id="rq-save">Salvar</button><button class="btn btn-line btn-sm" id="rq-cancel">Cancelar</button></div>`
        : `${r.observations ? `<p style="font-style:italic;color:var(--ink-soft)">"${esc(r.observations)}"</p>` : ''}
          <div class="actions-row"><button class="btn btn-line btn-sm" id="rq-edit">✎ Editar</button>
          ${next ? `<button class="btn btn-line btn-sm" data-rmove="${next.id}">Mover → ${esc(next.label)}</button>` : ''}
          ${r.stage !== 'aprovado' ? '<button class="btn btn-green btn-sm" data-rmove="aprovado">✓ Aprovar</button>' : ''}
          ${r.stage !== 'reprovado' ? '<button class="btn btn-danger btn-sm" data-rmove="reprovado">✗ Reprovar</button>' : ''}
          ${S.isAdmin ? '<button class="btn btn-line btn-sm" id="rq-del">🗑 Excluir</button>' : ''}</div>`}
        <div style="display:flex;align-items:center;gap:10px;margin:14px 0 6px"><b>Documentos CREMESP</b><span class="tag">${done}/${RQE_DOCUMENTS.length}</span><span class="prog"><i style="width:${(done / RQE_DOCUMENTS.length) * 100}%;background:var(--brand)"></i></span></div>
        ${RQE_DOCUMENTS.map((n) => {
          const d = docs[n];
          let extra = '';
          if (d?.checked) extra = `<span class="muted small">✓ ${fmtDate(d.updated_at)}</span>`;
          else if (d) {
            const rem = 24 - businessHours(d.created_at);
            extra = `<span class="slapill ${rem <= 0 ? 'urgent' : rem <= 4.8 ? 'warning' : 'ok'}">${rem <= 0 ? '!!' : Math.round(rem) + 'h'}</span>`;
          }
          return `<label class="doc-row ${d?.checked ? 'done' : ''}"><input type="checkbox" data-rdoc="${esc(n)}" ${d?.checked ? 'checked' : ''}><span class="dn">${esc(n)}</span>${extra}</label>`;
        }).join('')}
        <h3 style="font-size:.9rem;margin:16px 0 8px">Histórico</h3>
        <div class="hist">${acts.map((a) => `<div class="it">${esc(a.description)}<div class="m">${fmtFull(a.created_at)} · por ${esc(a.created_by_name || 'Sistema')}</div></div>`).join('') || '<div class="empty">Sem histórico</div>'}</div>
      </div>`;
    const md = $('.modal', el);
    $('[data-close2]', md).onclick = m.close;
    $$('[data-rmove]', md).forEach((b) => b.onclick = async () => { await moveRqe(r, b.dataset.rmove); m.close(); });
    const ed = $('#rq-edit', md); if (ed) ed.onclick = () => { editing = true; draw(); };
    const cc = $('#rq-cancel', md); if (cc) cc.onclick = () => { editing = false; draw(); };
    const sv = $('#rq-save', md);
    if (sv) sv.onclick = async () => {
      const patch = { specialty: $('#rq-esp', md).value.trim(), observations: $('#rq-obs', md).value.trim() };
      const { error } = await sb.from('flow_rqe_requests').update(patch).eq('id', r.id);
      if (error) return toast('Erro: ' + error.message, 'err');
      Object.assign(r, patch);
      await sb.from('flow_activities').insert({ rqe_request_id: r.id, type: 'note', description: 'Solicitação atualizada' });
      editing = false; await load(); draw(); drawRqe();
    };
    const del = $('#rq-del', md);
    if (del) del.onclick = async () => {
      if (!(await confirmDlg('Excluir solicitação', 'Excluir esta solicitação de RQE e seu histórico?', { okText: 'Excluir', danger: true }))) return;
      const { error } = await sb.from('flow_rqe_requests').delete().eq('id', r.id);
      if (error) return toast('Erro: ' + error.message, 'err');
      R.list = R.list.filter((x) => x.id !== r.id); m.close(); drawRqe();
    };
    $$('[data-rdoc]', md).forEach((c) => c.onchange = async () => {
      const { data, error } = await sb.from('flow_rqe_documents').upsert({ rqe_request_id: r.id, document_name: c.dataset.rdoc, checked: c.checked }, { onConflict: 'rqe_request_id,document_name' }).select().single();
      if (error) return toast('Erro: ' + error.message, 'err');
      R.docs[r.id] = (R.docs[r.id] || []).filter((d) => d.document_name !== data.document_name).concat(data);
      await sb.from('flow_activities').insert({ rqe_request_id: r.id, type: 'doc', description: `${c.checked ? 'Recebido' : 'Pendente'}: ${data.document_name}` });
      await load(); draw(); drawRqe();
    });
  };
  await load(); draw();
}
