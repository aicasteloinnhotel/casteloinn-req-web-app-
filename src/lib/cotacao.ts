/**
 * Cotação feita no app (no lugar da planilha): linhas da cotação, melhor preço,
 * pedidos por fornecedor e os textos para mandar no WhatsApp.
 * Só lógica aqui (nada grava), para poder testar.
 */

import { formatItemName, UNIDADE_PADRAO } from "@/lib/utils";
import { formatarQtd } from "@/lib/unidades";

export interface Fornecedor {
  id: string;
  nome: string;
  ativo?: boolean;
  /** Só números, com o 55 do Brasil (AJUSTE_09). */
  whatsapp?: string | null;
  /** Valor mínimo do pedido (AJUSTE_09). */
  pedido_minimo?: number | null;
}

/**
 * Número de WhatsApp como o link precisa: só dígitos, com o 55. Aceita
 * "(31) 99999-8888", "31999998888", "+55 31 9 9999-8888". Curto demais = null.
 */
export function normalizarWhatsapp(texto: string | null | undefined): string | null {
  let d = (texto || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d.length >= 12 && d.length <= 13 ? d : null;
}

/** "(31) 99999-8888" para mostrar. */
export function whatsappNaTela(numero: string | null | undefined): string {
  const d = normalizarWhatsapp(numero);
  if (!d) return "";
  const local = d.slice(2);
  const ddd = local.slice(0, 2);
  const resto = local.slice(2);
  return `(${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`;
}

/** Link que abre a conversa do fornecedor já com o texto escrito. */
export function linkWhatsapp(numero: string | null | undefined, texto: string): string | null {
  const d = normalizarWhatsapp(numero);
  return d ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : null;
}

export interface PrecoCotado {
  item_id: string;
  unidade: string;
  fornecedor_id: string;
  preco: number | null;
  escolhido?: boolean;
}

/** Uma linha da reposição como a cotação precisa. */
export interface LinhaDeReposicao {
  id: string;
  item_id: string;
  quantidade: number;
  unidade?: string | null;
  item?: { nome?: string; unidade?: string } | null;
}

/** Como a linha vai na cotação, quando foi editada (AJUSTE_10). Vazio = o original. */
export interface EdicaoDeLinha {
  item_id: string;
  /** A unidade da reposição: é a chave da linha (e do preço). */
  unidade: string;
  nome?: string | null;
  marca?: string | null;
  unidade_compra?: string | null;
  quantidade?: number | null;
}

/** Uma linha da cotação: um material numa unidade (1 UN + 2 CX = duas linhas). */
export interface LinhaCotacao {
  chave: string;
  item_id: string;
  /** Unidade da reposição: a chave da linha e do preço. Não muda com a edição. */
  unidade: string;
  /** Nome que vai na cotação (o editado ou o do cadastro). */
  nome: string;
  /** Quantidade da COMPRA (a editada ou a da reposição): é ela que multiplica o preço. */
  quantidade: number;
  /** Unidade da COMPRA (a editada ou a da reposição): é a que aparece e vai no texto. */
  unidadeCompra: string;
  marca: string;
  /** O original, para mostrar e para restaurar. */
  nomeCadastro: string;
  quantidadeReposicao: number;
  editada: boolean;
  /** As linhas da reposição que ela junta: é nelas que o pedido grava. */
  ids: string[];
  partes: { id: string; quantidade: number }[];
}

export const chaveDaLinha = (itemId: string, unidade: string) => `${itemId}|${unidade}`;

const unidadeDe = (l: LinhaDeReposicao) =>
  (l.unidade || l.item?.unidade || UNIDADE_PADRAO).trim().toUpperCase();

const limpo = (t?: string | null) => (t || "").trim();

export function montarLinhas(linhas: LinhaDeReposicao[], edicoes: EdicaoDeLinha[] = []): LinhaCotacao[] {
  const mapa = new Map<string, LinhaCotacao>();
  for (const l of linhas) {
    const unidade = unidadeDe(l);
    const chave = chaveDaLinha(l.item_id, unidade);
    if (!mapa.has(chave)) {
      const nome = formatItemName(l.item?.nome) || "Item";
      mapa.set(chave, {
        chave,
        item_id: l.item_id,
        unidade,
        nome,
        quantidade: 0,
        unidadeCompra: unidade,
        marca: "",
        nomeCadastro: nome,
        quantidadeReposicao: 0,
        editada: false,
        ids: [],
        partes: [],
      });
    }
    const c = mapa.get(chave)!;
    const q = Number(l.quantidade) || 0;
    c.quantidadeReposicao = Math.round((c.quantidadeReposicao + q) * 1000) / 1000;
    c.quantidade = c.quantidadeReposicao;
    c.ids.push(l.id);
    c.partes.push({ id: l.id, quantidade: q });
  }
  for (const e of edicoes) {
    const c = mapa.get(chaveDaLinha(e.item_id, (e.unidade || "").toUpperCase()));
    if (!c) continue;
    if (limpo(e.nome)) c.nome = limpo(e.nome).toUpperCase();
    if (limpo(e.marca)) c.marca = limpo(e.marca);
    if (limpo(e.unidade_compra)) c.unidadeCompra = limpo(e.unidade_compra).toUpperCase();
    if (e.quantidade != null && Number(e.quantidade) > 0) c.quantidade = Number(e.quantidade);
    c.editada =
      c.nome !== c.nomeCadastro || !!c.marca || c.unidadeCompra !== c.unidade || c.quantidade !== c.quantidadeReposicao;
  }
  return Array.from(mapa.values()).sort((a, b) => a.nomeCadastro.localeCompare(b.nomeCadastro, "pt-BR"));
}

/**
 * Quanto de cada linha da reposição vai no pedido, na unidade da compra.
 * Sem edição é a própria quantidade; com edição (24 UN viram 2 CX), divide
 * na proporção — a soma dá a quantidade da compra.
 */
export function partesDaCompra(linha: LinhaCotacao): { id: string; quantidade: number }[] {
  if (linha.quantidadeReposicao <= 0) return linha.partes.map((p) => ({ id: p.id, quantidade: 0 }));
  return linha.partes.map((p) => ({
    id: p.id,
    quantidade: Math.round(((p.quantidade / linha.quantidadeReposicao) * linha.quantidade) * 1000) / 1000,
  }));
}

/** "Detergente neutro 500ml (Ypê)". */
export const descricaoDaLinha = (l: Pick<LinhaCotacao, "nome" | "marca">) => (l.marca ? `${l.nome} (${l.marca})` : l.nome);

/**
 * Lê o preço como a pessoa digita: "4,10", "4.10", "R$ 1.234,56", "1234.5".
 * Vazio = null (sem preço). Texto que não é número = undefined (inválido).
 */
export function lerPreco(texto: string): number | null | undefined {
  // Tira R$, US$, $ e espaços. Sistema de fornecedor às vezes sai em formato
  // americano ("$2,006.11"): com vírgula E ponto, o que vem por último é o decimal.
  let t = (texto || "").replace(/(r|us)?\$/gi, "").replace(/\s/g, "");
  if (!t) return null;
  const temVirgula = t.includes(",");
  const temPonto = t.includes(".");
  if (temVirgula && temPonto) {
    t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  } else if (temVirgula) {
    // Várias vírgulas só valem como milhar de 3 dígitos ("1,234,567").
    if ((t.match(/,/g) || []).length > 1) {
      if (!/^\d{1,3}(,\d{3})+$/.test(t)) return undefined;
      t = t.replace(/,/g, "");
    } else t = t.replace(",", ".");
  } else if ((t.match(/\./g) || []).length > 1) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(t)) return undefined;
    t = t.replace(/\./g, "");
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return undefined;
  return Math.round(Number(t) * 100) / 100;
}

export const formatarReais = (n: number | null | undefined): string =>
  n == null ? "" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Preço no campo de digitar: "4,10" (sem o R$). */
export const precoNoCampo = (n: number | null | undefined): string =>
  n == null ? "" : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface Vencedor {
  fornecedor_id: string;
  preco: number;
  /** Escolhido à mão (não é o mais barato, ou empatou). */
  manual: boolean;
}

/**
 * Quem leva a linha: o escolhido à mão (se tiver preço) ou o menor preço.
 * Empate: o primeiro na ordem dos fornecedores da cotação.
 */
export function vencedorDaLinha(
  precos: PrecoCotado[],
  linha: Pick<LinhaCotacao, "item_id" | "unidade">,
  ordemFornecedores: string[],
): Vencedor | null {
  const daLinha = precos.filter(
    (p) =>
      p.item_id === linha.item_id &&
      p.unidade === linha.unidade &&
      p.preco != null &&
      ordemFornecedores.includes(p.fornecedor_id),
  );
  const escolhido = daLinha.find((p) => p.escolhido);
  if (escolhido) return { fornecedor_id: escolhido.fornecedor_id, preco: escolhido.preco!, manual: true };
  let melhor: PrecoCotado | null = null;
  for (const id of ordemFornecedores) {
    const p = daLinha.find((x) => x.fornecedor_id === id);
    if (p && (melhor === null || p.preco! < melhor.preco!)) melhor = p;
  }
  return melhor ? { fornecedor_id: melhor.fornecedor_id, preco: melhor.preco!, manual: false } : null;
}

export interface ItemDoPedido {
  linha: LinhaCotacao;
  preco: number;
  subtotal: number;
}

export interface PedidoDoFornecedor {
  fornecedor: Fornecedor;
  itens: ItemDoPedido[];
  total: number;
}

/** Os pedidos que saem da cotação: um por fornecedor que ganhou algo. */
export function pedidosPorFornecedor(
  linhas: LinhaCotacao[],
  precos: PrecoCotado[],
  fornecedores: Fornecedor[],
): { pedidos: PedidoDoFornecedor[]; semPreco: LinhaCotacao[] } {
  const ordem = fornecedores.map((f) => f.id);
  const porFornecedor = new Map<string, PedidoDoFornecedor>();
  const semPreco: LinhaCotacao[] = [];
  for (const linha of linhas) {
    const v = vencedorDaLinha(precos, linha, ordem);
    if (!v) {
      semPreco.push(linha);
      continue;
    }
    const fornecedor = fornecedores.find((f) => f.id === v.fornecedor_id)!;
    if (!porFornecedor.has(fornecedor.id)) porFornecedor.set(fornecedor.id, { fornecedor, itens: [], total: 0 });
    const ped = porFornecedor.get(fornecedor.id)!;
    const subtotal = Math.round(v.preco * linha.quantidade * 100) / 100;
    ped.itens.push({ linha, preco: v.preco, subtotal });
    ped.total = Math.round((ped.total + subtotal) * 100) / 100;
  }
  const pedidos = ordem.filter((id) => porFornecedor.has(id)).map((id) => porFornecedor.get(id)!);
  return { pedidos, semPreco };
}

/** Quanto falta para o pedido mínimo do fornecedor (0 = atingiu ou não tem mínimo). */
export function faltaParaMinimo(pedido: PedidoDoFornecedor): number {
  const minimo = Number(pedido.fornecedor.pedido_minimo) || 0;
  if (minimo <= 0 || pedido.total >= minimo) return 0;
  return Math.round((minimo - pedido.total) * 100) / 100;
}

/**
 * Para onde a linha pode ir: os outros fornecedores da cotação que têm preço
 * para ela, do mais barato para o mais caro.
 */
export function alternativasDaLinha(
  precos: PrecoCotado[],
  linha: Pick<LinhaCotacao, "item_id" | "unidade">,
  ordemFornecedores: string[],
  atual: string,
): { fornecedor_id: string; preco: number }[] {
  return precos
    .filter(
      (p) =>
        p.item_id === linha.item_id &&
        p.unidade === linha.unidade &&
        p.preco != null &&
        p.fornecedor_id !== atual &&
        ordemFornecedores.includes(p.fornecedor_id),
    )
    .map((p) => ({ fornecedor_id: p.fornecedor_id, preco: p.preco! }))
    .sort((a, b) => a.preco - b.preco || ordemFornecedores.indexOf(a.fornecedor_id) - ordemFornecedores.indexOf(b.fornecedor_id));
}

/** Lista para pedir preço aos fornecedores pelo WhatsApp. */
export function textoParaPedirPreco(linhas: LinhaCotacao[]): string {
  return [
    "*Cotação — Castelo Inn*",
    "",
    ...linhas.map((l) => `• ${formatarQtd(l.quantidade)} ${l.unidadeCompra} — ${descricaoDaLinha(l)}`),
  ].join("\n");
}

/** O pedido que vai para o fornecedor que ganhou, com o preço combinado. */
export function textoDoPedido(pedido: PedidoDoFornecedor): string {
  return [
    `*Pedido — Castelo Inn*`,
    "",
    ...pedido.itens.map(
      (i) => `• ${formatarQtd(i.linha.quantidade)} ${i.linha.unidadeCompra} — ${descricaoDaLinha(i.linha)} — ${formatarReais(i.preco)}`,
    ),
    "",
    `Total: ${formatarReais(pedido.total)}`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
//  IMPORTAR O ORÇAMENTO DO FORNECEDOR (.csv)
// ---------------------------------------------------------------------------

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** Nome para comparar: sem acento, maiúsculas, só letras e números. */
export const nomeParaComparar = (t: string) =>
  semAcento(t || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

/** Divide uma linha de .csv respeitando aspas ("a;b" é um campo só). */
function dividir(linha: string, sep: string): string[] {
  const campos: string[] = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const ch = linha[i];
    if (ch === '"') {
      if (aspas && linha[i + 1] === '"') { atual += '"'; i++; }
      else aspas = !aspas;
    } else if (ch === sep && !aspas) {
      campos.push(atual.trim());
      atual = "";
    } else atual += ch;
  }
  campos.push(atual.trim());
  return campos;
}

export interface LinhaDoOrcamento {
  produto: string;
  preco: number;
}

/**
 * Lê o orçamento: .csv com ";" (Excel em português), tabulação (copiado da
 * planilha) ou ",". Com cabeçalho, acha as colunas pelo nome (Produto/Item/
 * Descrição e Preço/Valor/Unitário); sem cabeçalho, o produto é a primeira
 * coluna com texto e o preço a última com número. Linha sem preço é ignorada.
 */
export function lerOrcamento(texto: string): { linhas: LinhaDoOrcamento[]; ignoradas: number } {
  const brutas = (texto || "").replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  if (brutas.length === 0) return { linhas: [], ignoradas: 0 };
  const sep = brutas.some((l) => l.includes(";")) ? ";" : brutas.some((l) => l.includes("\t")) ? "\t" : ",";
  const tabela = brutas.map((l) => dividir(l, sep));
  const cab = tabela[0].map((c) => nomeParaComparar(c));
  let colProduto = cab.findIndex((c) => /^(PRODUTO|ITEM|DESCRICAO|MATERIAL|NOME)/.test(c));
  let colPreco = cab.findIndex((c) => /(PRECO|VALOR|UNITARIO)/.test(c) && !/TOTAL/.test(c));
  const temCabecalho = colProduto >= 0 || colPreco >= 0;
  const dados = temCabecalho ? tabela.slice(1) : tabela;
  const linhas: LinhaDoOrcamento[] = [];
  let ignoradas = 0;
  for (const campos of dados) {
    let produto = colProduto >= 0 ? campos[colProduto] : campos.find((c) => /[a-zA-ZÀ-ú]/.test(c)) || "";
    let preco: number | null | undefined = null;
    if (colPreco >= 0) preco = lerPreco(campos[colPreco] || "");
    else {
      for (let i = campos.length - 1; i >= 0; i--) {
        const p = lerPreco(campos[i]);
        if (typeof p === "number" && campos[i] !== produto) { preco = p; break; }
      }
    }
    if (!produto.trim() || typeof preco !== "number") { ignoradas++; continue; }
    linhas.push({ produto: produto.trim(), preco });
  }
  return { linhas, ignoradas };
}

/** Quão parecido é o nome do orçamento com o da linha: 3 igual, 2 um contém o outro, 1 palavras em comum. */
/** Palavras que não ajudam a achar o produto. */
const PALAVRAS_SOLTAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "AO", "A", "O", "E", "COM", "C", "P", "PARA", "EM", "UN", "UND"]);

const palavrasDe = (t: string) =>
  nomeParaComparar(t)
    .split(" ")
    .filter((p) => p && !PALAVRAS_SOLTAS.has(p))
    // "50GR" e "50G", "1LT" e "1L" contam como a mesma medida.
    .map((p) => p.replace(/^(\d+)(GR|GRS)$/, "$1G").replace(/^(\d+)(LT|LTS)$/, "$1L"));

/** Quantas letras é preciso trocar para uma palavra virar a outra. */
function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * A palavra do orçamento vale pela do cadastro: igual, abreviada ("CHOC" =
 * "CHOCOLATE") ou com uma letra de diferença ("CHANTILY" = "CHANTILLY").
 * Número tem de ser igual: "AA" não é "AAA", "50G" não é "500G".
 */
function mesmaPalavra(a: string, b: string): boolean {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false;
  if (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  return Math.min(a.length, b.length) >= 5 && distancia(a, b) <= 1;
}

/**
 * Quão parecido é o nome do orçamento com o da cotação: 3 igual, 2 um contém o
 * outro, e abaixo disso a fração das palavras do nome MENOR que aparecem no
 * outro (aceitando abreviação). Fornecedor escreve "CHOC NESTLE SUFLAIR 50GR AO
 * LEITE" para o nosso "CHOCOLATE SUFLAIR 50G": as 3 palavras do nosso aparecem.
 */
function semelhanca(a: string, b: string): number {
  const x = nomeParaComparar(a);
  const y = nomeParaComparar(b);
  if (!x || !y) return 0;
  if (x === y) return 3;
  if (x.includes(y) || y.includes(x)) return 2;
  const pa = palavrasDe(a);
  const pb = palavrasDe(b);
  if (pa.length === 0 || pb.length === 0) return 0;
  const [menor, maior] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const achadas = menor.filter((p) => maior.some((q) => mesmaPalavra(p, q))).length;
  const fracao = achadas / menor.length;
  // Uma palavra só em comum não basta, e 3 de 4 é o mínimo: com menos,
  // "REFRESCO TANG LIMÃO" acharia o "REFRESCO TANG LARANJA". O que não for
  // achado a pessoa escolhe na prévia.
  if (achadas < Math.min(2, menor.length)) return 0;
  return fracao >= 0.75 ? Math.round(fracao * 100) / 100 : 0;
}

export interface Correspondencia {
  orcamento: LinhaDoOrcamento;
  /** A linha da cotação achada (ou escolhida); null = não achou. */
  chave: string | null;
  certeza: number;
}

/**
 * Acha cada linha do orçamento na cotação, pelo nome (o da cotação ou o do
 * cadastro). Cada linha da cotação recebe no máximo um preço: vale o mais parecido.
 */
export function casarOrcamento(orcamento: LinhaDoOrcamento[], linhas: LinhaCotacao[]): Correspondencia[] {
  const candidatos: { i: number; chave: string; certeza: number }[] = [];
  orcamento.forEach((o, i) => {
    for (const l of linhas) {
      const c = Math.max(semelhanca(o.produto, l.nome), semelhanca(o.produto, l.nomeCadastro));
      if (c > 0) candidatos.push({ i, chave: l.chave, certeza: c });
    }
  });
  candidatos.sort((a, b) => b.certeza - a.certeza);
  const r: Correspondencia[] = orcamento.map((o) => ({ orcamento: o, chave: null, certeza: 0 }));
  const usadas = new Set<string>();
  for (const c of candidatos) {
    if (r[c.i].chave || usadas.has(c.chave)) continue;
    r[c.i] = { ...r[c.i], chave: c.chave, certeza: c.certeza };
    usadas.add(c.chave);
  }
  return r;
}
