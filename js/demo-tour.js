/* CallMed Flow — tour guiado do modo demonstração: um cursor usa o sistema de verdade, passo a passo, com legenda. */
'use strict';

(function () {
  const API = () => window.FLOW_DEMO_API;
  const ABORT = Symbol('abort');
  const T = { run: 0, paused: false, fast: false, step: 0, target: 0, speed: 1 };
  let cursor, ring, bar;

  // ---------- primitivas ----------
  const sleepRaw = (ms) => new Promise((r) => setTimeout(r, ms));
  async function gate(token) {
    while (T.paused && token === T.run) await sleepRaw(120);
    if (token !== T.run) throw ABORT;
  }
  async function wait(token, ms) {
    if (T.fast) { await sleepRaw(30); return gate(token); }
    const end = Date.now() + ms / T.speed;
    while (Date.now() < end) { await sleepRaw(80); await gate(token); }
  }
  async function find(token, sel, root = document) {
    for (let i = 0; i < 60; i++) {
      const el = typeof sel === 'function' ? sel() : root.querySelector(sel);
      if (el && (el.offsetWidth || el.offsetHeight)) return el;
      await sleepRaw(80); await gate(token);
    }
    throw new Error('Não achei: ' + sel);
  }
  function center(el) { const r = el.getBoundingClientRect(); return [r.left + Math.min(r.width / 2, 60), r.top + r.height / 2]; }
  function showRing(el) {
    const r = el.getBoundingClientRect();
    Object.assign(ring.style, { left: r.left - 5 + 'px', top: r.top - 5 + 'px', width: r.width + 10 + 'px', height: r.height + 10 + 'px', opacity: 1 });
  }
  const hideRing = () => { ring.style.opacity = 0; };
  async function point(token, el) {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    await sleepRaw(30);
    const [x, y] = center(el);
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    showRing(el);
    await wait(token, 750);
  }
  async function click(token, sel) {
    const el = typeof sel === 'string' || typeof sel === 'function' ? await find(token, sel) : sel;
    await point(token, el);
    cursor.classList.remove('click'); void cursor.offsetWidth; cursor.classList.add('click');
    if (el.type === 'checkbox') { el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); } else el.click();
    hideRing();
    await wait(token, 450);
    return el;
  }
  async function type(token, sel, text) {
    const el = await find(token, sel);
    await point(token, el);
    el.focus();
    el.value = '';
    for (const ch of text) {
      el.value += ch;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      if (!T.fast) await sleepRaw(45 / T.speed);
      await gate(token);
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur'));
    hideRing();
    await wait(token, 300);
  }
  async function choose(token, sel, value) {
    const el = await find(token, sel);
    await point(token, el);
    el.value = value; el.dispatchEvent(new Event('change', { bubbles: true }));
    hideRing();
    await wait(token, 400);
  }
  async function drag(token, cardSel, colSel) {
    const card = await find(token, cardSel), col = await find(token, colSel);
    col.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    await point(token, card);
    const ghost = card.cloneNode(true);
    const r = card.getBoundingClientRect();
    Object.assign(ghost.style, { position: 'fixed', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', zIndex: 99, opacity: .9, transform: 'rotate(2deg)', transition: `left ${.9 / T.speed}s ease, top ${.9 / T.speed}s ease`, pointerEvents: 'none', boxShadow: '0 12px 30px -10px rgba(0,0,0,.35)' });
    if (!T.fast) document.body.appendChild(ghost);
    card.style.opacity = .35;
    const cr = col.getBoundingClientRect();
    const tx = cr.left + 10, ty = cr.top + 60;
    cursor.style.transform = `translate(${tx + 40}px, ${ty + 20}px)`;
    ghost.style.left = tx + 'px'; ghost.style.top = ty + 'px';
    showRing(col);
    await wait(token, 1000);
    const dt = new DataTransfer();
    card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    col.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    col.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    ghost.remove(); hideRing();
    await wait(token, 900);
  }
  function say(title, text) {
    $('#dm-title').textContent = title;
    $('#dm-text').textContent = text;
  }
  const closeModals = () => $$('.modal-bg').forEach((m) => m.remove());
  const NEW = 'Helena Prado';
  const newDoc = () => S.doctors.find((d) => d.name === NEW);

  // ---------- roteiro ----------
  const STEPS = [
    { t: 'Boas-vindas', run: async (k) => {
      API().setPersona('bruna'); go('hoje');
      say('Escalista · Bruna', 'Este é o Hoje: a primeira tela de cada pessoa. Vamos acompanhar um médico do cadastro até a aprovação.');
      await wait(k, 3200);
    } },
    { t: 'Cadastro', run: async (k) => {
      say('Escalista · Bruna', 'A escalista conheceu uma médica nova. Ela clica em "Novo médico".');
      await click(k, '#hj-new');
      say('Escalista · Bruna', 'Enquanto falta algo, o sistema mostra o quê ao lado do botão.');
      await point(k, await find(k, '#nd-missing'));
      await type(k, '#nd-name', NEW);
      await type(k, '#nd-wa', '11 98765-4321');
      await type(k, '#nd-crm', '187452');
    } },
    { t: 'Hospital e setor', run: async (k) => {
      say('Escalista · Bruna', 'Escolhe o hospital e o setor. Se a médica já existisse naquele hospital, o sistema bloquearia o cadastro repetido.');
      await click(k, () => $$('#nd-hosps label').find((l) => l.textContent.includes('Hospital Santa Cruz')).querySelector('input'));
      await click(k, () => $$('#nd-setores label').find((l) => l.textContent.includes('UTI')).querySelector('input'));
      say('Escalista · Bruna', 'E encaminha para quem vai cuidar do cadastro: a Camila.');
      await choose(k, '#nd-resp', 'a0000000-0000-4000-8000-000000000002');
      await wait(k, 600);
      await click(k, '#nd-ok');
      say('Escalista · Bruna', 'Pronto. A médica entrou em "Primeiro contato", já com a próxima ação e a responsável definidas.');
      await wait(k, 2200);
    } },
    { t: 'Aviso para o Cadastro', run: async (k) => {
      closeModals();
      API().setPersona('camila'); await loadNotifs(); go('hoje');
      say('Cadastro · Camila', 'Do lado do Cadastro: o sino avisa na hora que a Bruna passou uma médica.');
      await click(k, '#btn-bell');
      await wait(k, 1400);
      say('Cadastro · Camila', 'Um clique no aviso abre a ficha da médica.');
      await click(k, () => $$('#notif-pop .notif').find((n) => n.textContent.includes(NEW)));
    } },
    { t: 'Ficha do médico', run: async (k) => {
      if (currentView !== 'medico') await openDoctor(newDoc());
      say('Cadastro · Camila', 'A ficha mostra a etapa atual, o prazo (SLA) e a próxima ação: fazer o primeiro contato.');
      await point(k, await find(k, '.pv-next'));
      await wait(k, 800);
      say('Cadastro · Camila', 'O WhatsApp abre com um clique, com a mensagem pronta.');
      await click(k, '#pa-wa');
      await click(k, '#wa-go');
      await wait(k, 1200);
    } },
    { t: 'Ação feita', run: async (k) => {
      say('Cadastro · Camila', 'Falou com a médica? Clica em "Feito" e já agenda a próxima ação.');
      await click(k, () => $('#na-done') || $$('#view-medico button').find((b) => /Feito/.test(b.textContent)));
      await type(k, '#na-res', 'Médica vai mandar os documentos até sexta');
      await choose(k, '#na-acao', 'Cobrar documentação pendente');
      await click(k, '[data-quick="3"]');
      await click(k, '#na-save');
      say('Cadastro · Camila', 'E move a médica para a próxima etapa.');
      await click(k, () => $$('#view-medico [data-move]')[0]);
      await wait(k, 900);
    } },
    { t: 'Documentos', run: async (k) => {
      say('Cadastro · Camila', 'Na aba Documentos, o checklist dos 22 documentos: marca o que chegou e o percentual atualiza sozinho.');
      await click(k, () => $$('.pv-tab').find((b) => /Documentos/.test(b.textContent)));
      for (const n of ['CNH/RG', 'Carteira de CRM - Frente e verso', 'Comprovante de endereço', 'Currículo']) {
        await click(k, () => $(`.doc-row[data-doc="${n}"] input`));
      }
      await wait(k, 600);
      say('Cadastro · Camila', 'Tudo fica no Histórico, com nome e hora de quem fez.');
      await click(k, () => $$('.pv-tab').find((b) => /Histórico/.test(b.textContent)));
      await wait(k, 1800);
    } },
    { t: 'Kanban', run: async (k) => {
      say('Cadastro · Camila', 'No Fluxo, o Kanban mostra todos os médicos por etapa. Dá para buscar pelo nome…');
      go('fluxo');
      await click(k, '#fx-mode [data-mode="kanban"]');
      await type(k, '#f-search', 'Helena');
      await wait(k, 700);
      say('Cadastro · Camila', '…e mudar a etapa arrastando o card. A próxima ação da etapa nova já vem sugerida.');
      await drag(k, () => $(`.kcard[data-id="${newDoc().id}"]`), '.kanban-col[data-stage="aguardando_hospital"]');
      say('Cadastro · Camila', 'O hospital aprovou? Arrasta para "Aprovado". O sistema já cria a ação de avisar o médico; quando ela é feita, o caso se encerra.');
      await drag(k, () => $(`.kcard[data-id="${newDoc().id}"]`), '.kanban-col[data-stage="aprovado"]');
      await wait(k, 800);
    } },
    { t: 'Jornada', run: async (k) => {
      const s = $('#f-search'); s.value = ''; s.dispatchEvent(new Event('input'));
      say('Gestão', 'A Jornada mostra, dia a dia, quantos médicos estavam em cada etapa. A linha Total soma tudo.');
      await click(k, '#fx-mode [data-mode="jornada"]');
      await point(k, await find(k, '.op-totalrow'));
      say('Gestão', 'Clicar em um número filtra a lista e mostra exatamente quem são aqueles médicos.');
      await click(k, () => $$('.op-sumcell.clk').filter((c) => c.closest('.op-sumrow') && !c.closest('.op-totalrow')).slice(-3)[0]);
      await wait(k, 1800);
      const chip = $('#fx-chip button'); if (chip) await click(k, chip);
    } },
    { t: 'Atenção', run: async (k) => {
      say('Gestão', 'No topo, os números que pedem atenção: minhas ações, atrasadas, SLA vencido e sem próxima ação. Também filtram com um clique.');
      await click(k, '[data-k="sla"]');
      await wait(k, 1600);
      await click(k, '[data-k="sla"]');
      say('Gestão', '"Prioridades" lista quem cobrar primeiro na semana: urgência, prazo e ações atrasadas.');
      await click(k, '#fx-hot');
      await wait(k, 2400);
      closeModals();
    } },
    { t: 'Indicadores', run: async (k) => {
      say('Gestão', 'Os Indicadores mostram o funil, a taxa de aprovação e onde o processo trava.');
      await click(k, '#rail [data-view="indicadores"]');
      await wait(k, 2200);
      say('Gestão', 'Em "Relatórios detalhados": tempo por etapa, SLA, hospitais e produtividade da equipe, com exportação para Excel.');
      await click(k, '[data-goview="relatorios"]');
      await wait(k, 2600);
    } },
    { t: 'Sugestões', run: async (k) => {
      say('Para todos', 'Ideia ou problema? Em Sugestões dá para escrever, ditar por voz ou colar um print. Tudo fica registrado e respondido.');
      await click(k, '#rail [data-view="sugestoes"]');
      await type(k, '#sg-text', 'Gostei! Dá para avisar quando um documento vencer?');
      await click(k, '#sg-send');
      await wait(k, 1500);
    } },
    { t: 'Fim', run: async (k) => {
      go('hoje');
      say('Pronto!', 'Esse é o CallMed Flow. Agora fique à vontade para clicar em tudo: os dados são fictícios e nada é salvo.');
      await wait(k, 400);
    } },
  ];

  // ---------- controle ----------
  function renderBar() {
    $('#dm-step').textContent = `${Math.min(T.step + 1, STEPS.length)} de ${STEPS.length} · ${STEPS[Math.min(T.step, STEPS.length - 1)].t}`;
    $('#dm-prog').style.width = `${(T.step / (STEPS.length - 1)) * 100}%`;
    $('#dm-play').innerHTML = T.paused ? '▶ Continuar' : '❚❚ Pausar';
  }
  /** Uma rodada por vez: a nova espera a anterior parar no próximo ponto de controle. */
  function play(from) {
    const prev = T.current;
    const token = ++T.run;
    T.target = from;
    T.current = (async () => { try { await prev; } catch (_) { /* rodada anterior abortada */ } if (token === T.run) await playNow(from, token); })();
    return T.current;
  }
  let navTimer = null;
  function jump(to) {
    T.done = false;
    T.target = Math.max(0, Math.min(to, STEPS.length - 1));
    T.run++; // interrompe a rodada atual já
    $('#dm-step').textContent = `${T.target + 1} de ${STEPS.length} · ${STEPS[T.target].t}`;
    clearTimeout(navTimer);
    navTimer = setTimeout(() => play(T.target), 350);
  }
  async function playNow(from, token) {
    T.paused = false;
    cursor.style.display = '';
    try {
      if (from > 0 || T.step !== from) {
        T.fast = true; cursor.style.opacity = 0;
        await API().resetDemo('camila');
        for (let i = 0; i < from; i++) { T.step = i; await STEPS[i].run(token); }
        T.fast = false; cursor.style.opacity = 1;
      } else if (from === 0) await API().resetDemo('camila');
      for (let i = from; i < STEPS.length; i++) {
        T.step = i; T.target = i; renderBar();
        await STEPS[i].run(token);
      }
      T.step = STEPS.length - 1; renderBar();
      $('#dm-play').innerHTML = '⟲ Ver de novo';
      hideRing(); cursor.style.opacity = 0;
      T.done = true;
    } catch (e) {
      T.fast = false; cursor.style.opacity = 1;
      if (e !== ABORT) { console.warn('[tour]', e); say('Ops', 'Este passo não rodou como esperado. Clique em "Próximo" para seguir.'); }
    }
  }
  function build() {
    cursor = document.createElement('div');
    cursor.className = 'dm-cursor';
    cursor.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 2l16 11-7 1.5L9.5 21z" fill="#fff" stroke="#0b1240" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.appendChild(cursor);
    ring = document.createElement('div'); ring.className = 'dm-ring'; document.body.appendChild(ring);
    bar = document.createElement('div'); bar.className = 'dm-bar'; bar.hidden = true;
    bar.innerHTML = `<div class="t"><span id="dm-title"></span><span id="dm-step"></span></div><div class="x2" id="dm-text"></div>
      <div class="ctl"><button id="dm-prev" aria-label="Passo anterior">◀</button><button class="pri" id="dm-play"></button><button id="dm-next" aria-label="Próximo passo">▶</button>
      <span class="prog"><i id="dm-prog"></i></span><button id="dm-speed" title="Velocidade">1×</button><button id="dm-close">Explorar sozinho</button></div>`;
    document.body.appendChild(bar);
    $('#dm-play').onclick = () => { if (T.done) { T.done = false; play(0); return; } T.paused = !T.paused; renderBar(); };
    $('#dm-next').onclick = () => jump(T.target + 1);
    $('#dm-prev').onclick = () => jump(T.target - 1);
    $('#dm-speed').onclick = (e) => { T.speed = T.speed === 1 ? 1.6 : T.speed === 1.6 ? 0.7 : 1; e.target.textContent = { 1: '1×', 1.6: '1,5×', 0.7: '0,7×' }[T.speed]; };
    $('#dm-close').onclick = () => { T.run++; bar.hidden = true; document.body.classList.remove('dm-on'); hideRing(); cursor.style.display = 'none'; closeModals(); toast('Fique à vontade: clique em tudo. Os dados são fictícios e nada é salvo.', 'ok', 'Demonstração'); };
  }
  function open() {
    if (!cursor) build();
    const ov = document.createElement('div');
    ov.className = 'dm-start';
    ov.innerHTML = `<div class="card"><img src="assets/logo-azul.png" alt="CallMed" style="height:24px;margin-bottom:18px">
      <h1>Como usar o CallMed Flow</h1>
      <p>Uma demonstração de 3 minutos no sistema de verdade, com dados fictícios. Você pode pausar, voltar e avançar quando quiser.</p>
      <ol><li>A escalista cadastra e encaminha um médico</li><li>O Cadastro recebe o aviso, entra em contato e confere os documentos</li><li>O médico avança pelas etapas até a aprovação</li><li>A gestão acompanha na Jornada, nos Indicadores e nos Relatórios</li></ol>
      <div class="row"><button class="btn btn-primary btn-lg" id="dm-go">▶ Começar a demonstração</button><button class="btn btn-line btn-lg" id="dm-free">Explorar sozinho</button></div></div>`;
    document.body.appendChild(ov);
    $('#dm-go', ov).onclick = () => { ov.remove(); bar.hidden = false; document.body.classList.add('dm-on'); T.done = false; T.step = 0; play(0); };
    $('#dm-free', ov).onclick = () => { ov.remove(); $('#dm-close').click(); };
  }
  window.DemoTour = { open };
})();
