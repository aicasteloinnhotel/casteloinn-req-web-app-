import React from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Eye, Lock, MessageSquareText } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Requisicao } from "@/types";
import { contemTexto, foiEntregue, formatItemName, unidadeDoItem } from "@/lib/utils";
import { avaliarSeparacao, formatarQtd, quantidadeDevolvida, quantidadeQueSaiu, unidadeEntregue } from "@/lib/unidades";

/**
 * Prévia rápida da requisição, aberta pelo olho no cartão da lista: quem, de
 * onde, quando e o que foi pedido (e entregue), sem sair da lista nem perder o
 * filtro. Só leitura — para agir, "Abrir requisição".
 */
export function PreviaRequisicao({
  req,
  aberta,
  aoFechar,
  emAtendimento,
  pilulas,
  destacar,
}: {
  req: Requisicao;
  aberta: boolean;
  aoFechar: () => void;
  /** Outro operador está separando agora. */
  emAtendimento?: boolean;
  /** Pílulas extras do cartão (lançamento no TOTVS). */
  pilulas?: React.ReactNode;
  /** Busca por item ativa na lista: as linhas que batem ficam marcadas. */
  destacar?: string;
}) {
  const navigate = useNavigate();
  const entregue = foiEntregue(req.status);

  const linhas = [...(req.itens || [])].sort((a, b) =>
    formatItemName(a.item?.nome).localeCompare(formatItemName(b.item?.nome), "pt-BR")
  );

  return (
    <Dialog open={aberta} onOpenChange={(abrir) => { if (!abrir) aoFechar(); }}>
      <DialogContent className="sm:max-w-lg w-[94vw] max-h-[88dvh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="p-4 pr-12 border-b bg-slate-50 shrink-0">
          <DialogTitle className="text-teal-900 flex items-center gap-2 text-lg font-black">
            <Eye className="h-5 w-5 shrink-0" />
            Requisição #{req.codigo_requisicao}
          </DialogTitle>
          <div className="flex flex-wrap items-center gap-1">
            <StatusBadge status={req.status} />
            {pilulas}
          </div>
          <DialogDescription className="sr-only">
            Prévia da requisição, só para consulta.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 overflow-y-auto overscroll-contain flex-1 min-h-0 space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <div className="min-w-0">
              <dt className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Departamento</dt>
              <dd className="text-sm font-bold text-slate-800 [overflow-wrap:anywhere]">{req.departamento}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Solicitante</dt>
              <dd className="text-sm font-semibold text-slate-700 [overflow-wrap:anywhere]">{req.usuario?.nome || "---"}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Criada em</dt>
              <dd className="text-sm font-semibold text-slate-700 tabular-nums">
                {format(new Date(req.created_at), "dd/MM/yyyy HH:mm")}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Itens</dt>
              <dd className="text-sm font-semibold text-slate-700">{linhas.length}</dd>
            </div>
          </dl>

          {/* Complementar não ganha aviso próprio: a observação dela já diz
              "gerada automaticamente por ruptura da REQ #...". */}
          {emAtendimento && (
            <p className="text-xs font-semibold text-rose-800 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 flex items-center gap-1.5">
              <Lock className="h-3.5 w-3.5 shrink-0" /> Em atendimento por outro operador agora.
            </p>
          )}

          {req.observacao?.trim() && (
            <div className="text-sm text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 mb-0.5">
                <MessageSquareText className="h-3 w-3" /> Observação
              </p>
              <p className="whitespace-pre-line [overflow-wrap:anywhere]">{req.observacao}</p>
            </div>
          )}

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="flex justify-between gap-3 bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
              <span>Material</span>
              <span className="text-right">{entregue ? "Pedido / Entregue" : "Pedido"}</span>
            </div>
            <ul className="divide-y divide-slate-100">
              {linhas.map((linha) => {
                const unPedida = unidadeDoItem(linha);
                const unSep = unidadeEntregue(linha);
                const qtdSep = Number(linha.quantidade_separada ?? 0);
                const situacao = avaliarSeparacao(linha.quantidade, unPedida, qtdSep, unSep).situacao;
                const buscado = !!destacar && contemTexto(formatItemName(linha.item?.nome), destacar);
                return (
                  <li
                    key={linha.id}
                    className={`flex items-start justify-between gap-3 px-3 py-2.5 ${buscado ? "bg-amber-50" : ""}`}
                  >
                    <span className="min-w-0 text-sm font-semibold text-slate-800 uppercase [overflow-wrap:anywhere]">
                      {formatItemName(linha.item?.nome) || "Item removido"}
                    </span>
                    <span className="shrink-0 text-right leading-tight">
                      {Number(linha.quantidade) > 0 ? (
                        <span className="block text-sm font-black text-slate-800 tabular-nums">
                          {formatarQtd(linha.quantidade)} <span className="text-xs font-bold text-slate-500">{unPedida}</span>
                        </span>
                      ) : (
                        <span className="block text-[11px] font-semibold text-slate-500">incluído na entrega</span>
                      )}
                      {entregue && (
                        <span
                          className={`block text-xs font-bold tabular-nums mt-0.5 ${
                            qtdSep <= 0
                              ? "text-red-700"
                              : situacao === "falta"
                                ? "text-amber-700"
                                : "text-emerald-700"
                          }`}
                        >
                          {qtdSep <= 0 ? "não entregue" : `entregue ${formatarQtd(qtdSep)} ${unSep}`}
                        </span>
                      )}
                      {entregue && quantidadeDevolvida(linha) > 0 && (
                        <span className="block text-xs font-bold tabular-nums mt-0.5 text-violet-700">
                          voltou {formatarQtd(quantidadeDevolvida(linha))} · saiu {formatarQtd(quantidadeQueSaiu(linha))} {unSep}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
              {linhas.length === 0 && (
                <li className="px-3 py-4 text-sm text-center text-slate-500">Nenhum item nesta requisição.</li>
              )}
            </ul>
          </div>
        </div>

        {/* Lado a lado também no celular: empilhados, os dois botões comiam
            130px da janela, que é onde está a lista de itens. */}
        <div className="p-3 sm:p-4 border-t bg-white shrink-0 grid grid-cols-2 sm:flex sm:justify-end gap-2">
          <Button variant="outline" onClick={aoFechar} className="font-bold h-11">
            Fechar
          </Button>
          <Button
            onClick={() => navigate(`/requisicoes/${req.id}`)}
            className="font-bold h-11 bg-teal-600 hover:bg-teal-700 text-white"
          >
            Abrir requisição
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
