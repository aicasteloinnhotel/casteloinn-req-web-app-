import React, { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format, startOfDay, endOfDay } from "date-fns";
import { contemTexto, dataInputParaLocal, precisaLancar } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Plus, RefreshCcw, Filter, ArrowLeft, ClipboardList, ClipboardCheck } from "lucide-react";
import { hasSupabaseKeys } from "@/lib/supabase";
import { useRequisicoesSync } from "@/hooks/useRequisicoesSync";
import { RequisicaoCard } from "@/components/RequisicaoCard";
import { Input } from "@/components/ui/input";

export default function ListaRequisicoes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const {
    reqs,
    loading,
    updating,
    lastUpdated,
    atualizarManualmente,
  } = useRequisicoesSync(user?.perfil === "SOLICITANTE" ? user.id : undefined);

  // Filtros rápidos. O parâmetro ?filter= da URL antes só reconhecia
  // "aguardando"; qualquer outro valor caía em TODAS silenciosamente, então os
  // atalhos do dashboard não filtravam nada.
  type FiltroRapido = "TODAS" | "PENDENTE" | "SEPARANDO" | "FINALIZADA" | "CANCELADA" | "AGUARDANDO" | "RUPTURAS";
  const FILTROS_VALIDOS: FiltroRapido[] = ["TODAS", "PENDENTE", "SEPARANDO", "FINALIZADA", "CANCELADA", "AGUARDANDO", "RUPTURAS"];

  const filtroDaUrl = (searchParams.get("filter") || "").toUpperCase() as FiltroRapido;
  const initialFilter: FiltroRapido = FILTROS_VALIDOS.includes(filtroDaUrl) ? filtroDaUrl : "TODAS";
  const [quickFilter, setQuickFilter] = useState<FiltroRapido>(initialFilter);

  // Lançamento no TOTVS. "A lançar" só faz sentido para o que já foi entregue:
  // uma requisição pendente também não está lançada, mas ainda não pode ser.
  type FiltroLancamento = "TODOS" | "A_LANCAR" | "LANCADAS";
  const [filtroLancamento, setFiltroLancamento] = useState<FiltroLancamento>("TODOS");
  const ehAlmoxarifado = user?.perfil === "ALMOXARIFADO";

  // Advanced filters
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advDept, setAdvDept] = useState("");
  const [advDateStart, setAdvDateStart] = useState("");
  const [advDateEnd, setAdvDateEnd] = useState("");

  const requisicoes = useMemo(() => {
    let result = reqs;

    // Filtrar estritamente pelo ID do usuário autenticado se for SOLICITANTE
    if (user?.perfil === "SOLICITANTE") {
      result = result.filter(r => r.usuario_id === user.id);
    }

    // Quick filter
    if (quickFilter === "PENDENTE") result = result.filter(r => r.status === "PENDENTE");
    if (quickFilter === "AGUARDANDO") result = result.filter(r => r.status === "AGUARDANDO");
    if (quickFilter === "SEPARANDO") result = result.filter(r => r.status === "SEPARANDO");
    if (quickFilter === "FINALIZADA") result = result.filter(r => ["FINALIZADA", "RUPTURA_PARCIAL", "RUPTURA_TOTAL"].includes(r.status));
    if (quickFilter === "RUPTURAS") result = result.filter(r => ["RUPTURA_PARCIAL", "RUPTURA_TOTAL"].includes(r.status));
    if (quickFilter === "CANCELADA") result = result.filter(r => r.status === "CANCELADA");

    // Lançamento no TOTVS
    if (filtroLancamento === "LANCADAS") {
      result = result.filter(r => r.lancado === true);
    } else if (filtroLancamento === "A_LANCAR") {
      result = result.filter(r => !r.lancado && precisaLancar(r.status));
    }

    // Advanced filters
    if (advDept.trim() !== "") {
      result = result.filter(r => contemTexto(r.departamento, advDept));
    }
    // As datas do filtro são lidas como data local (ver dataInputParaLocal):
    // usar new Date("2026-09-22") direto jogava o corte para o dia anterior.
    const inicio = dataInputParaLocal(advDateStart);
    if (inicio) {
      const start = startOfDay(inicio).getTime();
      result = result.filter(r => new Date(r.created_at).getTime() >= start);
    }
    const fim = dataInputParaLocal(advDateEnd);
    if (fim) {
      const end = endOfDay(fim).getTime();
      result = result.filter(r => new Date(r.created_at).getTime() <= end);
    }

    return result;
  }, [reqs, quickFilter, filtroLancamento, advDept, advDateStart, advDateEnd]);

  const quickFilterOptions = [
    { label: "Todas", value: "TODAS" },
    { label: "Pendentes", value: "PENDENTE" },
    { label: "Aguardando", value: "AGUARDANDO" },
    { label: "Separando", value: "SEPARANDO" },
    { label: "Finalizadas", value: "FINALIZADA" },
    { label: "Rupturas", value: "RUPTURAS" },
    { label: "Canceladas", value: "CANCELADA" }
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {user?.perfil === "SOLICITANTE" && (
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/")}
            className="text-teal-950 hover:bg-teal-50 hover:text-teal-900 font-bold px-3 h-9 rounded-lg"
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao Início
          </Button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-teal-900 dark:text-white">
            Requisições
          </h1>
          <p className="text-slate-700 text-sm">
            {user?.perfil === "SOLICITANTE"
              ? "Acompanhe seus pedidos."
              : "Central operacional do Almoxarifado."}
          </p>
        </div>
        {/* Uma barra só, tudo com 44px de altura.
            O seletor substituiu as pílulas: elas rolavam de lado e os status do
            fim sumiam da tela. Aqui nada some, e no celular abre o seletor do
            próprio sistema. Começa sempre em "Todas". */}
        {/* No celular os dois seletores ficam numa linha e os botões na
            seguinte: espremer cinco controles em 375px cortava os rótulos. */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <select
              value={quickFilter}
              onChange={(e) => setQuickFilter(e.target.value as FiltroRapido)}
              aria-label="Filtrar por status"
              className="h-11 flex-1 sm:flex-none sm:w-40 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {quickFilterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Só o almoxarifado lança no TOTVS; para o solicitante este
                seletor seria só ruído na tela. */}
            {/* Mesmas cores das pílulas: âmbar = a lançar, verde = lançada.
                O ícone de prancheta diferencia este seletor do de status ao
                lado, já que os dois começam em "Todas". */}
            {ehAlmoxarifado && (
              <div className="relative flex-1 sm:flex-none sm:w-40 min-w-0">
                {filtroLancamento === "LANCADAS" ? (
                  <ClipboardCheck className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-700" />
                ) : (
                  <ClipboardList
                    className={`pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 ${
                      filtroLancamento === "A_LANCAR" ? "text-amber-700" : "text-slate-500"
                    }`}
                  />
                )}
                <select
                  value={filtroLancamento}
                  onChange={(e) => setFiltroLancamento(e.target.value as FiltroLancamento)}
                  aria-label="Filtrar por lançamento no TOTVS"
                  title="Lançamento no TOTVS"
                  className={`h-11 w-full rounded-lg border pl-8 pr-2.5 text-sm font-semibold shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
                    filtroLancamento === "A_LANCAR"
                      ? "border-amber-300 bg-amber-50 text-amber-900"
                      : filtroLancamento === "LANCADAS"
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <option value="TODOS">Todas</option>
                  <option value="A_LANCAR">A lançar</option>
                  <option value="LANCADAS">Lançadas</option>
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Link to="/requisicoes/nova" className="flex-1 sm:flex-none sm:shrink-0">
              <Button
                title="Criar nova requisição"
                className="h-11 w-full sm:w-auto px-3 bg-teal-600 hover:bg-teal-700 text-white font-bold"
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="sm:inline">Nova</span>
              </Button>
            </Link>

            <Button
              variant="outline"
              onClick={atualizarManualmente}
              disabled={updating}
              title={`Atualizado às ${format(lastUpdated, "HH:mm")}`}
              className="h-11 w-11 p-0 shrink-0 bg-white text-slate-600 hover:text-slate-900 border-slate-200"
            >
              <RefreshCcw className={`w-4 h-4 ${updating ? "animate-spin" : ""}`} />
            </Button>

            <Button
              variant="outline"
              onClick={() => setShowAdvanced(!showAdvanced)}
              title="Filtrar por departamento e período"
              className={`h-11 w-11 p-0 shrink-0 border-slate-200 ${
                showAdvanced || advDept || advDateStart || advDateEnd
                  ? "bg-teal-50 text-teal-700 border-teal-200"
                  : "bg-white text-slate-600 hover:text-slate-900"
              }`}
            >
              <Filter className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {!hasSupabaseKeys && import.meta.env.DEV && (
        <div className="p-4 bg-orange-100 text-orange-800 rounded-xl text-sm border border-orange-200 shadow-md">
          <strong>Atenção:</strong> Supabase não configurado.
        </div>
      )}

      {/* A fileira de pílulas que ficava aqui foi substituída pelo seletor na
          barra acima: elas rolavam de lado e os últimos status saíam da tela. */}
      <div className="flex flex-col gap-3">

        {/* Filtros avançados, abertos pelo ícone de funil */}
        {showAdvanced && (
          <div className={`bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 p-4 grid grid-cols-1 ${user?.perfil !== "SOLICITANTE" ? "sm:grid-cols-3" : "sm:grid-cols-2"} gap-4`}>
            {user?.perfil !== "SOLICITANTE" && (
              <div>
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 block">Departamento</label>
                <Input 
                  placeholder="Buscar por departamento..." 
                  className="h-9 text-sm"
                  value={advDept}
                  onChange={e => setAdvDept(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 block">Data Inicial</label>
              <Input 
                type="date" 
                className="h-9 text-sm"
                value={advDateStart}
                onChange={e => setAdvDateStart(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 block">Data Final</label>
              <Input 
                type="date" 
                className="h-9 text-sm"
                value={advDateEnd}
                onChange={e => setAdvDateEnd(e.target.value)}
              />
            </div>
          </div>
        )}

      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-700 font-medium">
          Carregando requisições...
        </div>
      ) : requisicoes.length === 0 ? (
        <div className="text-center py-16 bg-slate-50 rounded-xl border border-slate-200/80 shadow-md shadow-slate-200/50 border-dashed">
          <p className="text-slate-700 mb-4 font-medium">Nenhuma requisição encontrada com os filtros atuais.</p>
          <Link to="/requisicoes/nova">
            <Button
              variant="outline"
              className="border-teal-600 text-teal-700 hover:bg-teal-50 font-bold"
            >
              Criar Nova Requisição
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-2 sm:gap-3">
          {requisicoes.map((req) => (
            <RequisicaoCard key={req.id} req={req} />
          ))}
        </div>
      )}
    </div>
  );
}
