import type { Item, Requisicao } from "@/types";
import { formatItemName, quantidadeEfetiva, unidadeDoItem, UNIDADE_PADRAO } from "@/lib/utils";

const ENTREGUE = new Set(["FINALIZADA", "RUPTURA_PARCIAL", "RUPTURA_TOTAL"]);

export type Saida = {
  item_id: string;
  nome: string;
  unidade: string;
  valor: number;
};

/**
 * Quanto saiu de cada material, para a Curva ABC e o ranking de saída.
 *
 * Existiam três cópias desta conta (tela de Itens duas vezes e o Dashboard),
 * todas com o mesmo defeito: somavam unidades diferentes — 3 UN + 2 CX viravam
 * "5" — e liam `quantidade_separada !== undefined`, que é verdadeiro para o
 * `null` que vem do banco. Agora é uma conta só:
 *
 *  - requisição cancelada não conta;
 *  - entregue conta o que foi separado; em aberto conta o que foi pedido;
 *  - cada unidade é uma linha própria;
 *  - `catalogo`, quando informado, entra com zero para aparecer quem nunca saiu.
 */
export function calcularSaidas(
  requisicoes: Requisicao[],
  opcoes: { catalogo?: Item[]; de?: Date | null; ate?: Date | null } = {},
): Saida[] {
  const saidas = new Map<string, Saida>();
  const chave = (item_id: string, unidade: string) => `${item_id}|${unidade}`;

  for (const item of opcoes.catalogo || []) {
    const unidade = (item.unidade || UNIDADE_PADRAO).toUpperCase();
    saidas.set(chave(item.id, unidade), {
      item_id: item.id,
      nome: formatItemName(item.nome) || "Item",
      unidade,
      valor: 0,
    });
  }

  const inicio = opcoes.de?.getTime();
  const fim = opcoes.ate?.getTime();

  for (const r of requisicoes) {
    if (r.status === "CANCELADA") continue;
    const quando = new Date(r.created_at).getTime();
    if (inicio !== undefined && quando < inicio) continue;
    if (fim !== undefined && quando > fim) continue;

    const entregue = ENTREGUE.has(r.status);
    for (const linha of r.itens || []) {
      const item_id = linha.item?.id || linha.item_id;
      if (!item_id) continue;
      const unidade = unidadeDoItem(linha).toUpperCase();
      const k = chave(item_id, unidade);
      const atual = saidas.get(k) || {
        item_id,
        nome: formatItemName(linha.item?.nome) || "Item",
        unidade,
        valor: 0,
      };
      atual.valor += quantidadeEfetiva(linha, entregue);
      saidas.set(k, atual);
    }
  }

  // O zero do catálogo serve para mostrar quem nunca saiu. Se o material saiu
  // em outra unidade (cadastrado em RL, pedido em UN), a linha "0 RL" logo
  // abaixo de "4 UN" só confundia.
  const tiveramSaida = new Set(
    Array.from(saidas.values()).filter((s) => s.valor > 0).map((s) => s.item_id),
  );

  return Array.from(saidas.values())
    .filter((s) => s.valor > 0 || !tiveramSaida.has(s.item_id))
    .map((s) => ({ ...s, valor: Math.round(s.valor * 1000) / 1000 }))
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome));
}
