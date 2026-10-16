/**
 * "O que mudou" — o histórico de versões que aparece em Ajuda e Sobre.
 *
 * Escrito para quem USA o app (e para a diretoria), não para quem programa:
 * uma linha por mudança, dizendo o que a pessoa ganha. O detalhe técnico fica
 * no STATUS.md.
 *
 * Saiu versão nova: acrescente um bloco NO TOPO e mude `APP.versao` em
 * sobre.ts para o mesmo número. A data é a do pacote da atualização.
 *
 * Numeração: a versão muda quando um pacote é PUBLICADO; enquanto não sai,
 * os ajustes entram na mesma versão. Último número (1.2.1) para correções e
 * ajustes pequenos; número do meio (1.3) para um conjunto de novidades.
 */

export type TipoMudanca = "novo" | "melhoria" | "correcao";

/** Quem é afetado. "almoxarifado" não aparece para o solicitante. */
export type Publico = "todos" | "almoxarifado";

export interface Mudanca {
  tipo: TipoMudanca;
  texto: string;
  publico?: Publico; // padrão: todos
}

export interface Versao {
  versao: string;
  /** dd/MM/aaaa */
  data: string;
  /** O resumo da versão numa frase curta. */
  titulo: string;
  /** Título para o solicitante, quando o geral fala do que ele não vê. */
  tituloTodos?: string;
  mudancas: Mudanca[];
}

export const ROTULO_TIPO: Record<TipoMudanca, string> = {
  novo: "Novo",
  melhoria: "Melhoria",
  correcao: "Correção",
};

export const VERSOES: Versao[] = [
  {
    versao: "1.2",
    data: "15/10/2026",
    titulo: "Calculadora e marcação de itens no lançamento do TOTVS",
    tituloTodos: "Tela sem o anúncio do Netlify",
    mudancas: [
      {
        tipo: "correcao",
        texto: "Some o anúncio “Com tecnologia Netlify” que tinha aparecido no canto da tela, por cima dos botões.",
      },
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto:
          "O almoxarifado pode corrigir uma requisição pendente (medida, item trocado ou errado) antes de separar. O pedido continua de quem pediu, e a correção fica no histórico.",
      },
      {
        tipo: "melhoria",
        publico: "almoxarifado",
        texto: "“Quem mais pede” mostra os 5 que mais pedem, com a posição, e só os setores (sem o próprio almoxarifado).",
      },
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto:
          "Na janela “Lançar no TOTVS”, toque em cada item depois de digitá-lo: ele fica riscado e o próximo fica destacado. Na volta do ALT+TAB você sabe onde parou, mesmo em lista grande.",
      },
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto:
          "Calculadora ao lado da janela “Lançar no TOTVS” (no computador): conta pelo teclado e copia o resultado com vírgula, pronto para colar no TOTVS, sem sair do ALT+TAB para abrir a do Windows.",
      },
      {
        tipo: "melhoria",
        publico: "almoxarifado",
        texto: "Janela de lançamento mais limpa: saiu o botão “Copiar lista”, que não era usado.",
      },
    ],
  },  {
    versao: "1.1.8",
    data: "15/10/2026",
    titulo: "Painel numa tela só e separação mais fácil no celular",
    tituloTodos: "Tela de novidades do app",
    mudancas: [
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto:
          "Na separação, o carrinho de cada item manda para a Lista de Reposição o material que está acabando, sem sair da tela.",
      },
      {
        tipo: "melhoria",
        publico: "almoxarifado",
        texto:
          "Tela de separação maior no celular: caixas e botões grandes, barra de progresso e todos os itens numa lista só.",
      },
      {
        tipo: "melhoria",
        publico: "almoxarifado",
        texto:
          "Painel cabe numa tela só: saudação, entregues hoje, a lançar no TOTVS, reposição e a fila de atendimento em destaque.",
      },
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto:
          "No painel: gráfico dos últimos 6 meses, o que está aguardando material (com os itens que faltam) e quem mais pede no mês.",
      },
      {
        tipo: "novo",
        texto: "Esta tela de novidades, que avisa uma vez em cada aparelho quando sai versão nova.",
      },
    ],
  },
  {
    versao: "1.1.7",
    data: "14/10/2026",
    titulo: "Painel do almoxarifado refeito",
    mudancas: [
      {
        tipo: "melhoria",
        publico: "almoxarifado",
        texto:
          "Os números do painel abrem a lista já filtrada, e o gráfico de requisições e rupturas passou a ser por dia.",
      },
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto: "Fila de atendimento por tempo de espera, com a observação de cada pedido.",
      },
    ],
  },
  {
    versao: "1.1.6",
    data: "13/10/2026",
    titulo: "Busca pelo número e exportação para o RH",
    tituloTodos: "Busca pelo número e filtros mais claros",
    mudancas: [
      { tipo: "novo", texto: "Buscar uma requisição pelo número (ex.: 72 ou #72)." },
      {
        tipo: "melhoria",
        texto: "Os filtros ligados aparecem acima da lista, cada um com um X, e há o botão “Limpar filtros”.",
      },
      {
        tipo: "correcao",
        texto: "Atualizar a lista confirma a hora; se a internet falhar, a lista não some mais.",
      },
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto: "Exportar os usuários (login, setor, perfil, situação) em planilha para o RH.",
      },
    ],
  },
  {
    versao: "1.1.5",
    data: "07/10/2026",
    titulo: "Observação em destaque e planilha de cotação",
    tituloTodos: "Observação em destaque",
    mudancas: [
      {
        tipo: "novo",
        texto: "A observação do pedido aparece em destaque no topo, na separação e no PDF, e pode ser editada.",
      },
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto: "Copiar a Lista de Reposição direto para a planilha de cotação.",
      },
      { tipo: "correcao", texto: "PDF com mais de uma página não sobrepõe mais o cabeçalho." },
    ],
  },
  {
    versao: "1.1.4",
    data: "07/10/2026",
    titulo: "Devolução ao almoxarifado",
    mudancas: [
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto:
          "Registrar devolução quando foi mandado a mais. TOTVS, consumo e relatórios passam a contar só o que saiu de fato.",
      },
    ],
  },
  {
    versao: "1.1.3",
    data: "07/10/2026",
    titulo: "Busca por item",
    mudancas: [{ tipo: "novo", texto: "Encontrar as requisições que pediram um material específico." }],
  },
  {
    versao: "1.1.2",
    data: "07/10/2026",
    titulo: "Filtros que não se perdem e prévia",
    mudancas: [
      { tipo: "melhoria", texto: "Os filtros continuam ligados ao abrir uma requisição e voltar." },
      { tipo: "novo", texto: "Prévia da requisição sem sair da lista." },
    ],
  },
  {
    versao: "1.1.1",
    data: "06/10/2026",
    titulo: "Três medidas por item",
    mudancas: [
      { tipo: "melhoria", texto: "Cada material tem três medidas para escolher no pedido (ex.: KG, UN, PCT)." },
      { tipo: "correcao", texto: "Ajustes de tela no celular, tablet e notebook." },
    ],
  },
  {
    versao: "1.1",
    data: "06/10/2026",
    titulo: "Pausa para inventário e medida da entrega",
    tituloTodos: "Atualizar o app sem reinstalar",
    mudancas: [
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto: "Pausar novas requisições durante o inventário, com aviso para todos.",
      },
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto: "Registrar a entrega em outra medida (pedido 5 UN de carne, entregue 6,2 KG).",
      },
      {
        tipo: "correcao",
        publico: "almoxarifado",
        texto: "Complementar entregue pela metade fecha e gera outra só com o que ainda falta.",
      },
      { tipo: "melhoria", texto: "Aviso de versão nova com botão “Atualizar”, sem reinstalar o app." },
    ],
  },
  {
    versao: "1.0",
    data: "25/09/2026",
    titulo: "Lançamento: fim do pedido em papel",
    mudancas: [
      {
        tipo: "novo",
        texto: "Pedido pelo celular, separação, conferência e assinatura na tela, com comprovante em PDF.",
      },
      {
        tipo: "novo",
        publico: "almoxarifado",
        texto: "O que falta vira requisição complementar e entra na Lista de Reposição sozinho.",
      },
      { tipo: "novo", publico: "almoxarifado", texto: "Controle do que já foi lançado no TOTVS." },
    ],
  },
];

/** As versões com só o que interessa a esse perfil (versão vazia some). */
export const versoesPara = (ehAlmoxarifado: boolean): Versao[] =>
  VERSOES.map((v) => ({
    ...v,
    titulo: ehAlmoxarifado ? v.titulo : v.tituloTodos ?? v.titulo,
    mudancas: v.mudancas.filter((m) => ehAlmoxarifado || (m.publico ?? "todos") === "todos"),
  })).filter((v) => v.mudancas.length > 0);
