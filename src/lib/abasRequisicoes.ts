/**
 * Abas da lista de requisições e a busca única.
 *
 * As abas são a fila de trabalho: a tela abre no que precisa ser feito agora,
 * e o que já acabou sai do caminho (fica em Concluídas e em Todas). Só lógica
 * aqui, para poder testar.
 */

import { contemTexto, formatItemName, precisaLancar } from "@/lib/utils";

export type AbaRequisicoes = "A_FAZER" | "AGUARDANDO" | "A_LANCAR" | "CONCLUIDAS" | "TODAS";

export const ABA_PADRAO: AbaRequisicoes = "A_FAZER";

export interface OpcaoDeAba {
  aba: AbaRequisicoes;
  rotulo: string;
  /** Mostra quantas há. Concluídas e Todas crescem sem parar: o número só pesaria. */
  conta: boolean;
}

/** "A lançar" é do almoxarifado; para quem pede, "A fazer" vira "Em aberto". */
export function abasPara(ehAlmoxarifado: boolean): OpcaoDeAba[] {
  return [
    { aba: "A_FAZER", rotulo: ehAlmoxarifado ? "A fazer" : "Em aberto", conta: true },
    { aba: "AGUARDANDO", rotulo: "Aguardando", conta: true },
    ...(ehAlmoxarifado ? [{ aba: "A_LANCAR" as const, rotulo: "A lançar", conta: true }] : []),
    { aba: "CONCLUIDAS", rotulo: "Concluídas", conta: false },
    { aba: "TODAS", rotulo: "Todas", conta: false },
  ];
}

export const ehAba = (v: unknown): v is AbaRequisicoes =>
  v === "A_FAZER" || v === "AGUARDANDO" || v === "A_LANCAR" || v === "CONCLUIDAS" || v === "TODAS";

interface RequisicaoDaLista {
  status: string;
  lancado?: boolean | null;
  codigo_requisicao?: number | null;
  departamento?: string | null;
  usuario?: { nome?: string | null } | null;
  itens?: { item?: { nome?: string | null } | null }[] | null;
}

export function estaNaAba(r: RequisicaoDaLista, aba: AbaRequisicoes): boolean {
  switch (aba) {
    case "A_FAZER": return r.status === "PENDENTE" || r.status === "SEPARANDO";
    case "AGUARDANDO": return r.status === "AGUARDANDO";
    case "A_LANCAR": return !r.lancado && precisaLancar(r.status);
    case "CONCLUIDAS": return ["FINALIZADA", "RUPTURA_PARCIAL", "RUPTURA_TOTAL", "CANCELADA"].includes(r.status);
    default: return true;
  }
}

/** Atalhos do painel (?filter=pendente, ?lancamento=a_lancar) viram a aba certa. */
export function abaDoAtalho(filter: string | null, lancamento: string | null): AbaRequisicoes | null {
  if ((lancamento || "").toUpperCase() === "A_LANCAR") return "A_LANCAR";
  switch ((filter || "").toUpperCase()) {
    case "PENDENTE": case "SEPARANDO": return "A_FAZER";
    case "AGUARDANDO": return "AGUARDANDO";
    case "FINALIZADA": case "RUPTURAS": case "CANCELADA": return "CONCLUIDAS";
    case "TODAS": return "TODAS";
    default: return null;
  }
}

/** "72" ou "#72" é número da requisição (exato: 7 não traz a #17). */
export const numeroDaBusca = (termo: string): string | null => {
  const t = termo.trim();
  return /^#?\d+$/.test(t) ? t.replace("#", "") : null;
};

/** Busca única: número, item, setor ou quem pediu. */
export function casaComBusca(r: RequisicaoDaLista, termo: string): boolean {
  const t = termo.trim();
  if (!t) return true;
  const numero = numeroDaBusca(t);
  if (numero) return String(r.codigo_requisicao ?? "") === numero;
  return (
    contemTexto(r.departamento || "", t) ||
    contemTexto(r.usuario?.nome || "", t) ||
    (r.itens || []).some((l) => contemTexto(formatItemName(l.item?.nome ?? undefined), t))
  );
}
