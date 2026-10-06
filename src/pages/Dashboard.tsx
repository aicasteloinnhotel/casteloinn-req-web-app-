import React, { useState, Suspense, lazy } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import {
  Clock,
  PackageCheck,
  Send,
  Ban,
  PlusCircle,
  FileText,
  ChevronRight,
  RefreshCcw,
  HelpCircle,
  PauseCircle,
} from "lucide-react";
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

  // Tela Inicial Simplificada para Solicitantes (Mobile First)
  if (user.perfil === "SOLICITANTE") {
    return (
      <div className="space-y-6 flex flex-col items-center max-w-sm mx-auto pt-4 sm:pt-10">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-teal-900 border-b-2 border-teal-600 inline-block pb-1">
            Escolha uma opção abaixo
          </h1>
        </div>

        {/* Pausa para inventário: o cartão continua no lugar, mas travado e
            dizendo por quê — sumir com ele confundiria quem usa todo dia. */}
        {bloqueio.ativo ? (
          <Card className="w-full border-none shadow-xl shadow-slate-200/60 overflow-hidden bg-white opacity-70 cursor-not-allowed">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="bg-amber-50 p-3 rounded-full text-amber-600">
                <PauseCircle className="h-8 w-8" />
              </div>
              <div className="text-left">
                <h2 className="text-lg font-bold text-slate-800">Nova Requisição</h2>
                <p className="text-sm font-semibold text-amber-800">Suspensa temporariamente</p>
              </div>
            </CardContent>
          </Card>
        ) : (
        <Link to="/requisicoes/nova" className="w-full">
          <Card className="hover:ring-2 hover:ring-teal-600 transition-all border-none shadow-xl shadow-slate-200/60 border-slate-200/60 overflow-hidden bg-white group cursor-pointer">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-teal-50 p-3 rounded-full text-teal-700 group-hover:bg-teal-600 group-hover:text-white transition-colors">
                  <PlusCircle className="h-8 w-8" />
                </div>
                <div className="text-left">
                  <h2 className="text-lg font-bold text-slate-800">
                    Nova Requisição
                  </h2>
                  <p className="text-sm text-slate-700">Solicitar materiais</p>
                </div>
              </div>
              <ChevronRight className="text-slate-300 group-hover:text-teal-600" />
            </CardContent>
          </Card>
        </Link>
        )}
        <Link to="/requisicoes" className="w-full">
          <Card className="hover:ring-2 hover:ring-teal-600 transition-all border-none shadow-xl shadow-slate-200/60 border-slate-200/60 overflow-hidden bg-white group cursor-pointer">
            <CardContent className="p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-slate-100 p-3 rounded-full text-slate-600 group-hover:bg-slate-200 transition-colors">
                  <FileText className="h-8 w-8" />
                </div>
                <div className="text-left">
                  <h2 className="text-lg font-bold text-slate-800">
                    Minhas Requisições
                  </h2>
                  <p className="text-sm text-slate-700">Acompanhar status</p>
                </div>
              </div>
              <ChevronRight className="text-slate-300 group-hover:text-teal-600" />
            </CardContent>
          </Card>
        </Link>

        {/* Discreto de propósito: os dois cartões acima são o que se usa todo
            dia. O menu do avatar leva ao mesmo lugar. */}
        <Link
          to="/ajuda"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-teal-800 hover:bg-teal-50"
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
