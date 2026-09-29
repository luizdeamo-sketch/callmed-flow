/* CallMed Flow — Próxima ação por médico e painel ☀️ Hoje (no padrão do CRM Aliança) */
'use strict';

const ACOES = [
  'Fazer primeiro contato', 'Cobrar retorno do médico', 'Cobrar documentação pendente', 'Conferir documentos recebidos',
  'Cobrar documentação de R3', 'Enviar documentos ao jurídico', 'Cobrar retorno do jurídico', 'Enviar cadastro ao hospital (e-mail)',
  'Cobrar retorno do hospital', 'Enviar link / APP', 'Coletar procuração', 'Informar resultado ao médico', 'Outra',
];
/** Ação sugerida automaticamente quando o médico entra em cada etapa. */
const ACAO_POR_ETAPA = {
  aguardando_contato: 'Fazer primeiro contato',
  aguardando_medico: 'Cobrar retorno do médico',
  enviar_documentos_juridico: 'Enviar documentos ao jurídico',
  r3: 'Cobrar documentação de R3',
  aguardando_juridico: 'Cobrar retorno do jurídico',
  documentacao_pendente: 'Cobrar documentação pendente',
  documentacao_recebida: 'Enviar cadastro ao hospital (e-mail)',
  aguardando_hospital: 'Cobrar retorno do hospital',
};

// ---------- datas ----------
function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function ymdToday() { return ymd(new Date()); }
/** Dias até a data (negativo = atrasada, 0 = hoje). null se não houver data. */
function daysTo(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - t) / 864e5);
}
/** Próximo dia útil a partir de hoje (+n dias úteis). */
function addBusinessDays(n) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); if (![0, 6].includes(d.getDay())) left--; }
  return ymd(d);
}
function fmtYmd(s) { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}/${m}/${y.slice(2)}`; }
function respName(uid) { return uid ? (S.profiles[uid]?.display_name || 'Usuário removido') : '—'; }
function isOpen(d) { return !FINAL_STAGES.includes(d.stage); }

/** Etiqueta de situação da próxima ação: atrasada / hoje / em N dias / sem. */
function nextStatus(d) {
  if (!d.proxima_acao) return { k: 'sem', html: '<span class="tagx warn">sem próxima ação</span>' };
  const n = daysTo(d.proxima_data);
  if (n === null) return { k: 'semdata', html: '<span class="tagx mute">sem data</span>' };
  if (n < 0) return { k: 'atrasada', n, html: `<span class="tagx bad">atrasada ${-n}d</span>` };
  if (n === 0) return { k: 'hoje', n, html: '<span class="tagx warn">hoje</span>' };
  return { k: 'futura', n, html: `<span class="tagx">em ${n}d</span>` };
}
/** Trecho curto para listas (Jornada/Kanban): "→ Cobrar retorno 30/09". */
function nextInline(d) {
  if (!isOpen(d)) return '';
  if (!d.proxima_acao) return ' · <span style="color:var(--amber-ink)">sem próxima ação</span>';
  const n = daysTo(d.proxima_data);
  const style = n !== null && n < 0 ? 'color:var(--red);font-weight:600' : n === 0 ? 'color:var(--amber-ink);font-weight:600' : '';
  return ` · <span style="${style}">→ ${esc(d.proxima_acao)}${d.proxima_data ? ' ' + fmtYmd(d.proxima_data).slice(0, 5) : ''}</span>`;
}

/** Contadores para as pílulas e o botão ☀️. */
function nextCounts(onlyMine) {
  let late = 0, hoje = 0, sem = 0;
  S.doctors.forEach((d) => {
    if (!isOpen(d)) return;
    if (!d.proxima_acao) { if (!onlyMine) sem++; return; }
    if (onlyMine && d.proximo_responsavel_id !== S.user.id) return;
    const n = daysTo(d.proxima_data);
    if (n !== null && n < 0) late++; else if (n === 0) hoje++;
  });
  return { late, hoje, sem };
}

// ---------- gravação ----------
async function saveNextAction(d, acao, data, respId, { log = true, quiet = false } = {}) {
  const patch = { proxima_acao: acao || null, proxima_data: acao ? data || null : null, proximo_responsavel_id: acao ? respId || null : null };
  const { error } = await sb.from('flow_doctors').update(patch).eq('id', d.id);
  if (error) { toast('Erro ao salvar a próxima ação: ' + error.message, 'err'); return false; }
  Object.assign(d, patch);
  if (log) {
    await sb.from('flow_activities').insert({
      doctor_id: d.id, type: 'acao',
      description: acao ? `Próxima ação: ${acao} · ${fmtYmd(data)} · ${respName(respId)}` : 'Próxima ação removida',
    });
  }
  if (!quiet) toast('Próxima ação atualizada', 'ok');
  return true;
}

/** Janela "Próxima ação" (definir / concluir). Com `concluir`, registra a ação feita e pede a próxima. */
function nextActionDialog(d, { concluir = false, onDone } = {}) {
  const sugestao = ACAO_POR_ETAPA[d.stage] || '';
  const acaoAtual = d.proxima_acao || '';
  const respAtual = d.proximo_responsavel_id || S.user.id;
  const pessoas = Object.values(S.profiles).filter((p) => p.ativo).sort((a, b) => a.display_name.localeCompare(b.display_name));
  const m = openModal(`
    <div class="modal-head"><div><h2>${concluir ? '✔ Ação feita — qual é a próxima?' : 'Próxima ação'}</h2><div class="om-sub">${esc(d.name)} · ${esc(d.hospital)} · ${esc(stageLabel(d.stage))}</div></div><button class="x" data-close>✕</button></div>
    <div class="modal-body">
      ${concluir ? `<div class="es-box" style="background:var(--green-soft);border-color:#bfe6d4"><div class="ql" style="color:var(--green)">Feito: ${esc(acaoAtual)}</div>
        <textarea class="inp" id="na-res" rows="2" placeholder="Resultado (opcional) — ex.: médico prometeu enviar o diploma até sexta"></textarea></div>` : ''}
      <div class="form-grid">
        <div class="field full"><label>Ação</label><select class="inp" id="na-acao"><option value="">— nenhuma —</option>${ACOES.map((a, i) => `<option value="${esc(a)}" ${(concluir ? sugestao : acaoAtual || sugestao) === a ? 'selected' : ''}>${i + 1}. ${esc(a)}</option>`).join('')}</select></div>
        <div class="field full" id="na-outra-w" hidden><label>Descreva a ação</label><input class="inp" id="na-outra"></div>
        <div class="field"><label>Data</label><input class="inp" type="date" id="na-data" value="${concluir || !d.proxima_data ? addBusinessDays(1) : d.proxima_data}"></div>
        <div class="field"><label>Responsável</label><select class="inp" id="na-resp">${pessoas.map((p) => `<option value="${p.user_id}" ${p.user_id === respAtual ? 'selected' : ''}>${esc(p.display_name)}</option>`).join('')}</select></div>
      </div>
      <div class="actions-row" style="margin:0">
        <button class="btn btn-line btn-sm" data-quick="0">Hoje</button><button class="btn btn-line btn-sm" data-quick="1">Amanhã (útil)</button>
        <button class="btn btn-line btn-sm" data-quick="3">+3 dias úteis</button><button class="btn btn-line btn-sm" data-quick="5">+1 semana</button>
      </div>
      <div class="err" id="na-err"></div>
    </div>
    <div class="modal-foot">${!concluir && acaoAtual ? '<button class="btn btn-line" id="na-clear" style="color:var(--red);margin-right:auto">Remover</button>' : ''}<button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-primary" id="na-save">Salvar</button></div>`, { size: 'sm' });
  const el = m.el;
  const syncOutra = () => { $('#na-outra-w', el).hidden = $('#na-acao', el).value !== 'Outra'; };
  $('#na-acao', el).onchange = syncOutra; syncOutra();
  $$('[data-quick]', el).forEach((b) => b.onclick = () => { $('#na-data', el).value = +b.dataset.quick === 0 ? ymdToday() : addBusinessDays(+b.dataset.quick); });
  const clear = $('#na-clear', el);
  if (clear) clear.onclick = async () => { if (await saveNextAction(d, null)) { m.close(); onDone && onDone(); } };
  $('#na-save', el).onclick = async () => {
    let acao = $('#na-acao', el).value;
    if (acao === 'Outra') acao = $('#na-outra', el).value.trim();
    const data = $('#na-data', el).value, resp = $('#na-resp', el).value;
    if (acao && !data) { $('#na-err', el).textContent = 'Informe a data.'; return; }
    if (concluir) {
      const res = $('#na-res', el).value.trim();
      await sb.from('flow_activities').insert({ doctor_id: d.id, type: 'acao', description: `✔ Feito: ${acaoAtual}${res ? ' — ' + res : ''}` });
    }
    if (await saveNextAction(d, acao, data, resp, { quiet: true })) {
      toast(concluir ? 'Ação registrada' : 'Próxima ação atualizada', 'ok');
      m.close(); onDone && onDone();
    }
  };
}

/** Faixa "Próxima ação" da ficha do médico (igual ao pv-next do Aliança). */
function nextStripHtml(d) {
  if (!isOpen(d)) return '';
  const st = nextStatus(d);
  const cls = st.k === 'atrasada' ? 'late' : st.k === 'sem' || st.k === 'hoje' ? 'warn' : '';
  return `<div class="pv-next ${cls}" style="margin-top:8px">
    <div><b>Próxima ação:</b> ${d.proxima_acao ? esc(d.proxima_acao) : '<i>nenhuma definida</i>'}${d.proxima_acao ? ` · <b>${fmtYmd(d.proxima_data)}</b> · ${esc(respName(d.proximo_responsavel_id))}` : ''} ${st.html}</div>
    <div style="display:flex;gap:6px">
      <button class="btn btn-line btn-sm" id="na-edit">Definir próxima ação</button>
      ${d.proxima_acao ? '<button class="btn btn-primary btn-sm" id="na-done">✔ Feito</button>' : ''}
    </div></div>`;
}
function bindNextStrip(d, redraw) {
  const e = $('#na-edit'); if (e) e.onclick = () => nextActionDialog(d, { onDone: redraw });
  const f = $('#na-done'); if (f) f.onclick = () => nextActionDialog(d, { concluir: true, onDone: redraw });
}

// ---------- painel ☀️ Hoje ----------
const HJ = { onlyMine: true };
async function openHoje() {
  const m = openModal(`
    <div class="modal-head"><div><h2>☀️ Hoje — o que preciso fazer</h2><div class="om-sub">${new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}</div></div><button class="x" data-close>✕</button></div>
    <div class="modal-body" id="hj-body"><div class="op-more">Carregando...</div></div>`, { size: 'lg', onClose: () => { if (currentView === 'fluxo') refreshFluxo(); } });
  const draw = async () => {
    const body = $('#hj-body', m.el);
    const { data: tarefas } = await sb.from('flow_tarefas').select('*').or(`data.eq.${ymdToday()},and(concluida.eq.false,data.lt.${ymdToday()})`).order('created_at');
    const me = S.user.id;
    const open = S.doctors.filter(isOpen);
    const acoes = open.filter((d) => d.proxima_acao && daysTo(d.proxima_data) !== null && daysTo(d.proxima_data) <= 0 && (!HJ.onlyMine || d.proximo_responsavel_id === me))
      .sort((a, b) => String(a.proxima_data).localeCompare(String(b.proxima_data)));
    const semAcao = open.filter((d) => !d.proxima_acao).sort((a, b) => doctorSla(a).remaining - doctorSla(b).remaining);
    const slaHoje = open.filter((d) => { const s = doctorSla(d); return s.status === 'warning'; }).sort((a, b) => doctorSla(a).remaining - doctorSla(b).remaining);
    const t0 = new Date(); t0.setHours(0, 0, 0, 0);
    const encerradosHoje = S.doctors.filter((d) => FINAL_STAGES.includes(d.stage) && new Date(d.stage_entered_at) >= t0);
    const encaminhados = open.filter((d) => d.created_by === me && d.proximo_responsavel_id && d.proximo_responsavel_id !== me)
      .sort((a, b) => new Date(b.entry_date) - new Date(a.entry_date));
    const tars = (tarefas || []).filter((t) => !HJ.onlyMine || t.responsavel_id === me || t.created_by === me);
    const row = (d, right, sub) => `<div class="hj-row"><a href="#" data-openp="${d.id}">${esc(d.name)}</a> <small class="muted">· ${esc(d.hospital)}${sub ? ' · ' + sub : ''}</small><span class="hj-right">${right || ''}</span></div>`;
    const sec = (title, cnt, html, hint) => `<div class="es-box"><div class="ql">${title} <span class="tagx" style="margin-left:6px">${cnt}</span>${hint ? `<span class="hint" style="margin:0 0 0 8px;text-transform:none;letter-spacing:0;font-family:Inter">${hint}</span>` : ''}</div>${html || '<div class="hint" style="margin:0">Nada por aqui. 👍</div>'}</div>`;
    body.innerHTML = `
      <div class="sg-row" style="margin-bottom:10px"><label class="small" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="hj-mine" ${HJ.onlyMine ? 'checked' : ''}> Só as minhas (${esc(actorName())})</label><span style="flex:1"></span>
        <span class="tagx">${nextCounts(false).late} atrasadas no time todo</span></div>
      ${sec('⏰ Ações de hoje e atrasadas', acoes.length, acoes.map((d) => {
        const n = daysTo(d.proxima_data);
        return `<div class="hj-row"><a href="#" data-openp="${d.id}">${esc(d.name)}</a> <small class="muted">· ${esc(d.hospital)} · ${esc(stageLabel(d.stage))}</small>
          <div class="hj-act">→ <b>${esc(d.proxima_acao)}</b>${HJ.onlyMine ? '' : ' · ' + esc(respName(d.proximo_responsavel_id))} ${n < 0 ? `<span class="tagx bad">atrasada ${-n}d</span>` : '<span class="tagx warn">hoje</span>'}
          <span class="hj-right">${d.whatsapp ? `<a class="btn btn-line btn-sm" href="${waLink(d.whatsapp, '')}" target="_blank" rel="noopener" data-wa="${d.id}">💬</a>` : ''}<button class="btn btn-primary btn-sm" data-done="${d.id}">✔ Feito</button><button class="btn btn-line btn-sm" data-adiar="${d.id}" title="Adiar para o próximo dia útil">Amanhã</button></span></div></div>`;
      }).join(''))}
      ${sec('🚨 SLA vencendo (últimas horas do prazo)', slaHoje.length, slaHoje.slice(0, 40).map((d) => row(d, `<span class="slapill warning">${fmtRemaining(doctorSla(d).remaining)}</span>`, esc(stageLabel(d.stage)))).join(''), 'mova de etapa antes que vença')}
      ${HJ.onlyMine ? '' : sec('⚠ Em andamento sem próxima ação', semAcao.length, semAcao.slice(0, 40).map((d) => row(d, `<button class="btn btn-line btn-sm" data-def="${d.id}">Definir</button>`, esc(stageLabel(d.stage)))).join('') + (semAcao.length > 40 ? `<div class="hint">+${semAcao.length - 40} outros — use a pílula “sem próxima ação” no Fluxo.</div>` : ''))}
      ${encaminhados.length ? sec('📨 Cadastros que encaminhei (em andamento)', encaminhados.length, encaminhados.slice(0, 40).map((d) => row(d, `<span class="tagx mute">${esc(respName(d.proximo_responsavel_id))}</span>`, `${esc(stageLabel(d.stage))} · há ${Math.floor((Date.now() - new Date(d.entry_date)) / 864e5)}d`)).join(''), 'para acompanhar sem precisar cobrar') : ''}
      ${sec('✅ Encerrados hoje', encerradosHoje.length, encerradosHoje.map((d) => row(d, `<span class="tagx ${d.stage === 'aprovado' ? 'ok' : 'bad'}">${esc(stageLabel(d.stage))}</span>`)).join(''))}
      <div class="es-box"><div class="ql">📝 Tarefas avulsas</div>
        ${tars.map((t) => `<div class="hj-row"><label class="small" style="display:flex;gap:8px;align-items:center;flex:1"><input type="checkbox" data-task="${t.id}" ${t.concluida ? 'checked' : ''}> <span style="${t.concluida ? 'text-decoration:line-through;color:var(--ink-faint)' : ''}">${esc(t.descricao)}</span>
          ${t.data < ymdToday() ? `<span class="tagx bad">de ${fmtYmd(t.data)}</span>` : ''}${HJ.onlyMine ? '' : `<small class="muted">· ${esc(respName(t.responsavel_id))}</small>`}</label>
          ${t.created_by === me || S.isAdmin ? `<button class="btn-ghost" data-deltask="${t.id}" style="color:var(--ink-faint)">✕</button>` : ''}</div>`).join('') || '<div class="hint" style="margin:0">Nenhuma tarefa.</div>'}
        <div class="sg-row" style="margin-top:8px"><input class="inp" id="hj-task-new" placeholder="Nova tarefa (não precisa ter médico vinculado)..." style="flex:1"><button class="btn btn-primary btn-sm" id="hj-task-add">+ Tarefa</button></div>
        <div class="hint">Tarefas não concluídas de dias anteriores continuam aparecendo aqui até serem marcadas.</div></div>`;
    const byId = (id) => S.doctors.find((x) => x.id === id);
    $$('[data-openp]', body).forEach((a) => a.onclick = (e) => { e.preventDefault(); m.close(); openDoctor(byId(a.dataset.openp)); });
    $('#hj-mine', body).onchange = (e) => { HJ.onlyMine = e.target.checked; draw(); };
    $$('[data-done]', body).forEach((b) => b.onclick = () => nextActionDialog(byId(b.dataset.done), { concluir: true, onDone: draw }));
    $$('[data-def]', body).forEach((b) => b.onclick = () => nextActionDialog(byId(b.dataset.def), { onDone: draw }));
    $$('[data-adiar]', body).forEach((b) => b.onclick = async () => {
      const d = byId(b.dataset.adiar);
      if (await saveNextAction(d, d.proxima_acao, addBusinessDays(1), d.proximo_responsavel_id, { quiet: true })) { toast('Adiada para o próximo dia útil', 'ok'); draw(); }
    });
    $$('[data-wa]', body).forEach((a) => a.addEventListener('click', () => {
      sb.from('flow_activities').insert({ doctor_id: a.dataset.wa, type: 'contact', description: 'WhatsApp aberto pelo painel Hoje' }).then();
    }));
    $$('[data-task]', body).forEach((c) => c.onchange = async () => { await sb.from('flow_tarefas').update({ concluida: c.checked }).eq('id', c.dataset.task); draw(); });
    $$('[data-deltask]', body).forEach((b) => b.onclick = async () => { await sb.from('flow_tarefas').delete().eq('id', b.dataset.deltask); draw(); });
    const add = async () => {
      const v = $('#hj-task-new', body).value.trim();
      if (!v) return;
      const { error } = await sb.from('flow_tarefas').insert({ descricao: v, data: ymdToday() });
      if (error) return toast('Erro: ' + error.message, 'err');
      draw();
    };
    $('#hj-task-add', body).onclick = add;
    $('#hj-task-new', body).onkeydown = (e) => { if (e.key === 'Enter') add(); };
  };
  draw();
}
