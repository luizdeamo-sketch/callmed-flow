/* CallMed Flow — Sugestões de melhoria (igual ao CRM Aliança): texto, voz (ditado + áudio), prints/anexos, status, resposta e histórico */
'use strict';

const SG_STATUS = [['nova', 'Nova', '#0018fc'], ['em_analise', 'Em análise', '#c8790b'], ['aprovada', 'Aprovada', '#149c6b'], ['em_execucao', 'Em execução', '#7b3fe4'], ['concluida', 'Concluída', '#2f9e57'], ['rejeitada', 'Rejeitada', '#c23636'], ['depois', 'Deixar para depois', '#8990a3']];
const SG_TIPOS = { ideia: 'Ideia nova', melhoria: 'Melhoria', problema: 'Problema / erro' };
const SG_TELAS = ['Fluxo — Jornada', 'Fluxo — Kanban', 'Ficha do médico', 'Novo médico', 'Cobranças / mensagens', 'Indicadores', 'RQE', 'Relatórios', 'Auditoria', 'Administração', 'Notificações', 'Login / acesso', 'Outro'];
const SG = { list: [], filter: '', q: '', files: [], rec: null, media: null, chunks: [], audioBlob: null, recording: false, voz: false };
const sgLabel = (k) => SG_STATUS.find((s) => s[0] === k) || [k, k, '#666'];
const SG_SR = window.SpeechRecognition || window.webkitSpeechRecognition;

// ---------- armazenamento (bucket privado flow-docs) ----------
async function docsUpload(file, pasta) {
  const safe = file.name.replace(/[^\w.\-]+/g, '_');
  const path = `${pasta}/${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safe}`;
  const { error } = await sb.storage.from('flow-docs').upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
  if (error) throw error;
  return path;
}
async function docsSignedUrl(path) {
  const { data, error } = await sb.storage.from('flow-docs').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}
/** Prints colados (Ctrl+V) chegam como "image.png": dá um nome único. */
function namePasted(items) {
  return items.map((it, n) => {
    const f = it.getAsFile();
    const ext = (f.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
    return f.name && f.name !== 'image.png' ? f : new File([f], `print-${Date.now()}-${n + 1}.${ext}`, { type: f.type });
  });
}
function fileChips(files) {
  return files.map((f, i) => `<div class="sg-fchip">${/^image\//.test(f.type) ? `<img src="${URL.createObjectURL(f)}" alt="">` : '<span>📄</span>'}<span class="nm">${esc(f.name)}</span><button data-rm="${i}" title="Remover">✕</button></div>`).join('');
}

// ---------- tela ----------
function renderSugestoes() {
  const root = $('#view-sugestoes');
  if (!root.dataset.built) {
    root.dataset.built = '1';
    root.innerHTML = `
      <div class="pg-head"><h2>💡 Sugestões de melhoria</h2><span class="sub">Ideias, problemas e pedidos para o sistema. Tudo fica registrado no histórico.</span></div>
      <div class="es-box">
        <div class="sg-row" style="margin-bottom:8px"><span class="ql" style="margin:0">Registrando como</span><b>${esc(actorName())}</b></div>
        <textarea id="sg-text" rows="4" placeholder="Escreva livremente, ou clique em 🎤 e narre a sua ideia. Dá para colar um print (Ctrl+V) ou arrastar arquivos para cá."></textarea>
        <div id="sg-files" class="sg-files"></div>
        <div class="sg-row" style="margin-top:8px">
          <button id="sg-mic" class="btn btn-line btn-sm">🎤 Gravar / ditar</button>
          <button id="sg-attach" class="btn btn-line btn-sm">📎 Anexar print / PDF / arquivo</button><input type="file" id="sg-file" multiple hidden>
          <span id="sg-mic-st" style="font-size:12px;color:var(--red)"></span>
          <select id="sg-tipo">${Object.entries(SG_TIPOS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
          <select id="sg-tela"><option value="">Em qual tela? (opcional)</option>${SG_TELAS.map((t) => `<option>${esc(t)}</option>`).join('')}</select>
          <select id="sg-prio"><option value="normal">Prioridade normal</option><option value="alta">Prioridade alta</option><option value="baixa">Prioridade baixa</option></select>
          <span style="flex:1"></span><button id="sg-send" class="btn btn-primary">Enviar sugestão</button>
        </div>
        <audio id="sg-audio-prev" controls hidden style="margin-top:8px;width:100%"></audio>
      </div>
      <div class="op-filters" style="margin-bottom:10px"><div id="sg-chips" style="display:flex;gap:6px;flex-wrap:wrap"></div><input id="sg-q" placeholder="Buscar nas sugestões..." style="margin-left:auto;width:240px"></div>
      <div id="sg-list"><div class="op-more">Carregando...</div></div>`;
    bindComposer();
  }
  loadSugestoes();
}
VIEWS.sugestoes = renderSugestoes;

async function loadSugestoes() {
  const { data, error } = await sb.from('flow_sugestoes').select('*').order('created_at', { ascending: false }).limit(1000);
  if (error) { $('#sg-list').innerHTML = `<div class="op-more">Erro: ${esc(error.message)}</div>`; return; }
  SG.list = data || [];
  sgDraw();
}

function sgDraw() {
  const counts = {};
  SG.list.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });
  $('#sg-chips').innerHTML = `<button class="sg-chip ${SG.filter === '' ? 'on' : ''}" data-f="">Todas <b>${SG.list.length}</b></button>` +
    SG_STATUS.map((s) => `<button class="sg-chip ${SG.filter === s[0] ? 'on' : ''}" data-f="${s[0]}" style="--c:${s[2]}">${s[1]} <b>${counts[s[0]] || 0}</b></button>`).join('');
  const q = norm(SG.q);
  const rows = SG.list.filter((r) => (!SG.filter || r.status === SG.filter) && (!q || norm(r.texto).includes(q) || norm(r.autor).includes(q) || norm(r.tela).includes(q) || norm(r.resposta).includes(q)));
  $('#sg-list').innerHTML = rows.length ? rows.map((r) => {
    const st = sgLabel(r.status);
    const hist = r.historico || [];
    const aguardando = (r.resposta || '').startsWith('🔴');
    return `<div class="sg-card" data-id="${r.id}">
      <div class="sg-top"><b>${esc(r.autor || '—')}</b><span class="sg-meta">${fmtDate(r.created_at, true)}</span><span class="tagx">${esc(SG_TIPOS[r.tipo] || r.tipo)}</span>${r.tela ? `<span class="tagx">${esc(r.tela)}</span>` : ''}${r.prioridade === 'alta' ? '<span class="tagx bad">Prioridade alta</span>' : r.prioridade === 'baixa' ? '<span class="tagx mute">Prioridade baixa</span>' : ''}${aguardando ? `<span class="tagx bad">💬 Aguardando o retorno de ${esc((r.autor || '').split(' ')[0] || 'quem sugeriu')}</span>` : ''}${r.origem === 'voz' ? '<span class="tagx">🎤 por voz</span>' : ''}<span style="flex:1"></span><span class="sg-status" style="background:${st[2]}">${st[1]}</span></div>
      <div class="sg-text">${esc(r.texto).replace(/\n/g, '<br>')}</div>
      ${(r.anexos || []).length ? `<div class="sg-atts">${r.anexos.map((a) => (/^image\//.test(a.mime || '') ? `<a href="#" data-att="${esc(a.path)}" title="${esc(a.nome || '')}"><img class="sg-thumb" data-thumb="${esc(a.path)}" alt="${esc(a.nome || 'print')}"></a>` : `<a href="#" class="sg-file" data-att="${esc(a.path)}">📄 ${esc(a.nome || 'arquivo')}</a>`)).join('')}</div>` : ''}
      ${r.audio_path ? '<div class="sg-audio"><a href="#" data-act="audio">▶ ouvir o áudio original</a></div>' : ''}
      ${r.resposta ? `<div class="sg-resp" ${aguardando ? 'style="background:#fde8e8;border:2px solid var(--red)"' : ''}><b>Resposta:</b> ${esc(r.resposta).replace(/\n/g, '<br>')}</div>` : ''}
      <div class="sg-actions"><button class="btn btn-line btn-sm" data-act="status">Alterar status / responder</button><button class="btn-ghost" data-act="hist">Histórico (${hist.length})</button>${S.isAdmin ? '<button class="btn-ghost" data-act="del" style="color:var(--red);margin-left:auto">Excluir</button>' : ''}</div>
      <div class="sg-hist" hidden>${hist.length ? hist.slice().reverse().map((h) => `<div class="rec"><span class="k">${fmtDate(h.em, true)}</span><b>${esc(h.por || '—')}</b>: ${esc(sgLabel(h.de)[1])} → <b>${esc(sgLabel(h.para)[1])}</b>${h.nota ? '<br>' + esc(h.nota) : ''}${h.anexos ? `<br><span class="muted small">📎 ${h.anexos} anexo(s)</span>` : ''}</div>`).join('') : '<div class="muted small">Sem movimentações ainda.</div>'}</div>
    </div>`;
  }).join('') : '<div class="op-more">Nenhuma sugestão nesta seleção.</div>';

  $$('#sg-chips .sg-chip').forEach((b) => b.onclick = () => { SG.filter = b.dataset.f; sgDraw(); });
  $$('#sg-list [data-act]').forEach((a) => a.onclick = async (e) => {
    e.preventDefault();
    const card = a.closest('.sg-card');
    const r = SG.list.find((x) => x.id === card.dataset.id);
    if (!r) return;
    if (a.dataset.act === 'hist') { const h = $('.sg-hist', card); h.hidden = !h.hidden; }
    if (a.dataset.act === 'audio') {
      try { a.parentElement.innerHTML = `<audio controls autoplay src="${await docsSignedUrl(r.audio_path)}"></audio>`; } catch (x) { toast('Erro: ' + x.message, 'err'); }
    }
    if (a.dataset.act === 'status') sgStatusDialog(r);
    if (a.dataset.act === 'del') {
      if (!(await confirmDlg('Excluir sugestão', 'Excluir esta sugestão e o histórico dela?', { okText: 'Excluir', danger: true }))) return;
      const { error } = await sb.from('flow_sugestoes').delete().eq('id', r.id);
      if (error) return toast('Erro: ' + error.message, 'err');
      SG.list = SG.list.filter((x) => x.id !== r.id); sgDraw();
    }
  });
  $$('#sg-list [data-att]').forEach((a) => a.onclick = async (e) => {
    e.preventDefault();
    try { window.open(await docsSignedUrl(a.dataset.att), '_blank'); } catch (x) { toast('Erro: ' + x.message, 'err'); }
  });
  sgThumbs();
}

async function sgThumbs() {
  const imgs = $$('#sg-list img[data-thumb]');
  if (!imgs.length) return;
  const paths = uniq(imgs.map((i) => i.dataset.thumb));
  const { data } = await sb.storage.from('flow-docs').createSignedUrls(paths, 3600);
  const map = new Map((data || []).map((d) => [d.path, d.signedUrl]));
  imgs.forEach((i) => { const u = map.get(i.dataset.thumb); if (u) i.src = u; });
}

// ---------- escrever: texto, voz, anexos ----------
function bindComposer() {
  const ta = $('#sg-text');
  $('#sg-q').oninput = (e) => { SG.q = e.target.value; sgDraw(); };
  $('#sg-attach').onclick = () => $('#sg-file').click();
  $('#sg-file').onchange = (e) => { sgAddFiles(e.target.files); e.target.value = ''; };
  $('#sg-files').onclick = (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; SG.files.splice(+b.dataset.rm, 1); sgRenderFiles(); };
  ta.addEventListener('paste', (e) => {
    const items = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file');
    if (!items.length) return;
    e.preventDefault();
    sgAddFiles(namePasted(items));
    toast('Print anexado', 'ok');
  });
  ta.addEventListener('dragover', (e) => { e.preventDefault(); ta.classList.add('over'); });
  ta.addEventListener('dragleave', () => ta.classList.remove('over'));
  ta.addEventListener('drop', (e) => { e.preventDefault(); ta.classList.remove('over'); sgAddFiles(e.dataTransfer.files); });
  $('#sg-mic').onclick = sgMicToggle;
  $('#sg-send').onclick = sgSend;
}
function sgRenderFiles() { $('#sg-files').innerHTML = fileChips(SG.files); }
function sgAddFiles(list) {
  [...list].forEach((f) => {
    if (f.size > 25 * 1024 * 1024) { toast(`${f.name} passa de 25 MB e não foi anexado.`, 'err'); return; }
    SG.files.push(f);
  });
  sgRenderFiles();
}

/** Ditado por voz (transcreve no campo) + grava o áudio original para anexar. */
async function sgMicToggle() {
  const btn = $('#sg-mic'), st = $('#sg-mic-st'), ta = $('#sg-text');
  if (SG.recording) {
    SG.recording = false;
    try { SG.rec && SG.rec.stop(); } catch (_) { /* já parado */ }
    try { if (SG.media && SG.media.state !== 'inactive') SG.media.stop(); } catch (_) { /* já parado */ }
    btn.textContent = '🎤 Gravar / ditar'; btn.classList.remove('rec'); st.textContent = '';
    return;
  }
  if (!SG_SR) { toast('Este navegador não faz ditado por voz. Use o Chrome ou o Edge.', 'err'); return; }
  const base = ta.value ? ta.value.replace(/\s+$/, '') + '\n' : '';
  SG.audioBlob = null; SG.chunks = [];
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    SG.media = new MediaRecorder(stream);
    SG.media.ondataavailable = (e) => { if (e.data.size) SG.chunks.push(e.data); };
    SG.media.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      SG.audioBlob = new Blob(SG.chunks, { type: SG.media.mimeType || 'audio/webm' });
      const p = $('#sg-audio-prev'); p.src = URL.createObjectURL(SG.audioBlob); p.hidden = false;
    };
    SG.media.start();
  } catch (_) { SG.media = null; }
  const rec = new SG_SR();
  rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true;
  SG.rec = rec;
  let fin = '';
  rec.onresult = (ev) => {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const t = ev.results[i][0].transcript;
      if (ev.results[i].isFinal) fin += t + ' '; else interim += t;
    }
    ta.value = base + fin + interim;
    SG.voz = true;
  };
  rec.onerror = (ev) => { if (ev.error === 'not-allowed') toast('Permita o uso do microfone no navegador.', 'err'); };
  rec.onend = () => { if (SG.recording) { try { rec.start(); } catch (_) { /* reinício */ } } };
  rec.start();
  SG.recording = true;
  btn.textContent = '⏹ Parar'; btn.classList.add('rec'); st.textContent = '🔴 ouvindo... fale e depois clique em Parar';
}

async function sgSend() {
  if (SG.recording) await sgMicToggle();
  const ta = $('#sg-text');
  let texto = ta.value.trim();
  if (!texto && !SG.files.length && !SG.audioBlob) { toast('Escreva, dite ou anexe algo primeiro.', 'err'); return; }
  if (!texto) texto = SG.files.length ? '(ver anexos)' : '(ouvir o áudio)';
  const btn = $('#sg-send');
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    await new Promise((r) => setTimeout(r, 400)); // deixa o gravador fechar o áudio
    let audio_path = null;
    if (SG.audioBlob) {
      try { audio_path = await docsUpload(new File([SG.audioBlob], `sugestao-${Date.now()}.webm`, { type: SG.audioBlob.type || 'audio/webm' }), 'sugestoes'); } catch (e) { console.warn(e); }
    }
    const anexos = [];
    for (const f of SG.files) anexos.push({ path: await docsUpload(f, 'sugestoes'), nome: f.name, mime: f.type, tamanho: f.size });
    const autor = actorName();
    const { error } = await sb.from('flow_sugestoes').insert({
      texto, anexos, audio_path, origem: SG.voz || audio_path ? 'voz' : 'texto',
      tipo: $('#sg-tipo').value, tela: $('#sg-tela').value || null, prioridade: $('#sg-prio').value,
      historico: [{ em: new Date().toISOString(), por: autor, de: 'nova', para: 'nova', nota: 'Sugestão registrada' }],
    });
    if (error) throw error;
    ta.value = ''; SG.files = []; sgRenderFiles(); SG.audioBlob = null; SG.voz = false;
    const p = $('#sg-audio-prev'); p.hidden = true; p.removeAttribute('src');
    toast('Sugestão registrada — obrigado!', 'ok');
    loadSugestoes();
  } catch (e) { toast('Erro: ' + (e.message || e), 'err'); }
  btn.disabled = false; btn.textContent = 'Enviar sugestão';
}

// ---------- alterar status / responder ----------
function sgStatusDialog(r) {
  const files = [];
  const m = openModal(`
    <div class="modal-head"><div><h2>Alterar status</h2><div class="om-sub">${esc((r.texto || '').slice(0, 140))}${(r.texto || '').length > 140 ? '…' : ''}</div></div><button class="x" data-close>✕</button></div>
    <div class="modal-body">
      <div class="field"><label>Novo status</label><select class="inp" id="sgd-status">${SG_STATUS.map((s) => `<option value="${s[0]}" ${r.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}</select></div>
      <div class="field"><label>Resposta / nota (visível para quem sugeriu)</label><textarea class="inp" id="sgd-note" rows="4"></textarea></div>
      <label class="small" style="display:flex;gap:6px;align-items:center;margin:-4px 0 12px"><input type="checkbox" id="sgd-wait"> 💬 Preciso de um retorno de ${esc((r.autor || '').split(' ')[0] || 'quem sugeriu')} (destaca em vermelho)</label>
      <div class="field"><label>Anexar print(s) ou arquivo(s) — opcional</label>
        <div class="dz" id="sgd-dz">📎 Arraste, cole (Ctrl+V) ou clique para anexar<input type="file" id="sgd-file" multiple accept=".pdf,image/*" hidden></div>
        <div id="sgd-files" class="sg-files"></div></div>
    </div>
    <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-primary" id="sgd-save">Salvar</button></div>`);
  const el = m.el;
  const dz = $('#sgd-dz', el), inp = $('#sgd-file', el), host = $('#sgd-files', el);
  const draw = () => { host.innerHTML = fileChips(files); };
  const add = (list) => { files.push(...[...list]); draw(); };
  dz.onclick = () => inp.click();
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); add(e.dataTransfer.files); };
  inp.onchange = () => { add(inp.files); inp.value = ''; };
  host.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (!b) return; files.splice(+b.dataset.rm, 1); draw(); };
  $('.modal-body', el).addEventListener('paste', (e) => {
    const items = [...(e.clipboardData?.items || [])].filter((i) => i.kind === 'file');
    if (!items.length) return;
    e.preventDefault(); add(namePasted(items));
  });
  $('#sgd-save', el).onclick = async () => {
    const btn = $('#sgd-save', el);
    const para = $('#sgd-status', el).value;
    let nota = $('#sgd-note', el).value.trim();
    const wait = $('#sgd-wait', el).checked;
    if (para === r.status && !nota && !files.length && !wait) { m.close(); return; }
    if (wait && !nota.startsWith('🔴')) nota = '🔴 ' + (nota || 'Preciso de mais detalhes sobre esta sugestão.');
    btn.disabled = true; btn.textContent = 'Salvando...';
    const por = actorName();
    const novos = [];
    try {
      for (const f of files) novos.push({ path: await docsUpload(f, 'sugestoes'), nome: f.name, mime: f.type, tamanho: f.size, por, em: new Date().toISOString() });
    } catch (e) { toast('Erro ao anexar arquivo: ' + (e.message || e), 'err'); btn.disabled = false; btn.textContent = 'Salvar'; return; }
    const upd = {
      status: para,
      historico: (r.historico || []).concat([{ em: new Date().toISOString(), por, de: r.status, para, nota: nota || null, anexos: novos.length || undefined }]),
    };
    if (nota) upd.resposta = nota;
    if (novos.length) upd.anexos = (r.anexos || []).concat(novos);
    const { error } = await sb.from('flow_sugestoes').update(upd).eq('id', r.id);
    if (error) { toast('Erro: ' + error.message, 'err'); btn.disabled = false; btn.textContent = 'Salvar'; return; }
    Object.assign(r, upd);
    m.close(); toast('Status atualizado', 'ok'); sgDraw();
  };
}
