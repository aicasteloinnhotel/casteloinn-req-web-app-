import type { Item, RequisicaoItemComDetalhes } from "@/types";
import { UNIDADE_PADRAO, unidadeDoItem } from "@/lib/utils";

/**
 * Unidades oferecidas no cadastro de itens. Uma unidade vinda de planilha que
 * não esteja aqui continua valendo e aparece junto nos seletores.
 */
export const UNIDADES_CADASTRO: { valor: string; rotulo: string }[] = [
  { valor: "UN", rotulo: "Unidade" },
  { valor: "CX", rotulo: "Caixa" },
  { valor: "PCT", rotulo: "Pacote" },
  { valor: "KG", rotulo: "Quilo" },
  { valor: "G", rotulo: "Grama" },
  { valor: "LT", rotulo: "Litro" },
  { valor: "ML", rotulo: "Mililitro" },
  { valor: "FR", rotulo: "Frasco" },
  { valor: "RL", rotulo: "Rolo" },
  { valor: "FD", rotulo: "Fardo" },
  { valor: "BD", rotulo: "Balde" },
  { valor: "CART", rotulo: "Cartela" },
  { valor: "GL", rotulo: "Galão" },
  { valor: "GF", rotulo: "Garrafa" },
  { valor: "DZ", rotulo: "Dúzia" },
  { valor: "PAR", rotulo: "Par" },
];

/** Nome por extenso da unidade, quando conhecido ("KG" → "Quilo"). */
export const rotuloUnidade = (u: string): string =>
  UNIDADES_CADASTRO.find((x) => x.valor === u)?.rotulo ?? u;

const limpar = (lista: (string | null | undefined)[]): string[] => {
  const saida: string[] = [];
  for (const bruto of lista) {
    const u = (bruto || "").trim().toUpperCase();
    if (u && !saida.includes(u)) saida.push(u);
  }
  return saida;
};

/**
 * Unidades em que o material pode ser pedido. Item antigo, de antes da lista
 * existir, fica só com a unidade que tinha.
 */
export const unidadesDoItem = (item?: Pick<Item, "unidade" | "unidades"> | null): string[] => {
  const lista = limpar([...(item?.unidades || []), item?.unidade]);
  return lista.length > 0 ? lista : [UNIDADE_PADRAO];
};

/**
 * Unidades que o seletor de uma linha deve oferecer: as do cadastro e, se a
 * linha já está numa unidade fora da lista (pedido antigo), ela também — senão
 * o seletor trocaria a unidade sozinho.
 */
export const opcoesDeUnidade = (
  item: Pick<Item, "unidade" | "unidades"> | null | undefined,
  ...extras: (string | null | undefined)[]
): string[] => limpar([...unidadesDoItem(item), ...extras]);

/** Unidade em que a linha foi ENTREGUE. Sem registro, é a mesma do pedido. */
export const unidadeEntregue = (
  linha?: Pick<RequisicaoItemComDetalhes, "unidade" | "unidade_separada" | "item"> | null,
): string => (linha?.unidade_separada || "").trim().toUpperCase() || unidadeDoItem(linha);

/** Quanto voltou ao almoxarifado depois da entrega (0 sem devolução). */
export const quantidadeDevolvida = (
  linha?: Pick<RequisicaoItemComDetalhes, "quantidade_devolvida"> | null,
): number => Number(linha?.quantidade_devolvida) || 0;

/**
 * O que SAIU de verdade: entregue menos o que voltou (5 KG − 1,2 KG = 3,8 KG).
 * É isto que vai para o TOTVS, o comprovante e os relatórios.
 */
export const quantidadeQueSaiu = (
  linha?: Pick<RequisicaoItemComDetalhes, "quantidade_separada" | "quantidade_devolvida"> | null,
): number =>
  Math.max(0, Math.round(((Number(linha?.quantidade_separada) || 0) - quantidadeDevolvida(linha)) * 1000) / 1000);

/** Quantidade no formato brasileiro, como o TOTVS espera: 6,2 e não 6.2. */
export const formatarQtd = (n: number | null | undefined): string =>
  Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

export type ResultadoSeparacao =
  | { situacao: "completo" }
  | { situacao: "falta"; faltante: number }
  | { situacao: "excedente"; excedente: number }
  /** Entregue em outra unidade (pedido 5 UN, entregue 6,2 KG): conta como atendido. */
  | { situacao: "outra_unidade" };

/**
 * Compara o que foi pedido com o que foi separado.
 *
 * Na mesma unidade, a conta é direta. Em unidade diferente não há como
 * comparar (5 UN de carne contra 6,2 KG), então vale o que o almoxarifado
 * decidiu entregar: qualquer quantidade maior que zero atende a linha, e zero
 * é falta do pedido inteiro, na unidade em que foi pedido.
 */
export const avaliarSeparacao = (
  solicitado: number,
  unidadeSolicitada: string,
  separado: number,
  unidadeSeparada?: string | null,
): ResultadoSeparacao => {
  const pedida = (unidadeSolicitada || "").trim().toUpperCase();
  const entregue = (unidadeSeparada || "").trim().toUpperCase() || pedida;
  const sol = Number(solicitado) || 0;
  const sep = Number(separado) || 0;

  if (entregue !== pedida) {
    return sep > 0 ? { situacao: "outra_unidade" } : { situacao: "falta", faltante: sol };
  }
  if (sep < sol) return { situacao: "falta", faltante: Math.round((sol - sep) * 1000) / 1000 };
  if (sep > sol) return { situacao: "excedente", excedente: Math.round((sep - sol) * 1000) / 1000 };
  return { situacao: "completo" };
};
