/* CallMed Flow — administração: usuários (acesso, papel, senha) e hospitais. Só admin. */
'use strict';

let adminTab = 'usuarios';

async function adminCall(action, payload) {
  const { data, error } = await sb.functions.invoke('flow-admin', { body: { action, ...payload } });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch (_) { /* mantém */ }
    throw new Error(msg);
  }
  return data;
}

async function renderAdmin() {
  const root = $('#view-usuarios');
  if (!S.isAdmin) { root.innerHTML = '<div class="alert r">Acesso restrito a administradores.</div>'; return; }
  await loadCore().catch(() => {});
  const tabs = [['usuarios', 'Usuários'], ['hospitais', 'Hospitais'], ['migracao', 'Migração do Flow antigo']];
  root.innerHTML = `<div class="tabs">${tabs.map(([k, l]) => `<button data-atab="${k}" class="${adminTab === k ? 'active' : ''}">${l}</button>`).join('')}</div><div id="adm-body"></div>`;
  $$('[data-atab]', root).forEach((b) => b.onclick = () => { adminTab = b.dataset.atab; renderAdmin(); });
  ({ usuarios: drawUsers, hospitais: drawHospitals, migracao: drawMigration })[adminTab]();
}

// ---------- migração única do Flow antigo (Lovable) ----------
function drawMigration() {
  $('#adm-body').innerHTML = `
    <div class="panel" style="max-width:760px">
      <h3>Importar dados do Flow antigo</h3>
      <p class="small" style="margin-top:0">Selecione os 3 arquivos gerados na migração: <span class="mono">payload_doctors.json</span>, <span class="mono">payload_acts.json</span> e <span class="mono">payload_docs.json</span>.
      A carga pode ser repetida sem duplicar nada (cada registro mantém o ID original). Os médicos entram primeiro, depois histórico e documentos.</p>
      <input type="file" id="mg-files" accept=".json" multiple>
      <div class="actions-row"><button class="btn btn-primary btn-sm" id="mg-go" disabled>Importar</button></div>
      <div id="mg-log" class="small mono" style="white-space:pre-wrap"></div>
    </div>`;
  const files = {};
  $('#mg-files').onchange = async (e) => {
    for (const f of e.target.files) {
      const key = f.name.includes('doctors') ? 'flow_doctors' : f.name.includes('acts') ? 'flow_activities' : f.name.includes('docs') ? 'flow_doctor_documents' : null;
      if (key) files[key] = JSON.parse(await f.text());
    }
    $('#mg-log').textContent = Object.entries(files).map(([k, v]) => `${k}: ${v.length} registros prontos`).join('\n');
    $('#mg-go').disabled = !files.flow_doctors;
  };
  $('#mg-go').onclick = async () => {
    $('#mg-go').disabled = true;
    const log = (t) => { $('#mg-log').textContent += '\n' + t; };
    for (const table of ['flow_doctors', 'flow_activities', 'flow_doctor_documents']) {
      const rows = files[table];
      if (!rows) continue;
      let ok = 0; const errs = [];
      for (let i = 0; i < rows.length; i += 300) {
        try {
          const r = await adminCall('import', { table, rows: rows.slice(i, i + 300) });
          ok += r.ok; errs.push(...r.errors);
        } catch (e) { errs.push({ id: `lote ${i}`, msg: e.message }); }
        $('#mg-log').textContent = $('#mg-log').textContent.replace(new RegExp(`\\n?${table} → .*$`), '') + `\n${table} → ${ok}/${rows.length}`;
      }
      if (errs.length) log(`${table}: ${errs.length} erro(s). Primeiro: ${errs[0].msg}`);
    }
    log('Concluído.');
    toast('Importação concluída', 'ok');
    await loadCore();
  };
}
VIEWS.usuarios = renderAdmin;

function drawUsers() {
  const users = Object.values(S.profiles).sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.display_name.localeCompare(b.display_name));
  $('#adm-body').innerHTML = `
    <div class="toolbar"><button class="btn btn-primary btn-sm" id="u-new">＋ Novo usuário</button>
      <span class="muted small">Novos usuários recebem uma senha provisória e são obrigados a trocá-la no primeiro acesso.</span></div>
    <div class="panel" style="padding:0;overflow:auto"><table class="t"><thead><tr><th>Nome</th><th>E-mail</th><th>Setor</th><th>Papel</th><th>Situação</th><th></th></tr></thead><tbody>
    ${users.map((u) => {
      const admin = (S.roles[u.user_id] || []).includes('admin');
      const me = u.user_id === S.user.id;
      return `<tr><td><b>${esc(u.display_name || '—')}</b>${me ? ' <span class="tag on">você</span>' : ''}</td><td>${esc(u.email)}</td><td>${esc(SETOR_USUARIO[u.setor] || u.setor || '—')}</td>
        <td>${admin ? '<span class="tag on">Administrador</span>' : '<span class="tag">Usuário</span>'}</td>
        <td>${u.ativo ? (u.must_change_password ? '<span class="tag a">Aguardando 1º acesso</span>' : '<span class="tag g">Ativo</span>') : '<span class="tag r">Bloqueado</span>'}</td>
        <td style="white-space:nowrap">${me ? '' : `
          <button class="btn btn-line btn-sm" data-u="${u.user_id}" data-act="role">${admin ? 'Tirar admin' : 'Tornar admin'}</button>
          <button class="btn btn-line btn-sm" data-u="${u.user_id}" data-act="reset">Nova senha</button>
          <button class="btn ${u.ativo ? 'btn-danger' : 'btn-green'} btn-sm" data-u="${u.user_id}" data-act="active">${u.ativo ? 'Bloquear' : 'Reativar'}</button>`}
          <button class="btn btn-line btn-sm" data-u="${u.user_id}" data-act="edit">✎</button></td></tr>`;
    }).join('')}</tbody></table></div>`;
  $('#u-new').onclick = () => userForm();
  $$('[data-act]', $('#adm-body')).forEach((b) => b.onclick = () => userAction(b.dataset.u, b.dataset.act));
}

function showTempPassword(email, pass) {
  const m = openModal(`
    <div class="modal-head"><h2>Senha provisória</h2><button class="x" data-close>×</button></div>
    <div class="modal-body">
      <p style="margin-top:0">Envie para <b>${esc(email)}</b> por um canal privado. Ela só aparece agora; no primeiro acesso a pessoa define a própria senha.</p>
      <div style="display:flex;gap:6px"><input class="inp mono" id="tp" value="${esc(pass)}" readonly><button class="btn btn-primary btn-sm" id="tp-copy">Copiar</button></div>
      <p class="small muted">Link do sistema: ${esc(location.origin + location.pathname)}</p>
    </div>
    <div class="modal-foot"><button class="btn btn-line" data-close>Fechar</button></div>`, { size: 'sm' });
  $('#tp-copy', m.el).onclick = () => {
    navigator.clipboard.writeText(`CallMed Flow\n${location.origin + location.pathname}\nE-mail: ${email}\nSenha provisória: ${pass}`);
    toast('Copiado', 'ok');
  };
}

function userForm(u) {
  const m = openModal(`
    <div class="modal-head"><h2>${u ? 'Editar usuário' : 'Novo usuário'}</h2><button class="x" data-close>×</button></div>
    <div class="modal-body">
      <div class="field"><label>Nome</label><input class="inp" id="uf-name" value="${esc(u?.display_name || '')}"></div>
      <div class="field"><label>E-mail</label><input class="inp" id="uf-email" type="email" value="${esc(u?.email || '')}" ${u ? 'disabled' : ''}></div>
      <div class="field"><label>Setor</label><select class="inp" id="uf-setor"><option value="">—</option>${Object.entries(SETOR_USUARIO).map(([k, l]) => `<option value="${k}" ${u?.setor === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${u ? '' : '<label class="small"><input type="checkbox" id="uf-admin"> Administrador (gerencia usuários, colunas, hospitais e pode excluir médicos)</label>'}
    </div>
    <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-primary" id="uf-ok">${u ? 'Salvar' : 'Criar usuário'}</button></div>`, { size: 'sm' });
  $('#uf-ok', m.el).onclick = async () => {
    const name = $('#uf-name', m.el).value.trim(), setor = $('#uf-setor', m.el).value;
    if (!name) return toast('Informe o nome.', 'err');
    const btn = $('#uf-ok', m.el); btn.disabled = true;
    try {
      if (u) {
        const { error } = await sb.from('flow_profiles').update({ display_name: name, setor }).eq('user_id', u.user_id);
        if (error) throw error;
        toast('Usuário atualizado', 'ok');
      } else {
        const email = $('#uf-email', m.el).value.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('E-mail inválido.');
        const r = await adminCall('create', { email, display_name: name, setor, admin: $('#uf-admin', m.el).checked });
        m.close();
        if (r.temp_password) showTempPassword(email, r.temp_password);
        else toast('Essa conta já existia e foi liberada no Flow. A pessoa usa a senha que já tem.', 'ok');
      }
      m.close(); renderAdmin();
    } catch (e) { toast(e.message, 'err'); btn.disabled = false; }
  };
}

async function userAction(uid, act) {
  const u = S.profiles[uid];
  try {
    if (act === 'edit') return userForm(u);
    if (act === 'role') {
      const admin = (S.roles[uid] || []).includes('admin');
      if (!(await confirmDlg(admin ? 'Tirar administrador' : 'Tornar administrador', `${admin ? 'Remover' : 'Dar'} acesso de administrador para ${u.display_name}?`))) return;
      await adminCall('set_admin', { user_id: uid, admin: !admin });
    }
    if (act === 'active') {
      if (!(await confirmDlg(u.ativo ? 'Bloquear acesso' : 'Reativar acesso', `${u.ativo ? 'Bloquear' : 'Reativar'} o acesso de ${u.display_name} ao Flow?`, { danger: u.ativo }))) return;
      await adminCall('set_active', { user_id: uid, ativo: !u.ativo });
    }
    if (act === 'reset') {
      if (!(await confirmDlg('Gerar nova senha', `Gerar uma senha provisória para ${u.display_name}? A senha atual deixa de funcionar.`))) return;
      const r = await adminCall('reset_password', { user_id: uid });
      showTempPassword(u.email, r.temp_password);
    }
    toast('Feito', 'ok');
    renderAdmin();
  } catch (e) { toast(e.message, 'err'); }
}

function drawHospitals() {
  const counts = {};
  S.doctors.forEach((d) => { counts[d.hospital] = (counts[d.hospital] || 0) + 1; });
  $('#adm-body').innerHTML = `
    <div class="toolbar"><input class="inp" id="h-new" placeholder="Nome do novo hospital" style="width:320px"><button class="btn btn-primary btn-sm" id="h-add">＋ Adicionar</button>
      <span class="muted small">Renomear atualiza todos os médicos daquele hospital. Hospitais inativos somem das listas de cadastro, mas o histórico fica.</span></div>
    <div class="panel" style="padding:0"><table class="t"><thead><tr><th>Hospital</th><th>Médicos</th><th>Situação</th><th></th></tr></thead><tbody>
    ${S.hospitals.map((h) => `<tr><td><b>${esc(h.nome)}</b></td><td>${counts[h.nome] || 0}</td><td>${h.ativo ? '<span class="tag g">Ativo</span>' : '<span class="tag">Inativo</span>'}</td>
      <td><button class="btn btn-line btn-sm" data-hren="${esc(h.nome)}">Renomear</button> <button class="btn btn-line btn-sm" data-htog="${esc(h.nome)}">${h.ativo ? 'Inativar' : 'Ativar'}</button></td></tr>`).join('')}
    </tbody></table></div>`;
  $('#h-add').onclick = async () => {
    const nome = $('#h-new').value.trim();
    if (!nome) return;
    const { error } = await sb.from('flow_hospitals').insert({ nome });
    if (error) return toast(error.code === '23505' ? 'Esse hospital já existe.' : error.message, 'err');
    toast('Hospital adicionado', 'ok'); renderAdmin();
  };
  $$('[data-htog]').forEach((b) => b.onclick = async () => {
    const h = S.hospitals.find((x) => x.nome === b.dataset.htog);
    const { error } = await sb.from('flow_hospitals').update({ ativo: !h.ativo }).eq('nome', h.nome);
    if (error) return toast(error.message, 'err');
    renderAdmin();
  });
  $$('[data-hren]').forEach((b) => b.onclick = () => {
    const old = b.dataset.hren;
    const m = openModal(`<div class="modal-head"><h2>Renomear hospital</h2><button class="x" data-close>×</button></div>
      <div class="modal-body"><div class="field"><label>Novo nome</label><input class="inp" id="hr" value="${esc(old)}"></div></div>
      <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button><button class="btn btn-primary" id="hr-ok">Salvar</button></div>`, { size: 'sm' });
    $('#hr-ok', m.el).onclick = async () => {
      const nome = $('#hr', m.el).value.trim();
      if (!nome || nome === old) return m.close();
      const { error } = await sb.from('flow_hospitals').update({ nome }).eq('nome', old);
      if (error) return toast(error.message, 'err');
      m.close(); toast('Hospital renomeado', 'ok'); renderAdmin();
    };
  });
}

// ---------- inicialização ----------
if (/type=recovery/.test(location.hash)) passMode = 'recovery';
boot();
