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
    <div class="modal-head"><h2>Novo cadastro de médico</h2><button class="x" data-close>×</button></div>
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

// ---------- detalhe ----------
async function openDoctor(d) {
  let tab = 'info', editing = false, acts = [], docs = [];
  const m = openModal('<div class="modal-body"><div class="empty">Carregando…</div></div>', { size: 'lg', onClose: () => { if (editing) saveEdit(true); } });
  const el = m.el;

  const loadDetail = async () => {
    const [a, dd] = await Promise.all([
      sb.from('flow_activities').select('*').eq('doctor_id', d.id).order('created_at', { ascending: false }).limit(500),
      sb.from('flow_doctor_documents').select('*').eq('doctor_id', d.id),
    ]);
    acts = a.data || []; docs = dd.data || [];
  };

  const nextStage = () => {
    const i = S.stages.findIndex((s) => s.id === d.stage);
    return S.stages.slice(i + 1).find((s) => !FINAL_STAGES.includes(s.id));
  };

  const header = () => {
    const sla = FINAL_STAGES.includes(d.stage) ? null : doctorSla(d);
    const st = stageById(d.stage);
    return `<div class="modal-head hero"><div>
        <h2>${esc(d.name)}</h2>
        <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:6px">
          ${d.crm ? `<span class="tag">${esc(d.crm)}</span>` : ''}<span class="tag">${esc(d.hospital)}</span>
          <span class="tag" style="background:${esc(st?.color || '')}">${esc(st?.label || d.stage)}</span>
          <button class="tag" id="dd-prio" style="cursor:pointer" title="Clique para alternar urgência">${PRIORITIES[d.priority] || d.priority}</button>
          ${(d.setores || []).length ? `<span class="tag">${esc(d.setores.join(', '))}</span>` : ''}
          ${sla ? `<span class="tag">${sla.status === 'urgent' ? 'SLA vencido' : `${Math.max(0, Math.round(sla.remaining))}h restantes`}</span>` : ''}
        </div></div>
      <div style="display:flex;gap:6px;align-items:center">
        <button class="icon-btn" id="dd-send" title="Enviar mensagem">✈</button>
        <button class="icon-btn" id="dd-copy" title="Replicar para outro hospital">⧉</button>
        ${S.isAdmin ? '<button class="icon-btn" id="dd-del" title="Excluir médico">🗑</button>' : ''}
        <button class="x" data-close2>×</button></div></div>`;
  };

  const infoView = () => {
    const f = (l, v) => (v === '' || v == null ? '' : `<div><span class="lbl">${l}</span>${esc(v)}</div>`);
    const yn = (b) => (b ? 'Sim' : 'Não');
    const nx = nextStage();
    return `
      <div class="info-grid">
        ${f('WhatsApp', d.whatsapp)}${f('CPF', d.cpf)}${f('Estado', d.estado)}${f('RQE', d.rqe)}${f('Status esp.', d.status_especialidade)}
        ${f('Procuração', yn(d.procuracao))}${f('DISC', d.disc ? DISC_LABEL[d.disc] : '')}${f('APP', yn(d.app))}${f('Link enviado', yn(d.link_enviado))}${f('MedSimples', d.medsimples)}
        ${f('Cobrança', d.cobranca)}${f('Cobrança 2', d.cobranca2)}${f('Cobrança MedSimples', d.cobranca_medsimples)}${f('Dt. cobrança doc', d.dt_cobranca_doc)}
        ${f('Dt. e-mail enviado', d.dt_email_enviado)}${f('Dt. resp. hospital', d.dt_resp_hospital)}${f('Entrada', fmtDate(d.entry_date))}
      </div>
      ${d.doc_pendente ? `<div class="alert a">📄 <b>Doc. pendente:</b> ${esc(d.doc_pendente)}</div>` : ''}
      ${d.observations ? `<p style="font-style:italic;color:var(--ink-soft)">"${esc(d.observations)}"</p>` : ''}
      <div class="actions-row">
        <button class="btn btn-line btn-sm" id="dd-edit">✎ Editar</button>
        ${nx && !FINAL_STAGES.includes(d.stage) ? `<button class="btn btn-line btn-sm" data-move="${nx.id}">Mover → ${esc(nx.label)}</button>` : ''}
        <select class="inp" id="dd-movesel" style="width:auto;padding:5px 8px;font-size:12px"><option value="">Mover para…</option>${S.stages.filter((s) => s.id !== d.stage).map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('')}</select>
        ${d.stage !== 'aprovado' ? '<button class="btn btn-green btn-sm" data-move="aprovado">✓ Aprovar</button>' : ''}
        ${d.stage !== 'reprovado' ? '<button class="btn btn-danger btn-sm" data-move="reprovado">✗ Reprovar</button>' : ''}
        ${d.whatsapp ? '<button class="btn btn-line btn-sm" id="dd-wa">💬 WhatsApp</button>' : ''}
      </div>
      <div id="dd-wa-box"></div>
      <h3 style="font-size:.9rem;margin:16px 0 8px">Notas e histórico</h3>
      <div style="display:flex;gap:6px;margin-bottom:12px"><input class="inp" id="dd-note" placeholder="Adicionar nota ou atividade..."><button class="btn btn-primary btn-sm" id="dd-note-ok">＋</button></div>
      <div class="hist">${acts.map((a) => `<div class="it">${esc(a.description)}<div class="m">${fmtFull(a.created_at)} · por ${esc(a.created_by_name || 'Sistema')}</div></div>`).join('') || '<div class="empty">Sem histórico</div>'}</div>`;
  };

  const editView = () => {
    const i = (id, l, v, extra = '') => `<div class="field"><label>${l}</label><input class="inp" id="${id}" value="${esc(v)}" ${extra}></div>`;
    const sel = (id, l, opts, v) => `<div class="field"><label>${l}</label><select class="inp" id="${id}">${opts.map(([k, t]) => `<option value="${esc(k)}" ${k === v ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></div>`;
    return `<div class="form-grid">
      ${i('ed-name', 'Nome', d.name)}${i('ed-crm', 'CRM', d.crm)}${i('ed-cpf', 'CPF', d.cpf)}${i('ed-wa', 'WhatsApp', d.whatsapp)}
      <div class="field"><label>Hospital</label><select class="inp" id="ed-hosp">${hospitalOptions(d.hospital)}</select></div>
      ${i('ed-rqe', 'RQE', d.rqe)}${i('ed-uf', 'Estado', d.estado, 'maxlength="2"')}
      ${sel('ed-status', 'Status especialidade', [['', '(Vazio)'], ...STATUS_ESP.map((s) => [s, s])], d.status_especialidade)}
      ${sel('ed-disc', 'DISC', [['', '(Vazio)'], ...DISC.map((s) => [s, DISC_LABEL[s]])], d.disc)}
      ${sel('ed-med', 'MedSimples', [['', '(Vazio)'], ['Sim', 'Sim'], ['Não', 'Não']], d.medsimples)}
      <div class="field full"><label>Setor</label><div class="checks" id="ed-setores">${SETORES.map((s) => `<label class="${(d.setores || []).includes(s) ? 'on' : ''}"><input type="checkbox" value="${esc(s)}" ${(d.setores || []).includes(s) ? 'checked' : ''}> ${esc(s)}</label>`).join('')}</div></div>
      <div class="full switches"><label><input type="checkbox" id="ed-app" ${d.app ? 'checked' : ''}> APP</label><label><input type="checkbox" id="ed-proc" ${d.procuracao ? 'checked' : ''}> Procuração</label><label><input type="checkbox" id="ed-link" ${d.link_enviado ? 'checked' : ''}> Link enviado</label></div>
      ${i('ed-docpend', 'Doc. pendente', d.doc_pendente)}${i('ed-cob', 'Cobrança', d.cobranca)}${i('ed-cobmed', 'Cobrança MedSimples', d.cobranca_medsimples)}${i('ed-cob2', 'Cobrança 2', d.cobranca2)}
      ${i('ed-dtdoc', 'Dt. cobrança doc', d.dt_cobranca_doc)}${i('ed-dtmail', 'Dt. e-mail enviado', d.dt_email_enviado)}${i('ed-dtresp', 'Dt. resp. hospital', d.dt_resp_hospital)}
      <div class="field full"><label>Observações</label><textarea class="inp" id="ed-obs">${esc(d.observations)}</textarea></div>
    </div>
    <div class="actions-row"><button class="btn btn-primary btn-sm" id="ed-save">Salvar</button><button class="btn btn-line btn-sm" id="ed-cancel">Cancelar</button></div>`;
  };

  const docsView = () => {
    const byName = Object.fromEntries(docs.map((x) => [x.document_name, x]));
    const isRec = (n) => ['enviado', 'aprovado'].includes(byName[n]?.status);
    const rec = REQUIRED_DOCUMENTS.filter(isRec).length;
    const pct = Math.round((rec / REQUIRED_DOCUMENTS.length) * 100);
    return `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><b>Documentos</b><span class="tag ${pct === 100 ? 'g' : ''}">${rec}/${REQUIRED_DOCUMENTS.length}</span><span class="prog"><i style="width:${pct}%;background:${pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--brand)' : '#e0a94f'}"></i></span><b>${pct}%</b></div>
      <div class="toolbar"><input class="inp search" id="dc-q" placeholder="Buscar documento..."><select class="inp" id="dc-f"><option value="">Todos</option><option value="p">Pendentes</option><option value="r">Recebidos</option></select><button class="btn btn-line btn-sm" id="dc-all">Marcar filtrados como recebidos</button></div>
      <div id="dc-list">${REQUIRED_DOCUMENTS.map((n) => {
        const r = isRec(n);
        return `<label class="doc-row ${r ? 'done' : ''}" data-doc="${esc(n)}"><input type="checkbox" ${r ? 'checked' : ''}><span class="dn">${esc(n)}</span>${r ? `<span class="muted small">✓ ${fmtDate(byName[n].updated_at, true)}</span><span class="tag g">Recebido</span>` : '<span class="tag a">Pendente</span>'}</label>`;
      }).join('')}</div>
      <h3 style="font-size:.85rem;margin:14px 0 6px">Checklist adicional</h3>
      <div class="switches"><label><input type="checkbox" id="dc-app" ${d.app ? 'checked' : ''}> APP</label><label><input type="checkbox" id="dc-proc" ${d.procuracao ? 'checked' : ''}> Procuração</label></div>`;
  };

  const draw = () => {
    const modal = $('.modal', el);
    modal.innerHTML = header() + `<div class="tabs" style="padding:0 20px;margin:0"><button data-tab="info" class="${tab === 'info' ? 'active' : ''}">Informações</button><button data-tab="docs" class="${tab === 'docs' ? 'active' : ''}">Documentos</button></div>
      <div class="modal-body">${tab === 'docs' ? docsView() : editing ? editView() : infoView()}</div>`;
    $('[data-close2]', modal).onclick = m.close;
    $$('[data-tab]', modal).forEach((b) => b.onclick = async () => { if (editing) await saveEdit(true); tab = b.dataset.tab; draw(); });
    $('#dd-prio', modal).onclick = async () => {
      const np = d.priority === 'urgente' ? 'rotina' : 'urgente';
      if (await updateDoctor(d, { priority: np }, `Prioridade alterada para ${PRIORITIES[np]}`)) draw();
    };
    $('#dd-send', modal).onclick = () => { m.close(); openMessages(d); };
    $('#dd-copy', modal).onclick = () => replicate(d, m);
    const del = $('#dd-del', modal);
    if (del) del.onclick = () => deleteDoctor(d, m);
    if (tab === 'docs') return bindDocs(modal);
    if (editing) return bindEdit(modal);
    bindInfo(modal);
  };

  const bindInfo = (modal) => {
    $('#dd-edit', modal).onclick = () => { editing = true; draw(); };
    $$('[data-move]', modal).forEach((b) => b.onclick = async () => { if (await moveDoctor(d, b.dataset.move)) { await loadDetail(); draw(); } });
    $('#dd-movesel', modal).onchange = async (e) => { if (e.target.value && await moveDoctor(d, e.target.value)) { await loadDetail(); draw(); } };
    const wa = $('#dd-wa', modal);
    if (wa) wa.onclick = () => {
      $('#dd-wa-box', modal).innerHTML = `<div class="panel" style="margin-bottom:10px"><div class="lbl" style="margin-bottom:6px">Mensagem personalizada · variáveis {nome} {hospital} {especialidade} {crm}</div>
        <textarea class="inp" id="wa-txt" maxlength="500">Olá, {nome}! Tudo bem? Entramos em contato referente ao seu cadastro no hospital {hospital}.</textarea>
        <div class="actions-row"><button class="btn btn-primary btn-sm" id="wa-go">Enviar mensagem</button></div></div>`;
      $('#wa-go', modal).onclick = () => {
        window.open(waLink(d.whatsapp, fillTemplate($('#wa-txt', modal).value, d)), '_blank');
        sb.from('flow_activities').insert({ doctor_id: d.id, type: 'contact', description: 'Mensagem de WhatsApp enviada' }).then(() => loadDetail().then(draw));
      };
    };
    const addNote = async () => {
      const t = $('#dd-note', modal).value.trim();
      if (!t) return;
      const { error } = await sb.from('flow_activities').insert({ doctor_id: d.id, type: 'note', description: t });
      if (error) return toast('Erro ao salvar nota: ' + error.message, 'err');
      await loadDetail(); draw();
    };
    $('#dd-note-ok', modal).onclick = addNote;
    $('#dd-note', modal).onkeydown = (e) => { if (e.key === 'Enter') addNote(); };
  };

  const collectEdit = (modal) => ({
    name: sanitizeName($('#ed-name', modal).value), crm: $('#ed-crm', modal).value.trim(), cpf: $('#ed-cpf', modal).value.trim(),
    whatsapp: $('#ed-wa', modal).value.trim(), hospital: $('#ed-hosp', modal).value, rqe: $('#ed-rqe', modal).value.trim(),
    estado: $('#ed-uf', modal).value.trim().toUpperCase(), status_especialidade: $('#ed-status', modal).value, disc: $('#ed-disc', modal).value,
    medsimples: $('#ed-med', modal).value, setores: $$('#ed-setores input:checked', modal).map((x) => x.value),
    app: $('#ed-app', modal).checked, procuracao: $('#ed-proc', modal).checked, link_enviado: $('#ed-link', modal).checked,
    doc_pendente: $('#ed-docpend', modal).value.trim(), cobranca: $('#ed-cob', modal).value.trim(), cobranca_medsimples: $('#ed-cobmed', modal).value.trim(),
    cobranca2: $('#ed-cob2', modal).value.trim(), dt_cobranca_doc: $('#ed-dtdoc', modal).value.trim(), dt_email_enviado: $('#ed-dtmail', modal).value.trim(),
    dt_resp_hospital: $('#ed-dtresp', modal).value.trim(), observations: $('#ed-obs', modal).value.trim(),
  });
  let pendingEdit = null;
  const bindEdit = (modal) => {
    $$('#ed-setores input', modal).forEach((i) => i.onchange = () => i.parentElement.classList.toggle('on', i.checked));
    const snap = () => { pendingEdit = collectEdit(modal); };
    modal.addEventListener('input', snap); modal.addEventListener('change', snap);
    $('#ed-name', modal).onblur = (e) => { e.target.value = sanitizeName(e.target.value); };
    $('#ed-save', modal).onclick = () => saveEdit(false);
    $('#ed-cancel', modal).onclick = () => { editing = false; pendingEdit = null; draw(); };
  };
  /** Salva a edição. Fechar o diálogo em modo edição salva automaticamente (comportamento do Flow original). */
  async function saveEdit(silentClose) {
    const modal = $('.modal', el);
    const patch = modal && $('#ed-name', modal) ? collectEdit(modal) : pendingEdit;
    editing = false;
    if (!patch) return;
    pendingEdit = null;
    const changed = Object.keys(patch).some((k) => JSON.stringify(patch[k]) !== JSON.stringify(d[k]));
    if (!changed) { if (!silentClose) draw(); return; }
    const ok = await updateDoctor(d, patch, 'Cadastro atualizado');
    if (!silentClose) { if (!ok) editing = true; await loadDetail(); draw(); }
  }

  const bindDocs = (modal) => {
    const apply = () => {
      const q = norm($('#dc-q', modal).value), f = $('#dc-f', modal).value;
      $$('.doc-row', modal).forEach((r) => {
        const done = r.classList.contains('done');
        r.hidden = (q && !norm(r.dataset.doc).includes(q)) || (f === 'p' && done) || (f === 'r' && !done);
      });
    };
    $('#dc-q', modal).oninput = apply; $('#dc-f', modal).onchange = apply;
    $$('.doc-row input', modal).forEach((c) => c.onchange = () => setDocs([c.closest('.doc-row').dataset.doc], c.checked));
    $('#dc-all', modal).onclick = () => setDocs($$('.doc-row', modal).filter((r) => !r.hidden && !r.classList.contains('done')).map((r) => r.dataset.doc), true);
    $('#dc-app', modal).onchange = (e) => updateDoctor(d, { app: e.target.checked }, `APP ${e.target.checked ? 'marcado' : 'desmarcado'}`);
    $('#dc-proc', modal).onchange = (e) => updateDoctor(d, { procuracao: e.target.checked }, `Procuração ${e.target.checked ? 'marcada' : 'desmarcada'}`);
  };
  async function setDocs(names, received) {
    if (!names.length) return;
    const rows = names.map((n) => ({ doctor_id: d.id, document_name: n, status: received ? 'enviado' : 'nao_enviado', updated_by: S.user.id }));
    const { error } = await sb.from('flow_doctor_documents').upsert(rows, { onConflict: 'doctor_id,document_name' });
    if (error) return toast('Erro ao atualizar documentos: ' + error.message, 'err');
    await sb.from('flow_activities').insert({ doctor_id: d.id, type: 'doc', description: `${received ? 'Recebido' : 'Pendente'}: ${names.join(', ')}` });
    await loadDetail();
    const rec = docs.filter((x) => ['enviado', 'aprovado'].includes(x.status) && REQUIRED_DOCUMENTS.includes(x.document_name)).length;
    S.docProgress[d.id] = Math.round((rec / REQUIRED_DOCUMENTS.length) * 100);
    draw(); afterDoctorChange();
  }

  await loadDetail();
  draw();
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

function replicate(d, parent) {
  const m = openModal(`
    <div class="modal-head"><h2>Replicar cadastro</h2><button class="x" data-close>×</button></div>
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
    m.close(); parent.close(); afterDoctorChange();
  };
}

async function deleteDoctor(d, parent) {
  if (!(await confirmDlg('Excluir médico', `Tem certeza que deseja excluir ${d.name}? Esta ação não pode ser desfeita e todos os dados relacionados serão removidos.`, { okText: 'Excluir', danger: true }))) return;
  const { error, count } = await sb.from('flow_doctors').delete({ count: 'exact' }).eq('id', d.id);
  if (error) return toast('Erro ao excluir médico: ' + error.message, 'err');
  if (!count) return toast('Você não tem permissão para excluir este médico.', 'err');
  S.doctors = S.doctors.filter((x) => x.id !== d.id);
  toast('Médico excluído com sucesso!', 'ok');
  parent.close(); afterDoctorChange();
}

// ---------- mensagens / cobranças ----------
function openMessages(single) {
  let channel = 'wa', stage = single ? single.stage : 'aguardando_contato';
  const sel = new Set(single ? [single.id] : []);
  const m = openModal(`
    <div class="modal-head"><h2>${single ? 'Enviar mensagem' : 'Disparar cobranças / avisos'}</h2><button class="x" data-close>×</button></div>
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
