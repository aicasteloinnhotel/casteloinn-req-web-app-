/**
 * Etapas da compra na Lista de Reposição: A comprar → Em cotação → Aguardando
 * entrega → (chegou: Histórico). Urgente não é etapa: é uma marca do item, que
 * o põe no topo da etapa em que ele está.
 *
 * Tudo vem das colunas que já existem (nada de SQL):
 * - Em cotação: tem cotacao_lote.
 * - Aguardando: prazo_original "PEDIDO: ..." (ou os antigos "PEDIDO"/"AGUARDANDO").
 * - A comprar: o resto.
 * Só lógica aqui (nada grava), para poder testar.
 */

export type EtapaReposicao = "COMPRAR" | "COTACAO" | "AGUARDANDO";

/** `curto` vai nas abas do celular, para as três caberem numa linha. */
export const ETAPAS: { etapa: EtapaReposicao; rotulo: string; curto: string }[] = [
  { etapa: "COMPRAR", rotulo: "A comprar", curto: "A comprar" },
  { etapa: "COTACAO", rotulo: "Em cotação", curto: "Cotação" },
  { etapa: "AGUARDANDO", rotulo: "Aguardando entrega", curto: "Aguardando" },
];

export const ehEtapa = (v: unknown): v is EtapaReposicao =>
  v === "COMPRAR" || v === "COTACAO" || v === "AGUARDANDO";

interface GrupoComEstado {
  modalidade: "NORMAL" | "URGENTE" | "AGUARDANDO";
  lote?: string | null;
  prazo_original?: string | null;
  prazo_target_date?: number | null;
  item?: { nome?: string } | null;
}

export const etapaDoGrupo = (g: GrupoComEstado): EtapaReposicao =>
  g.lote ? "COTACAO" : g.modalidade === "AGUARDANDO" ? "AGUARDANDO" : "COMPRAR";

/** Urgente só vale antes do pedido: depois, o que importa é a previsão. */
export const ehUrgente = (g: GrupoComEstado): boolean =>
  g.modalidade === "URGENTE" && etapaDoGrupo(g) !== "AGUARDANDO";

const nome = (g: GrupoComEstado) => g.item?.nome || "";
const prazo = (g: GrupoComEstado) => g.prazo_target_date ?? Number.POSITIVE_INFINITY;

/**
 * Ordem dentro da etapa. A comprar e Em cotação: urgentes primeiro (o prazo
 * mais curto antes), depois por nome. Aguardando: o que chega antes primeiro.
 */
export function ordenarNaEtapa<G extends GrupoComEstado>(grupos: G[], etapa: EtapaReposicao): G[] {
  return [...grupos].sort((a, b) => {
    if (etapa === "AGUARDANDO") {
      return prazo(a) - prazo(b) || nome(a).localeCompare(nome(b), "pt-BR");
    }
    const ua = ehUrgente(a) ? 0 : 1;
    const ub = ehUrgente(b) ? 0 : 1;
    if (ua !== ub) return ua - ub;
    if (ua === 0 && prazo(a) !== prazo(b)) return prazo(a) - prazo(b);
    return nome(a).localeCompare(nome(b), "pt-BR");
  });
}

/** Etiqueta do item urgente: "Urgente · hoje", "Urgente · 2 dias", "Urgente · atrasado". */
export function rotuloDaUrgencia(g: GrupoComEstado, agora: number): string {
  if (g.prazo_target_date && g.prazo_target_date < agora) return "Urgente · atrasado";
  const p = (g.prazo_original || "").trim();
  return p ? `Urgente · ${p.toLowerCase()}` : "Urgente";
}

/** Etiqueta da previsão de quem já foi pedido. */
export function rotuloDaPrevisao(g: GrupoComEstado, agora: number): string {
  if (g.prazo_target_date && g.prazo_target_date < agora) return "Atrasado";
  const p = (g.prazo_original || "").replace(/^PEDIDO:?\s*/i, "").replace(/^AGUARDANDO:?\s*/i, "").trim();
  if (!p || /j[áa] solicitado/i.test(p)) return "Já pedido";
  if (p === "Hoje") return "Chega hoje";
  return `Chega em ${p}`;
}
