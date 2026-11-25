/**
 * O status da requisição na língua de quem pediu.
 *
 * "PENDENTE", "SEPARANDO" e "RUPTURA_PARCIAL" são palavras do almoxarifado. Quem
 * pede só quer saber três coisas: já viram? está sendo separado? já posso
 * buscar / já chegou? Aqui cada status vira uma frase curta, uma cor e um passo
 * de uma linha de progresso (Enviado → Separando → Entregue).
 */

export type TomDoStatus = "espera" | "andamento" | "pronto" | "atencao" | "cancelado";

export interface SituacaoParaSolicitante {
  /** Curto, para a etiqueta da lista: "Enviado", "Separando"... */
  etiqueta: string;
  /** A frase do topo da tela do pedido. */
  titulo: string;
  /** Uma linha explicando o que acontece agora. */
  descricao: string;
  /** Passo na linha de progresso: 1 enviado, 2 separando, 3 entregue. 0 = fora dela (cancelado). */
  passo: 0 | 1 | 2 | 3;
  tom: TomDoStatus;
  /** Ainda vai acontecer algo (para a tela inicial mostrar "em andamento"). */
  emAndamento: boolean;
}

export const PASSOS = ["Enviado", "Separando", "Entregue"] as const;

export function situacaoParaSolicitante(status: string): SituacaoParaSolicitante {
  switch (status) {
    case "PENDENTE":
      return {
        etiqueta: "Enviado",
        titulo: "Pedido enviado",
        descricao: "O almoxarifado ainda não começou. Dá para editar ou cancelar.",
        passo: 1,
        tom: "espera",
        emAndamento: true,
      };
    case "SEPARANDO":
      return {
        etiqueta: "Separando",
        titulo: "Sendo separado",
        descricao: "O almoxarifado está separando os seus itens.",
        passo: 2,
        tom: "andamento",
        emAndamento: true,
      };
    case "AGUARDANDO":
      return {
        etiqueta: "Esperando chegar",
        titulo: "Esperando o material chegar",
        descricao: "Estes itens faltaram no estoque. Quando chegarem, são entregues.",
        passo: 2,
        tom: "atencao",
        emAndamento: true,
      };
    case "FINALIZADA":
      return {
        etiqueta: "Entregue",
        titulo: "Entregue",
        descricao: "Tudo foi entregue.",
        passo: 3,
        tom: "pronto",
        emAndamento: false,
      };
    case "RUPTURA_PARCIAL":
      return {
        etiqueta: "Entregue em parte",
        titulo: "Entregue em parte",
        descricao: "Faltou algum item. O que faltou vem depois, num pedido complementar.",
        passo: 3,
        tom: "atencao",
        emAndamento: false,
      };
    case "RUPTURA_TOTAL":
      return {
        etiqueta: "Faltou tudo",
        titulo: "Nada estava no estoque",
        descricao: "Os itens vêm depois, num pedido complementar.",
        passo: 3,
        tom: "atencao",
        emAndamento: false,
      };
    case "CANCELADA":
      return {
        etiqueta: "Cancelado",
        titulo: "Pedido cancelado",
        descricao: "Este pedido não será atendido.",
        passo: 0,
        tom: "cancelado",
        emAndamento: false,
      };
    default:
      return { etiqueta: status, titulo: status, descricao: "", passo: 1, tom: "espera", emAndamento: true };
  }
}

/** Cores de cada tom: a mesma família das pílulas que o app já usa. */
export const COR_DO_TOM: Record<TomDoStatus, { etiqueta: string; icone: string; barra: string; anel: string }> = {
  espera: { etiqueta: "bg-yellow-100 text-yellow-900 border-yellow-200", icone: "bg-yellow-100 text-yellow-800", barra: "bg-yellow-400", anel: "ring-yellow-100" },
  andamento: { etiqueta: "bg-teal-100 text-teal-900 border-teal-200", icone: "bg-teal-100 text-teal-700", barra: "bg-teal-500", anel: "ring-teal-100" },
  pronto: { etiqueta: "bg-emerald-100 text-emerald-900 border-emerald-200", icone: "bg-emerald-100 text-emerald-700", barra: "bg-emerald-500", anel: "ring-emerald-100" },
  atencao: { etiqueta: "bg-orange-100 text-orange-900 border-orange-200", icone: "bg-orange-100 text-orange-700", barra: "bg-orange-400", anel: "ring-orange-100" },
  cancelado: { etiqueta: "bg-slate-100 text-slate-700 border-slate-200", icone: "bg-slate-100 text-slate-500", barra: "bg-slate-300", anel: "ring-slate-100" },
};
