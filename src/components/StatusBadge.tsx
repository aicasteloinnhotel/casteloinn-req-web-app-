import React from "react";

/** Cor de cada status. A mesma em todas as telas. */
const COR: Record<string, string> = {
  PENDENTE: "bg-yellow-100 text-yellow-800",
  AGUARDANDO: "bg-amber-100 text-amber-800",
  SEPARANDO: "bg-teal-100 text-teal-800",
  FINALIZADA: "bg-emerald-100 text-emerald-800",
  CANCELADA: "bg-red-100 text-red-800",
  RUPTURA: "bg-orange-100 text-orange-800",
};

const TAMANHO = {
  /** Cartões da lista, onde o espaço é curto. */
  sm: "text-[10px] px-2 py-0.5",
  /** Tela da requisição aberta, alinhado às outras pílulas de lá. */
  md: "text-xs px-2 py-1",
};

/**
 * Pílula do status da requisição.
 *
 * Existia uma versão na lista (pílula colorida) e outra no detalhe (texto
 * solto), e as duas se desencontravam. Agora as duas telas usam esta.
 *
 * Ruptura sai como duas pílulas — FINALIZADA + RUPTURA PARCIAL/TOTAL — porque
 * a entrega aconteceu; o que faltou está na requisição complementar.
 */
export function StatusBadge({
  status,
  tamanho = "sm",
}: {
  status: string;
  tamanho?: keyof typeof TAMANHO;
}) {
  const base = `${TAMANHO[tamanho]} rounded-full font-bold uppercase whitespace-nowrap`;

  if (status === "RUPTURA_PARCIAL" || status === "RUPTURA_TOTAL") {
    return (
      <>
        <span className={`${base} ${COR.FINALIZADA}`}>FINALIZADA</span>
        <span className={`${base} ${COR.RUPTURA}`}>{status.replace("_", " ")}</span>
      </>
    );
  }

  return (
    <span className={`${base} ${COR[status] ?? "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}
