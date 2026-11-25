import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft, Ban, Check, CheckCircle2, ChevronDown, ChevronRight, Clock, PackageSearch, Pencil, Truck, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ObservacaoDestaque } from "@/components/ObservacaoDestaque";
import { ProgressoDoPedido } from "@/components/StatusSimples";
import { nomeDaUnidade } from "@/components/AdicionarAoPedido";
import { COR_DO_TOM, situacaoParaSolicitante, type TomDoStatus } from "@/lib/statusSolicitante";
import { avaliarSeparacao, formatarQtd, unidadeEntregue } from "@/lib/unidades";
import { formatItemName, unidadeDoItem } from "@/lib/utils";
import { TITULO } from "@/lib/estilos";
import { textoDaObservacao } from "@/lib/observacao";
import type { Requisicao } from "@/types";

const ICONE_DO_TOM: Record<TomDoStatus, React.ReactNode> = {
  espera: <Clock className="h-7 w-7" />,
  andamento: <PackageSearch className="h-7 w-7" />,
  pronto: <CheckCircle2 className="h-7 w-7" />,
  atencao: <Truck className="h-7 w-7" />,
  cancelado: <XCircle className="h-7 w-7" />,
};

/** O que aconteceu, em palavras de quem pediu ("Começou a separação"). */
function eventoAmigavel(acao: string): string {
  if (acao.startsWith("STATUS_ALTERADO_")) {
    const st = acao.replace("STATUS_ALTERADO_", "");
    if (st === "SEPARANDO") return "Começou a separação";
    return situacaoParaSolicitante(st).titulo;
  }
  const mapa: Record<string, string> = {
    CRIADA: "Pedido enviado",
    EDITADA: "Pedido editado",
    ITENS_EDITADOS: "Itens ajustados na separação",
    TERMO_ACEITO: "Recebimento confirmado",
    RUPTURA_PARCIAL: "Entregue em parte",
    RUPTURA_TOTAL: "Nada estava no estoque",
    RUPTURA_GEROU_COMPLEMENTAR: "O que faltou virou um novo pedido",
    AGUARDANDO: "Esperando o material chegar",
    OBSERVACAO_EDITADA: "Observação alterada",
    DEVOLUCAO: "Devolução ao almoxarifado",
    DEVOLUCAO_DESFEITA: "Devolução desfeita",
    ITEM_INCLUIDO_APOS_ENTREGA: "Item adicionado depois da entrega",
  };
  return mapa[acao] || "";
}

/** O que o solicitante precisa saber de cada item: quanto pediu e, depois, quanto recebeu. */
function situacaoDoItem(prod: NonNullable<Requisicao["itens"]>[number]): { texto: string; tom: "neutro" | "ok" | "falta" | "info" } {
  const un = unidadeDoItem(prod);
  const pediu = `${formatarQtd(prod.quantidade)} ${nomeDaUnidade(un, prod.quantidade)}`;
  if (prod.quantidade_separada === undefined || prod.quantidade_separada === null) return { texto: pediu, tom: "neutro" };
  const unEnt = unidadeEntregue(prod);
  const recebeu = `${formatarQtd(prod.quantidade_separada)} ${nomeDaUnidade(unEnt, Number(prod.quantidade_separada))}`;
  const r = avaliarSeparacao(prod.quantidade, un, prod.quantidade_separada, unEnt);
  if (r.situacao === "completo") return { texto: `Recebeu ${recebeu}`, tom: "ok" };
  if (r.situacao === "excedente") return { texto: `Recebeu ${recebeu} (pediu ${pediu})`, tom: "ok" };
  if (r.situacao === "outra_unidade") return { texto: `Recebeu ${recebeu} (pediu ${pediu})`, tom: "info" };
  if (Number(prod.quantidade_separada) <= 0) return { texto: `Pediu ${pediu} · vem depois`, tom: "falta" };
  return { texto: `Recebeu ${recebeu} de ${pediu} · o resto vem depois`, tom: "falta" };
}

const COR_DO_ITEM = {
  neutro: "text-slate-600",
  ok: "text-emerald-700",
  falta: "text-orange-700",
  info: "text-sky-700",
};

/**
 * A requisição aberta, para quem pediu. Feita para responder primeiro "como
 * está o meu pedido?" (status em palavras simples + linha de progresso) e
 * depois "o que vem?". As ações ficam embaixo, grandes e separadas: editar é a
 * principal; cancelar fica à parte, com outra cor e confirmação — longe o
 * bastante para não ser tocado no lugar do editar.
 */
export function DetalheSolicitante({
  req, rel, historico, ehDono, updating, aoSalvarObservacao, aoCancelar,
}: {
  req: Requisicao;
  rel: { original?: { id: string; codigo: number }; complementar?: { id: string; codigo: number } } | null;
  historico: { id: string; acao: string; created_at: string }[];
  ehDono: boolean;
  updating: boolean;
  aoSalvarObservacao?: (texto: string) => Promise<void>;
  aoCancelar: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [confirmar, setConfirmar] = useState(false);
  const s = situacaoParaSolicitante(req.status);
  const cor = COR_DO_TOM[s.tom];
  const pendente = req.status === "PENDENTE" && ehDono;
  const itens = req.itens || [];
  const eventos = historico
    .map((h) => ({ ...h, texto: eventoAmigavel(h.acao) }))
    .filter((h) => h.texto);

  return (
    <div className="max-w-xl mx-auto space-y-5 pb-10">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/requisicoes"))}
          aria-label="Voltar"
          className="h-11 w-11 rounded-full bg-slate-100 hover:bg-slate-200 text-teal-900 shrink-0"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0">
          <h1 className={TITULO}>Pedido #{req.codigo_requisicao ?? "—"}</h1>
          <p className="text-xs font-medium text-slate-500 tabular-nums">
            Feito em {format(new Date(req.created_at), "dd/MM/yyyy 'às' HH:mm")}
          </p>
        </div>
      </div>

      {/* Como está: frase simples, cor e a linha Enviado → Separando → Entregue. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-lg shadow-slate-200/50 space-y-5">
        <div className="flex items-start gap-4">
          <span className={`h-14 w-14 shrink-0 rounded-2xl flex items-center justify-center ${cor.icone}`}>{ICONE_DO_TOM[s.tom]}</span>
          <div className="min-w-0">
            <p className="text-xl font-black leading-tight text-slate-900">{s.titulo}</p>
            {s.descricao && <p className="mt-1 text-sm font-medium text-slate-600">{s.descricao}</p>}
          </div>
        </div>
        <ProgressoDoPedido status={req.status} />
      </section>

      {/* O que faltou vem em outro pedido: liga um ao outro. */}
      {rel?.complementar && (
        <button
          type="button"
          onClick={() => navigate(`/requisicoes/${rel.complementar!.id}`)}
          className="w-full flex items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-left hover:bg-orange-100"
        >
          <Truck className="h-6 w-6 shrink-0 text-orange-700" />
          <span className="min-w-0 flex-1 text-sm font-semibold text-orange-950">
            O que faltou vem no <strong>pedido #{rel.complementar.codigo}</strong>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-orange-400" />
        </button>
      )}
      {rel?.original && (
        <button
          type="button"
          onClick={() => navigate(`/requisicoes/${rel.original!.id}`)}
          className="w-full flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:bg-slate-50"
        >
          <PackageSearch className="h-6 w-6 shrink-0 text-slate-500" />
          <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800">
            É o que faltou do <strong>pedido #{rel.original.codigo}</strong>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
        </button>
      )}

      {/* A observação automática da complementar ("Complementar da #438") só
          repete o aviso de cima: não aparece. */}
      {!(rel?.original && /^Complementar da #\S+$/.test(textoDaObservacao(req.observacao))) && (
        <ObservacaoDestaque observacao={req.observacao} aoSalvar={aoSalvarObservacao} />
      )}

      {/* Itens */}
      <section className="space-y-2">
        <h2 className="flex items-baseline gap-1.5 px-1 text-xs font-black uppercase tracking-wider text-slate-600">
          Itens <span className="font-semibold text-slate-400">· {itens.length}</span>
        </h2>
        <div className="rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 divide-y divide-slate-100 overflow-hidden">
          {itens.map((prod) => {
            const sit = situacaoDoItem(prod);
            return (
              <div key={prod.id} className="flex items-start gap-3 px-4 py-3">
                {sit.tom === "ok" && <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" strokeWidth={3} />}
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-bold leading-snug text-slate-900 [overflow-wrap:anywhere]">
                    {formatItemName(prod.item?.nome)}
                  </p>
                  <p className={`text-sm font-semibold ${COR_DO_ITEM[sit.tom]}`}>{sit.texto}</p>
                </div>
              </div>
            );
          })}
          {itens.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-500">Nenhum item.</p>}
        </div>
      </section>

      {/* Linha do tempo, recolhida: quem quer, abre. */}
      {eventos.length > 0 && (
        <details className="group rounded-2xl border border-slate-200 bg-white">
          <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-bold text-slate-700 [&::-webkit-details-marker]:hidden">
            O que aconteceu com este pedido
            <ChevronDown className="h-5 w-5 text-slate-400 transition-transform group-open:rotate-180" />
          </summary>
          <ol className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
            {eventos.map((h) => (
              <li key={h.id} className="flex items-start gap-3">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-teal-500" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-800">{h.texto}</span>
                  <span className="block text-xs text-slate-500 tabular-nums">
                    {format(new Date(h.created_at), "dd/MM 'às' HH:mm")}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}

      {/* Ações, só enquanto ninguém começou. Editar: grande, a principal.
          Cancelar: separado por uma linha, outra cor, e pede confirmação. */}
      {pendente && (
        <section className="space-y-6 pt-1">
          <Button
            onClick={() => navigate(`/requisicoes/${req.id}/editar`)}
            className="w-full h-14 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-lg font-black shadow-lg shadow-teal-900/15"
          >
            <Pencil className="h-5 w-5" /> Editar pedido
          </Button>
          <div className="border-t border-slate-200 pt-6">
            <Button
              variant="outline"
              onClick={() => setConfirmar(true)}
              disabled={updating}
              className="w-full h-12 rounded-2xl border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800 font-bold"
            >
              <Ban className="h-5 w-5" /> Cancelar este pedido
            </Button>
          </div>
        </section>
      )}

      {/* Confirmar o cancelamento: a escolha segura é a mais fácil de tocar. */}
      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg">Cancelar o pedido #{req.codigo_requisicao}?</DialogTitle>
            <DialogDescription className="text-sm">
              O almoxarifado não vai mais atender este pedido. Não dá para desfazer.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            <Button
              onClick={() => setConfirmar(false)}
              className="h-12 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-black"
            >
              Não, manter o pedido
            </Button>
            <Button
              variant="outline"
              disabled={updating}
              onClick={async () => {
                setConfirmar(false);
                await aoCancelar();
              }}
              className="h-12 rounded-xl border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 font-bold"
            >
              {updating ? "Cancelando..." : "Sim, cancelar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
