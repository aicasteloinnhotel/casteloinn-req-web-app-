import React, { useState, Suspense, lazy } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { FileText, ChevronRight, HelpCircle, PauseCircle, Plus } from "lucide-react";
import { EtiquetaStatus } from "@/components/StatusSimples";
import { situacaoParaSolicitante } from "@/lib/statusSolicitante";
import { primeiroNome, saudacao } from "@/lib/saudacao";
import { TITULO } from "@/lib/estilos";
import { useBloqueio } from "@/contexts/BloqueioContext";
import { useRequisicoesSync } from "@/hooks/useRequisicoesSync";
import { Requisicao } from "@/types";

// Só o almoxarifado vê este painel. Carregando sob demanda, o solicitante não
// baixa a biblioteca de gráficos (recharts) nem a de PDF só para abrir o app.
const DashboardAlmoxarifado = lazy(() => import("./requisicoes/DashboardAlmoxarifado"));

export default function Dashboard() {
  const { user } = useAuth();
  const { bloqueio } = useBloqueio();

  // Load all for ALMOXARIFADO
  const { reqs, loading, updating, lastUpdated, atualizarManualmente } =
    useRequisicoesSync(user?.perfil === "SOLICITANTE" ? user.id : undefined);

  if (!user) return null;

  // Tela inicial do solicitante. Uma ação principal, grande e no alto (o que se
  // faz quase sempre); logo abaixo, a resposta para "e o meu pedido?" sem
  // precisar abrir outra tela; o resto, discreto.
  if (user.perfil === "SOLICITANTE") {
    const emAndamento = reqs
      .filter((r) => situacaoParaSolicitante(r.status).emAndamento)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return (
      <div className="max-w-md mx-auto space-y-6 pt-1 sm:pt-6">
        <div>
          <p className="text-sm font-semibold text-slate-500">{saudacao(new Date())},</p>
          <h1 className={TITULO}>{primeiroNome(user.nome) || "Bem-vindo"}</h1>
        </div>

        {/* Pausa para inventário: o lugar do botão continua, mas diz por quê
            não dá — sumir com ele confundiria quem usa todo dia. */}
        {bloqueio.ativo ? (
          <div className="flex items-center gap-4 rounded-2xl border-2 border-amber-200 bg-amber-50 p-5">
            <span className="h-14 w-14 shrink-0 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <PauseCircle className="h-8 w-8" />
            </span>
            <span className="min-w-0">
              <span className="block text-lg font-black text-amber-950">Pedidos pausados</span>
              <span className="block text-sm font-medium text-amber-900">
                {bloqueio.motivo || "Inventário em andamento"}. Volta assim que o almoxarifado liberar.
              </span>
            </span>
          </div>
        ) : (
          <Link
            to="/requisicoes/nova"
            className="group flex items-center gap-4 rounded-2xl bg-teal-600 p-5 text-white shadow-lg shadow-teal-900/15 hover:bg-teal-700 active:scale-[0.99] transition"
          >
            <span className="h-14 w-14 shrink-0 rounded-2xl bg-white/15 flex items-center justify-center">
              <Plus className="h-8 w-8" strokeWidth={2.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xl font-black leading-tight">Fazer um pedido</span>
              <span className="block text-sm font-medium text-teal-50">Pedir materiais ao almoxarifado</span>
            </span>
            <ChevronRight className="h-6 w-6 shrink-0 text-teal-100 group-hover:translate-x-0.5 transition" />
          </Link>
        )}

        {/* "E o meu pedido?" respondido aqui mesmo. */}
        <section className="space-y-2">
          <h2 className="flex items-baseline gap-1.5 px-1 text-xs font-black uppercase tracking-wider text-slate-600">
            Em andamento
            {emAndamento.length > 0 && <span className="font-semibold text-slate-400">· {emAndamento.length}</span>}
          </h2>
          {loading ? (
            <div className="h-20 rounded-2xl bg-slate-100 animate-pulse" />
          ) : emAndamento.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm font-medium text-slate-500">
              Nenhum pedido em andamento.
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 divide-y divide-slate-100 overflow-hidden">
              {emAndamento.slice(0, 5).map((r) => {
                const qtd = r.itens?.length ?? 0;
                return (
                  <Link
                    key={r.id}
                    to={`/requisicoes/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3.5 min-h-16 hover:bg-slate-50 active:bg-slate-100"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-bold text-slate-900">Pedido #{r.codigo_requisicao ?? "—"}</span>
                      <span className="block text-xs font-medium text-slate-500 tabular-nums">
                        {qtd > 0 && `${qtd} ${qtd === 1 ? "item" : "itens"} · `}
                        {format(new Date(r.created_at), "dd/MM HH:mm")}
                      </span>
                    </span>
                    <EtiquetaStatus status={r.status} />
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                  </Link>
                );
              })}
            </div>
          )}
          <Link
            to="/requisicoes"
            className="flex items-center justify-center gap-2 h-12 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50"
          >
            <FileText className="h-4 w-4" /> Ver todos os meus pedidos
          </Link>
        </section>

        {/* Discreto de propósito: o menu do avatar leva ao mesmo lugar. */}
        <Link
          to="/ajuda"
          className="mx-auto flex w-fit items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"
        >
          <HelpCircle className="h-4 w-4" /> Ajuda e contato do almoxarifado
        </Link>
      </div>
    );
  }

  // Painel Operacional para Almoxarifado
  // Fallback for ALMOXARIFADO or any other existing user profile
  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-600 font-medium">Carregando painel...</div>}>
      <DashboardAlmoxarifado
        reqs={reqs}
        lastUpdated={lastUpdated}
        updating={updating}
        onRefresh={atualizarManualmente}
      />
    </Suspense>
  );
}
