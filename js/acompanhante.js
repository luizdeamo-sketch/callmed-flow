/* CallMed Flow — Acompanhante: aviso de nova versão · registro de uso · balão 💬 (mesmas peças do piloto da LCA e do CRM Aliança).
   O sistema anota telas abertas e rótulos de botões clicados. Nunca anota o que a pessoa digita nos campos. */
'use strict';

/** Ditado por voz (pt-BR) + gravação do áudio original. Usado pelo balão e pela aba Sugestões. */
const Ditado = {
  SR: window.SpeechRecognition || window.webkitSpeechRecognition,
  ativo: null,
  /** Começa a ditar no campo. onAudio(blob) é chamado quando a gravação termina. Retorna false se o navegador não dita. */
  async iniciar(textarea, { onAudio, onTexto } = {}) {
    if (!this.SR) { toast('Este navegador não faz ditado por voz. Use o Chrome ou o Edge.', 'err'); return false; }
    const st = { rec: null, media: null, chunks: [] };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      st.media = new MediaRecorder(stream);
      st.media.ondataavailable = (e) => { if (e.data.size) st.chunks.push(e.data); };
      st.media.onstop = () => { stream.getTracks().forEach((t) => t.stop()); onAudio && onAudio(new Blob(st.chunks, { type: st.media.mimeType || 'audio/webm' })); };
      st.media.start();
    } catch (_) { st.media = null; }
    const base = textarea.value ? textarea.value.replace(/\s+$/, '') + '\n' : '';
    let fin = '';
    const rec = new this.SR();
    rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true;
    rec.onresult = (ev) => {
      let parcial = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const t = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) fin += t + ' '; else parcial += t;
      }
      textarea.value = base + fin + parcial;
      onTexto && onTexto();
    };
    rec.onerror = (ev) => { if (ev.error === 'not-allowed') toast('Permita o uso do microfone no navegador.', 'err'); };
    rec.onend = () => { if (this.ativo === st) { try { rec.start(); } catch (_) { /* reinício */ } } };
    st.rec = rec; this.ativo = st;
    rec.start();
    return true;
  },
  parar() {
    const st = this.ativo; if (!st) return;
    this.ativo = null;
    try { st.rec.stop(); } catch (_) { /* já parado */ }
    try { if (st.media && st.media.state !== 'inactive') st.media.stop(); } catch (_) { /* já parado */ }
  },
};

(function () {
  const A = window.ACOMP = window.ACOMP || {};
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* sem armazenamento */ } };
  const email = () => String((S.user && S.user.email) || '').toLowerCase();
  const DEMO = !!window.FLOW_DEMO;
  // quem testa o sistema não recebe os balões automáticos (o botão 💬 continua)
  const SEM_BALAO = ['luiz.amo@callmedsaude.com.br', 'luiz.amo@capacitycase.com.br', 'luizdeamo@gmail.com'];

  /* ---------- PEÇA 1 · aviso de nova versão ---------- */
  // O publicar.sh carimba ?v=AAAAMMDDhhmmss nos <script>. Sem carimbo (arquivo aberto direto) não há o que comparar.
  const LOCAL = location.protocol === 'file:';
  const versaoDe = (txt) => { const m = String(txt).match(/js\/core\.js\?v=(\d{10,})/); return m ? m[1] : ''; };
  const VERSAO = versaoDe([...document.scripts].map((s) => s.getAttribute('src') || '').join(' '));
  async function verificarVersao() {
    if (LOCAL || DEMO || !VERSAO || A.novaVersao) return;
    try {
      const r = await fetch(location.pathname + '?v=' + Date.now(), { cache: 'no-store' });
      const nova = versaoDe(await r.text());
      if (nova && nova !== VERSAO) mostrarFaixa();
    } catch (_) { /* sem rede: tenta de novo depois */ }
  }
  function mostrarFaixa() {
    if (document.getElementById('ac-versao')) return;
    A.novaVersao = true;
    const f = document.createElement('div');
    f.id = 'ac-versao'; f.setAttribute('role', 'status');
    f.innerHTML = '<span>Saiu uma versão nova do Flow, com melhorias. Salve o que estiver fazendo e clique em Atualizar para ver o que mudou.</span><button type="button" id="ac-versao-btn">Atualizar</button>';
    document.body.appendChild(f);
    document.getElementById('ac-versao-btn').addEventListener('click', () => location.reload()); // nunca recarrega sozinho
  }
  A.verificarVersao = verificarVersao;
  A._testeFaixa = mostrarFaixa;
  setInterval(verificarVersao, 120000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verificarVersao(); });

  /* ---------- PEÇA 2 · registro de uso ---------- */
  const SESSAO = (self.crypto && crypto.randomUUID) ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14);
  const FILA = []; const ultimos = [];
  const NAV_NOME = { hoje: 'Hoje', fluxo: 'Fluxo', medico: 'Ficha do médico', indicadores: 'Indicadores', relatorios: 'Relatórios', auditoria: 'Auditoria', sugestoes: 'Sugestões', usuarios: 'Admin', rqe: 'RQE', login: 'Entrada' };
  const SUB_NOME = { jornada: 'Jornada', kanban: 'Kanban', resumo: 'Resumo', documentos: 'Documentos', historico: 'Histórico', geral: 'Visão geral', hosp: 'Hospitais', form: 'Formação', pipe: 'SLA pipeline', rqe: 'SLA RQE', prod: 'Produtividade', perdas: 'Motivos de perda', usuarios: 'Usuários', hospitais: 'Hospitais', migracao: 'Migração' };
  function rotaAtual() {
    const app = document.getElementById('app');
    if (!app || !app.classList.contains('active')) return '/login';
    const v = typeof currentView !== 'undefined' ? currentView : 'hoje';
    let sub = '';
    try {
      if (v === 'fluxo') sub = '/' + FX.mode;
      else if (v === 'medico') sub = '/' + PV.tab;
      else if (v === 'relatorios') sub = '/' + RF.tab;
      else if (v === 'usuarios') sub = '/' + adminTab;
    } catch (_) { /* tela sem abas */ }
    return ('/' + v + sub).replace(/\d+/g, ':n').split('?')[0];
  }
  const nomeTela = (r) => { const p = String(r || '').split('/').filter(Boolean); if (!p.length) return 'Tela'; const base = NAV_NOME[p[0]] || p[0]; return p[1] ? base + ' · ' + (SUB_NOME[p[1]] || p[1]) : base; };
  A.nomeTela = nomeTela;
  // tira e-mails, números e nomes próprios das mensagens do sistema antes de guardar
  const mascarar = (t) => String(t || '').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '…').replace(/\d[\d.\-/() ]{4,}\d/g, '…')
    .replace(/(^|\s)([A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}'.-]+(?:\s+(?:de|da|do|dos|das|e)?\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ][\p{L}'.-]+)+)/gu, '$1…');
  A.mascarar = mascarar;
  function uso(tipo, alvo, detalhe, rota) {
    if (!email()) return; // antes do login não grava nada
    const ev = { em: new Date().toISOString(), sessao: SESSAO, tipo, rota: rota || rotaAtual(), alvo: String(alvo || '').slice(0, 200) || null, detalhe: detalhe || null };
    ultimos.push({ em: ev.em, tipo, rota: ev.rota, alvo: ev.alvo }); if (ultimos.length > 20) ultimos.shift();
    if (DEMO) return; // modo demonstração: não grava uso
    FILA.push(ev); if (FILA.length > 500) FILA.shift();
  }
  A.uso = uso;
  let enviando = false;
  async function flush() {
    if (enviando || !FILA.length || !email() || DEMO) return;
    enviando = true;
    const lote = FILA.splice(0, FILA.length);
    try { const { error } = await sb.from('flow_uso_eventos').insert(lote); if (error) throw error; }
    catch (_) { FILA.unshift(...lote); if (FILA.length > 500) FILA.splice(0, FILA.length - 500); }
    enviando = false;
  }
  A.flush = flush;
  setInterval(flush, 15000);

  // telas: troca de tela (a partir da navegação do próprio Flow), tempo em cada uma e vai-e-volta
  let rotaCur = null, tsTela = Date.now(), tsEntrou = 0; // tsEntrou: quando a pessoa entrou no sistema (a troca automática de tela do login não é vai-e-volta)
  const hist = [];
  function checarTela() {
    const root = document.getElementById('ac-root'), dentro = !!(email() && document.getElementById('app').classList.contains('active'));
    if (root) root.hidden = !dentro; // o 💬 só aparece depois do login
    if (!email()) return;
    const r = rotaAtual(); if (r === rotaCur) return;
    const agora = Date.now(), ant = rotaCur, ms = agora - tsTela;
    if (!ant || ant === '/login') tsEntrou = agora;
    rotaCur = r; tsTela = agora;
    uso('tela', nomeTela(r), { anterior: ant, ms_na_anterior: ant ? ms : null }, r);
    hist.push({ rota: r, ts: agora }); if (hist.length > 4) hist.shift();
    if (hist.length >= 3) {
      const [a, b, c] = hist.slice(-3);
      const secao = (x) => x.split('/')[1];
      // A → B → A em menos de 30 s, B de outra seção (abrir a ficha e voltar para a lista não conta)
      if (c.rota === a.rota && b.rota !== a.rota && secao(b.rota) !== secao(a.rota) && secao(b.rota) !== 'medico' && c.ts - a.ts < 30000 && a.ts - tsEntrou > 15000) duvida('voltou');
    }
  }
  A.checarTela = checarTela;
  setInterval(checarTela, 700);
  document.addEventListener('click', () => setTimeout(checarTela, 60), true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { uso('saida', nomeTela(rotaCur || rotaAtual()), { ms_na_tela: Date.now() - tsTela }); flush(); }
    else tsTela = Date.now();
  });

  // cliques: só o rótulo do botão/aba/link. Nada que tenha nome de médico.
  const RE_REPETE = /^[+＋−\-‹›<>«»×✕◀▶]/;
  function rotulo(t) {
    if (t.closest('input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]),textarea,[contenteditable="true"],select')) return null;
    if (t.closest('.kcard')) return { texto: 'card do médico (Kanban)', el: 'card' };
    if (t.closest('.op-left') && t.closest('.op-row') && !t.closest('.op-head,.op-sumrow')) return { texto: 'linha do médico (Jornada)', el: 'linha' };
    if (t.closest('[data-openp],[data-other],[data-doc],[data-pd]')) return { texto: 'abrir ficha do médico', el: 'a' };
    if (t.closest('.notif')) return { texto: 'notificação', el: 'notif' };
    const el = t.closest('button,a,[role=button],[role=tab],.nav-btn,.pv-tab,.sg-chip,.op-kpi.clk,.op-sumcell.clk,.op-sumrow .op-left,summary,label,tr,td');
    if (!el) return null;
    if (el.matches('tr,td')) { const tab = el.closest('table'); const th = tab && tab.querySelector('th'); return { texto: 'linha: ' + (th ? th.textContent.trim().slice(0, 40) : 'tabela'), el: 'tr' }; }
    if (el.matches('.op-sumcell')) return { texto: 'número do resumo da Jornada', el: 'celula' };
    const tx = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return { texto: tx || (el.id ? '#' + el.id : el.tagName.toLowerCase()), el: el.tagName.toLowerCase() };
  }
  let cliques = [];
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof Element) || t.closest('#ac-root,#ac-versao,.dm-bar,.dm-start')) return;
    const r = rotulo(t); if (!r) return;
    uso('clique', r.texto, { elemento: r.el });
    if (t.closest('[data-repetir]') || RE_REPETE.test(r.texto)) return;
    const agora = Date.now();
    cliques.push({ t: agora, x: e.clientX, y: e.clientY, k: r.texto });
    cliques = cliques.filter((c) => agora - c.t <= 1000);
    const g = cliques.filter((c) => c.k === r.texto && Math.abs(c.x - e.clientX) <= 30 && Math.abs(c.y - e.clientY) <= 30);
    if (g.length >= 3) { uso('raiva', r.texto, { cliques: g.length }); cliques = []; duvida('travou'); }
  }, true);
  document.addEventListener('change', (e) => {
    const s = e.target;
    if (!(s instanceof HTMLSelectElement) || s.closest('#ac-root')) return;
    const nome = s.getAttribute('aria-label') || s.title || (s.options[0] ? s.options[0].textContent : '') || s.id || 'filtro';
    const op = s.options[s.selectedIndex] ? s.options[s.selectedIndex].textContent.trim() : '';
    uso('clique', mascarar(nome.trim().slice(0, 40) + ': ' + op.slice(0, 40)), { elemento: 'select' });
  }, true);

  // mensagens do sistema (toast) e erros de JavaScript
  const RE_ERRO = /^erro|n[aã]o (consegui|foi poss|aceit|encontr)|preench|informe|escolh|escrev|selecion|falt|inv[aá]lid|obrigat|permita|primeiro|antes de|digite|descreva|somente/i;
  let ultimoSalvo = 0;
  const _toast = window.toast;
  if (typeof _toast === 'function') {
    window.toast = function (msg, kind, title) {
      try {
        const m = String(msg || ''), erro = kind === 'err' || RE_ERRO.test(m);
        uso('aviso', mascarar(m), { erro });
        if (erro) duvida('recusa');
        else if (/salv|criad|registrad|atualizad|adicionad|replicad|cadastro/i.test(m)) ultimoSalvo = Date.now();
        else if (/apagad|exclu[ií]d|removid/i.test(m) && Date.now() - ultimoSalvo < 300000) duvida('desfez');
      } catch (_) { /* não atrapalha o aviso */ }
      return _toast.apply(this, arguments);
    };
  }
  window.addEventListener('error', (e) => { try { uso('erro', String(e.message || 'erro').slice(0, 200), { arquivo: String(e.filename || '').split('/').pop().split('?')[0], linha: e.lineno }); } catch (_) { /* nada */ } });
  window.addEventListener('unhandledrejection', (e) => { try { uso('erro', String((e.reason && e.reason.message) || e.reason || 'promessa recusada').slice(0, 200), { promessa: true }); } catch (_) { /* nada */ } });

  // sair: envia o que falta e sai só deste navegador (o padrão derrubava as outras abas)
  const btnSair = document.getElementById('btn-logout');
  if (btnSair) btnSair.onclick = async () => { await flush(); await sb.auth.signOut({ scope: 'local' }); location.reload(); };

  /* ---------- PEÇA 3 · acompanhante (balão 💬) ---------- */
  const PERGUNTAS = {
    travou: 'Parece que algo não respondeu como você esperava. O que você queria que acontecesse?',
    recusa: 'O sistema não aceitou. A mensagem ficou clara? Se não, conta o que você estava tentando fazer.',
    desfez: 'Vi que você apagou algo que tinha acabado de salvar. Ficou alguma dúvida nesta tela?',
    voltou: 'Procurando alguma coisa? Se não achou, me conta o que era que eu anoto.',
    experimento: 'É assim que o balão aparece. O que você tem achado do Flow até agora?',
  };
  const TIPO_PADRAO = { travou: 'problema', recusa: 'problema', desfez: 'duvida', voltou: 'duvida' };
  const TIPOS = [['melhoria', 'Ideia de melhoria'], ['problema', 'Algo não funciona'], ['duvida', 'Dúvida']];
  const RESPONSAVEL = 'Luiz';
  const ac = { motivo: null, pergunta: null, tipo: 'melhoria', print: null, audio: null, voz: false, timerBalao: null, ultimoAuto: 0, ultimaDuvida: 0, gen: 0 };
  const $id = (id) => document.getElementById(id);
  function montar() {
    if ($id('ac-root') || !document.body) return;
    const root = document.createElement('div'); root.id = 'ac-root';
    root.innerHTML = '<div id="ac-bubble" hidden></div><div id="ac-box" hidden></div><button type="button" id="ac-btn" title="Dar uma ideia, avisar de um problema ou tirar uma dúvida" aria-label="Falar com a equipe">💬</button>';
    document.body.appendChild(root);
    $id('ac-btn').addEventListener('click', () => abrirCaixa('botao', ''));
  }
  const ocupado = () => !!document.querySelector('.modal-bg') || !!Ditado.ativo || !$id('ac-box').hidden || !$id('ac-bubble').hidden;
  function fecharBalao(como) {
    const b = $id('ac-bubble'); clearTimeout(ac.timerBalao);
    if (!b.hidden) { b.hidden = true; uso('balao', ac.motivo, { evento: 'fechou', resposta: como }); }
  }
  function mostrarBalao(motivo, pergunta, forcar) {
    montar();
    if (!email() || !$id('app').classList.contains('active')) return false;
    if (!forcar && (SEM_BALAO.includes(email()) || ocupado())) return false;
    if (forcar && !$id('ac-bubble').hidden) fecharBalao('ignorou');
    ac.motivo = motivo; ac.pergunta = pergunta;
    const b = $id('ac-bubble');
    b.innerHTML = `<p>${esc(pergunta)}</p><div class="ac-acoes"><button type="button" data-ac="ok">👍 Tudo certo</button><button type="button" data-ac="falar">💬 Tenho algo a dizer</button><button type="button" data-ac="x" aria-label="Fechar">✕</button></div>`;
    b.hidden = false; uso('balao', motivo, { evento: 'abriu', pergunta });
    b.querySelector('[data-ac=ok]').onclick = () => fecharBalao('ok');
    b.querySelector('[data-ac=x]').onclick = () => fecharBalao('desistiu');
    b.querySelector('[data-ac=falar]').onclick = () => { b.hidden = true; clearTimeout(ac.timerBalao); abrirCaixa(motivo, pergunta, true); };
    ac.timerBalao = setTimeout(() => fecharBalao('ignorou'), 40000);
    return true;
  }
  A.mostrarBalao = mostrarBalao;
  // sinal de dúvida vindo do registro de uso: no máximo um a cada 15 min, 1,5 s depois (para a mensagem do sistema aparecer antes)
  function duvida(motivo) { window.dispatchEvent(new CustomEvent('flow-duvida', { detail: { motivo } })); }
  A.duvida = duvida;
  window.addEventListener('flow-duvida', (e) => {
    const motivo = e.detail && e.detail.motivo; if (!PERGUNTAS[motivo]) return;
    if (Date.now() - ac.ultimaDuvida < 900000) return;
    setTimeout(() => { if (Date.now() - ac.ultimaDuvida < 900000) return; if (mostrarBalao(motivo, PERGUNTAS[motivo])) ac.ultimaDuvida = Date.now(); }, 1500);
  });
  // primeira vez numa tela: depois de 25 s nela, uma vez por tela, no máximo um balão a cada 5 min
  setInterval(() => {
    if (!email() || SEM_BALAO.includes(email()) || !rotaCur || rotaCur === '/login') return;
    if (Date.now() - tsTela < 25000 || Date.now() - ac.ultimoAuto < 300000) return;
    const chave = 'ac_telas:' + email(), vistas = lsGet(chave, []);
    if (vistas.includes(rotaCur)) return;
    if (mostrarBalao('primeira', `Primeira vez em ${nomeTela(rotaCur)} no sistema novo. Está funcionando como você esperava?`)) { vistas.push(rotaCur); lsSet(chave, vistas); ac.ultimoAuto = Date.now(); }
  }, 1500);

  // print da área visível (html-to-image), com limite de 8 s: se demorar, segue sem print
  let libImg = null;
  async function carregarLib() {
    if (window.htmlToImage) return window.htmlToImage;
    if (!libImg) libImg = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/dist/html-to-image.js'; s.onload = () => res(window.htmlToImage); s.onerror = rej; document.head.appendChild(s); });
    return libImg;
  }
  async function tirarPrint() {
    const gen = ++ac.gen;
    const el = $id('ac-print'); if (el) el.innerHTML = '<span class="ac-mut">Tirando o print da tela…</span>';
    let blob = null;
    try {
      blob = await Promise.race([(async () => {
        const lib = await carregarLib();
        const w = window.innerWidth, h = window.innerHeight;
        const url = await lib.toJpeg(document.body, {
          quality: 0.75, skipFonts: true, backgroundColor: '#ffffff', width: w, height: h, canvasWidth: w, canvasHeight: h,
          pixelRatio: Math.min(1, 1100 / w),
          style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)` },
          filter: (n) => !(n.id === 'ac-root' || n.id === 'toasts' || n.id === 'ac-versao' || (n.classList && (n.classList.contains('dm-bar') || n.classList.contains('dm-banner') || n.classList.contains('dm-cursor') || n.classList.contains('dm-ring')))),
        });
        return (await fetch(url)).blob();
      })(), new Promise((_, rej) => setTimeout(() => rej(new Error('demorou')), 8000))]);
    } catch (_) { blob = null; }
    if (gen !== ac.gen) return; // a caixa foi fechada/reaberta nesse meio-tempo
    ac.print = blob; desenharPrint();
  }
  function desenharPrint() {
    const el = $id('ac-print'); if (!el) return;
    el.innerHTML = ac.print
      ? `<img alt="Print da tela" src="${URL.createObjectURL(ac.print)}"><div class="ac-linha"><button type="button" id="ac-tirar">Tirar o print</button><span class="ac-mut">O print vai junto para a equipe ver o que você viu.</span></div>`
      : '<span class="ac-mut">Sem print desta vez.</span> <button type="button" id="ac-reprint">Tentar de novo</button>';
    const t = $id('ac-tirar'); if (t) t.onclick = () => { ac.print = null; desenharPrint(); };
    const b = $id('ac-reprint'); if (b) b.onclick = tirarPrint;
  }
  async function alternarVoz() {
    const btn = $id('ac-mic');
    if (Ditado.ativo) { Ditado.parar(); btn.textContent = '🎤 Falar'; return; }
    ac.audio = null;
    if (await Ditado.iniciar($id('ac-texto'), { onAudio: (b) => { ac.audio = b; }, onTexto: () => { ac.voz = true; } })) btn.textContent = '⏹ Parar';
  }
  function fecharCaixa(como) {
    const bx = $id('ac-box'); if (bx.hidden) return;
    Ditado.parar(); ac.gen++;
    bx.hidden = true; ac.print = null; ac.audio = null; ac.voz = false;
    uso('balao', ac.motivo, { evento: 'fechou', resposta: como });
  }
  function abrirCaixa(motivo, pergunta, veioDoBalao) {
    montar();
    const bx = $id('ac-box'); if (!bx.hidden) return;
    const b = $id('ac-bubble');
    if (!b.hidden && !veioDoBalao) { b.hidden = true; clearTimeout(ac.timerBalao); uso('balao', ac.motivo, { evento: 'fechou', resposta: 'falou' }); }
    ac.motivo = motivo; ac.pergunta = pergunta || ''; ac.tipo = TIPO_PADRAO[motivo] || 'melhoria';
    if (!veioDoBalao) uso('balao', motivo, { evento: 'abriu', pergunta: pergunta || null });
    bx.innerHTML = '<div class="ac-cab"><b>Conta pra gente</b><button type="button" id="ac-fechar" aria-label="Fechar">✕</button></div>'
      + `<p class="ac-perg">${pergunta ? esc(pergunta) : `Escreva ou fale sobre a tela <b>${esc(nomeTela(rotaAtual()))}</b>. O print dela vai junto.`}</p>`
      + `<div class="ac-chips">${TIPOS.map(([k, l]) => `<button type="button" data-tipo="${k}" class="${k === ac.tipo ? 'on' : ''}">${l}</button>`).join('')}</div>`
      + '<textarea id="ac-texto" rows="4" placeholder="O que você quer dizer?"></textarea>'
      + '<div class="ac-linha"><button type="button" id="ac-mic">🎤 Falar</button></div>'
      + '<div id="ac-print"></div><div class="ac-mut" style="margin-top:4px">Fundos de imagem podem sair em branco no print.</div>'
      + '<div class="ac-linha"><button type="button" id="ac-enviar" class="ac-pri">Enviar</button></div><div id="ac-ok" hidden></div>';
    bx.hidden = false;
    bx.querySelector('#ac-fechar').onclick = () => fecharCaixa('fechou');
    bx.querySelectorAll('[data-tipo]').forEach((btn) => btn.onclick = () => { ac.tipo = btn.dataset.tipo; bx.querySelectorAll('[data-tipo]').forEach((x) => x.classList.toggle('on', x === btn)); });
    bx.querySelector('#ac-mic').onclick = alternarVoz;
    bx.querySelector('#ac-enviar').onclick = enviar;
    setTimeout(() => { const t = $id('ac-texto'); if (t) t.focus(); }, 50);
    tirarPrint();
  }
  A.abrirCaixa = abrirCaixa;
  async function enviar() {
    const ta = $id('ac-texto'), btn = $id('ac-enviar');
    if (Ditado.ativo) { Ditado.parar(); $id('ac-mic').textContent = '🎤 Falar'; await new Promise((r) => setTimeout(r, 400)); }
    const texto = ta.value.trim();
    if (!texto) { toast('Escreva ou fale algo primeiro.', 'err'); return; }
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const anexos = []; let audio_path = null;
      if (ac.print) { try { const f = new File([ac.print], `print-${Date.now()}.jpg`, { type: 'image/jpeg' }); anexos.push({ path: await docsUpload(f, 'sugestoes'), nome: f.name, mime: 'image/jpeg', tamanho: f.size }); } catch (_) { /* segue sem o print */ } }
      if (ac.audio) { try { audio_path = await docsUpload(new File([ac.audio], `sugestao-${Date.now()}.webm`, { type: ac.audio.type || 'audio/webm' }), 'sugestoes'); } catch (_) { /* segue sem o áudio */ } }
      const rota = rotaAtual();
      const contexto = { via: 'balao', motivo: ac.motivo, pergunta: ac.pergunta || null, rota, largura: window.innerWidth, ultimos: ultimos.slice(-20) };
      const { error } = await sb.from('flow_sugestoes').insert({
        texto, anexos, audio_path, origem: (ac.voz || audio_path) ? 'voz' : 'texto', tipo: ac.tipo, tela: nomeTela(rota), prioridade: 'normal', status: 'nova', contexto,
        historico: [{ em: new Date().toISOString(), por: actorName(), de: 'nova', para: 'nova', nota: 'Registrada pelo balão 💬' }],
      });
      if (error) throw error;
      const ok = $id('ac-ok'); ok.hidden = false; ok.textContent = `Anotado! O ${RESPONSAVEL} já recebeu. 🙌`;
      uso('balao', ac.motivo, { evento: 'fechou', resposta: 'enviou' });
      ac.print = null; ac.audio = null; ac.voz = false;
      setTimeout(() => { $id('ac-box').hidden = true; }, 3500);
      if (typeof currentView !== 'undefined' && currentView === 'sugestoes' && typeof loadSugestoes === 'function') loadSugestoes();
    } catch (e) { toast('Erro ao enviar: ' + (e.message || e), 'err'); btn.disabled = false; btn.textContent = 'Enviar'; }
  }

  // cartão na tela Hoje explicando o balão (chamado pelo renderHoje)
  A.cartao = function (slot) {
    if (!slot) return;
    const chave = 'ac_card_recolhido:' + (email() || 'x');
    const desenha = () => {
      if (lsGet(chave, false)) {
        slot.className = 'ac-card ac-card-min';
        slot.innerHTML = '<span>Tem alguém do seu lado anotando 💬</span> <a href="#" id="ac-card-ver">Ver como funciona</a>';
        slot.querySelector('#ac-card-ver').onclick = (e) => { e.preventDefault(); lsSet(chave, false); desenha(); };
        return;
      }
      slot.className = 'ac-card';
      slot.innerHTML = '<div class="ac-card-corpo"><h3>Tem alguém do seu lado anotando 💬</h3><ul>'
        + '<li><b>O botão 💬</b> no canto da tela abre a caixa de escrever, em cima da tela em que você está.</li>'
        + '<li><b>Escreva ou fale:</b> o microfone dita para você, e o sistema tira um print da tela para a equipe ver o que você viu.</li>'
        + '<li><b>De vez em quando o balão pergunta</b> como está indo: na primeira vez em uma tela, ou quando algo não respondeu como esperado.</li>'
        + '<li><b>Tudo vai para a aba Sugestões,</b> e a resposta chega por lá.</li></ul>'
        + '<p class="ac-mut">O sistema anota quais telas você abre e onde clica, só para melhorar o Flow. Ele <b>nunca</b> anota o que você digita nos campos.</p>'
        + '<div class="ac-card-bt"><button type="button" id="ac-card-exp" class="ac-pri">💬 Experimentar agora</button><button type="button" id="ac-card-ok">Entendi</button></div></div>'
        + '<div class="ac-desenho" aria-hidden="true"><div class="ac-d-balao"><i></i><i></i></div><div class="ac-d-btn">💬</div></div>';
      slot.querySelector('#ac-card-exp').onclick = () => mostrarBalao('experimento', PERGUNTAS.experimento, true);
      slot.querySelector('#ac-card-ok').onclick = () => { lsSet(chave, true); desenha(); };
    };
    desenha();
  };

  const css = document.createElement('style');
  css.textContent = `
    #ac-root{ position:fixed; right:20px; bottom:20px; z-index:70; font-family:var(--f-ui); }
    #ac-btn{ width:52px; height:52px; border-radius:50%; border:0; background:var(--brand); color:#fff; font-size:22px; cursor:pointer; box-shadow:0 8px 24px -8px rgba(16,16,24,.45); }
    #ac-btn:hover{ background:var(--brand-hover); }
    #ac-bubble, #ac-box{ position:absolute; right:0; bottom:64px; background:var(--surface); border:1px solid var(--border); border-radius:14px; padding:14px; box-shadow:0 16px 40px -12px rgba(16,16,24,.35); font-size:13px; line-height:1.45; color:var(--ink); }
    #ac-bubble{ width:300px; } #ac-bubble p{ margin:0 0 10px; }
    #ac-box{ width:350px; max-height:78vh; overflow:auto; } #ac-box *{ box-sizing:border-box; }
    .ac-acoes{ display:flex; gap:6px; flex-wrap:wrap; }
    .ac-acoes button, .ac-chips button, .ac-linha button, .ac-card button{ border:1px solid var(--border); background:var(--surface); color:var(--ink); border-radius:999px; padding:5px 11px; font:500 12px var(--f-ui); cursor:pointer; }
    .ac-acoes button:hover, .ac-chips button:hover, .ac-linha button:hover, .ac-card button:hover{ border-color:var(--border-strong); background:var(--surface-2); }
    .ac-acoes [data-ac=x]{ margin-left:auto; }
    .ac-cab{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; } .ac-cab button{ border:0; background:none; font-size:15px; cursor:pointer; color:var(--ink-faint); }
    .ac-perg{ margin:0 0 8px; color:var(--ink-soft); } .ac-mut{ color:var(--ink-faint); font-size:11.5px; }
    .ac-chips{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
    .ac-chips .on, .ac-pri{ background:var(--brand) !important; color:#fff !important; border-color:var(--brand) !important; }
    #ac-texto{ width:100%; border:1px solid var(--border); border-radius:8px; padding:8px 10px; font:inherit; resize:vertical; }
    #ac-texto:focus{ outline:none; border-color:var(--brand); box-shadow:0 0 0 3px rgba(16,41,232,.1); }
    .ac-linha{ display:flex; gap:8px; align-items:center; margin:8px 0; flex-wrap:wrap; }
    #ac-print img{ max-width:100%; max-height:140px; border:1px solid var(--border); border-radius:8px; display:block; }
    #ac-ok{ background:var(--green-soft); border-radius:8px; padding:8px 10px; color:var(--green); font-weight:600; }
    #ac-versao{ position:fixed; top:0; left:0; right:0; z-index:300; background:#b86e00; color:#fff; text-align:center; padding:9px 14px; font:600 13.5px var(--f-ui); display:flex; gap:12px; justify-content:center; align-items:center; flex-wrap:wrap; }
    #ac-versao button{ background:#fff; color:#8a5200; border:0; border-radius:999px; padding:5px 14px; font-weight:700; cursor:pointer; }
    .ac-card{ display:flex; gap:18px; align-items:center; justify-content:space-between; background:var(--brand-soft); border:1px solid var(--brand-line); border-radius:12px; padding:14px 18px; margin:0 0 18px; }
    .ac-card h3{ margin:0 0 6px; font-size:15px; } .ac-card ul{ margin:0 0 6px; padding-left:18px; font-size:12.5px; line-height:1.55; color:var(--ink-soft); } .ac-card p{ margin:4px 0 10px; }
    .ac-card-bt{ display:flex; gap:8px; flex-wrap:wrap; } .ac-card-min{ padding:8px 14px; font-size:12.5px; justify-content:flex-start; }
    .ac-desenho{ position:relative; width:150px; height:110px; flex:none; }
    .ac-d-balao{ position:absolute; left:0; top:0; width:130px; height:62px; background:#fff; border:1px solid var(--border); border-radius:12px; padding:10px; box-shadow:0 6px 16px -8px rgba(16,16,24,.3); }
    .ac-d-balao i{ display:block; height:7px; border-radius:4px; background:#d9ddf0; margin-bottom:7px; } .ac-d-balao i:last-child{ width:60%; }
    .ac-d-btn{ position:absolute; right:6px; bottom:0; width:40px; height:40px; border-radius:50%; background:var(--brand); color:#fff; display:flex; align-items:center; justify-content:center; }
    #toasts{ right:18px; }
    @media print{ #ac-root, #ac-versao, .ac-card{ display:none !important; } }
    @media (max-width:760px){ #ac-root{ bottom:78px; right:12px; } .ac-desenho{ display:none; } #ac-box, #ac-bubble{ width:calc(100vw - 32px); } }`;
  document.head.appendChild(css);

  function iniciar() { montar(); checarTela(); verificarVersao(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
