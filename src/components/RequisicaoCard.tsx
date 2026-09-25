import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { ChevronRight, Lock, ClipboardCheck, ClipboardList } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Requisicao } from "@/types";
import { isLockAtivo } from "@/services/api";
import { StatusBadge } from "@/components/StatusBadge";
import { precisaLancar } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

export const RequisicaoCard = React.memo(({ req }: { req: Requisicao }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  // A trava expira: sem checar o tempo, uma separação abandonada deixava o
  // selo "Em Atendimento" na lista para sempre.
  const isLockedByOther =
    !!req.locked_by && req.locked_by !== user?.id && isLockAtivo(req.locked_at);

  // Entregue e lançada no TOTVS são coisas diferentes: a requisição só sai
  // mesmo do radar depois de lançada, e é isso que esta pílula mostra.
  // Só para o almoxarifado: para quem pediu, "A LANÇAR" parecia uma pendência
  // dele (o seletor de lançamento da lista já era escondido pelo mesmo motivo).
  const mostraLancamento =
    user?.perfil === "ALMOXARIFADO" && (precisaLancar(req.status) || !!req.lancado);
  const pilulaLancamento = !mostraLancamento ? null : req.lancado ? (
    <span className="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1 whitespace-nowrap">
      <ClipboardCheck className="w-3 h-3 shrink-0" /> LANÇADA
    </span>
  ) : (
    <span className="bg-amber-100 text-amber-800 border border-amber-200 text-[10px] px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1 whitespace-nowrap">
      <ClipboardList className="w-3 h-3 shrink-0" /> A LANÇAR
    </span>
  );

  return (
    <Card 
      className={`border-none shadow-lg shadow-slate-200/50 bg-white cursor-pointer hover:shadow-md transition-all hover:ring-2 hover:ring-teal-500/50 ${
        req.status === 'PENDENTE' ? 'border-l-4 border-l-yellow-400' : 
        req.status === 'AGUARDANDO' ? 'border-l-4 border-l-amber-500' : 
        req.status === 'SEPARANDO' ? 'border-l-4 border-l-teal-400' : 
        req.status === 'FINALIZADA' ? 'border-l-4 border-l-emerald-400' : 
        req.status === 'CANCELADA' ? 'border-l-4 border-l-red-400' : 
        (req.status === 'RUPTURA_PARCIAL' || req.status === 'RUPTURA_TOTAL') ? 'border-l-4 border-l-orange-400' : ''
      }`}
      onClick={() => navigate(`/requisicoes/${req.id}`)}
    >
      {/* CELULAR: número + status na primeira linha, depois setor, solicitante
          e o resumo. Antes era uma grade de duas colunas com um rótulo
          minúsculo acima de cada valor ("Requisição", "Departamento",
          "Solicitante", "Itens", "Criada em"), o que deixava o cartão com
          223px de altura e mais rótulo do que informação. */}
      <CardContent className="md:hidden p-4">
        <div className="flex items-start justify-between gap-2 mb-1">
          <span className="font-black text-base text-slate-800 leading-none">
            #{req.codigo_requisicao}
          </span>
          {/* min-w-0 em vez de shrink-0: com ruptura + lançamento são três
              pílulas, e elas precisam poder quebrar linha no celular. */}
          <div className="min-w-0 flex flex-wrap items-center justify-end gap-1">
            <StatusBadge status={req.status} />
            {pilulaLancamento}
          </div>
        </div>

        <p className="font-bold text-sm text-slate-800 break-words leading-snug">
          {req.departamento}
        </p>
        <p className="text-xs text-slate-600 break-words leading-snug">
          {req.usuario?.nome || "---"}
        </p>
        <p className="text-xs text-slate-500 mt-1">
          {req.itens?.length || 0} {req.itens?.length === 1 ? "item" : "itens"}
          {" • "}
          {format(new Date(req.created_at), "dd/MM HH:mm")}
        </p>

        {isLockedByOther && (
          <span className="mt-2 text-[10px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
            <Lock className="w-3 h-3" /> Em Atendimento
          </span>
        )}
      </CardContent>

      {/* COMPUTADOR: colunas, que é onde elas cabem de verdade. */}
      <CardContent className="hidden md:flex p-5 flex-row items-center justify-between gap-4">
        <div className="flex flex-row items-center gap-6 flex-1 min-w-0">
          <div className="min-w-[5rem] shrink-0">
            <p className="text-xs text-slate-600 font-medium mb-1">Requisição</p>
            <p className="font-black text-lg text-slate-800">#{req.codigo_requisicao}</p>
          </div>

          <div className="flex-1 min-w-[120px]">
            <p className="text-xs text-slate-600 font-medium mb-1">Departamento</p>
            <p className="font-bold text-sm text-slate-700 break-words" title={req.departamento}>{req.departamento}</p>
          </div>

          <div className="flex-1 min-w-[120px]">
            <p className="text-xs text-slate-600 font-medium mb-1">Solicitante</p>
            <p className="font-medium text-sm text-slate-600 break-words" title={req.usuario?.nome}>{req.usuario?.nome || "---"}</p>
          </div>

          <div className="w-12 shrink-0 text-center">
            <p className="text-xs text-slate-600 font-medium mb-1">Itens</p>
            <p className="font-bold text-sm text-slate-700">{req.itens?.length || 0}</p>
          </div>

          <div className="w-24 shrink-0 text-center">
            <p className="text-xs text-slate-600 font-medium mb-1">Criada em</p>
            <p className="font-mono text-sm text-slate-600">{format(new Date(req.created_at), "dd/MM HH:mm")}</p>
          </div>

          {/* Largura limitada e sem shrink-0: com FINALIZADA + RUPTURA +
              A LANÇAR as pílulas precisam quebrar linha. Sem limite, a coluna
              crescia e a última pílula cobria a seta do cartão. */}
          <div className="min-w-[120px] max-w-[200px] text-right">
            <div className="flex flex-wrap items-center justify-end gap-1">
              <StatusBadge status={req.status} />
              {pilulaLancamento}
            </div>
            {isLockedByOther && (
              <div className="mt-1">
                <span className="text-[10px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1 justify-end">
                  <Lock className="w-3 h-3" /> Em Atendimento
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 text-slate-300">
          <ChevronRight className="w-5 h-5" />
        </div>
      </CardContent>
    </Card>
  );
});
