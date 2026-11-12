import type { Item } from "@/types";
import { contemTexto } from "@/lib/utils";

/** Uma linha do pedido em construção (Nova Requisição / Editar). */
export type LinhaPedido = {
  item_id: string;
  quantidade: number;
  unidade: string;
  item?: Item;
};

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Materiais para a busca da Nova Requisição. Sem texto: todos, em ordem
 * alfabética (o "ver todos"). Com texto: os que têm todas as palavras, e
 * primeiro os que COMEÇAM com o que foi digitado — "sab" mostra "Sabão em pó"
 * antes de "Esponja com sabão".
 */
export const buscarItens = (itens: Item[], busca: string): Item[] => {
  const termo = busca.trim();
  const porNome = (a: Item, b: Item) => a.nome.localeCompare(b.nome, "pt-BR");
  if (!termo) return [...itens].sort(porNome);
  const inicio = semAcento(termo);
  return itens
    .filter((i) => contemTexto(i.nome, termo))
    .sort((a, b) => {
      const ca = semAcento(a.nome).startsWith(inicio) ? 0 : 1;
      const cb = semAcento(b.nome).startsWith(inicio) ? 0 : 1;
      return ca - cb || porNome(a, b);
    });
};

/**
 * Põe o material no pedido. Mesmo material na mesma unidade soma na linha que
 * já existe; em outra unidade é outra linha (2 CX + 3 UN). Devolve a lista nova
 * e a posição da linha mexida (para destacá-la).
 */
export const adicionarAoPedido = (
  linhas: LinhaPedido[],
  nova: LinhaPedido,
): { linhas: LinhaPedido[]; posicao: number } => {
  const posicao = linhas.findIndex((l) => l.item_id === nova.item_id && l.unidade === nova.unidade);
  if (posicao < 0) return { linhas: [...linhas, nova], posicao: linhas.length };
  const soma = Math.round((linhas[posicao].quantidade + nova.quantidade) * 1000) / 1000;
  return {
    linhas: linhas.map((l, i) => (i === posicao ? { ...l, quantidade: soma } : l)),
    posicao,
  };
};

/** O que já está no pedido deste material, para mostrar na busca ("2 UN · 1 CX"). */
export const jaNoPedido = (linhas: LinhaPedido[], itemId: string): string =>
  linhas
    .filter((l) => l.item_id === itemId)
    .map((l) => `${l.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} ${l.unidade}`)
    .join(" · ");
