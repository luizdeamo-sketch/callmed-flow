/* CallMed Flow — modo demonstração (?demo): o sistema de verdade, com dados fictícios em memória e um tour guiado.
   Nada aqui toca o banco: todas as chamadas ao Supabase são respondidas localmente. */
'use strict';

(function () {
  // ================= dados fictícios =================
  const DAY = 864e5;
  const NOW = Date.now();
  const iso = (ms) => new Date(ms).toISOString();
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const uid = (n) => `d0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  const BRUNA = 'a0000000-0000-4000-8000-000000000001';
  const CAMILA = 'a0000000-0000-4000-8000-000000000002';
  const RENATO = 'a0000000-0000-4000-8000-000000000003';
  const PEOPLE = {
    bruna: { user_id: BRUNA, display_name: 'Bruna Lima', email: 'bruna@demo.local', setor: 'escalas', ativo: true, must_change_password: false },
    camila: { user_id: CAMILA, display_name: 'Camila Rocha', email: 'camila@demo.local', setor: 'cadastro', ativo: true, must_change_password: false },
    renato: { user_id: RENATO, display_name: 'Renato Alves', email: 'renato@demo.local', setor: 'cadastro', ativo: true, must_change_password: false },
  };
  const STAGES = [
    ['aguardando_contato', 'Primeiro contato', '#8b8fa3', 24], ['aguardando_medico', 'Aguardando médico', '#c98a1b', 24],
    ['aguardando_juridico', 'Jurídico', '#7c6fd0', 24], ['documentacao_pendente', 'Documentação', '#d9822b', 24],
    ['aguardando_hospital', 'Hospital', '#3463e0', 48], ['em_espera', 'Em espera', '#9a9aa5', 9999],
    ['aprovado', 'Aprovado', '#1f9d6b', 9999], ['reprovado', 'Reprovado', '#d0443a', 9999],
  ];
  const LABEL = Object.fromEntries(STAGES.map((s) => [s[0], s[1]]));
  const HOSPS = ['Hospital Santa Cruz', 'Hospital Salvalus – Unidade Avançada', 'Centro Médico Guapituba (MAUÁ)', 'Ambulatório Monte Serrat', 'Ambulatório CM João Azevedo'];
  const FIRST = ['Ana', 'Bruno', 'Carla', 'Daniel', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João', 'Larissa', 'Marcelo', 'Natália', 'Otávio', 'Paula', 'Rafael', 'Sofia', 'Tiago', 'Vanessa', 'Gustavo', 'Juliana', 'Leonardo', 'Mariana', 'Pedro', 'Renata', 'Sérgio', 'Talita', 'Vinícius', 'Beatriz', 'Caio', 'Débora', 'Fábio', 'Helena', 'Igor', 'Lívia', 'Mateus'];
  const LAST = ['Moura', 'Duarte', 'Ribeiro', 'Castro', 'Nogueira', 'Teixeira', 'Barros', 'Freitas', 'Campos', 'Pires', 'Cardoso', 'Monteiro', 'Rezende', 'Sales', 'Vieira', 'Andrade', 'Lacerda', 'Prado'];
  const SETS = ['UTI', 'PRONTO ATENDIMENTO', 'ENFERMARIA', 'ANESTESIA', 'EMERGÊNCIA'];
  // caminho típico até cada etapa final
  const PATH = { aguardando_contato: ['aguardando_contato'], aguardando_medico: ['aguardando_contato', 'aguardando_medico'],
    documentacao_pendente: ['aguardando_contato', 'aguardando_medico', 'documentacao_pendente'],
    aguardando_juridico: ['aguardando_contato', 'aguardando_medico', 'documentacao_pendente', 'aguardando_juridico'],
    aguardando_hospital: ['aguardando_contato', 'aguardando_medico', 'documentacao_pendente', 'aguardando_hospital'],
    em_espera: ['aguardando_contato', 'aguardando_medico', 'em_espera'],
    aprovado: ['aguardando_contato', 'aguardando_medico', 'documentacao_pendente', 'aguardando_hospital', 'aprovado'],
    reprovado: ['aguardando_contato', 'aguardando_medico', 'documentacao_pendente', 'aguardando_hospital', 'reprovado'] };
  const MIX = [['aguardando_contato', 3], ['aguardando_medico', 10], ['documentacao_pendente', 7], ['aguardando_juridico', 3], ['aguardando_hospital', 8], ['em_espera', 2], ['aprovado', 6], ['reprovado', 1]];
  const ymdL = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function buildDB() {
    seed = 7;
    const db = {
      flow_stages: STAGES.map(([id, label, color, sla], i) => ({ id, label, color, position: i, sla_hours: sla, is_custom: false })),
      flow_hospitals: HOSPS.map((nome) => ({ nome, ativo: true, created_at: iso(NOW - 200 * DAY) })),
      flow_profiles: Object.values(PEOPLE).map((p) => ({ ...p })),
      flow_user_roles: [],
      flow_doctors: [], flow_activities: [], flow_doctor_documents: [], flow_notifications: [],
      flow_sugestoes: [{ id: crypto.randomUUID(), autor_id: CAMILA, autor: 'Camila Rocha', texto: 'Seria ótimo ver no Hoje quantos documentos faltam de cada médico.', origem: 'texto', tipo: 'melhoria', tela: 'Hoje', prioridade: 'normal', status: 'em_analise', audio_path: null, resposta: '', historico: [], anexos: [], created_at: iso(NOW - 2 * DAY), atualizado_em: iso(NOW - DAY) }],
      flow_rqe_requests: [], flow_rqe_documents: [], flow_tarefas: [],
    };
    let n = 0;
    MIX.forEach(([final, qty]) => {
      for (let k = 0; k < qty; k++) {
        n++;
        const id = uid(n);
        const name = `${FIRST[(n * 7) % FIRST.length]} ${LAST[(n * 5) % LAST.length]}`;
        const entry = NOW - (6 + Math.floor(rnd() * 34)) * DAY - Math.floor(rnd() * 8) * 3600e3;
        const path = PATH[final];
        const lastAt = final === 'aprovado' && k < 2 ? NOW - 2 * 3600e3 : NOW - Math.floor(rnd() * 5 * DAY) - 3600e3;
        const step = (lastAt - entry) / Math.max(1, path.length - 1);
        const by = n % 4 === 0 ? CAMILA : BRUNA;
        path.forEach((st, i) => {
          const at = i === 0 ? entry : entry + step * i;
          db.flow_activities.push({ id: crypto.randomUUID(), doctor_id: id, type: 'stage_change', description: i === 0 ? 'Cadastro criado no sistema' : `Movido para ${LABEL[st]}`, created_by: i === 0 ? by : CAMILA, created_by_name: i === 0 ? PEOPLE[by === BRUNA ? 'bruna' : 'camila'].display_name : 'Camila Rocha', created_at: iso(at) });
        });
        const open = !['aprovado', 'reprovado'].includes(final);
        const urg = open && (n % 9 === 0);
        db.flow_doctors.push({
          id, name, hospital: HOSPS[n % HOSPS.length], cpf: '', crm: `CRM/SP ${120000 + n * 37}`, estado: 'SP', status_especialidade: final === 'em_espera' ? 'R3' : pick(['FORMADO', 'FORMADO C/ RQE']),
          setores: [SETS[n % SETS.length]], rqe: '', procuracao: rnd() > 0.5, disc: pick(['ADERENTE', 'ADERENTE', 'AGUARDANDO RETORNO']), medsimples: '', cobranca_medsimples: '',
          doc_pendente: final === 'documentacao_pendente' && k % 2 === 0 ? 'Diploma frente e verso' : '', dt_cobranca_doc: '', cobranca: '', dt_email_enviado: '', cobranca2: '', dt_resp_hospital: '',
          stage: final, priority: urg ? 'urgente' : 'rotina', urgente_ate: urg ? ymdL(NOW + 4 * DAY) : null, app: rnd() > 0.6, link_enviado: rnd() > 0.5, whatsapp: `1199${String(1000000 + n * 7919).slice(0, 7)}`,
          observations: '', entry_date: iso(entry), stage_entered_at: iso(lastAt), sla_hours: STAGES.find((s) => s[0] === final)[3], legacy_id: null, created_by: by, created_at: iso(entry), updated_at: iso(lastAt),
          proxima_acao: open ? (ACAO_POR_ETAPA[final] || 'Cobrar retorno do médico') : null, proxima_data: open ? ymdL(NOW + (Math.floor(rnd() * 7) - 2) * DAY) : null,
          proximo_responsavel_id: open ? (n % 5 === 0 ? RENATO : CAMILA) : null,
        });
        const docsN = { documentacao_pendente: 9, aguardando_juridico: 16, aguardando_hospital: 22, aprovado: 22, reprovado: 22 }[final] || 0;
        REQUIRED_DOCUMENTS.slice(0, docsN).forEach((dn) => db.flow_doctor_documents.push({ id: crypto.randomUUID(), doctor_id: id, document_name: dn, status: 'enviado', notes: '', updated_by: CAMILA, created_at: iso(lastAt), updated_at: iso(lastAt) }));
      }
    });
    db.flow_notifications.push({ id: crypto.randomUUID(), user_id: CAMILA, doctor_id: uid(12), doctor_name: db.flow_doctors[11].name, message: `${db.flow_doctors[11].name} foi movido para "Documentação"`, created_by_name: 'Renato Alves', read: true, created_at: iso(NOW - 5 * 3600e3) });
    return db;
  }
  let DB = buildDB();

  // ================= Supabase simulado =================
  const match = (r, f) => f.every(([op, c, v]) => {
    const x = r[c];
    if (op === 'eq') return String(x) === String(v);
    if (op === 'neq') return String(x) !== String(v);
    if (op === 'in') return v.map(String).includes(String(x));
    if (op === 'is') return (x ?? null) === v;
    if (op === 'gte') return x >= v; if (op === 'lte') return x <= v; if (op === 'gt') return x > v; if (op === 'lt') return x < v;
    return true;
  });
  function from(table) {
    const st = { op: null, payload: null, f: [], single: false, range: null, order: null, limit: null };
    const exec = () => {
      const rows = (DB[table] ||= []);
      let data;
      if (st.op === 'insert' || st.op === 'upsert') {
        const arr = [].concat(st.payload).map((r) => {
          const row = { id: crypto.randomUUID(), created_at: iso(Date.now()), ...r };
          if (table === 'flow_activities') { row.created_by = S.user.id; row.created_by_name = S.profile.display_name; }
          if (table === 'flow_sugestoes') { row.status ||= 'nova'; row.historico ||= []; row.anexos ||= []; row.atualizado_em = row.created_at; }
          if (table === 'flow_doctors') { row.created_by = S.user.id; row.updated_at = row.created_at; row.entry_date ||= row.created_at; row.stage_entered_at ||= row.created_at; }
          return row;
        });
        if (st.op === 'upsert' && table === 'flow_doctor_documents') {
          arr.forEach((r) => { const ex = rows.find((x) => x.doctor_id === r.doctor_id && x.document_name === r.document_name); if (ex) Object.assign(ex, r, { id: ex.id, updated_at: iso(Date.now()) }); else rows.push({ ...r, updated_at: iso(Date.now()) }); });
        } else rows.push(...arr);
        data = arr;
        if (table === 'flow_doctors') arr.forEach(onHandoff);
      } else if (st.op === 'update') {
        const m = rows.filter((r) => match(r, st.f));
        m.forEach((r) => { const before = r.proximo_responsavel_id; Object.assign(r, st.payload); if (table === 'flow_doctors' && st.payload.proximo_responsavel_id && st.payload.proximo_responsavel_id !== before) onHandoff(r); });
        data = m;
      } else if (st.op === 'delete') { data = rows.filter((r) => match(r, st.f)); DB[table] = rows.filter((r) => !match(r, st.f)); }
      else {
        data = rows.filter((r) => match(r, st.f));
        if (st.order) data = data.slice().sort((a, b) => (a[st.order.c] > b[st.order.c] ? 1 : -1) * (st.order.asc ? 1 : -1));
        if (st.range) data = data.slice(st.range[0], st.range[1] + 1);
        if (st.limit) data = data.slice(0, st.limit);
      }
      data = JSON.parse(JSON.stringify(data));
      if (st.single) data = Array.isArray(data) ? (data[0] ?? null) : data;
      return { data, error: null, count: Array.isArray(data) ? data.length : null };
    };
    const b = {
      select() { if (!st.op) st.op = 'select'; return b; },
      insert(p) { st.op = 'insert'; st.payload = p; return b; }, upsert(p) { st.op = 'upsert'; st.payload = p; return b; },
      update(p) { st.op = 'update'; st.payload = p; return b; }, delete() { st.op = 'delete'; return b; },
      single() { st.single = true; return b; }, maybeSingle() { st.single = true; return b; }, range(a, z) { st.range = [a, z]; return b; },
      order(c, o) { st.order = { c, asc: !o || o.ascending !== false }; return b; }, limit(n) { st.limit = n; return b; },
      match(o) { Object.entries(o).forEach(([c, v]) => st.f.push(['eq', c, v])); return b; },
      then(res, rej) { return Promise.resolve().then(exec).then(res, rej); },
    };
    ['eq', 'neq', 'in', 'is', 'gte', 'lte', 'gt', 'lt'].forEach((op) => { b[op] = (c, v) => { st.f.push([op, c, v]); return b; }; });
    ['or', 'ilike', 'like', 'not', 'filter', 'contains', 'textSearch'].forEach((m) => { b[m] = () => b; });
    return b;
  }
  /** O banco de verdade avisa quem recebe um médico; aqui fazemos o mesmo. */
  function onHandoff(d) {
    if (!d.proximo_responsavel_id || d.proximo_responsavel_id === S.user.id) return;
    DB.flow_notifications.push({ id: crypto.randomUUID(), user_id: d.proximo_responsavel_id, doctor_id: d.id, doctor_name: d.name,
      message: `${S.profile.display_name} te passou: ${d.name} (${d.hospital}) — ${d.proxima_acao || 'acompanhar cadastro'}`, created_by_name: S.profile.display_name, read: false, created_at: iso(Date.now()) });
  }
  sb.from = from;
  sb.rpc = async () => ({ data: null, error: null });
  Object.defineProperty(sb, 'functions', { configurable: true, value: { invoke: async () => ({ data: { ok: true, temp_password: 'Demo-1234', errors: [] }, error: null }) } });
  const fakeStorage = { upload: async (p) => ({ data: { path: p }, error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'about:blank' }, error: null }), createSignedUrls: async (ps) => ({ data: ps.map((p) => ({ path: p, signedUrl: 'about:blank' })), error: null }), remove: async () => ({ data: [], error: null }) };
  Object.defineProperty(sb, 'storage', { configurable: true, value: { from: () => fakeStorage } });
  sb.channel = () => { const c = { on() { return c; }, subscribe() { return c; } }; return c; };
  sb.removeChannel = () => {};
  sb.auth.signOut = async () => ({ error: null });
  window.open = () => { toast('Na vida real, aqui abre o WhatsApp com a mensagem pronta.', 'ok', 'Demonstração'); return null; };
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a && /^(https?:|mailto:)/.test(a.getAttribute('href'))) { e.preventDefault(); toast('Na vida real, aqui abre o WhatsApp com a mensagem pronta.', 'ok', 'Demonstração'); }
  }, true);

  // ================= persona e reinício =================
  function setPersona(key) {
    const p = PEOPLE[key];
    S.user = { id: p.user_id, email: p.email };
    S.profile = DB.flow_profiles.find((x) => x.user_id === p.user_id);
    const chip = $('#who-chip');
    const pt = p.display_name.split(' ');
    chip.textContent = (pt[0][0] + pt[pt.length - 1][0]).toUpperCase();
    chip.title = `${p.display_name} · ${SETOR_USUARIO[p.setor]}`;
    $('#who-email').textContent = `${p.display_name} · ${SETOR_USUARIO[p.setor]}`;
    HJ.onlyMine = true;
  }
  async function resetDemo(persona = 'camila') {
    DB = buildDB();
    $$('.modal-bg').forEach((m) => m.remove());
    $('#notif-pop').hidden = true;
    Object.assign(F, { search: '', stage: '', next: '', resp: '', slaVencido: false, priority: '', hospitals: [] });
    FX.cell = null; FX.mode = 'jornada'; FX.per = { preset: '30d', start: null, end: null, gran: 'dia' };
    const s = $('#f-search'); if (s) s.value = '';
    setPersona(persona);
    await loadCore();
    STAGE_EV = null; ACTS = null;
    await loadNotifs();
    go('hoje');
  }

  // ================= início do modo demonstração =================
  const css = document.createElement('style');
  css.textContent = `
  .dm-banner{position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:90;background:#0b1240;color:#fff;font:500 12px var(--f-ui);padding:5px 14px;border-radius:0 0 10px 10px;letter-spacing:.01em;display:flex;gap:10px;align-items:center}
  .dm-banner a{color:#9ea7e6;text-decoration:none;cursor:pointer}
  .dm-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:100;pointer-events:none;transition:transform .7s cubic-bezier(.4,.1,.2,1);filter:drop-shadow(0 2px 3px rgba(0,0,0,.3))}
  .dm-cursor.click::after{content:'';position:absolute;left:-10px;top:-10px;width:24px;height:24px;border-radius:50%;border:2px solid #1029e8;animation:dmPulse .5s ease-out}
  @keyframes dmPulse{from{transform:scale(.3);opacity:1}to{transform:scale(1.6);opacity:0}}
  .dm-ring{position:fixed;z-index:95;pointer-events:none;border:2px solid #1029e8;border-radius:10px;box-shadow:0 0 0 4px rgba(16,41,232,.15);transition:all .5s cubic-bezier(.4,.1,.2,1);opacity:0}
  .dm-bar{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:110;width:min(760px,calc(100vw - 32px));background:#0b1240;color:#fff;border-radius:14px;box-shadow:0 20px 50px -12px rgba(0,0,0,.45);padding:14px 16px 12px;font-family:var(--f-ui)}
  .dm-bar .t{font-size:12px;color:#9ea7e6;font-weight:500;display:flex;justify-content:space-between;gap:10px}
  .dm-bar .x2{font-size:16px;line-height:1.4;font-weight:500;margin:4px 0 10px;min-height:44px}
  .dm-bar .ctl{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .dm-bar button{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;border-radius:8px;height:32px;padding:0 12px;font:500 13px var(--f-ui);cursor:pointer;display:inline-flex;align-items:center;gap:6px}
  .dm-bar button:hover{background:rgba(255,255,255,.14)}
  .dm-bar button.pri{background:#fff;color:#0b1240;border-color:#fff}
  .dm-bar .prog{flex:1;min-width:80px;height:4px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden}
  .dm-bar .prog i{display:block;height:100%;background:#38e3bf;transition:width .4s}
  body.dm-on .modal-bg{padding-bottom:170px} body.dm-on .modal{max-height:calc(100vh - 200px)}
  .dm-start{position:fixed;inset:0;z-index:120;background:rgba(11,18,64,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:16px}
  .dm-start .card{background:#fff;border-radius:16px;max-width:520px;width:100%;padding:32px;box-shadow:0 30px 70px -20px rgba(0,0,0,.5)}
  .dm-start h1{font-size:1.5rem;margin:0 0 8px} .dm-start p{color:var(--ink-soft);margin:0 0 20px;font-size:14px;line-height:1.55}
  .dm-start ol{margin:0 0 22px;padding-left:20px;color:var(--ink-soft);font-size:13.5px;line-height:1.7}
  .dm-start .row{display:flex;gap:8px;flex-wrap:wrap}
  @media (max-width:760px){.dm-bar{bottom:70px;padding:10px 12px}.dm-bar .x2{font-size:14px;min-height:0}.dm-banner{white-space:nowrap;font-size:11px}.dm-banner .lg{display:none} body.dm-on .modal-bg{padding-bottom:290px} body.dm-on .modal{max-height:calc(100vh - 310px)}}`;
  document.head.appendChild(css);

  window.FLOW_DEMO_API = { resetDemo, setPersona, get DB() { return DB; } };

  (async () => {
    FX.per = { preset: '30d', start: null, end: null, gran: 'dia' }; FX.mode = 'jornada';
    setPersona('camila');
    await startApp();
    setPersona('camila');
    go('hoje');
    for (let i = 0; i < 100 && !window.DemoTour; i++) await new Promise((r) => setTimeout(r, 50));
    const ban = document.createElement('div');
    ban.className = 'dm-banner';
    ban.innerHTML = 'Modo demonstração<span class="lg"> · dados fictícios, nada é salvo</span> <a id="dm-again">Ver o tour</a>';
    document.body.appendChild(ban);
    $('#dm-again').onclick = () => window.DemoTour && window.DemoTour.open();
    window.DemoTour && window.DemoTour.open();
  })();
})();
