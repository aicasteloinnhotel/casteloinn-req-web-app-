import React, { useMemo, useState } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { format } from "date-fns";
import { Lock, ClipboardCheck, ClipboardList, Eye, Search, MessageSquareWarning } from "lucide-react";
import { PreviaRequisicao } from "@/components/PreviaRequisicao";
import { useAuth } from "@/contexts/AuthContext";
import { Requisicao } from "@/types";
import { isLockAtivo } from "@/services/api";
import { StatusBadge } from "@/components/StatusBadge";
import { contemTexto, foiEntregue, formatItemName, precisaLancar, unidadeDoItem } from "@/lib/utils";
import { formatarQtd, quantidadeDevolvida, quantidadeQueSaiu, unidadeEntregue } from "@/lib/unidades";
import { useNavigate } from "react-router-dom";

/**
 * Colunas da tabela do computador: Nº, Setor, Solicitante, Itens, Pedida,
 * Status e a prévia. O cabeçalho e as linhas usam a mesma grade.
 */
const COLUNAS =
  "grid grid-cols-[4.5rem_minmax(0,1.3fr)_minmax(0,1fr)_2.75rem_6.5rem_minmax(8rem,16rem)_2.25rem] items-center gap-3";

/** Cor da borda da esquerda: o status de relance, igual nas duas telas. */
const BORDA_DO_STATUS: Record<string, string> = {
  PENDENTE: "border-l-yellow-400",
  AGUARDANDO: "border-l-amber-500",
  SEPARANDO: "border-l-teal-400",
  FINALIZADA: "border-l-emerald-400",
  CANCELADA: "border-l-red-400",
  RUPTURA_PARCIAL: "border-l-orange-400",
  RUPTURA_TOTAL: "border-l-orange-400",
};

/** Cabeçalho das colunas, uma vez por tabela (só no computador). */
export function CabecalhoDaTabela() {
  return (
    <div
      aria-hidden="true"
      className={`hidden lg:grid ${COLUNAS} border-l-4 border-l-transparent bg-slate-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-500`}
    >
      <span>Nº</span>
      <span>Setor</span>
      <span>Solicitante</span>
      <span className="text-center">Itens</span>
      <span>Pedida</span>
      <span className="text-right">Status</span>
      <span />
    </div>
  );
}

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
  const pilulaEmAtendimento = isLockedByOther && (
    <span className="text-[10px] font-semibold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1 whitespace-nowrap">
      <Lock className="w-3 h-3" /> Em Atendimento
    </span>
  );

  // Busca na lista: quais linhas desta requisição bateram, para o cartão
  // dizer na hora "tem 2 GL de detergente", sem abrir.
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

  const qtdItens = req.itens?.length || 0;
  const pedidaEm = format(new Date(req.created_at), "dd/MM HH:mm");

  const linhaDaObservacao = obsNaLista && (
    <p
      className="flex items-center gap-1.5 text-xs font-semibold text-amber-900 min-w-0"
      title={obsNaLista}
    >
      <MessageSquareWarning className="w-3.5 h-3.5 shrink-0 text-amber-600" />
      <span className="truncate">{obsNaLista}</span>
    </p>
  );

  const linhaDaBusca = encontrados.length > 0 && (
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
  );

  // A janela fica FORA do <Card>: o React leva os cliques de dentro dela até
  // os componentes pais, e o onClick do cartão abriria a requisição.
  return (
    <>
    <Card
      className={`gap-0 py-0 border-none shadow-lg shadow-slate-200/50 bg-white cursor-pointer transition-all hover:shadow-md hover:ring-2 hover:ring-teal-500/50 lg:rounded-none lg:shadow-none lg:ring-0 lg:hover:ring-0 lg:hover:shadow-none lg:hover:bg-slate-50 ${
        BORDA_DO_STATUS[req.status] ? `border-l-4 ${BORDA_DO_STATUS[req.status]}` : ""
      }`}
      onClick={() => navigate(`/requisicoes/${req.id}`)}
    >
      {/* CELULAR: duas linhas. Número e setor com o status; depois quem
          pediu, quantos itens e quando, com o olho da prévia. */}
      {/* Compacto até 1024px. As colunas do computador precisam de ~780px. */}
      <CardContent className="lg:hidden px-3.5 py-3 space-y-1.5">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 text-sm leading-snug text-slate-800 break-words">
            <span className="font-black">#{req.codigo_requisicao}</span>
            <span className="text-slate-300"> · </span>
            <span className="font-bold">{req.departamento}</span>
          </p>
          {/* min-w-0: com ruptura + lançamento são três pílulas, e elas
              precisam poder quebrar linha no celular. */}
          <div className="min-w-0 flex flex-wrap items-center justify-end gap-1">
            <StatusBadge status={req.status} />
            {pilulaLancamento}
            {pilulaEmAtendimento}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-xs text-slate-600">
            {req.usuario?.nome || "---"} · {qtdItens} {qtdItens === 1 ? "item" : "itens"} · {pedidaEm}
          </p>
          <button
            type="button"
            onClick={abrirPrevia}
            aria-label={`Prévia da requisição #${req.codigo_requisicao}`}
            className="shrink-0 h-8 w-8 -my-1 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 active:bg-teal-100 transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
        {linhaDaObservacao}
        {linhaDaBusca}
      </CardContent>

      {/* COMPUTADOR: uma linha da tabela, sem rótulo em cada célula (o
          cabeçalho das colunas fica no topo da tabela). */}
      <CardContent className="hidden lg:block px-4 py-2.5">
        <div className={COLUNAS}>
          <span className="font-black text-slate-800 tabular-nums">#{req.codigo_requisicao}</span>
          <div className="min-w-0">
            <p className="font-bold text-slate-800 truncate" title={req.departamento}>{req.departamento}</p>
            {linhaDaObservacao}
          </div>
          <p className="text-slate-600 truncate" title={req.usuario?.nome}>{req.usuario?.nome || "---"}</p>
          <span className="text-center font-semibold text-slate-700 tabular-nums">{qtdItens}</span>
          <span className="text-slate-600 tabular-nums">{pedidaEm}</span>
          <div className="flex flex-wrap items-center justify-end gap-1">
            <StatusBadge status={req.status} />
            {pilulaLancamento}
            {pilulaEmAtendimento}
          </div>
          <button
            type="button"
            onClick={abrirPrevia}
            title="Prévia rápida"
            aria-label={`Prévia da requisição #${req.codigo_requisicao}`}
            className="h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-600 flex items-center justify-center hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
        {linhaDaBusca && <div className="mt-1.5 pl-[5.25rem]">{linhaDaBusca}</div>}
      </CardContent>
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
