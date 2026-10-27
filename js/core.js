/* CallMed Flow — núcleo: config, constantes, utilitários, SLA, acesso, carga de dados, notificações */
'use strict';

const sb = supabase.createClient(window.FLOW_CONFIG.url, window.FLOW_CONFIG.key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// ---------- ícones de linha (traço herda a cor do texto) ----------
const ICONS = {
  fluxo: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  hoje: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
  rqe: '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8M16 17H8M10 9H8"/>',
  history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  idea: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6M10 22h4"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  edit: '<path d="M21.17 6.81a1 1 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/>',
  trash: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/>',
  clip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  doc: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4M12 17h.01"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  note: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  kanban: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
  route: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  hosp: '<path d="M12 6v4M14 14h-4M14 18h-4M14 8h-4"/><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/><path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/>',
};
/** Ícone de linha em SVG (herda a cor do texto). */
function ic(name, size) {
  const s = size || 16;
  return `<svg class="ic" aria-hidden="true" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}
document.querySelectorAll('[data-ic]').forEach((el) => { el.outerHTML = ic(el.dataset.ic, +el.dataset.size || 16); });

// ---------- constantes do domínio (copiadas do Flow original) ----------
const SETORES = ['UTI', 'ANESTESIA', 'ENFERMARIA', 'AMBULATÓRIO', 'PREVENT', 'PRONTO ATENDIMENTO', 'SADT', 'EMERGÊNCIA', 'ORTOPEDIA'];
const STATUS_ESP = ['FORMADO', 'FORMADO C/ RQE', 'R1', 'R2', 'R3'];
const DISC = ['ADERENTE', 'NÃO APLICAVEL', 'REPROVADO', 'AGUARDANDO RETORNO'];
const DISC_LABEL = { 'ADERENTE': 'Aderente', 'NÃO APLICAVEL': 'Não Aplicável', 'REPROVADO': 'Reprovado', 'AGUARDANDO RETORNO': 'Ag. Retorno' };
const DISC_CLASS = { 'ADERENTE': 'g', 'REPROVADO': 'r', 'AGUARDANDO RETORNO': 'a', 'NÃO APLICAVEL': '' };
const PRIORITIES = { rotina: 'Rotina', urgente: 'Urgente' };
/** Urgência vale por alguns dias; depois volta a rotina sozinha. */
const URGENTE_DIAS = 7;
function urgenteAte() { const d = new Date(); d.setDate(d.getDate() + URGENTE_DIAS); return ymd(d); }
/** Nomes antigos de etapa (histórico do Lovable / antes da simplificação) → etapa atual. */
const STAGE_ALIASES = {
  'Aguardando Contato': 'aguardando_contato', 'Aguardando Retorno Médico': 'aguardando_medico',
  'Enviar Documentos Jurídico': 'aguardando_juridico', 'Aguardando Jurídico': 'aguardando_juridico', 'R3': 'aguardando_medico', 'Aguardando formação (R3)': 'aguardando_medico',
  'Documentação Pendente': 'documentacao_pendente', 'Em espera': 'aguardando_medico', 'Documentação Recebida - Enviar Email': 'aguardando_hospital',
  'Aguardando Retorno Hospital': 'aguardando_hospital',
};
const SETOR_USUARIO = { cadastro: 'Cadastro', escalas: 'Escalas', juridico: 'Jurídico', marketing: 'Marketing', diretoria: 'Diretoria' };
/** Parecer jurídico do cadastro — só quem é do setor Jurídico registra (o banco também bloqueia). */
const PARECER_JUR = { aprovado: ['Aprovado', 'ok'], aprovado_restricao: ['Aprovado com restrição', 'warn'], nao_aprovado: ['Não aprovado', 'bad'] };
function isJuridico() { return S.profile?.setor === 'juridico'; }
const REQUIRED_DOCUMENTS = [
  'Antecedente Criminal', 'ATLS/ACLS', 'Carta de Recomendação / Declaração de Experiência', 'Carteira de CRM - Frente e verso',
  'Carteira de vacinação', 'Carteira de vacinação COVID', 'Certidão de quitação do CREMESP', 'Certidão ético profissional do CREMESP',
  'CNH/RG', 'Comprovante de endereço', 'Currículo', 'Diploma Frente e verso', 'Foto', 'Membro ativo do SBA', 'Outros certificados',
  'Outros Documentos', 'Procuração', 'Regimento de direitos e deveres dos prestadores', 'RQE',
  'Título de especialista ou residência médica', 'Fichas Hospitalares', 'Contratos',
];
const RQE_STAGES = [
  { id: 'solicitado', label: 'Solicitado', desc: 'Solicitação recebida', color: 'hsl(270, 60%, 55%)', sla: 24 },
  { id: 'documentacao', label: 'Documentação', desc: 'Reunir certificados e documentos', color: 'hsl(25, 85%, 55%)', sla: 48 },
  { id: 'requerimento', label: 'Requerimento', desc: 'Preencher requerimento CREMESP', color: 'hsl(40, 90%, 55%)', sla: 24 },
  { id: 'protocolo', label: 'Protocolo CREMESP', desc: 'Protocolar presencialmente', color: 'hsl(210, 80%, 45%)', sla: 48 },
  { id: 'em_analise', label: 'Em Análise', desc: 'Aguardando análise (~30-60 dias)', color: 'hsl(190, 70%, 45%)', sla: 0 },
  { id: 'aprovado', label: 'Aprovado', desc: 'RQE concedido', color: 'hsl(152, 60%, 45%)', sla: 0 },
  { id: 'reprovado', label: 'Reprovado', desc: 'Solicitação negada', color: 'hsl(0, 72%, 55%)', sla: 0 },
];
const RQE_DOCUMENTS = [
  'Requerimento de Serviços Diversos (preenchido)',
  'Certificado de Residência Médica (CNRM/MEC) - frente e verso',
  'Título de Especialista (AMB) - frente e verso',
  'Carteira Profissional Médica (CPM/e-CPM)',
  'Cópia autenticada do certificado (se RQE de outro CRM)',
];
const TEMPLATES = {
  aguardando_contato: 'Olá, {nome}! Somos da CallMed Saúde. Estamos entrando em contato referente ao seu cadastro no hospital {hospital}. Por favor, retorne o quanto antes para darmos andamento ao processo.',
  aguardando_medico: 'Olá, Dr(a). {nome}! Precisamos do seu retorno para dar continuidade ao seu cadastro no {hospital}. Poderia nos retornar o mais breve possível?',
  aguardando_juridico: 'Olá! Informamos que o cadastro do(a) Dr(a). {nome} no {hospital} está aguardando análise jurídica. Favor verificar a pendência.',
  enviar_documentos_juridico: 'Olá, Dr(a). {nome}! Para dar continuidade ao cadastro no {hospital}, precisamos que envie os documentos solicitados para análise jurídica. Aguardamos seu retorno.',
  r3: 'Olá, Dr(a). {nome}! Identificamos que seu cadastro no {hospital} requer documentação de R3. Por favor, envie os comprovantes solicitados para darmos sequência ao processo.',
  documentacao_pendente: 'Olá, Dr(a). {nome}! Seu cadastro no {hospital} está com documentação pendente. Por favor, envie os documentos necessários o quanto antes para não atrasar o processo.',
  documentacao_recebida: 'Olá! Recebemos toda a documentação do(a) Dr(a). {nome}. Estamos enviando o cadastro completo ao {hospital} por e-mail para análise.',
  aguardando_hospital: 'Olá! Gostaríamos de verificar o status do cadastro do(a) Dr(a). {nome} no {hospital}. Há alguma atualização sobre a aprovação?',
  aprovado: 'Olá, Dr(a). {nome}! Seu cadastro no {hospital} foi aprovado com sucesso! Parabéns!',
  reprovado: 'Olá, Dr(a). {nome}! Infelizmente seu cadastro no {hospital} não foi aprovado. Entre em contato conosco para mais informações.',
  _todos: 'Olá, {nome}! Estamos acompanhando o andamento do seu cadastro no {hospital}. Por favor, entre em contato conosco para atualizações.',
};
const FINAL_STAGES = ['aprovado', 'reprovado'];

// ---------- estado global ----------
const S = {
  user: null, profile: null, isAdmin: false,
  stages: [], hospitals: [], doctors: [], docProgress: {}, profiles: {}, roles: {},
  notifs: [], channel: null, loadedAt: null,
};

// ---------- utilitários ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const pad = (n) => String(n).padStart(2, '0');
function fmtDate(v, withTime = false) {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d)) return '—';
  const s = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
  return withTime ? `${s} ${pad(d.getHours())}:${pad(d.getMinutes())}` : s;
}
function fmtFull(v) {
  const d = new Date(v);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} às ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function timeAgo(v) {
  const s = Math.floor((Date.now() - new Date(v)) / 1000);
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  return `há ${Math.floor(s / 86400)} d`;
}
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
function digits(s) { return String(s || '').replace(/\D/g, ''); }
function uniq(a) { return Array.from(new Set(a)); }

function toast(msg, kind = '', title = '') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = (title ? `<b>${esc(title)}</b>` : '') + esc(msg);
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), title ? 8000 : 4000);
}

/** Abre um modal. `html` é o conteúdo interno do .modal. Retorna {el, close}. */
function openModal(html, { size = '', onClose } = {}) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  document.addEventListener('keydown', onKey);
  $('#modal-root').appendChild(bg);
  $$('[data-close]', bg).forEach((b) => b.addEventListener('click', close));
  return { el: bg, close };
}

function confirmDlg(title, text, { okText = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let answered = false;
    const m = openModal(`
      <div class="modal-head"><h2>${esc(title)}</h2><button class="x" data-close>✕</button></div>
      <div class="modal-body"><p style="margin:0">${esc(text)}</p></div>
      <div class="modal-foot"><button class="btn btn-line" data-close>Cancelar</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="cf-ok">${esc(okText)}</button></div>`,
    { size: 'sm', onClose: () => { if (!answered) resolve(false); } });
    $('#cf-ok', m.el).onclick = () => { answered = true; m.close(); resolve(true); };
  });
}

/** Busca todas as linhas (o PostgREST corta em 1000 por página). */
async function fetchAll(table, select = '*', { order = 'created_at', asc = false, filter } = {}) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select).order(order, { ascending: asc }).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

function waLink(phone, text) {
  let d = digits(phone);
  if (!d.startsWith('55')) d = '55' + d;
  return `https://api.whatsapp.com/send?phone=${d}&text=${encodeURIComponent(text)}`;
}
function fillTemplate(t, d) {
  return t.replaceAll('{nome}', d.name || '').replaceAll('{hospital}', d.hospital || '')
    .replaceAll('{especialidade}', (d.setores || []).join(', ')).replaceAll('{crm}', d.crm || '');
}

/** Remove pontuação nas pontas, colapsa espaços e capitaliza só palavras 100% minúsculas (regra do Flow original). */
function sanitizeName(s) {
  return String(s || '').replace(/^[\s\p{P}\p{S}\p{M}]+|[\s\p{P}\p{S}\p{M}]+$/gu, '').replace(/\s+/g, ' ')
    .split(' ').map((w) => (w && w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
}

function actorName() { return S.profile?.display_name || S.user?.email || 'Usuário'; }
function stageById(id) { return S.stages.find((s) => s.id === id); }
function stageLabel(id) { return stageById(id)?.label || id; }

// ---------- SLA ----------
/** Horas "úteis": tempo corrido excluindo sábados e domingos inteiros (dia útil conta 24h). */
function businessHours(start, end = new Date()) {
  let t = new Date(start).getTime();
  const stop = end.getTime();
  let ms = 0;
  while (t < stop) {
    const d = new Date(t);
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const sliceEnd = Math.min(next, stop);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) ms += sliceEnd - t;
    t = sliceEnd;
  }
  return ms / 3.6e6;
}
function doctorSla(d) {
  let sla, elapsed;
  if (d.priority === 'hospital_novo') {
    sla = 3;
    elapsed = (Date.now() - new Date(d.stage_entered_at)) / 3.6e6;
  } else {
    sla = stageById(d.stage)?.sla_hours ?? d.sla_hours ?? 24;
    elapsed = businessHours(d.stage_entered_at);
  }
  if (sla >= 9999) return { sla, elapsed, remaining: Infinity, status: 'none' };
  const remaining = sla - elapsed;
  const status = remaining <= 0 ? 'urgent' : remaining <= sla * 0.2 ? 'warning' : 'ok';
  return { sla, elapsed, remaining, status };
}
function fmtRemaining(r) {
  if (!isFinite(r)) return 'sem prazo';
  if (r <= 0) return 'Vencido';
  if (r < 1) return `${Math.round(r * 60)}min`;
  return `${Math.round(r)}h`;
}
function rqeSla(r) {
  const st = RQE_STAGES.find((s) => s.id === r.stage);
  if (!st || !st.sla) return { status: 'none', days: Math.floor((Date.now() - new Date(r.stage_entered_at)) / 864e5) };
  const elapsed = businessHours(r.stage_entered_at);
  const remaining = st.sla - elapsed;
  return { sla: st.sla, elapsed, remaining, status: remaining <= 0 ? 'urgent' : remaining <= st.sla * 0.2 ? 'warning' : 'ok' };
}

// ---------- acesso ----------
function showOnly(id) {
  ['login-screen', 'pass-screen', 'noaccess-screen'].forEach((s) => { $('#' + s).hidden = s !== id; });
  $('#app').classList.toggle('active', id === 'app');
}

let passMode = 'forced'; // 'forced' (troca obrigatória) | 'recovery' (link de e-mail)

/** Arquivos que precisam estar carregados antes de abrir o sistema (um por arquivo, com uma função dele). */
const ARQUIVOS_FLOW = [['hoje.js', 'nextCounts'], ['fluxo.js', 'moveDoctor'], ['doctor.js', 'openDoctor'], ['rqe.js', 'renderRqe'], ['reports.js', 'exportHistorico'], ['sugestoes.js', 'renderSugestoes'], ['admin.js', 'renderAdmin']];
/** Se a internet falhou ao baixar algum arquivo, recarrega uma vez sozinho; se faltar de novo, avisa em vez de abrir telas vazias. */
function arquivosOk() {
  const faltam = ARQUIVOS_FLOW.filter(([, fn]) => typeof window[fn] !== 'function').map(([f]) => f);
  if (!faltam.length) return true;
  let ultima = 0;
  try { ultima = +sessionStorage.getItem('flow:recarga') || 0; } catch (_) { /* sem armazenamento */ }
  if (Date.now() - ultima > 60000) {
    try { sessionStorage.setItem('flow:recarga', String(Date.now())); sessionStorage.setItem('flow:recarga-faltou', faltam.join(', ')); } catch (_) { /* sem armazenamento */ }
    location.reload();
    return false;
  }
  try { sessionStorage.setItem('flow:recarga-faltou', faltam.join(', ')); } catch (_) { /* sem armazenamento */ }
  const f = document.createElement('div');
  f.setAttribute('role', 'alert');
  f.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:400;background:#b42318;color:#fff;padding:12px 16px;font:600 14px system-ui,sans-serif;text-align:center';
  f.innerHTML = 'O Flow não carregou por completo (a internet falhou ao baixar uma parte do sistema). Confira a conexão e <button type="button" style="margin-left:8px;border:0;border-radius:999px;padding:5px 14px;font-weight:700;cursor:pointer">Recarregar</button>';
  f.querySelector('button').onclick = () => location.reload();
  document.body.appendChild(f);
  return false;
}

async function boot() {
  if (!arquivosOk()) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showOnly('login-screen');
  S.user = session.user;
  if (passMode === 'recovery') return showPass('recovery');
  const { data: prof } = await sb.from('flow_profiles').select('*').eq('user_id', S.user.id).maybeSingle();
  if (!prof || !prof.ativo) {
    $('#noaccess-email').textContent = S.user.email;
    return showOnly('noaccess-screen');
  }
  S.profile = prof;
  if (prof.must_change_password) return showPass('forced');
  await startApp();
}

function showPass(mode) {
  passMode = mode;
  $('#pass-sub').textContent = mode === 'recovery'
    ? 'Digite sua nova senha de acesso.'
    : 'Por segurança, defina uma nova senha para continuar.';
  $('#pass-err').textContent = '';
  showOnly('pass-screen');
}

sb.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') { passMode = 'recovery'; showPass('recovery'); }
  if (event === 'SIGNED_OUT') { S.user = null; showOnly('login-screen'); }
});

$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#btn-login');
  btn.disabled = true; btn.textContent = 'Aguarde...';
  $('#login-err').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('#login-email').value.trim(), password: $('#login-pass').value });
  btn.disabled = false; btn.textContent = 'Entrar';
  if (error) { $('#login-err').textContent = error.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : error.message; return; }
  passMode = 'forced';
  boot();
});

$('#btn-forgot').addEventListener('click', async () => {
  const email = $('#login-email').value.trim();
  if (!email) { $('#login-err').textContent = 'Digite seu e-mail acima e clique de novo em "Esqueci minha senha".'; return; }
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  $('#login-err').textContent = !error ? ''
    : error.status === 429 || /rate limit/i.test(error.message)
      ? 'Limite de e-mails de recuperação atingido. Aguarde cerca de 1 hora e tente de novo (clique uma vez só), ou peça a um administrador uma senha provisória.'
      : error.message;
  if (!error) toast('Enviamos um link de recuperação para seu e-mail.', 'ok');
});

$('#pass-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p1 = $('#pass-1').value, p2 = $('#pass-2').value;
  if (p1.length < 8) { $('#pass-err').textContent = 'A senha deve ter pelo menos 8 caracteres.'; return; }
  if (p1 !== p2) { $('#pass-err').textContent = 'As senhas não coincidem.'; return; }
  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) { $('#pass-err').textContent = error.message; return; }
  await sb.rpc('flow_password_changed');
  toast('Senha definida com sucesso!', 'ok');
  history.replaceState(null, '', location.pathname);
  passMode = 'forced';
  boot();
});

$('#btn-noaccess-out').onclick = () => sb.auth.signOut();
$('#btn-logout').onclick = async () => { await sb.auth.signOut(); location.reload(); };

// ---------- carga de dados ----------
async function loadCore() {
  const [stages, hospitals, doctors, docs, profiles, roles] = await Promise.all([
    fetchAll('flow_stages', '*', { order: 'position', asc: true }),
    fetchAll('flow_hospitals', '*', { order: 'nome', asc: true }),
    fetchAll('flow_doctors'),
    fetchAll('flow_doctor_documents', 'doctor_id,status', { order: 'doctor_id' }),
    fetchAll('flow_profiles', '*', { order: 'display_name', asc: true }),
    fetchAll('flow_user_roles', '*', { order: 'user_id' }),
  ]);
  S.stages = stages;
  S.hospitals = hospitals;
  const hojeYmd = ymdToday();
  doctors.forEach((d) => { if (d.priority === 'urgente' && d.urgente_ate && d.urgente_ate < hojeYmd) d.priority = 'rotina'; });
  S.doctors = doctors;
  S.profiles = Object.fromEntries(profiles.map((p) => [p.user_id, p]));
  S.roles = {};
  roles.forEach((r) => { (S.roles[r.user_id] ||= []).push(r.role); });
  S.isAdmin = (S.roles[S.user.id] || []).includes('admin');
  const received = {};
  docs.forEach((d) => { if (d.status === 'enviado' || d.status === 'aprovado') received[d.doctor_id] = (received[d.doctor_id] || 0) + 1; });
  S.docProgress = {};
  doctors.forEach((d) => { S.docProgress[d.id] = Math.round(((received[d.id] || 0) / REQUIRED_DOCUMENTS.length) * 100); });
  S.loadedAt = Date.now();
}

function hospitalOptions(selected = '', { includeInactive = false } = {}) {
  return S.hospitals.filter((h) => h.ativo || includeInactive || h.nome === selected)
    .map((h) => `<option ${h.nome === selected ? 'selected' : ''}>${esc(h.nome)}</option>`).join('');
}

// ---------- notificações ----------
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.stop(ctx.currentTime + 0.36);
  } catch (_) { /* sem áudio */ }
}
async function loadNotifs() {
  const { data } = await sb.from('flow_notifications').select('*').eq('user_id', S.user.id).order('created_at', { ascending: false }).limit(50);
  S.notifs = data || [];
  renderBell();
}
function renderBell() {
  const unread = S.notifs.filter((n) => !n.read).length;
  const b = $('#bell-count');
  b.hidden = !unread;
  b.textContent = unread > 99 ? '99+' : unread;
  const pop = $('#notif-pop');
  if (pop.hidden) return;
  pop.innerHTML = `<div class="ph">Notificações ${unread ? `<button class="btn-ghost" id="n-all">Marcar todas como lidas</button>` : ''}</div>` +
    (S.notifs.length ? S.notifs.map((n) => `
      <div class="notif ${n.read ? '' : 'unread'}" data-id="${n.id}" data-doc="${n.doctor_id || ''}">
        <div class="a">${esc(n.created_by_name || 'Usuário')} <span class="tm">· ${timeAgo(n.created_at)}</span></div>
        <div>${esc(n.message)}</div></div>`).join('') : '<div class="empty">Nenhuma notificação</div>');
  const all = $('#n-all', pop);
  if (all) all.onclick = async (e) => {
    e.stopPropagation();
    const ids = S.notifs.filter((n) => !n.read).map((n) => n.id);
    await sb.from('flow_notifications').update({ read: true }).in('id', ids);
    S.notifs.forEach((n) => { n.read = true; });
    renderBell();
  };
  $$('.notif', pop).forEach((el) => el.onclick = async () => {
    const n = S.notifs.find((x) => x.id === el.dataset.id);
    if (n && !n.read) { n.read = true; sb.from('flow_notifications').update({ read: true }).eq('id', n.id).then(); }
    pop.hidden = true; renderBell();
    const d = S.doctors.find((x) => x.id === el.dataset.doc);
    if (d) openDoctor(d);
    else if (n && S.isAdmin && /Admin → Hospitais/.test(n.message)) { adminTab = 'hospitais'; go('usuarios'); }
  });
}
$('#btn-bell').onclick = (e) => {
  e.stopPropagation();
  const pop = $('#notif-pop');
  pop.hidden = !pop.hidden;
  renderBell();
};
document.addEventListener('click', (e) => { if (!e.target.closest('#notif-pop')) $('#notif-pop').hidden = true; });

function subscribeNotifs() {
  if (S.channel) sb.removeChannel(S.channel);
  S.channel = sb.channel('flow-notif-' + S.user.id)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'flow_notifications', filter: `user_id=eq.${S.user.id}` }, (p) => {
      S.notifs.unshift(p.new);
      S.notifs = S.notifs.slice(0, 50);
      renderBell();
      beep();
      toast(p.new.message, '', p.new.created_by_name || 'Usuário');
    }).subscribe();
}

// ---------- navegação ----------
const VIEWS = {};
const VIEW_TITLES = { hoje: 'Hoje', fluxo: 'Fluxo', medico: 'Médico', indicadores: 'Indicadores', sugestoes: 'Sugestões', rqe: 'RQE', relatorios: 'Relatórios', auditoria: 'Auditoria', usuarios: 'Administração' };
const VIEW_SUBS = { hoje: 'O que fazer agora', fluxo: 'Credenciamento de médicos', indicadores: 'Funil, SLA e gargalos', rqe: 'Registro de especialista no CREMESP', relatorios: 'Conversão, tempo e produtividade', auditoria: 'Quem fez o quê, e quando', sugestoes: 'Ideias e problemas do sistema', usuarios: 'Usuários e hospitais' };
let currentView = 'fluxo';
function go(view) {
  currentView = view;
  const railOf = { medico: 'fluxo', auditoria: 'usuarios', rqe: 'usuarios' };
  $$('#rail .nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === (railOf[view] || view)));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  $('#hdr-title').textContent = VIEW_TITLES[view];
  $('#hdr-sub').textContent = VIEW_SUBS[view] || '';
  try { localStorage.setItem('flow:view2', view); } catch (_) { /* ignora */ }
  VIEWS[view] && VIEWS[view]();
  document.dispatchEvent(new CustomEvent('flow-tela', { detail: { view } }));
}
$$('#rail .nav-btn').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
document.addEventListener('click', (e) => { const b = e.target.closest('[data-goview]'); if (b) go(b.dataset.goview); });

async function reloadAll(silent) {
  const btn = $('#btn-reload');
  btn.disabled = true;
  try {
    await loadCore();
    VIEWS[currentView] && VIEWS[currentView]();
    if (!silent) toast('Dados atualizados!', 'ok');
  } catch (err) { toast('Erro ao carregar: ' + err.message, 'err'); }
  btn.disabled = false;
}
$('#btn-reload').onclick = () => reloadAll(false);

async function startApp() {
  showOnly('app');
  { const nm = S.profile.display_name || S.user.email || '';
    const pt = nm.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
    const chip = $('#who-chip');
    chip.textContent = ((pt[0] || '?')[0] + (pt.length > 1 ? pt[pt.length - 1][0] : '')).toUpperCase();
    chip.title = nm + (S.profile.setor ? ' · ' + (SETOR_USUARIO[S.profile.setor] || S.profile.setor) : ''); }
  $('#view-fluxo').innerHTML = '<div class="op-more">Carregando…</div>'; delete $('#view-fluxo').dataset.built;
  try { await loadCore(); } catch (err) { toast('Erro ao carregar dados: ' + err.message, 'err'); return; }
  $('#rail-usuarios').hidden = !S.isAdmin;
  $('#who-email').textContent = S.user.email || '';
  $('#btn-backup').hidden = !S.isAdmin;
  loadNotifs();
  subscribeNotifs();
  let v = 'hoje';
  try { v = localStorage.getItem('flow:view2') || 'hoje'; } catch (_) { /* ignora */ }
  if ((['usuarios', 'auditoria', 'rqe'].includes(v) && !S.isAdmin) || v === 'medico') v = 'hoje';
  go(VIEWS[v] ? v : 'hoje');
  if (typeof Novidades !== 'undefined') Novidades.checar();
  if (typeof sgRetornoCarrega === 'function') { sgRetornoCarrega(); if (!S.sgTimer) S.sgTimer = setInterval(sgRetornoCarrega, 5 * 60000); } // respostas às sugestões de quem está logado
  // atualização automática a cada 5 min com a aba visível
  setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('.modal-bg')) reloadAll(true); }, 5 * 60 * 1000);
}

// ---------- backup (admin): todos os dados do Flow num Excel ----------
$('#btn-backup').onclick = async () => {
  const btn = $('#btn-backup');
  btn.disabled = true; btn.textContent = 'Gerando...';
  try {
    const [acts, docs, sugs] = await Promise.all([
      fetchAll('flow_activities', '*', { order: 'created_at', asc: true }),
      fetchAll('flow_doctor_documents', '*', { order: 'doctor_id' }),
      fetchAll('flow_sugestoes', '*'),
    ]);
    const X = await loadXlsx();
    const wb = X.utils.book_new();
    const byId = Object.fromEntries(S.doctors.map((d) => [d.id, d]));
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(S.doctors.map((d) => ({ ...d, setores: (d.setores || []).join(', '), etapa: stageLabel(d.stage) }))), 'Médicos');
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(acts.map((a) => ({ data: a.created_at, medico: byId[a.doctor_id]?.name || '', hospital: byId[a.doctor_id]?.hospital || '', tipo: a.type, descricao: a.description, por: a.created_by_name }))), 'Histórico');
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(docs.map((x) => ({ medico: byId[x.doctor_id]?.name || '', hospital: byId[x.doctor_id]?.hospital || '', documento: x.document_name, status: x.status, atualizado: x.updated_at }))), 'Documentos');
    X.utils.book_append_sheet(wb, X.utils.json_to_sheet(sugs.map((x) => ({ data: x.created_at, autor: x.autor, tipo: x.tipo, tela: x.tela, status: x.status, texto: x.texto, resposta: x.resposta }))), 'Sugestões');
    X.writeFile(wb, `backup_callmed_flow_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast('Backup baixado', 'ok');
  } catch (e) { toast('Erro no backup: ' + e.message, 'err'); }
  btn.disabled = false; btn.innerHTML = ic('download') + ' Backup';
};

// ---------- exportação ----------
function downloadCsv(filename, header, rows) {
  const cell = (v) => String(v ?? '').replaceAll(';', ',').replace(/\r?\n/g, ' ');
  const csv = '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
let xlsxLib = null;
async function loadXlsx() {
  if (xlsxLib) return xlsxLib;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  xlsxLib = window.XLSX;
  return xlsxLib;
}
