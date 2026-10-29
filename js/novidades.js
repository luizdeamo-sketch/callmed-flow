/* CallMed Flow — Novidades: o que mudou em cada versão, mostrado uma vez depois de atualizar, e o atalho "Como usar" (tour). */
'use strict';

/** Mais recente primeiro. `id` só cresce; a pessoa vê as versões com id maior que a última que ela já viu. */
const NOVIDADES = [
  {
    id: 8, data: '29/10', titulo: 'Kanban mais fácil de navegar',
    itens: [
      ['Barra de rolagem no rodapé', 'No Kanban, a barra para ir às outras colunas agora fica sempre visível no rodapé da tela (pedido da Denise).'],
      ['Renomear coluna', 'Administradores clicam no ✎ do cabeçalho da coluna para trocar o nome. O histórico e os relatórios continuam certos.'],
    ],
  },
  {
    id: 7, data: '28/10', titulo: 'Ajustes da revisão geral',
    itens: [
      ['Aprovar pede confirmação', 'E avisa quando ainda há documentos pendentes. Aprovar e Reprovar ficam só nos botões próprios (saíram do "Mover para").'],
      ['Feito sugere o passo seguinte', 'Ex.: depois de "Enviar cadastro ao hospital", sugere "Cobrar retorno do hospital".'],
      ['Print do balão 💬 mais rápido', 'E certo mesmo com a tela rolada.'],
      ['Relatórios', '"CSV desta aba" baixa um arquivo só; o Excel traz todas as abas, inclusive Formação e Motivos de perda.'],
      ['Tela larga', 'No monitor grande, as listas do Hoje viram colunas.'],
    ],
  },
  {
    id: 6, data: '27/10', titulo: 'Sugestões com retorno e print marcado',
    itens: [
      ['A resposta chega até você', 'Quando a gestão responde a sua sugestão, o aviso aparece na tela de onde ela saiu e o menu Sugestões mostra um número. Clique em "Ficou bom" ou "Ainda não ficou".'],
      ['Print do jeito que você quer', 'No balão 💬, "Tirar print e marcar": escolha a área (ou outra janela), risque, desenhe um retângulo ou escreva em cima.'],
      ['Suas sugestões são suas', 'Cada sugestão só aparece para quem a criou e para a gestão.'],
      ['Telas na largura toda', 'O Flow agora usa a tela inteira, do celular ao monitor grande.'],
    ],
  },
  {
    id: 5, data: '27/10', titulo: 'Filtro por data de cadastro',
    itens: [
      ['Cadastrados de … até …', 'Em Filtros, escolha as datas para ver só os médicos cadastrados naquele período. Junto com o filtro de hospital, separa os cadastros novos dos antigos.'],
      ['Vale para a exportação', 'O botão Exportar leva para o Excel só os médicos do período escolhido.'],
    ],
  },
  {
    id: 4, data: '19/10', titulo: 'Hospitais novos sem travar o cadastro',
    itens: [
      ['Hospital não está na lista?', 'No cadastro do médico, clique nesse link. Administrador cadastra na hora; os demais enviam o pedido e recebem o aviso quando o hospital entrar.'],
      ['Quem cuida da lista', 'Os administradores, em Admin → Hospitais: incluir, renomear, inativar e excluir. Pedidos pendentes aparecem no topo.'],
      ['Sem duplicar', 'O Flow avisa quando o nome é parecido com um hospital que já existe (ex.: "H. Santa Cruz" e "Hospital Santa Cruz").'],
    ],
  },
  {
    id: 3, data: '19/10', titulo: 'Melhorias desta semana',
    itens: [
      ['Parecer jurídico na ficha', 'Aprovado, aprovado com restrição ou não aprovado. Só o Jurídico marca, e quem cuida do médico recebe o aviso na hora.'],
      ['Reprovar pede o motivo', 'E já cria a ação de avisar o médico. Aprovar também cria "Informar aprovação e próximos passos".'],
      ['Cor do parecer no Kanban e na Jornada', 'Verde liberado, amarelo com restrição, vermelho não aprovado.'],
      ['Etapas mais simples', 'Os médicos R3 voltaram para "Aguardando médico" (seguem marcados como R3).'],
      ['Relatórios', 'Nova aba "Motivos de perda" e exportação do histórico completo em Excel, para auditoria.'],
      ['Balão 💬 em todas as telas', 'Conta pra gente o que achou: escreva ou fale, e o print da tela vai junto.'],
    ],
  },
  {
    id: 2, data: '15/10', titulo: 'Flow mais simples',
    itens: [
      ['Abre no Hoje', 'Suas ações do dia, atrasadas primeiro, com Feito, Amanhã e WhatsApp num clique.'],
      ['Novo médico', 'O sistema avisa o que falta preencher e bloqueia cadastro repetido no mesmo hospital.'],
      ['Urgente vale 7 dias', 'Depois volta para rotina sozinho, a menos que alguém marque de novo.'],
    ],
  },
];
const NOV_ULTIMA = NOVIDADES[0].id;
const TOUR_URL = 'demo.html';

const Novidades = {
  chave() { return 'flow:novidades:' + String((S.user && S.user.email) || '').toLowerCase(); },
  vista() { try { return +localStorage.getItem(this.chave()) || 0; } catch (_) { return NOV_ULTIMA; } },
  marcar() { try { localStorage.setItem(this.chave(), String(NOV_ULTIMA)); } catch (_) { /* sem armazenamento */ } this.ponto(); },
  ponto() { const p = $('#nov-dot'); if (p) p.hidden = this.vista() >= NOV_ULTIMA; },
  /** Chamado ao entrar: mostra o que mudou desde a última vez (quem nunca viu, vê só a versão atual). */
  checar() {
    if (window.FLOW_DEMO) return;
    this.ponto();
    const visto = this.vista();
    if (visto >= NOV_ULTIMA) return;
    const lista = visto ? NOVIDADES.filter((n) => n.id > visto) : NOVIDADES.slice(0, 1);
    setTimeout(() => { if (!document.querySelector('.modal-bg')) this.abrir(lista); }, 900);
  },
  abrir(lista = NOVIDADES) {
    const m = openModal(`
      <div class="modal-head"><div><h2>Novidades do Flow</h2><div class="om-sub">O que mudou nas últimas versões</div></div><button class="x" data-close>✕</button></div>
      <div class="modal-body">
        ${lista.map((n) => `<div class="nov-bloco"><div class="nov-cab"><b>${esc(n.titulo)}</b><span class="tagx mute">${esc(n.data)}</span></div>
          <ul class="nov-lista">${n.itens.map(([t, d]) => `<li><b>${esc(t)}.</b> ${esc(d)}</li>`).join('')}</ul></div>`).join('')}
        <div class="nov-tour"><div><b>Primeira vez por aqui?</b><div class="muted small">Um tour de 3 minutos mostra o caminho de um médico, do cadastro à aprovação.</div></div>
          <a class="btn btn-line" href="${TOUR_URL}" target="_blank" rel="noopener">${ic('hoje', 15)}Ver como usar</a></div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" id="nov-ok">Entendi</button></div>`, { size: 'sm', onClose: () => this.marcar() });
    $('#nov-ok', m.el).onclick = () => m.close();
  },
};

$('#btn-novidades').onclick = () => Novidades.abrir();
$('#btn-tour').onclick = () => window.open(TOUR_URL, '_blank', 'noopener');

const novCss = document.createElement('style');
novCss.textContent = `
  .nov-bloco{ margin-bottom:16px; } .nov-cab{ display:flex; align-items:center; gap:8px; margin-bottom:6px; }
  .nov-lista{ margin:0; padding-left:18px; font-size:13px; line-height:1.55; color:var(--ink-soft); } .nov-lista li{ margin-bottom:4px; } .nov-lista b{ color:var(--ink); font-weight:600; }
  .nov-tour{ display:flex; gap:12px; align-items:center; justify-content:space-between; flex-wrap:wrap; background:var(--brand-soft); border:1px solid var(--brand-line); border-radius:10px; padding:12px 14px; }
  #btn-novidades{ position:relative; } #nov-dot{ position:absolute; top:5px; right:5px; width:7px; height:7px; border-radius:50%; background:var(--red); box-shadow:0 0 0 2px var(--surface); }`;
document.head.appendChild(novCss);
