import React, { useMemo, useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { ChevronRight, Lock, ClipboardCheck, ClipboardList, Eye, Search, MessageSquareWarning } from "lucide-react";
import { PreviaRequisicao } from "@/components/PreviaRequisicao";
import { useAuth } from "@/contexts/AuthContext";
import { Requisicao } from "@/types";
import { isLockAtivo } from "@/services/api";
import { StatusBadge } from "@/components/StatusBadge";
import { contemTexto, foiEntregue, formatItemName, precisaLancar, unidadeDoItem } from "@/lib/utils";
import { formatarQtd, quantidadeDevolvida, quantidadeQueSaiu, unidadeEntregue } from "@/lib/unidades";
import { useNavigate } from "react-router-dom";

export const RequisicaoCard = React.memo(({ req, buscaItem }: { req: Requisicao; buscaItem?: string }) => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Observação visível já na lista: dá para ver o aviso antes de abrir.
  const obsNaLista = (req.observacao || "").trim();
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

  // Busca por item na lista: quais linhas desta requisição bateram, para o
  // cartão dizer na hora "tem 2 GL de detergente", sem abrir.
  const encontrados = useMemo(
    () =>
      buscaItem
        ? (req.itens || []).filter((l) => contemTexto(formatItemName(l.item?.nome), buscaItem))
        : [],
    [req.itens, buscaItem]
  );
  const entregue = foiEntregue(req.status);
  const qtdDaLinha = (l: NonNullable<Requisicao["itens"]>[number]) => {
    if (!entregue) return `${formatarQtd(l.quantidade)} ${unidadeDoItem(l)}`;
    if (Number(l.quantidade_separada ?? 0) <= 0) return "não entregue";
    // Com devolução, o que conta é o que ficou no setor.
    const voltou = quantidadeDevolvida(l);
    return voltou > 0
      ? `saiu ${formatarQtd(quantidadeQueSaiu(l))} ${unidadeEntregue(l)} (voltou ${formatarQtd(voltou)})`
      : `entregue ${formatarQtd(quantidadeQueSaiu(l))} ${unidadeEntregue(l)}`;
  };

  // Prévia sem sair da lista. O clique no olho não pode chegar ao cartão,
  // que abriria a requisição.
  const [previa, setPrevia] = useState(false);
  const abrirPrevia = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPrevia(true);
  };

  // A janela fica FORA do <Card>: o React leva os cliques de dentro dela até
  // os componentes pais, e o onClick do cartão abriria a requisição.
  return (
    <>
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
      {/* Compacto até 1024px. As colunas do computador precisam de ~780px:
          em tablet (768px) a status e a seta ficavam cortadas na borda. */}
      <CardContent className="lg:hidden p-4">
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
        <div className="flex items-end justify-between gap-2 mt-1">
          <div className="min-w-0">
            <p className="text-xs text-slate-500">
              {req.itens?.length || 0} {req.itens?.length === 1 ? "item" : "itens"}
              {" • "}
              {format(new Date(req.created_at), "dd/MM HH:mm")}
            </p>
            {isLockedByOther && (
              <span className="mt-2 text-[10px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                <Lock className="w-3 h-3" /> Em Atendimento
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={abrirPrevia}
            aria-label={`Prévia da requisição #${req.codigo_requisicao}`}
            className="shrink-0 h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-600 inline-flex items-center gap-1.5 hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 active:bg-teal-100 transition-colors"
          >
            <Eye className="w-4 h-4" /> Prévia
          </button>
        </div>
      </CardContent>

      {/* COMPUTADOR: colunas, que é onde elas cabem de verdade. */}
      <CardContent className="hidden lg:flex p-5 flex-row items-center justify-between gap-4">
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

        <button
          type="button"
          onClick={abrirPrevia}
          title="Prévia rápida"
          aria-label={`Prévia da requisição #${req.codigo_requisicao}`}
          className="shrink-0 h-9 w-9 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors"
        >
          <Eye className="w-4 h-4" />
        </button>

        <div className="shrink-0 text-slate-300 -ml-2">
          <ChevronRight className="w-5 h-5" />
        </div>
      </CardContent>

      {/* Observação e o que a busca por item achou. -mt-4 anula o
          espaçamento do cartão: fica colado ao conteúdo, como parte dele.
          Âmbar só para a observação; a busca é azul, para não confundir. */}
      {(obsNaLista || encontrados.length > 0) && (
        <div className="-mt-4 px-4 lg:px-5 space-y-2">
          {obsNaLista && (
            <p
              className="flex items-start gap-1.5 text-xs font-semibold text-amber-950 bg-amber-50 border border-amber-300 rounded-md px-2 py-1"
              title={obsNaLista}
            >
              <MessageSquareWarning className="w-3.5 h-3.5 mt-px shrink-0 text-amber-700" />
              <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">{obsNaLista}</span>
            </p>
          )}
          {encontrados.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-sky-700 shrink-0" />
              {encontrados.slice(0, 3).map((l) => (
                <span
                  key={l.id}
                  className="min-w-0 max-w-full text-[11px] font-semibold text-sky-900 bg-sky-50 border border-sky-200 rounded-md px-2 py-0.5 [overflow-wrap:anywhere]"
                >
                  {formatItemName(l.item?.nome)} · <span className="font-black">{qtdDaLinha(l)}</span>
                </span>
              ))}
              {encontrados.length > 3 && (
                <span className="text-[11px] font-bold text-slate-500">+{encontrados.length - 3}</span>
              )}
            </div>
          )}
        </div>
      )}
    </Card>

    {previa && (
      <PreviaRequisicao
        req={req}
        aberta={previa}
        aoFechar={() => setPrevia(false)}
        emAtendimento={isLockedByOther}
        pilulas={pilulaLancamento}
        destacar={buscaItem}
      />
    )}
    </>
  );
});
