import React, { useState, Suspense, lazy } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronRight, HelpCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RequisicaoCard, CabecalhoDaTabela } from "@/components/RequisicaoCard";
import { primeiroNome, saudacao } from "@/lib/saudacao";
import { useBloqueio } from "@/contexts/BloqueioContext";
import { useRequisicoesSync } from "@/hooks/useRequisicoesSync";
import { Requisicao } from "@/types";

// Só o almoxarifado vê este painel. Carregando sob demanda, o solicitante não
// baixa a biblioteca de gráficos (recharts) nem a de PDF só para abrir o app.
const DashboardAlmoxarifado = lazy(() => import("./requisicoes/DashboardAlmoxarifado"));

/** O que ainda não chegou ao setor. */
const EM_ANDAMENTO: Requisicao["status"][] = ["PENDENTE", "SEPARANDO", "AGUARDANDO"];

export default function Dashboard() {
  const { user } = useAuth();
  const { bloqueio } = useBloqueio();

  // Load all for ALMOXARIFADO
  const { reqs, loading, updating, lastUpdated, atualizarManualmente } =
    useRequisicoesSync(user?.perfil === "SOLICITANTE" ? user.id : undefined);

  if (!user) return null;

  // Tela inicial do solicitante. Nada de visual próprio: o cabeçalho é o
  // cartão do painel do almoxarifado, o botão é o "Nova" da tela Requisições
  // e a lista usa o mesmo cartão (RequisicaoCard) daquela tela.
  if (user.perfil === "SOLICITANTE") {
    const emAndamento = reqs
      .filter((r) => EM_ANDAMENTO.includes(r.status))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="rounded-xl bg-teal-900 text-white shadow-sm p-3 space-y-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-teal-100/90 leading-tight">{saudacao(new Date())},</p>
            <h1 className="text-base sm:text-lg font-black leading-tight tracking-tight break-words">
              {primeiroNome(user.nome) || "Bem-vindo"}
            </h1>
            <p className="text-xs text-teal-100/90 leading-tight mt-1 first-letter:uppercase tabular-nums">
              {format(new Date(), "EEE, dd/MM", { locale: ptBR })} · {user.departamento}
            </p>
          </div>
          {/* Pausa para inventário: o aviso fica no lugar do botão. */}
          {bloqueio.ativo ? (
            <p className="text-xs font-bold text-amber-200 leading-tight">
              Requisições pausadas · {bloqueio.motivo || "inventário em andamento"}
            </p>
          ) : (
            <Link to="/requisicoes/nova" className="block">
              <Button className="w-full h-11 bg-white text-teal-900 hover:bg-teal-50 font-bold">
                <Plus className="h-4 w-4 mr-1.5" /> Nova Requisição
              </Button>
            </Link>
          )}
        </div>

        {/* "E o meu pedido?" respondido aqui, com o título e o "Ver todas ›"
            da fila do painel do almoxarifado. */}
        <section className="space-y-2">
          <div className="flex items-start justify-between gap-3 px-1">
            <h2 className="text-base font-bold text-slate-800">
              Em andamento <span className="font-medium text-slate-500">· {emAndamento.length}</span>
            </h2>
            <Link to="/requisicoes" className="shrink-0 text-xs font-bold text-teal-700 hover:underline flex items-center mt-1">
              Ver todas <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {loading ? (
            <div className="h-20 rounded-xl bg-slate-100 animate-pulse" />
          ) : emAndamento.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm font-semibold text-slate-500">
              Nenhuma requisição em andamento.
            </div>
          ) : (
            <div className="grid gap-2 lg:gap-0 lg:bg-white lg:rounded-xl lg:border lg:border-slate-200 lg:shadow-lg lg:shadow-slate-200/50 lg:overflow-hidden lg:divide-y lg:divide-slate-100">
              <CabecalhoDaTabela />
              {emAndamento.slice(0, 5).map((r) => (
                <RequisicaoCard key={r.id} req={r} />
              ))}
            </div>
          )}
        </section>

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
