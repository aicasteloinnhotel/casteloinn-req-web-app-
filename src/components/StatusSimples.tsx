import React from "react";
import { Check } from "lucide-react";
import { COR_DO_TOM, PASSOS, situacaoParaSolicitante } from "@/lib/statusSolicitante";

/** Etiqueta do status em linguagem simples ("Enviado", "Separando", "Entregue"). */
export function EtiquetaStatus({ status, className = "" }: { status: string; className?: string }) {
  const s = situacaoParaSolicitante(status);
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-bold whitespace-nowrap ${COR_DO_TOM[s.tom].etiqueta} ${className}`}
    >
      {s.etiqueta}
    </span>
  );
}

/**
 * Linha de progresso: Enviado → Separando → Entregue. Mostra em que ponto o
 * pedido está sem a pessoa precisar entender o nome técnico do status.
 */
export function ProgressoDoPedido({ status }: { status: string }) {
  const s = situacaoParaSolicitante(status);
  if (s.passo === 0) return null;
  const cor = COR_DO_TOM[s.tom].barra;
  return (
    <ol className="flex items-start" aria-label="Andamento do pedido">
      {PASSOS.map((rotulo, i) => {
        const n = i + 1;
        // Passo alcançado = feito (o pedido JÁ foi enviado, JÁ está separando).
        // O atual ganha um anel na cor do status, para o olho achar onde está.
        const feito = n <= s.passo;
        const atual = n === s.passo;
        return (
          <li key={rotulo} className="flex-1 flex flex-col items-center relative" aria-current={atual ? "step" : undefined}>
            {/* traço até o próximo passo */}
            {i < PASSOS.length - 1 && (
              <span
                className={`absolute top-3.5 left-1/2 w-full h-1 rounded-full ${n < s.passo ? cor : "bg-slate-200"}`}
                aria-hidden
              />
            )}
            <span
              className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-black ${
                feito ? `${cor} border-transparent text-white` : "bg-white border-slate-200 text-slate-400"
              } ${atual && s.passo < 3 ? `ring-4 ${COR_DO_TOM[s.tom].anel}` : ""}`}
            >
              {feito ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
            </span>
            <span className={`mt-1.5 text-xs font-bold ${atual || feito ? "text-slate-800" : "text-slate-400"}`}>{rotulo}</span>
          </li>
        );
      })}
    </ol>
  );
}
