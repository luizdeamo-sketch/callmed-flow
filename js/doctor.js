/* CallMed Flow — cadastro de médico, detalhe (informações, documentos, histórico) e mensagens */
'use strict';

function afterDoctorChange() {
  if (currentView === 'fluxo') refreshFluxo(); else VIEWS[currentView] && VIEWS[currentView]();
}
function friendlyDbError(error, fallback) {
  if (error?.code === '23505') return error.message?.includes('Duplicidade') ? error.message : 'Este médico já está cadastrado neste hospital.';
  return `${fallback}: ${error?.message || 'erro desconhecido'}`;
}

// ---------- novo médico ----------
function openNewDoctor() {
  const m = openModal(`
    <div class="modal-head"><h2>Novo cadastro de médico</h2><button class="x" data-close>✕</button></div>
    <div class="modal-body">
      <div class="form-grid">
        <div class="field full"><label>Nome completo *</label><input class="inp" id="nd-name" placeholder="Dr. / Dra."></div>
        <div class="field"><label>WhatsApp *</label><input class="inp" id="nd-wa" placeholder="(11) 99999-9999"></div>
        <div class="field"><label>CPF</label><input class="inp" id="nd-cpf" placeholder="000.000.000-00"></div>
        <div class="field"><label>CRM (número)</label><input class="inp" id="nd-crm" placeholder="123456"></div>
        <div class="field"><label>UF do CRM</label><input class="inp" id="nd-uf" value="SP" maxlength="2"></div>
        <div class="field full"><label>Setor *</label><div class="checks" id="nd-setores">${SETORES.map((s) => `<label><input type="checkbox" value="${esc(s)}"> ${esc(s)}</label>`).join('')}</div></div>
        <div class="field full"><label>Hospitais * <span class="muted">(1 cadastro por hospital)</span></label><div class="checks" id="nd-hosps"></div></div>
        <div class="full" id="nd-conflicts"></div>
        <div class="field"><label>Status especialidade</label><select class="inp" id="nd-status"><option value="">—</option>${STATUS_ESP.map((s) => `<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label>RQE</label><input class="inp" id="nd-rqe"></div>
        <div class="field"><label>DISC</label><select class="inp" id="nd-disc"><option value="">—</option>${DISC.map((s) => `<option value="${esc(s)}">${esc(DISC_LABEL[s])}</option>`).join('')}</select></div>
        <div class="field"><label>Prioridade</label><select class="inp" id="nd-prio">${Object.entries(PRIORITIES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
        <div class="full switches">
          <label><input type="checkbox" id="nd-med"> MedSimples</label>
          <label><input type="checkbox" id="nd-proc"> Procuração</label>
          <label><input type="checkbox" id="nd-app"> APP</label>
        </div>
        <div class="field full"><label>Observações</label><textarea class="inp" id="nd-obs"></textarea></div>
      </div>
      <div class="alert b small" id="nd-summary" hidden></div>
    </div>
    <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-primary" id="nd-ok" disabled>Cadastrar</button></div>`);
  const el = m.el;
  const hospSel = new Set(), setorSel = new Set(), reasons = {};

  const conflictsFor = () => {
    const nm = norm(sanitizeName($('#nd-name', el).value));
    const crm = digits($('#nd-crm', el).value);
    const map = {};
    if (!nm && crm.length < 3) return map;
    S.doctors.forEach((d) => {
      const byName = nm && norm(d.name) === nm;
      const byCrm = crm.length >= 3 && digits(d.crm) === crm;
      if (byName || byCrm) map[d.hospital] = { d, by: byName && byCrm ? 'nome e CRM' : byName ? 'nome' : 'CRM' };
    });
    return map;
  };

  const render = () => {
    const conf = conflictsFor();
    $('#nd-hosps', el).innerHTML = S.hospitals.filter((h) => h.ativo).map((h) => {
      const c = conf[h.nome];
      return `<label class="${hospSel.has(h.nome) ? (c ? 'conf' : 'on') : ''}" title="${c ? 'Já cadastrado neste hospital' : ''}"><input type="checkbox" value="${esc(h.nome)}" ${hospSel.has(h.nome) ? 'checked' : ''}> ${esc(h.nome)}${c ? ' ⚠' : ''}</label>`;
    }).join('');
    $$('#nd-hosps input', el).forEach((i) => i.onchange = () => { i.checked ? hospSel.add(i.value) : hospSel.delete(i.value); render(); });
    const blocked = [...hospSel].filter((h) => conf[h]);
    $('#nd-conflicts', el).innerHTML = blocked.map((h) => `
      <div class="alert r"><b>Duplicidade detectada por ${esc(conf[h].by)}</b> — ${esc(conf[h].d.name)} · CRM ${esc(conf[h].d.crm || '—')} · ${esc(h)}
      <textarea class="inp" data-reason="${esc(h)}" maxlength="500" placeholder="Motivo obrigatório (mín. 5 caracteres) — será registrado no histórico do médico" style="margin-top:6px;min-height:50px">${esc(reasons[h] || '')}</textarea></div>`).join('');
    $$('[data-reason]', el).forEach((t) => t.oninput = () => { reasons[t.dataset.reason] = t.value; check(); });
    const nNew = [...hospSel].length - blocked.length;
    const sum = $('#nd-summary', el);
    sum.hidden = !hospSel.size;
    sum.innerHTML = `${blocked.length ? `${blocked.length} hospital(is) bloqueado(s): médico já cadastrado. ` : ''}${nNew} novo(s) cadastro(s) será(ão) criado(s).`;
    check();
  };
  const check = () => {
    const conf = conflictsFor();
    const blockedOk = [...hospSel].filter((h) => conf[h]).every((h) => (reasons[h] || '').trim().length >= 5);
    $('#nd-ok', el).disabled = !($('#nd-name', el).value.trim() && $('#nd-wa', el).value.trim() && hospSel.size && setorSel.size && blockedOk);
  };
  $$('#nd-setores input', el).forEach((i) => i.onchange = () => {
    i.checked ? setorSel.add(i.value) : setorSel.delete(i.value);
    i.parentElement.classList.toggle('on', i.checked); check();
  });
  $('#nd-name', el).onblur = (e) => { e.target.value = sanitizeName(e.target.value); render(); };
  ['#nd-wa', '#nd-name'].forEach((s) => $(s, el).addEventListener('input', check));
  $('#nd-crm', el).addEventListener('input', render);
  render();

  $('#nd-ok', el).onclick = async () => {
    const btn = $('#nd-ok', el);
    btn.disabled = true;
    const conf = conflictsFor();
    const uf = ($('#nd-uf', el).value.trim() || 'SP').toUpperCase();
    const crmNum = $('#nd-crm', el).value.trim();
    const base = {
      name: sanitizeName($('#nd-name', el).value), whatsapp: $('#nd-wa', el).value.trim(), cpf: $('#nd-cpf', el).value.trim(),
      crm: crmNum ? `CRM/${uf} ${crmNum}` : '', estado: uf, setores: [...setorSel],
      status_especialidade: $('#nd-status', el).value, rqe: $('#nd-rqe', el).value.trim(), disc: $('#nd-disc', el).value,
      priority: $('#nd-prio', el).value, medsimples: $('#nd-med', el).checked ? 'Sim' : '', procuracao: $('#nd-proc', el).checked,
      app: $('#nd-app', el).checked, observations: $('#nd-obs', el).value.trim(), stage: 'aguardando_contato',
      sla_hours: stageById('aguardando_contato')?.sla_hours ?? 24,
    };
    let created = 0, failed = 0;
    for (const h of hospSel) {
      if (conf[h]) {
        await sb.from('flow_activities').insert({ doctor_id: conf[h].d.id, type: 'note', description: `Tentativa de novo cadastro bloqueada — duplicidade por ${conf[h].by}. Motivo: ${reasons[h].trim()}` });
        continue;
      }
      const { data, error } = await sb.from('flow_doctors').insert({ ...base, hospital: h }).select().single();
      if (error) { failed++; toast(friendlyDbError(error, `Erro ao cadastrar em ${h}`), 'err'); continue; }
      S.doctors.unshift(data);
      S.docProgress[data.id] = 0;
      await sb.from('flow_activities').insert({ doctor_id: data.id, type: 'stage_change', description: 'Cadastro criado no sistema' });
      created++;
    }
    if (created) toast(`${created} cadastro(s) criado(s) com sucesso!`, 'ok');
    if (!failed) m.close(); else btn.disabled = false;
    afterDoctorChange();
  };
}

// ---------- ficha do médico (página inteira, igual à ficha de pessoa do Aliança) ----------
const PV = { doctor: null, tab: 'resumo', acts: [], docs: [], back: 'fluxo' };

async function openDoctor(d) {
  if (!d) return;
  if (currentView !== 'medico') PV.back = currentView;
  if (PV.doctor?.id !== d.id) PV.tab = 'resumo';
  PV.doctor = d;
  PV.acts = []; PV.docs = [];
  $$('.modal-bg').forEach((m) => m.remove());
  go('medico');
  await loadDoctorDetail();
  drawMedico();
}
async function loadDoctorDetail() {
  const d = PV.doctor;
  const [a, dd] = await Promise.all([
    sb.from('flow_activities').select('*').eq('doctor_id', d.id).order('created_at', { ascending: false }).limit(500),
    sb.from('flow_doctor_documents').select('*').eq('doctor_id', d.id),
  ]);
  PV.acts = a.data || []; PV.docs = dd.data || [];
}
VIEWS.medico = () => { if (PV.doctor) drawMedico(); else go('fluxo'); };

function pvField(label, val, mono) { return `<div class="cf"><label>${label}</label><div class="v${mono ? ' mono' : ''}">${val || '—'}</div></div>`; }

function drawMedico() {
  const d = PV.doctor;
  const root = $('#view-medico');
  if (!d || !S.doctors.includes(d)) { root.innerHTML = '<div class="op-more">Cadastro não encontrado.</div>'; return; }
  const st = stageById(d.stage);
  const sla = FINAL_STAGES.includes(d.stage) ? null : doctorSla(d);
  const idx = S.stages.findIndex((s) => s.id === d.stage);
  const next = S.stages.slice(idx + 1).find((s) => !FINAL_STAGES.includes(s.id));
  const diasEtapa = Math.floor((Date.now() - new Date(d.stage_entered_at)) / 864e5);
  const nextCls = !sla ? 'done' : sla.status === 'urgent' ? 'late' : sla.status === 'warning' ? 'warn' : '';
  const TABS = [['resumo', 'Resumo'], ['docs', `Documentos · ${S.docProgress[d.id] || 0}%`], ['historico', `Histórico · ${PV.acts.length}`]];
  root.innerHTML = `
    <div class="person-header"><div style="flex:1;min-width:0">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><button class="btn-ghost" id="pv-back">← ${esc(VIEW_TITLES[PV.back] || 'Fluxo')}</button><h2 style="margin:0">${esc(d.name)}</h2></div>
      <div class="tags">
        <span class="ptag brand">${esc(d.hospital)}</span>
        ${d.crm ? `<span class="ptag">${esc(d.crm)}</span>` : ''}
        ${(d.setores || []).map((s) => `<span class="ptag">${esc(s)}</span>`).join('')}
        ${d.status_especialidade ? `<span class="ptag">${esc(d.status_especialidade)}</span>` : ''}
        <button class="ptag ${d.priority === 'urgente' ? 'bad' : d.priority === 'hospital_novo' ? 'warn' : ''}" id="pv-prio" style="cursor:pointer" title="Clique para alternar urgência">${PRIORITIES[d.priority] || d.priority}</button>
      </div>
      <div class="person-actions">
        <button class="btn btn-line" id="pa-edit">✏️ Editar cadastro</button>
        ${d.whatsapp ? '<button class="btn btn-line" id="pa-wa">💬 WhatsApp</button>' : ''}
        <button class="btn btn-line" id="pa-msg">✉️ Enviar cobrança</button>
        <button class="btn btn-line" id="pa-copy">⧉ Replicar para outro hospital</button>
        ${S.isAdmin ? '<button class="btn btn-line" id="pa-del" style="color:var(--red)">🗑 Excluir</button>' : ''}
      </div>
      <div class="pv-next ${nextCls}">
        <div><b>Etapa atual:</b> <span class="op-dot" style="display:inline-block;background:${esc(st?.color || '#999')};margin:0 4px"></span>${esc(st?.label || d.stage)} · há ${diasEtapa} dia(s)
          ${sla ? ` · ${sla.status === 'urgent' ? '<span class="tagx bad">SLA vencido</span>' : `<span class="tagx ${sla.status === 'warning' ? 'warn' : ''}">SLA: ${fmtRemaining(sla.remaining)} restantes</span>`}` : ''}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
          ${next ? `<button class="btn btn-line btn-sm" data-move="${next.id}">Mover → ${esc(next.label)}</button>` : ''}
          <select class="inp" id="pv-movesel" style="width:auto;padding:6px 8px;font-size:12.5px"><option value="">Mover para…</option>${S.stages.filter((s) => s.id !== d.stage).map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select>
          ${d.stage !== 'aprovado' ? '<button class="btn btn-green btn-sm" data-move="aprovado">✓ Aprovar</button>' : ''}
          ${d.stage !== 'reprovado' ? '<button class="btn btn-danger btn-sm" data-move="reprovado">✗ Reprovar</button>' : ''}
        </div>
      </div>
      <div id="pv-wa-box"></div>
    </div></div>
    <div class="pv-tabs">${TABS.map(([k, l]) => `<button class="pv-tab ${PV.tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div id="pv-body"></div>`;

  $('#pv-back').onclick = () => go(PV.back || 'fluxo');
  $$('.pv-tab', root).forEach((b) => b.onclick = () => { PV.tab = b.dataset.tab; drawMedico(); });
  $('#pv-prio').onclick = async () => {
    const np = d.priority === 'urgente' ? 'rotina' : 'urgente';
    if (await updateDoctor(d, { priority: np }, `Prioridade alterada para ${PRIORITIES[np]}`)) { await loadDoctorDetail(); drawMedico(); }
  };
  $('#pa-edit').onclick = () => editDoctorDialog(d);
  $('#pa-msg').onclick = () => openMessages(d);
  $('#pa-copy').onclick = () => replicate(d);
  const del = $('#pa-del'); if (del) del.onclick = () => deleteDoctor(d);
  const wa = $('#pa-wa');
  if (wa) wa.onclick = () => {
    $('#pv-wa-box').innerHTML = `<div class="es-box" style="margin-top:10px"><div class="ql">Mensagem personalizada · variáveis {nome} {hospital} {especialidade} {crm}</div>
      <textarea class="inp" id="wa-txt" maxlength="500">Olá, {nome}! Tudo bem? Entramos em contato referente ao seu cadastro no hospital {hospital}.</textarea>
      <div class="actions-row" style="margin-bottom:0"><button class="btn btn-primary btn-sm" id="wa-go">Abrir WhatsApp</button></div></div>`;
    $('#wa-go').onclick = async () => {
      window.open(waLink(d.whatsapp, fillTemplate($('#wa-txt').value, d)), '_blank');
      await sb.from('flow_activities').insert({ doctor_id: d.id, type: 'contact', description: 'Mensagem de WhatsApp enviada' });
      await loadDoctorDetail(); drawMedico();
    };
  };
  $$('[data-move]', root).forEach((b) => b.onclick = async () => { if (await moveDoctor(d, b.dataset.move)) { await loadDoctorDetail(); drawMedico(); } });
  $('#pv-movesel').onchange = async (e) => { if (e.target.value && await moveDoctor(d, e.target.value)) { await loadDoctorDetail(); drawMedico(); } };

  const body = $('#pv-body');
  if (PV.tab === 'docs') return drawDocsTab(body, d);
  if (PV.tab === 'historico') return drawHistTab(body, d);
  drawResumoTab(body, d);
}

function drawResumoTab(body, d) {
  const yn = (b) => (b ? 'Sim' : 'Não');
  const diasFluxo = Math.floor((Date.now() - new Date(d.entry_date)) / 864e5) + 1;
  const contatos = PV.acts.filter((a) => a.type === 'contact' || a.type === 'cobranca').length;
  const wa = d.whatsapp ? `${esc(d.whatsapp)} <a href="${waLink(d.whatsapp, '')}" target="_blank" rel="noopener" title="Abrir WhatsApp">💬</a>` : '';
  body.innerHTML = `
    <div class="activity-strip" style="margin:0 0 14px">
      <div class="astat"><span class="an">${diasFluxo}</span><span class="al">Dias no fluxo</span></div>
      <div class="astat"><span class="an">${S.docProgress[d.id] || 0}%</span><span class="al">Documentos</span></div>
      <div class="astat"><span class="an">${contatos}</span><span class="al">Contatos / cobranças</span></div>
      <div class="astat"><span class="an">${PV.acts.length}</span><span class="al">Registros no histórico</span></div>
      <div class="astat"><span class="an">${fmtDate(d.entry_date)}</span><span class="al">Entrada</span></div>
    </div>
    ${d.doc_pendente ? `<div class="es-box" style="background:var(--amber-soft);border-color:var(--amber-line)"><div class="ql" style="color:var(--amber-ink)">📄 Documento pendente</div>${esc(d.doc_pendente)}</div>` : ''}
    <div class="pv-grid">
      <div class="es-box"><div class="ql">Dados do médico</div><div class="core-fields">
        ${pvField('Nome', esc(d.name))}${pvField('CPF', esc(d.cpf), true)}${pvField('CRM', esc(d.crm), true)}${pvField('UF', esc(d.estado))}
        ${pvField('WhatsApp', wa)}${pvField('RQE', esc(d.rqe))}${pvField('Formação', esc(d.status_especialidade))}${pvField('Setores', esc((d.setores || []).join(', ')))}
      </div></div>
      <div class="es-box"><div class="ql">Credenciamento · ${esc(d.hospital)}</div><div class="core-fields">
        ${pvField('DISC', d.disc ? esc(DISC_LABEL[d.disc]) : '')}${pvField('MedSimples', esc(d.medsimples))}${pvField('APP', yn(d.app))}${pvField('Procuração', yn(d.procuracao))}
        ${pvField('Link enviado', yn(d.link_enviado))}${pvField('Cobrança', esc(d.cobranca))}${pvField('Cobrança 2', esc(d.cobranca2))}${pvField('Cobrança MedSimples', esc(d.cobranca_medsimples))}
        ${pvField('Dt. cobrança doc.', esc(d.dt_cobranca_doc))}${pvField('Dt. e-mail enviado', esc(d.dt_email_enviado))}${pvField('Dt. resposta hospital', esc(d.dt_resp_hospital))}
      </div></div>
    </div>
    ${d.observations ? `<div class="es-box"><div class="ql">Observações</div><div style="font-size:13.5px;line-height:1.55;white-space:pre-wrap">${esc(d.observations)}</div></div>` : ''}
    <div class="es-box"><div class="ql">Outros cadastros deste médico</div>${otherHospitals(d)}</div>`;
  $$('#pv-body [data-other]').forEach((a) => a.onclick = (e) => { e.preventDefault(); openDoctor(S.doctors.find((x) => x.id === a.dataset.other)); });
}
function otherHospitals(d) {
  const nm = norm(d.name), crm = digits(d.crm);
  const others = S.doctors.filter((x) => x.id !== d.id && (norm(x.name) === nm || (crm.length >= 3 && digits(x.crm) === crm)));
  if (!others.length) return '<div class="hint" style="margin:0">Cadastrado só neste hospital.</div>';
  return others.map((x) => `<div style="padding:4px 0"><a href="#" data-other="${x.id}" style="color:var(--brand);font-weight:600">${esc(x.hospital)}</a> · ${esc(stageLabel(x.stage))}</div>`).join('');
}

function drawHistTab(body, d) {
  const ICON = { stage_change: '➡️', note: '📝', doc: '📄', contact: '💬', cobranca: '✉️', admin: '⚙️' };
  body.innerHTML = `
    <div class="es-box"><div class="ql">Registrar atividade</div>
      <div style="display:flex;gap:6px"><input class="inp" id="pv-note" placeholder="Nota, ligação, retorno do hospital..."><button class="btn btn-primary btn-sm" id="pv-note-ok">Registrar</button></div></div>
    <div class="es-box"><div class="ql">Histórico · mais recente primeiro</div>
      <div class="hist">${PV.acts.map((a) => `<div class="it">${ICON[a.type] || '•'} ${esc(a.description)}<div class="m">${fmtFull(a.created_at)} · por ${esc(a.created_by_name || 'Sistema')}</div></div>`).join('') || '<div class="empty">Sem histórico</div>'}</div></div>`;
  const add = async () => {
    const t = $('#pv-note').value.trim();
    if (!t) return;
    const { error } = await sb.from('flow_activities').insert({ doctor_id: d.id, type: 'note', description: t });
    if (error) return toast('Erro ao salvar: ' + error.message, 'err');
    await loadDoctorDetail(); drawMedico();
  };
  $('#pv-note-ok').onclick = add;
  $('#pv-note').onkeydown = (e) => { if (e.key === 'Enter') add(); };
}

function drawDocsTab(body, d) {
  const byName = Object.fromEntries(PV.docs.map((x) => [x.document_name, x]));
  const isRec = (n) => ['enviado', 'aprovado'].includes(byName[n]?.status);
  const rec = REQUIRED_DOCUMENTS.filter(isRec).length;
  const pct = Math.round((rec / REQUIRED_DOCUMENTS.length) * 100);
  body.innerHTML = `
    <div class="es-box">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><span class="ql" style="margin:0">Checklist de documentos</span><span class="tagx ${pct === 100 ? 'ok' : ''}">${rec}/${REQUIRED_DOCUMENTS.length}</span><span class="prog"><i style="width:${pct}%;background:${pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--brand)' : '#e0a94f'}"></i></span><b>${pct}%</b></div>
      <div class="op-filters" style="margin-bottom:8px"><input id="dc-q" placeholder="Buscar documento..."><select id="dc-f"><option value="">Todos</option><option value="p">Pendentes</option><option value="r">Recebidos</option></select><button id="dc-all">Marcar filtrados como recebidos</button></div>
      <div id="dc-list">${REQUIRED_DOCUMENTS.map((n) => {
        const r = isRec(n);
        return `<label class="doc-row ${r ? 'done' : ''}" data-doc="${esc(n)}"><input type="checkbox" ${r ? 'checked' : ''}><span class="dn">${esc(n)}</span>${r ? `<span class="muted small">✓ ${fmtDate(byName[n].updated_at, true)}</span><span class="tagx ok">Recebido</span>` : '<span class="tagx warn">Pendente</span>'}</label>`;
      }).join('')}</div>
    </div>
    <div class="es-box"><div class="ql">Checklist adicional</div>
      <div class="switches"><label><input type="checkbox" id="dc-app" ${d.app ? 'checked' : ''}> APP</label><label><input type="checkbox" id="dc-proc" ${d.procuracao ? 'checked' : ''}> Procuração</label><label><input type="checkbox" id="dc-link" ${d.link_enviado ? 'checked' : ''}> Link enviado</label></div></div>`;
  const apply = () => {
    const q = norm($('#dc-q').value), f = $('#dc-f').value;
    $$('.doc-row', body).forEach((r) => {
      const done = r.classList.contains('done');
      r.hidden = (q && !norm(r.dataset.doc).includes(q)) || (f === 'p' && done) || (f === 'r' && !done);
    });
  };
  $('#dc-q').oninput = apply; $('#dc-f').onchange = apply;
  $$('.doc-row input', body).forEach((c) => c.onchange = () => setDocs(d, [c.closest('.doc-row').dataset.doc], c.checked));
  $('#dc-all').onclick = () => setDocs(d, $$('.doc-row', body).filter((r) => !r.hidden && !r.classList.contains('done')).map((r) => r.dataset.doc), true);
  const tgl = (id, field, label) => { $(id).onchange = async (e) => { if (await updateDoctor(d, { [field]: e.target.checked }, `${label} ${e.target.checked ? 'marcado' : 'desmarcado'}`)) { await loadDoctorDetail(); drawMedico(); } }; };
  tgl('#dc-app', 'app', 'APP'); tgl('#dc-proc', 'procuracao', 'Procuração'); tgl('#dc-link', 'link_enviado', 'Link enviado');
}
async function setDocs(d, names, received) {
  if (!names.length) return;
  const rows = names.map((n) => ({ doctor_id: d.id, document_name: n, status: received ? 'enviado' : 'nao_enviado', updated_by: S.user.id }));
  const { error } = await sb.from('flow_doctor_documents').upsert(rows, { onConflict: 'doctor_id,document_name' });
  if (error) return toast('Erro ao atualizar documentos: ' + error.message, 'err');
  await sb.from('flow_activities').insert({ doctor_id: d.id, type: 'doc', description: `${received ? 'Recebido' : 'Pendente'}: ${names.join(', ')}` });
  await loadDoctorDetail();
  const rec = PV.docs.filter((x) => ['enviado', 'aprovado'].includes(x.status) && REQUIRED_DOCUMENTS.includes(x.document_name)).length;
  S.docProgress[d.id] = Math.round((rec / REQUIRED_DOCUMENTS.length) * 100);
  drawMedico();
}

function editDoctorDialog(d) {
  const i = (id, l, v, extra = '') => `<div class="field"><label>${l}</label><input class="inp" id="${id}" value="${esc(v)}" ${extra}></div>`;
  const sel = (id, l, opts, v) => `<div class="field"><label>${l}</label><select class="inp" id="${id}">${opts.map(([k, t]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
  const m = openModal(`
    <div class="modal-head"><div><h2>Editar cadastro</h2><div class="om-sub">${esc(d.name)} · ${esc(d.hospital)}</div></div><button class="x" data-close>✕</button></div>
    <div class="modal-body"><div class="form-grid">
      ${i('ed-name', 'Nome', d.name)}${i('ed-crm', 'CRM', d.crm)}${i('ed-cpf', 'CPF', d.cpf)}${i('ed-wa', 'WhatsApp', d.whatsapp)}
      <div class="field"><label>Hospital</label><select class="inp" id="ed-hosp">${hospitalOptions(d.hospital)}</select></div>
      ${i('ed-rqe', 'RQE', d.rqe)}${i('ed-uf', 'UF', d.estado, 'maxlength="2"')}
      ${sel('ed-status', 'Formação', [['', '(Vazio)'], ...STATUS_ESP.map((s) => [s, s])], d.status_especialidade)}
      ${sel('ed-disc', 'DISC', [['', '(Vazio)'], ...DISC.map((s) => [s, DISC_LABEL[s]])], d.disc)}
      ${sel('ed-med', 'MedSimples', [['', '(Vazio)'], ['Sim', 'Sim'], ['Não', 'Não']], d.medsimples)}
      <div class="field full"><label>Setores</label><div class="checks" id="ed-setores">${uniq([...SETORES, ...(d.setores || [])]).map((s) => `<label class="${(d.setores || []).includes(s) ? 'on' : ''}"><input type="checkbox" value="${esc(s)}" ${(d.setores || []).includes(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('')}</div></div>
      ${i('ed-docpend', 'Doc. pendente', d.doc_pendente)}${i('ed-cob', 'Cobrança', d.cobranca)}${i('ed-cobmed', 'Cobrança MedSimples', d.cobranca_medsimples)}${i('ed-cob2', 'Cobrança 2', d.cobranca2)}
      ${i('ed-dtdoc', 'Dt. cobrança doc.', d.dt_cobranca_doc)}${i('ed-dtmail', 'Dt. e-mail enviado', d.dt_email_enviado)}${i('ed-dtresp', 'Dt. resposta hospital', d.dt_resp_hospital)}
      <div class="field full"><label>Observações</label><textarea class="inp" id="ed-obs">${esc(d.observations)}</textarea></div>
    </div></div>
    <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-primary" id="ed-save">Salvar</button></div>`, { size: 'lg' });
  const el = m.el;
  $$('#ed-setores input', el).forEach((c) => c.onchange = () => c.parentElement.classList.toggle('on', c.checked));
  $('#ed-name', el).onblur = (e) => { e.target.value = sanitizeName(e.target.value); };
  $('#ed-save', el).onclick = async () => {
    const patch = {
      name: sanitizeName($('#ed-name', el).value), crm: $('#ed-crm', el).value.trim(), cpf: $('#ed-cpf', el).value.trim(),
      whatsapp: $('#ed-wa', el).value.trim(), hospital: $('#ed-hosp', el).value, rqe: $('#ed-rqe', el).value.trim(),
      estado: $('#ed-uf', el).value.trim().toUpperCase(), status_especialidade: $('#ed-status', el).value, disc: $('#ed-disc', el).value,
      medsimples: $('#ed-med', el).value, setores: $$('#ed-setores input:checked', el).map((x) => x.value),
      doc_pendente: $('#ed-docpend', el).value.trim(), cobranca: $('#ed-cob', el).value.trim(), cobranca_medsimples: $('#ed-cobmed', el).value.trim(),
      cobranca2: $('#ed-cob2', el).value.trim(), dt_cobranca_doc: $('#ed-dtdoc', el).value.trim(), dt_email_enviado: $('#ed-dtmail', el).value.trim(),
      dt_resp_hospital: $('#ed-dtresp', el).value.trim(), observations: $('#ed-obs', el).value.trim(),
    };
    if (!patch.name) return toast('Informe o nome.', 'err');
    const changed = Object.keys(patch).some((k) => JSON.stringify(patch[k]) !== JSON.stringify(d[k]));
    if (!changed) return m.close();
    if (await updateDoctor(d, patch, 'Cadastro atualizado')) { m.close(); await loadDoctorDetail(); drawMedico(); toast('Cadastro atualizado', 'ok'); }
  };
}

/** Atualiza campos do médico e registra no histórico (o banco gera a notificação para "Cadastro atualizado"). */
async function updateDoctor(d, patch, description = 'Cadastro atualizado') {
  const { data, error } = await sb.from('flow_doctors').update(patch).eq('id', d.id).select().single();
  if (error) { toast(friendlyDbError(error, 'Erro ao atualizar'), 'err'); return false; }
  Object.assign(d, data);
  await sb.from('flow_activities').insert({ doctor_id: d.id, type: 'note', description });
  afterDoctorChange();
  return true;
}

function replicate(d) {
  const m = openModal(`
    <div class="modal-head"><div><h2>Replicar cadastro</h2><div class="om-sub">${esc(d.name)}</div></div><button class="x" data-close>✕</button></div>
    <div class="modal-body"><p style="margin-top:0">Será criado um novo cadastro de <b>${esc(d.name)}</b> em outro hospital, mantendo os dados pessoais. O fluxo recomeça em "Aguardando Contato".</p>
      <div class="field"><label>Novo hospital</label><select class="inp" id="rp-h"><option value="">Selecione…</option>${S.hospitals.filter((h) => h.ativo && h.nome !== d.hospital).map((h) => `<option>${esc(h.nome)}</option>`).join('')}</select></div></div>
    <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-primary" id="rp-ok">Replicar</button></div>`, { size: 'sm' });
  $('#rp-ok', m.el).onclick = async () => {
    const h = $('#rp-h', m.el).value;
    if (!h) return toast('Escolha o hospital.', 'err');
    const copy = {
      name: d.name, cpf: d.cpf, crm: d.crm, estado: d.estado, status_especialidade: d.status_especialidade, setores: d.setores, rqe: d.rqe,
      disc: d.disc, medsimples: d.medsimples, whatsapp: d.whatsapp, hospital: h, stage: 'aguardando_contato', priority: 'rotina',
      sla_hours: stageById('aguardando_contato')?.sla_hours ?? 24,
      observations: d.observations ? `[Replicado de ${d.hospital}] ${d.observations}` : `Replicado de ${d.hospital}`,
    };
    const { data, error } = await sb.from('flow_doctors').insert(copy).select().single();
    if (error) return toast(friendlyDbError(error, 'Erro ao replicar'), 'err');
    S.doctors.unshift(data); S.docProgress[data.id] = 0;
    await sb.from('flow_activities').insert({ doctor_id: data.id, type: 'stage_change', description: 'Cadastro criado no sistema' });
    toast(`Cadastro replicado para ${h}`, 'ok');
    m.close(); openDoctor(data);
  };
}

async function deleteDoctor(d) {
  if (!(await confirmDlg('Excluir médico', `Tem certeza que deseja excluir ${d.name}? Esta ação não pode ser desfeita e todos os dados relacionados serão removidos.`, { okText: 'Excluir', danger: true }))) return;
  const { error, count } = await sb.from('flow_doctors').delete({ count: 'exact' }).eq('id', d.id);
  if (error) return toast('Erro ao excluir médico: ' + error.message, 'err');
  if (!count) return toast('Você não tem permissão para excluir este médico.', 'err');
  S.doctors = S.doctors.filter((x) => x.id !== d.id);
  toast('Médico excluído com sucesso!', 'ok');
  PV.doctor = null; go(PV.back && PV.back !== 'medico' ? PV.back : 'fluxo');
}

// ---------- mensagens / cobranças ----------
function openMessages(single) {
  let channel = 'wa', stage = single ? single.stage : 'aguardando_contato';
  const sel = new Set(single ? [single.id] : []);
  const m = openModal(`
    <div class="modal-head"><h2>${single ? 'Enviar mensagem' : 'Disparar cobranças / avisos'}</h2><button class="x" data-close>✕</button></div>
    <div class="modal-body" id="ms-body"></div>
    <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-primary" id="ms-send"></button></div>`, { size: 'lg' });
  const el = m.el;
  let text = single ? fillTemplate(TEMPLATES[single.stage] || TEMPLATES._todos, single) : TEMPLATES[stage];
  const recipients = () => (single ? [single] : S.doctors.filter((d) => !FINAL_STAGES.includes(d.stage) && (stage === '_todos' || d.stage === stage)));
  const draw = () => {
    const list = recipients();
    $('#ms-body', el).innerHTML = `
      <div class="toolbar">
        <select class="inp" id="ms-ch"><option value="wa" ${channel === 'wa' ? 'selected' : ''}>WhatsApp</option><option value="mail" ${channel === 'mail' ? 'selected' : ''}>E-mail</option></select>
        ${single ? '' : `<select class="inp" id="ms-stage"><option value="_todos" ${stage === '_todos' ? 'selected' : ''}>Todos os pendentes</option>${S.stages.filter((s) => !FINAL_STAGES.includes(s.id)).map((s) => `<option value="${s.id}" ${s.id === stage ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
        <button class="btn btn-line btn-sm" id="ms-all">${sel.size === list.length && list.length ? 'Desmarcar todos' : 'Selecionar todos'}</button>`}
      </div>
      <div class="lbl" style="margin-bottom:6px">Destinatários (${sel.size} de ${list.length})</div>
      <div style="max-height:230px;overflow:auto;border:1px solid var(--border);border-radius:8px;margin-bottom:12px">
        ${list.map((d) => `<label class="doc-row" style="${d.whatsapp || channel === 'mail' ? '' : 'opacity:.5'}"><input type="checkbox" value="${d.id}" ${sel.has(d.id) ? 'checked' : ''}><span class="dn">${esc(d.name)} <span class="muted small">· ${esc(d.hospital)}</span></span>
          ${doctorSla(d).status === 'urgent' ? '<span class="tag r">SLA!</span>' : ''}${d.whatsapp ? '' : '<span class="tag">Sem WhatsApp</span>'}</label>`).join('') || '<div class="empty">Nenhum médico nesta etapa</div>'}
      </div>
      <div class="field"><label>Mensagem · variáveis {nome} {hospital} {especialidade} {crm}</label><textarea class="inp" id="ms-text" style="min-height:110px">${esc(text)}</textarea></div>
      ${channel === 'wa' && sel.size > 1 ? '<div class="alert a small">Cada destinatário abre uma aba do WhatsApp. Se o navegador bloquear, permita pop-ups para este site.</div>' : ''}`;
    $('#ms-send', el).textContent = `Enviar (${sel.size}) via ${channel === 'wa' ? 'WhatsApp' : 'E-mail'}`;
    $('#ms-ch', el).onchange = (e) => { channel = e.target.value; draw(); };
    const st = $('#ms-stage', el);
    if (st) st.onchange = (e) => { stage = e.target.value; text = TEMPLATES[stage] || TEMPLATES._todos; sel.clear(); draw(); };
    const all = $('#ms-all', el);
    if (all) all.onclick = () => { if (sel.size === list.length) sel.clear(); else list.forEach((d) => sel.add(d.id)); draw(); };
    $$('.doc-row input', el).forEach((c) => c.onchange = () => { c.checked ? sel.add(c.value) : sel.delete(c.value); $('#ms-send', el).textContent = `Enviar (${sel.size}) via ${channel === 'wa' ? 'WhatsApp' : 'E-mail'}`; });
    $('#ms-text', el).oninput = (e) => { text = e.target.value; };
  };
  draw();
  $('#ms-send', el).onclick = async () => {
    if (!sel.size) return toast('Selecione pelo menos um médico.', 'err');
    if (!text.trim()) return toast('Escreva uma mensagem.', 'err');
    let sent = 0, skipped = 0;
    const done = [];
    for (const id of sel) {
      const d = S.doctors.find((x) => x.id === id) || single;
      const msg = fillTemplate(text, d);
      if (channel === 'wa') {
        if (!d.whatsapp) { skipped++; continue; }
        window.open(waLink(d.whatsapp, msg), '_blank');
      } else {
        window.open(`mailto:?subject=${encodeURIComponent('CallMed - Atualização de Cadastro - ' + d.hospital)}&body=${encodeURIComponent(msg)}`, '_blank');
      }
      sent++; done.push(d);
    }
    if (done.length) await sb.from('flow_activities').insert(done.map((d) => ({ doctor_id: d.id, type: 'cobranca', description: `Cobrança enviada via ${channel === 'wa' ? 'WhatsApp' : 'e-mail'}` })));
    if (sent) toast(`${sent} mensagem(ns) enviada(s) via ${channel === 'wa' ? 'WhatsApp' : 'e-mail'}!`, 'ok');
    if (skipped) toast(`${skipped} médico(s) sem WhatsApp cadastrado.`, 'err');
    m.close();
  };
}
