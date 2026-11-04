/**
 * Estado dos itens da Lista de Reposição: Normal, Aguardando chegada, Urgente e,
 * por cima deles, "Em cotação".
 *
 * A cotação fica em colunas próprias (cotacao_lote, cotacao_em) e não mexe na
 * urgência nem no prazo: "voltar ao estado anterior" é só limpar essas colunas.
 * Só lógica aqui (nada grava), para poder testar.
 */

import { addDays, addWeeks, endOfDay } from "date-fns";
import { formatItemName, UNIDADE_PADRAO } from "@/lib/utils";
import { formatarQtd } from "@/lib/unidades";

export type ModalidadeReposicao = "NORMAL" | "URGENTE" | "AGUARDANDO";

export interface OpcaoDePrazo {
  prazo: string;
  rotulo: string;
}

export const PRAZOS_AGUARDANDO: OpcaoDePrazo[] = [
  { prazo: "Já Solicitado", rotulo: "Já pedido" },
  { prazo: "Hoje", rotulo: "Chega hoje" },
  { prazo: "2 a 3 dias", rotulo: "Chega em 2 a 3 dias" },
  { prazo: "1 semana", rotulo: "Chega em 1 semana" },
];

export const PRAZOS_URGENTE: OpcaoDePrazo[] = [
  { prazo: "Hoje", rotulo: "Prazo: hoje" },
  { prazo: "2 dias", rotulo: "Prazo: 2 dias" },
  { prazo: "3 dias", rotulo: "Prazo: 3 dias" },
  { prazo: "1 semana", rotulo: "Prazo: 1 semana" },
];

export interface CamposDeEstado {
  urgente: boolean;
  prazo_original: string | null;
  prazo_target_date: number | null;
}

/** Como cada estado é gravado na linha (o mesmo formato de sempre). */
export function camposDoEstado(
  modalidade: ModalidadeReposicao,
  prazo?: string,
  agora: Date = new Date(),
): CamposDeEstado {
  if (modalidade === "NORMAL") {
    return { urgente: false, prazo_original: null, prazo_target_date: null };
  }
  if (modalidade === "AGUARDANDO") {
    const p = prazo || "Já Solicitado";
    const alvo =
      p === "Hoje" ? endOfDay(agora)
      : p === "2 a 3 dias" ? addDays(agora, 3)
      : p === "1 semana" ? addWeeks(agora, 1)
      : null;
    return { urgente: false, prazo_original: `PEDIDO: ${p}`, prazo_target_date: alvo ? alvo.getTime() : null };
  }
  const p = prazo || "Hoje";
  const dias = p.match(/^(\d+) dias$/);
  const alvo =
    p === "1 semana" ? addWeeks(agora, 1)
    : dias ? addDays(agora, Number(dias[1]))
    : endOfDay(agora);
  return { urgente: true, prazo_original: p, prazo_target_date: alvo.getTime() };
}

interface LinhaComUnidade {
  quantidade: number;
  unidade?: string | null;
}

export interface GrupoParaCotacao {
  item_id: string;
  item?: { nome?: string; unidade?: string } | null;
  manual_items: LinhaComUnidade[];
  rupturas: LinhaComUnidade[];
}

/**
 * Linhas no formato da planilha de cotação (aba MODELO): PRODUTO, MARCA (em
 * branco), UND e QTD, separados por tabulação. Clica em B3, cola, e as quatro
 * colunas entram de uma vez. Material em duas unidades (1 UN + 2 CX) vira duas
 * linhas: a planilha tem uma unidade por linha.
 */
export function linhasParaCotacao(grupos: GrupoParaCotacao[]): string[] {
  const linhas: string[] = [];
  for (const g of grupos) {
    const nome = formatItemName(g.item?.nome) || "Item";
    const porUnidade = new Map<string, number>();
    for (const l of [...g.manual_items, ...g.rupturas]) {
      const un = (l.unidade || g.item?.unidade || UNIDADE_PADRAO).toUpperCase();
      porUnidade.set(un, (porUnidade.get(un) || 0) + (Number(l.quantidade) || 0));
    }
    for (const [un, qtd] of porUnidade) {
      linhas.push([nome, "", un, formatarQtd(qtd)].join("\t"));
    }
  }
  return linhas;
}

export interface LoteDeCotacao<G> {
  lote: string;
  em: string | null;
  grupos: G[];
}

/** Subgrupos da seção "Em cotação": uma cópia para a planilha, a mais nova primeiro. */
export function separarEmLotes<G extends { lote?: string | null; cotacao_em?: string | null }>(
  grupos: G[],
): LoteDeCotacao<G>[] {
  const lotes = new Map<string, LoteDeCotacao<G>>();
  for (const g of grupos) {
    if (!g.lote) continue;
    if (!lotes.has(g.lote)) lotes.set(g.lote, { lote: g.lote, em: g.cotacao_em ?? null, grupos: [] });
    lotes.get(g.lote)!.grupos.push(g);
  }
  return Array.from(lotes.values()).sort((a, b) => (b.em || "").localeCompare(a.em || ""));
}

export interface FotoDeEstado extends CamposDeEstado {
  id: string;
  cotacao_lote: string | null;
  cotacao_em: string | null;
}

/** O estado de agora das linhas desses itens, para o "Desfazer" devolver. */
export function fotografarEstado(
  linhas: {
    id: string;
    item_id: string;
    resolvido: boolean;
    urgente?: boolean;
    prazo_original?: string | null;
    prazo_target_date?: number | null;
    cotacao_lote?: string | null;
    cotacao_em?: string | null;
  }[],
  itemIds: string[],
): FotoDeEstado[] {
  const ids = new Set(itemIds);
  return linhas
    .filter((l) => !l.resolvido && ids.has(l.item_id))
    .map((l) => ({
      id: l.id,
      urgente: !!l.urgente,
      prazo_original: l.prazo_original ?? null,
      prazo_target_date: l.prazo_target_date ?? null,
      cotacao_lote: l.cotacao_lote ?? null,
      cotacao_em: l.cotacao_em ?? null,
    }));
}
