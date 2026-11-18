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

/** Uma linha da cotação: um material numa unidade (1 UN + 2 CX = duas linhas). */
export interface LinhaCotacao {
  chave: string;
  item_id: string;
  unidade: string;
  nome: string;
  quantidade: number;
  /** As linhas da reposição que ela junta: é nelas que o pedido grava. */
  ids: string[];
}

export const chaveDaLinha = (itemId: string, unidade: string) => `${itemId}|${unidade}`;

const unidadeDe = (l: LinhaDeReposicao) =>
  (l.unidade || l.item?.unidade || UNIDADE_PADRAO).trim().toUpperCase();

export function montarLinhas(linhas: LinhaDeReposicao[]): LinhaCotacao[] {
  const mapa = new Map<string, LinhaCotacao>();
  for (const l of linhas) {
    const unidade = unidadeDe(l);
    const chave = chaveDaLinha(l.item_id, unidade);
    if (!mapa.has(chave)) {
      mapa.set(chave, {
        chave,
        item_id: l.item_id,
        unidade,
        nome: formatItemName(l.item?.nome) || "Item",
        quantidade: 0,
        ids: [],
      });
    }
    const c = mapa.get(chave)!;
    c.quantidade = Math.round((c.quantidade + (Number(l.quantidade) || 0)) * 1000) / 1000;
    c.ids.push(l.id);
  }
  return Array.from(mapa.values()).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

/**
 * Lê o preço como a pessoa digita: "4,10", "4.10", "R$ 1.234,56", "1234.5".
 * Vazio = null (sem preço). Texto que não é número = undefined (inválido).
 */
export function lerPreco(texto: string): number | null | undefined {
  let t = (texto || "").replace(/r\$/i, "").replace(/\s/g, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, "");
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
    ...linhas.map((l) => `• ${formatarQtd(l.quantidade)} ${l.unidade} — ${l.nome}`),
  ].join("\n");
}

/** O pedido que vai para o fornecedor que ganhou, com o preço combinado. */
export function textoDoPedido(pedido: PedidoDoFornecedor): string {
  return [
    `*Pedido — Castelo Inn*`,
    "",
    ...pedido.itens.map(
      (i) => `• ${formatarQtd(i.linha.quantidade)} ${i.linha.unidade} — ${i.linha.nome} (${formatarReais(i.preco)})`,
    ),
    "",
    `Total: ${formatarReais(pedido.total)}`,
  ].join("\n");
}
