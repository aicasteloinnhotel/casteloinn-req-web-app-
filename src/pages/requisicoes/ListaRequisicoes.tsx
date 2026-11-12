import React, { useState, useMemo, useEffect, useDeferredValue } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { format, startOfDay, endOfDay } from "date-fns";
import { dataInputParaLocal } from "@/lib/utils";
import { lerFiltros, salvarFiltros } from "@/lib/filtrosRequisicoes";
import { ORDEM_PADRAO, ORDENS, ehOrdem, ordenarEmGrupos, type OrdemRequisicoes } from "@/lib/ordemRequisicoes";
import {
  ABA_PADRAO, abaDoAtalho, abasPara, casaComBusca, ehAba, estaNaAba, numeroDaBusca, type AbaRequisicoes,
} from "@/lib/abasRequisicoes";
import { ABA_ATIVA, ABA_INATIVA, BOTAO_ICONE, BOTAO_PRIMARIO, CAMPO, SUBTITULO, TITULO } from "@/lib/estilos";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, RefreshCcw, Filter, FilterX, X, ArrowLeft, ArrowUpDown, Check, Search } from "lucide-react";
import { hasSupabaseKeys } from "@/lib/supabase";
import { useRequisicoesSync } from "@/hooks/useRequisicoesSync";
import { RequisicaoCard, CabecalhoDaTabela } from "@/components/RequisicaoCard";
import { Input } from "@/components/ui/input";

// Refinos do funil: valem dentro da aba (ou da busca).
type FiltroStatus = "TODAS" | "PENDENTE" | "SEPARANDO" | "FINALIZADA" | "CANCELADA" | "AGUARDANDO" | "RUPTURAS";
const STATUS_VALIDOS: FiltroStatus[] = ["TODAS", "PENDENTE", "SEPARANDO", "FINALIZADA", "CANCELADA", "AGUARDANDO", "RUPTURAS"];
const OPCOES_DE_STATUS: { label: string; value: FiltroStatus }[] = [
  { label: "Todos", value: "TODAS" },
  { label: "Pendentes", value: "PENDENTE" },
  { label: "Separando", value: "SEPARANDO" },
  { label: "Aguardando", value: "AGUARDANDO" },
  { label: "Finalizadas", value: "FINALIZADA" },
  { label: "Rupturas", value: "RUPTURAS" },
  { label: "Canceladas", value: "CANCELADA" },
];
type FiltroLancamento = "TODOS" | "A_LANCAR" | "LANCADAS";

// A mesma aba do resto do app (ABA), mas no celular cada uma tem a largura do
// nome e a linha quebra quando falta espaço: em colunas iguais, "Aguardando"
// era cortado.
const ABA_DA_FILA =
  "flex flex-auto sm:flex-1 items-center justify-center gap-1.5 sm:gap-2 h-9 sm:h-auto px-2.5 sm:px-3 rounded-md text-[13px] sm:text-sm font-bold whitespace-nowrap transition-colors";

// Funil ou ordem ligados: o mesmo botão de ícone, em verde-claro (como antes).
const BOTAO_ICONE_LIGADO = "h-11 w-11 p-0 shrink-0 bg-teal-50 text-teal-700 border-teal-200";

const ROTULO_DO_CAMPO ="text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1 block";

export default function ListaRequisicoes() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const ehAlmoxarifado = user?.perfil === "ALMOXARIFADO";
  // Filtros guardados neste menu: voltar de uma requisição ou dar F5 não os
  // perde. Somem ao ir para outro menu (ver filtrosRequisicoes.ts).
  const [salvos] = useState(() => lerFiltros(user?.id));

  const {
    reqs,
    loading,
    updating,
    lastUpdated,
    atualizarManualmente,
  } = useRequisicoesSync(user?.perfil === "SOLICITANTE" ? user.id : undefined);

  // Aba: atalho do painel (?filter=aguardando, ?lancamento=a_lancar) vale
  // mais que a guardada. "A lançar" só existe para o almoxarifado.
  const abas = abasPara(ehAlmoxarifado);
  const [aba, setAba] = useState<AbaRequisicoes>(() => {
    const doAtalho = abaDoAtalho(searchParams.get("filter"), searchParams.get("lancamento"));
    const escolhida = doAtalho ?? (ehAba(salvos.aba) ? salvos.aba : ABA_PADRAO);
    return abas.some((a) => a.aba === escolhida) ? escolhida : ABA_PADRAO;
  });

  // Busca única: número, item, setor ou quem pediu. Procura em todas as abas.
  // Adiada para a digitação não engasgar no celular com centenas de requisições.
  const [busca, setBusca] = useState(salvos.busca || "");
  const buscaAdiada = useDeferredValue(busca.trim());
  const numeroBuscado = numeroDaBusca(buscaAdiada);

  // Refinos do funil.
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>(() =>
    STATUS_VALIDOS.includes(salvos.status as FiltroStatus) ? (salvos.status as FiltroStatus) : "TODAS"
  );
  const [filtroLancamento, setFiltroLancamento] = useState<FiltroLancamento>(() =>
    ehAlmoxarifado && (salvos.lancamento === "A_LANCAR" || salvos.lancamento === "LANCADAS")
      ? salvos.lancamento
      : "TODOS"
  );
  const [advDateStart, setAdvDateStart] = useState(salvos.dataInicial || "");
  const [advDateEnd, setAdvDateEnd] = useState(salvos.dataFinal || "");
  // Painel aberto se ficou aberto, ou se há filtro nele: filtro escondido
  // aplicado confunde ("cadê as requisições?").
  const [showAdvanced, setShowAdvanced] = useState(
    !!salvos.painelAberto ||
      !!(salvos.dataInicial || salvos.dataFinal) ||
      (!!salvos.status && salvos.status !== "TODAS") ||
      (!!salvos.lancamento && salvos.lancamento !== "TODOS")
  );

  // Ordem da lista: só o almoxarifado escolhe (o solicitante vê só as dele,
  // e setor/solicitante não fazem sentido para ele). Guardada como os filtros.
  const [ordem, setOrdem] = useState<OrdemRequisicoes>(() =>
    ehAlmoxarifado && ehOrdem(salvos.ordem) ? salvos.ordem : ORDEM_PADRAO
  );
  const ordemLigada = ordem !== ORDEM_PADRAO;
  const rotuloDaOrdem = ORDENS.find((o) => o.valor === ordem)?.rotulo || "";

  useEffect(() => {
    salvarFiltros(user?.id, {
      aba,
      busca,
      status: filtroStatus,
      lancamento: filtroLancamento,
      dataInicial: advDateStart,
      dataFinal: advDateEnd,
      painelAberto: showAdvanced,
      ordem,
    });
  }, [user?.id, aba, busca, filtroStatus, filtroLancamento, advDateStart, advDateEnd, showAdvanced, ordem]);

  // O atalho do painel já virou aba guardada: tira da URL, senão um F5
  // depois de trocar de aba voltaria para a do atalho.
  useEffect(() => {
    if (searchParams.has("filter") || searchParams.has("lancamento")) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tudo o que vale antes da aba e da busca: dono (solicitante) e o funil.
  const filtradas = useMemo(() => {
    let result = reqs;

    // Filtrar estritamente pelo ID do usuário autenticado se for SOLICITANTE
    if (user?.perfil === "SOLICITANTE") {
      result = result.filter(r => r.usuario_id === user.id);
    }

    if (filtroStatus === "PENDENTE") result = result.filter(r => r.status === "PENDENTE");
    if (filtroStatus === "AGUARDANDO") result = result.filter(r => r.status === "AGUARDANDO");
    if (filtroStatus === "SEPARANDO") result = result.filter(r => r.status === "SEPARANDO");
    if (filtroStatus === "FINALIZADA") result = result.filter(r => ["FINALIZADA", "RUPTURA_PARCIAL", "RUPTURA_TOTAL"].includes(r.status));
    if (filtroStatus === "RUPTURAS") result = result.filter(r => ["RUPTURA_PARCIAL", "RUPTURA_TOTAL"].includes(r.status));
    if (filtroStatus === "CANCELADA") result = result.filter(r => r.status === "CANCELADA");

    if (filtroLancamento === "LANCADAS") {
      result = result.filter(r => r.lancado === true);
    } else if (filtroLancamento === "A_LANCAR") {
      result = result.filter(r => estaNaAba(r, "A_LANCAR"));
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
  }, [reqs, user?.perfil, user?.id, filtroStatus, filtroLancamento, advDateStart, advDateEnd]);

  const contagem = useMemo(() => {
    const n: Partial<Record<AbaRequisicoes, number>> = {};
    for (const a of abas) if (a.conta) n[a.aba] = filtradas.filter((r) => estaNaAba(r, a.aba)).length;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, ehAlmoxarifado]);

  // Com busca, procura em todas as abas (como no e-mail): achar a #72 não
  // pode depender de saber em que aba ela está.
  const requisicoes = useMemo(
    () => buscaAdiada
      ? filtradas.filter((r) => casaComBusca(r, buscaAdiada))
      : filtradas.filter((r) => estaNaAba(r, aba)),
    [filtradas, aba, buscaAdiada]
  );

  const grupos = useMemo(() => ordenarEmGrupos(requisicoes, ordem), [requisicoes, ordem]);

  const filtrosAtivos =
    filtroStatus !== "TODAS" || filtroLancamento !== "TODOS" || !!advDateStart || !!advDateEnd;

  const limparTodosOsFiltros = () => {
    setFiltroStatus("TODAS");
    setFiltroLancamento("TODOS");
    setAdvDateStart("");
    setAdvDateEnd("");
  };

  const trocarAba = (nova: AbaRequisicoes) => {
    setAba(nova);
    setBusca("");
  };

  // Cada filtro ligado vira uma etiqueta acima da lista, com o X dele. Com os
  // filtros guardados entre telas, era fácil esquecer que um estava ligado.
  const dataCurta = (valor: string) => {
    const d = dataInputParaLocal(valor);
    return d ? format(d, "dd/MM/yy") : valor;
  };
  const filtrosLigados: { chave: string; rotulo: string; limpar: () => void }[] = [];
  if (filtroStatus !== "TODAS") {
    filtrosLigados.push({
      chave: "status",
      rotulo: OPCOES_DE_STATUS.find((o) => o.value === filtroStatus)?.label || filtroStatus,
      limpar: () => setFiltroStatus("TODAS"),
    });
  }
  if (filtroLancamento !== "TODOS") {
    filtrosLigados.push({
      chave: "lancamento",
      rotulo: filtroLancamento === "A_LANCAR" ? "A lançar" : "Lançadas",
      limpar: () => setFiltroLancamento("TODOS"),
    });
  }
  if (advDateStart) filtrosLigados.push({ chave: "de", rotulo: `De ${dataCurta(advDateStart)}`, limpar: () => setAdvDateStart("") });
  if (advDateEnd) filtrosLigados.push({ chave: "ate", rotulo: `Até ${dataCurta(advDateEnd)}`, limpar: () => setAdvDateEnd("") });

  const rotuloDaAba = abas.find((a) => a.aba === aba)?.rotulo || "";
  const textoDaBusca = numeroBuscado ? `#${numeroBuscado}` : `“${buscaAdiada}”`;

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-10">
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

      {/* Cabeçalho: título e as duas ações da tela (Nova, atualizar). */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className={TITULO}>Requisições</h1>
          <p className={SUBTITULO}>
            {user?.perfil === "SOLICITANTE"
              ? "Acompanhe seus pedidos."
              : "Central operacional do Almoxarifado."}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            onClick={atualizarManualmente}
            disabled={updating}
            title={`Atualizado às ${format(lastUpdated, "HH:mm")}`}
            aria-label="Atualizar a lista"
            className={BOTAO_ICONE}
          >
            <RefreshCcw className={`w-4 h-4 ${updating ? "animate-spin" : ""}`} />
          </Button>
          <Link to="/requisicoes/nova">
            <Button title="Criar nova requisição" className={BOTAO_PRIMARIO}>
              <Plus className="h-4 w-4 mr-1.5" /> Nova
            </Button>
          </Link>
        </div>
      </div>

      {!hasSupabaseKeys && import.meta.env.DEV && (
        <div className="p-4 bg-orange-100 text-orange-800 rounded-xl text-sm border border-orange-200 shadow-md">
          <strong>Atenção:</strong> Supabase não configurado.
        </div>
      )}

      {/* Abas da fila de trabalho, no mesmo estilo das abas do resto do app.
          No celular viram duas linhas: rolar de lado escondia as últimas (foi
          por isso que as antigas pílulas de status saíram). */}
      <div
        role="tablist"
        aria-label="Requisições por situação"
        className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 sm:flex-nowrap sm:h-11"
      >
        {abas.map((a) => {
          const ativa = !buscaAdiada && a.aba === aba;
          return (
            <button
              key={a.aba}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => trocarAba(a.aba)}
              className={`${ABA_DA_FILA} ${ativa ? ABA_ATIVA : ABA_INATIVA}`}
            >
              <span>{a.rotulo}</span>
              {a.conta && (
                <span className={`tabular-nums text-xs ${ativa ? "text-teal-700" : "text-slate-500"}`}>
                  {contagem[a.aba] ?? 0}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Busca única + funil (período e refinos) + ordenar. */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={ehAlmoxarifado ? "Buscar nº, item, setor ou pessoa" : "Buscar nº ou item"}
            aria-label="Buscar requisição por número, item, setor ou pessoa"
            className={`${CAMPO} w-full pl-9 pr-3 font-medium placeholder:font-normal placeholder:text-slate-400`}
          />
        </div>

        <Button
          variant="outline"
          onClick={() => setShowAdvanced(!showAdvanced)}
          title="Filtrar por período e status"
          aria-label="Filtros"
          className={showAdvanced || filtrosAtivos ? BOTAO_ICONE_LIGADO : BOTAO_ICONE}
        >
          <Filter className="w-4 h-4" />
        </Button>

        {/* Ordenar: não esconde nada, só muda a ordem (e agrupa). */}
        {ehAlmoxarifado && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  title={`Ordenar: ${rotuloDaOrdem.toLowerCase()}`}
                  aria-label="Ordenar a lista"
                  className={ordemLigada ? BOTAO_ICONE_LIGADO : BOTAO_ICONE}
                />
              }
            >
              <ArrowUpDown className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 p-1.5 bg-white border border-slate-200 rounded-xl shadow-lg">
              <p className="px-2 pt-1 pb-1.5 text-[10px] font-black text-slate-500 uppercase tracking-wider">Ordenar</p>
              {ORDENS.map((o) => (
                <DropdownMenuItem
                  key={o.valor}
                  onClick={() => setOrdem(o.valor)}
                  className={`cursor-pointer rounded-lg py-2 text-sm flex items-center gap-2 ${
                    o.valor === ordem ? "font-bold text-teal-800" : "font-medium text-slate-700"
                  }`}
                >
                  <Check className={`h-4 w-4 shrink-0 ${o.valor === ordem ? "text-teal-600" : "invisible"}`} />
                  {o.rotulo}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {/* Funil: o período e os refinos de status e lançamento. Valem dentro
            da aba e também na busca. */}
        {showAdvanced && (
          <div className={`bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 p-4 grid grid-cols-2 gap-4 ${
            ehAlmoxarifado ? "lg:grid-cols-4" : "lg:grid-cols-3"
          }`}>
            <div>
              <label htmlFor="filtro-status" className={ROTULO_DO_CAMPO}>Status</label>
              <select
                id="filtro-status"
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {OPCOES_DE_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            {ehAlmoxarifado && (
              <div>
                <label htmlFor="filtro-lancamento" className={ROTULO_DO_CAMPO}>Lançamento no TOTVS</label>
                <select
                  id="filtro-lancamento"
                  value={filtroLancamento}
                  onChange={(e) => setFiltroLancamento(e.target.value as FiltroLancamento)}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="TODOS">Todas</option>
                  <option value="A_LANCAR">A lançar</option>
                  <option value="LANCADAS">Lançadas</option>
                </select>
              </div>
            )}
            <div>
              <label className={ROTULO_DO_CAMPO}>Data Inicial</label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={advDateStart}
                onChange={e => setAdvDateStart(e.target.value)}
              />
            </div>
            <div>
              <label className={ROTULO_DO_CAMPO}>Data Final</label>
              <Input
                type="date"
                className="h-9 text-sm"
                value={advDateEnd}
                onChange={e => setAdvDateEnd(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Filtros ligados, cada um com o seu X, e o "Limpar filtros" que
            zera tudo de uma vez. A ordem fora da padrão também ganha etiqueta
            (outra cor: não é filtro, não esconde nada), e o "Limpar filtros"
            não mexe nela. */}
        {(filtrosLigados.length > 0 || ordemLigada) && (
          <div className="flex flex-wrap items-center gap-2">
            {ordemLigada && (
              <button
                type="button"
                onClick={() => setOrdem(ORDEM_PADRAO)}
                title="Voltar para mais recentes primeiro"
                className="inline-flex max-w-full items-center gap-1 h-7 pl-2 pr-1.5 rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="truncate">{rotuloDaOrdem}</span>
                <X className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </button>
            )}
            {filtrosLigados.length > 0 && <span className="text-xs font-semibold text-slate-500">Filtros:</span>}
            {filtrosLigados.map((f) => (
              <button
                key={f.chave}
                type="button"
                onClick={f.limpar}
                title="Tirar este filtro"
                className="inline-flex max-w-full items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full border border-teal-200 bg-teal-50 text-xs font-semibold text-teal-800 hover:bg-teal-100 transition-colors"
              >
                <span className="truncate">{f.rotulo}</span>
                <X className="h-3.5 w-3.5 shrink-0 opacity-70" />
              </button>
            ))}
            {filtrosLigados.length > 0 && (
              <button
                type="button"
                onClick={limparTodosOsFiltros}
                className="ml-auto inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-sm hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-colors"
              >
                <FilterX className="h-4 w-4" /> Limpar filtros
              </button>
            )}
          </div>
        )}

        {/* Buscando, a lista sai de todas as abas: diz isso, para ninguém
            achar que a busca está presa na aba de antes. */}
        {buscaAdiada && !loading && requisicoes.length > 0 && (
          <p className="text-xs text-slate-600 [overflow-wrap:anywhere]">
            <strong className="text-slate-800">{requisicoes.length}</strong>{" "}
            {requisicoes.length === 1 ? "requisição" : "requisições"} com{" "}
            <strong className="text-slate-800">{textoDaBusca}</strong> em todas as abas
            {filtrosAtivos && ", nos filtros atuais"}.
          </p>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-slate-700 font-medium">
          Carregando requisições...
        </div>
      ) : requisicoes.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200/80 shadow-md shadow-slate-200/50 border-dashed">
          <p className="text-slate-700 mb-4 font-medium px-4 [overflow-wrap:anywhere]">
            {buscaAdiada
              ? `Nenhuma requisição com ${textoDaBusca}${filtrosAtivos ? " nos filtros atuais" : ""}.`
              : filtrosAtivos
                ? `Nada em “${rotuloDaAba}” com os filtros atuais.`
                : aba === "A_FAZER"
                  ? (ehAlmoxarifado ? "Nada a fazer agora." : "Nenhuma requisição em aberto.")
                  : aba === "TODAS"
                    ? "Nenhuma requisição ainda."
                    : `Nada em “${rotuloDaAba}”.`}
          </p>
          {filtrosAtivos ? (
            <Button
              variant="outline"
              onClick={limparTodosOsFiltros}
              className="border-teal-600 text-teal-700 hover:bg-teal-50 font-bold"
            >
              <FilterX className="h-4 w-4 mr-2" /> Limpar filtros
            </Button>
          ) : !buscaAdiada && aba !== "TODAS" ? (
            <Button
              variant="outline"
              onClick={() => trocarAba("TODAS")}
              className="border-teal-600 text-teal-700 hover:bg-teal-50 font-bold"
            >
              Ver todas
            </Button>
          ) : !buscaAdiada ? (
            <Link to="/requisicoes/nova">
              <Button
                variant="outline"
                className="border-teal-600 text-teal-700 hover:bg-teal-50 font-bold"
              >
                Criar Nova Requisição
              </Button>
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5">
          {grupos.map((g) => (
            <section key={g.titulo ?? "todas"} className="space-y-2">
              {g.titulo && (
                <h2 className="flex items-baseline gap-1.5 px-1 text-xs font-black uppercase tracking-wider text-slate-600">
                  <span className="truncate">{g.titulo}</span>
                  <span className="font-semibold text-slate-400">· {g.reqs.length}</span>
                </h2>
              )}
              {/* Celular: cartões. Computador: uma tabela, com o cabeçalho
                  das colunas uma vez só em vez de um rótulo em cada cartão. */}
              <div className="grid gap-2 lg:gap-0 lg:bg-white lg:rounded-xl lg:border lg:border-slate-200 lg:shadow-lg lg:shadow-slate-200/50 lg:overflow-hidden lg:divide-y lg:divide-slate-100">
                <CabecalhoDaTabela />
                {g.reqs.map((req) => (
                  <RequisicaoCard
                    key={req.id}
                    req={req}
                    buscaItem={numeroBuscado ? undefined : buscaAdiada}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
