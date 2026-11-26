import React, { useState } from "react";
import { format, parseISO } from "date-fns";
import { Check, Flame, PackageMinus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Churrasco, Requisicao } from "@/types";
import { toast } from "@/lib/toast";
import { formatarQtd } from "@/lib/unidades";
import { salvarTarefasChurrasco } from "@/services/api";
import {
  etapaDoChurrasco, kgDeCarne, marcarTarefa, sugestaoCarneKg, type EtapaChurrasco, type TarefaChurrasco,
} from "@/lib/churrasco";

const PASSOS: { etapa: EtapaChurrasco; rotulo: string }[] = [
  { etapa: "SEPARAR", rotulo: "Separar e conferir" },
  { etapa: "VOLTA", rotulo: "Contar a volta" },
  { etapa: "LANCAR", rotulo: "Lançar" },
];
const ORDEM: EtapaChurrasco[] = ["SEPARAR", "VOLTA", "LANCAR", "PRONTO"];

/**
 * A ficha do churrasco no topo da requisição, enquanto ela não foi lançada:
 * dados do evento, em que passo está e as tarefas de antes e depois. Lançada,
 * a ficha some e a requisição fica igual às outras.
 */
export function FichaChurrasco({
  churrasco, req, podeMexer, nomeUsuario, aoContarVolta, aoReabrirVolta, aoMudar, ocupado,
}: {
  churrasco: Churrasco;
  req: Requisicao;
  /** Almoxarifado: marca tarefas e conta a volta. */
  podeMexer: boolean;
  nomeUsuario: string;
  aoContarVolta: () => void;
  aoReabrirVolta: () => void;
  aoMudar: (c: Churrasco) => void;
  ocupado?: boolean;
}) {
  const etapa = etapaDoChurrasco(req.status, req.lancado, churrasco.volta_conferida_em);
  const [salvando, setSalvando] = useState<number | null>(null);
  const atual = ORDEM.indexOf(etapa);
  const sug = sugestaoCarneKg(churrasco.pax || 0, churrasco.tipo);
  // Antes da entrega, o pedido; depois, o peso que de fato saiu (peso real).
  const entregue = etapa !== "SEPARAR";
  const kgPedido = kgDeCarne(
    (req.itens || []).map((l) =>
      entregue
        ? { item_id: l.item_id, nome: l.item?.nome, quantidade: Number(l.quantidade_separada ?? 0), unidade: l.unidade_separada || l.unidade || l.item?.unidade }
        : { item_id: l.item_id, nome: l.item?.nome, quantidade: Number(l.quantidade), unidade: l.unidade || l.item?.unidade },
    ),
    churrasco.grupos,
  );

  const alternar = async (indice: number, feito: boolean) => {
    const novas = marcarTarefa(churrasco.tarefas as TarefaChurrasco[], indice, feito, nomeUsuario);
    const antes = churrasco;
    aoMudar({ ...churrasco, tarefas: novas });
    setSalvando(indice);
    try {
      await salvarTarefasChurrasco(churrasco.requisicao_id, novas);
    } catch (e: any) {
      aoMudar(antes);
      toast.error(e?.message || "Não foi possível salvar a tarefa.");
    } finally {
      setSalvando(null);
    }
  };

  const listaDeTarefas = (fase: "ANTES" | "DEPOIS", titulo: string) => {
    const itens = churrasco.tarefas.map((t, i) => ({ t, i })).filter(({ t }) => t.fase === fase);
    if (itens.length === 0) return null;
    const feitas = itens.filter(({ t }) => t.feito_em).length;
    return (
      <div>
        <p className="mb-1 flex items-baseline gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500">
          {titulo} <span className="font-semibold text-slate-400">· {feitas}/{itens.length}</span>
        </p>
        <ul className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
          {itens.map(({ t, i }) => {
            const feito = !!t.feito_em;
            return (
              <li key={i}>
                <button
                  type="button"
                  disabled={!podeMexer || salvando === i}
                  onClick={() => alternar(i, !feito)}
                  className={`w-full min-h-11 flex items-center gap-3 px-3 py-2 text-left transition-colors ${
                    podeMexer ? "hover:bg-teal-50/60" : "cursor-default"
                  } ${feito ? "bg-teal-50/40" : ""}`}
                >
                  <span className={`h-5 w-5 shrink-0 rounded-md border flex items-center justify-center ${
                    feito ? "border-teal-600 bg-teal-600 text-white" : "border-slate-300 bg-white"
                  }`}>
                    {feito && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className={`min-w-0 flex-1 text-sm font-semibold ${feito ? "text-slate-500 line-through decoration-slate-300" : "text-slate-800"}`}>
                    {t.nome}
                  </span>
                  {feito && t.feito_por && (
                    <span className="shrink-0 text-[11px] text-slate-400 tabular-nums">
                      {t.feito_por.split(" ")[0]} {t.feito_em ? format(new Date(t.feito_em), "HH:mm") : ""}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 overflow-hidden print:hidden">
      {/* Cabeçalho: o evento, como no topo da planilha. */}
      <div className="bg-teal-900 text-white p-3 sm:p-4">
        <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-teal-100/90">
          <Flame className="h-3.5 w-3.5" /> Churrasco
        </p>
        <p className="text-lg font-black leading-tight break-words">{churrasco.empresa}</p>
        <p className="mt-0.5 text-xs text-teal-100/90 tabular-nums">
          {churrasco.data_evento ? format(parseISO(churrasco.data_evento), "dd/MM/yyyy") : "sem data"}
          {churrasco.horario ? ` · ${churrasco.horario}` : ""}
          {churrasco.pax ? ` · ${churrasco.pax} PAX` : ""}
          {` · churrasco ${churrasco.tipo === "GRANDE" ? "grande" : "pequeno"}`}
        </p>
        {(sug > 0 || kgPedido > 0) && (
          <p className="mt-1 text-xs text-teal-50">
            Carne {entregue ? "separada" : "na ficha"}: <strong>{formatarQtd(kgPedido)} kg</strong>
            {sug > 0 && <span className="text-teal-100/80"> · sugerida: {formatarQtd(sug)} kg</span>}
          </p>
        )}
      </div>

      <div className="p-3 sm:p-4 space-y-4">
        {/* Passos: onde está e o que falta. */}
        <ol className="grid grid-cols-3 gap-1.5">
          {PASSOS.map((p, i) => {
            const feito = atual > ORDEM.indexOf(p.etapa);
            const agora = etapa === p.etapa;
            return (
              <li
                key={p.etapa}
                className={`rounded-lg border px-2 py-1.5 text-center text-[11px] font-bold leading-tight ${
                  agora ? "border-teal-600 bg-teal-600 text-white" : feito ? "border-teal-200 bg-teal-50 text-teal-800" : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {feito && <Check className="inline h-3 w-3 mr-0.5 -mt-0.5" strokeWidth={3} />}
                {i + 1}. {p.rotulo}
              </li>
            );
          })}
        </ol>

        {etapa === "SEPARAR" && (
          <p className="text-xs text-slate-600">
            Separe pela tela de Separação. O gerente confere os itens e assina como quem recebe.
          </p>
        )}

        {etapa === "VOLTA" && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-2">
            <p className="text-sm font-bold text-violet-900">Depois do evento: busque e conte as bebidas que voltaram.</p>
            <p className="text-xs text-violet-800">O lançamento no TOTVS só é liberado depois dessa contagem.</p>
            {podeMexer && (
              <Button
                onClick={aoContarVolta}
                disabled={ocupado}
                className="w-full h-12 bg-violet-700 hover:bg-violet-800 text-white font-bold"
              >
                <PackageMinus className="h-5 w-5 mr-2" /> Contar a volta das bebidas
              </Button>
            )}
          </div>
        )}

        {etapa === "LANCAR" && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <p className="text-xs font-semibold text-emerald-900">
              Volta contada{churrasco.volta_conferida_em ? ` em ${format(new Date(churrasco.volta_conferida_em), "dd/MM 'às' HH:mm")}` : ""}.
              Já pode lançar no TOTVS pelo botão Lançar, no topo.
            </p>
            {podeMexer && (
              <button
                type="button"
                onClick={aoReabrirVolta}
                disabled={ocupado}
                className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800 underline underline-offset-2"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reabrir contagem
              </button>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {listaDeTarefas("ANTES", "Antes do evento")}
          {listaDeTarefas("DEPOIS", "Depois do evento")}
        </div>
      </div>
    </section>
  );
}
