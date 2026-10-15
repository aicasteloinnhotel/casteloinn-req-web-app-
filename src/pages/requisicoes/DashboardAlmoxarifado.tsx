import React, { useMemo, useEffect, useState, useCallback } from "react";
import {
  addDays,
  addWeeks,
  differenceInCalendarDays,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Requisicao, ItemReposicao } from "@/types";
import { getListaReposicao } from "@/services/reposicao";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import { descreverQuantidades, foiEntregue, formatItemName, precisaLancar } from "@/lib/utils";
import { BotaoSuspenderRequisicoes } from "@/components/PausaInventario";
import { useBloqueio } from "@/contexts/BloqueioContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Inbox,
  PackageCheck,
  ClipboardList,
  ShoppingCart,
  Printer,
  RefreshCcw,
  MessageSquareWarning,
  ChevronRight,
  PackageSearch,
} from "lucide-react";

interface GroupedItem {
  item_id: string;
  item: any;
  tipo_origem: string;
  manual_items: ItemReposicao[];
  rupturas: ItemReposicao[];
  all_ids: string[];
  total_quantidade: number;
  urgente?: boolean;
  prazo_target_date?: number | null;
  prazo_original?: string;
}

interface Props {
  reqs: Requisicao[];
  lastUpdated: Date;
  updating: boolean;
  onRefresh: () => void;
}

/** Há quanto tempo: "38 min", "3 h", "2 dias". */
const tempoDesde = (iso: string, agora: number): string => {
  const min = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
};

/** "Bom dia" até 11h59, "Boa tarde" até 17h59, depois "Boa noite". */
const saudacao = (quando: Date): string => {
  const h = quando.getHours();
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
};

/**
 * Só o primeiro nome, com a primeira letra maiúscula ("MARIA JOSÉ" → "Maria").
 * Login que é cargo abreviado ("Enc. Almoxarifado") fica inteiro: "Enc."
 * sozinho não diz nada.
 */
const primeiroNome = (nome?: string | null): string => {
  const limpo = (nome || "").trim().replace(/\s+/g, " ");
  const primeiro = limpo.split(" ")[0] || "";
  if (!primeiro) return "";
  if (primeiro.endsWith(".")) return limpo;
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
};

/** Pedido esperando mais que isto fica em destaque na fila. */
const ESPERA_LONGA_MIN = 30;
/** Entregue e não lançada há mais que isto: atenção no TOTVS. */
const LANCAMENTO_ATRASADO_DIAS = 7;
/** Janela do gráfico de linha. */
const MESES_NO_GRAFICO = 6;
/** Com mais dias que isto de dados, o gráfico passa de diário a semanal. */
const DIAS_ATE_AGRUPAR_POR_SEMANA = 62;
const CARTAO ="bg-white rounded-xl border border-slate-200 shadow-sm";

/** Um dos números do topo. Tocar abre a lista certa já filtrada. */
function Indicador({
  icone,
  titulo,
  valor,
  detalhe,
  tomDetalhe = "neutro",
  aoTocar,
  extra,
}: {
  icone: React.ReactNode;
  titulo: string;
  valor: number;
  detalhe: string;
  tomDetalhe?: "neutro" | "atencao" | "perigo";
  aoTocar: () => void;
  extra?: React.ReactNode;
}) {
  const cor =
    tomDetalhe === "perigo" ? "text-red-600" : tomDetalhe === "atencao" ? "text-amber-700" : "text-slate-500";
  // O quadrado do ícone ocupa o vazio à esquerda e já diz o tom: verde em dia,
  // âmbar atenção, vermelho atrasado.
  const caixaIcone =
    tomDetalhe === "perigo"
      ? "bg-red-50 text-red-600"
      : tomDetalhe === "atencao"
        ? "bg-amber-50 text-amber-700"
        : "bg-teal-50 text-teal-700";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={aoTocar}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); aoTocar(); } }}
      className={`${CARTAO} p-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3 text-left cursor-pointer hover:border-teal-300 hover:shadow-md transition-all min-w-0 relative`}
    >
      {/* No celular o ícone fica em cima: lado a lado, o texto ficava com
          três dedos de largura e quebrava em várias linhas. */}
      <span className={`h-9 w-9 sm:h-11 sm:w-11 shrink-0 rounded-xl flex items-center justify-center ${caixaIcone} [&>svg]:h-5 [&>svg]:w-5`}>
        {icone}
      </span>
      <div className="min-w-0 flex-1 w-full">
        {/* Espaço à direita só no título do cartão que tem botão no canto
            (Reposição); o detalhe embaixo usa a largura toda. No celular o
            botão fica na altura do ícone e não encosta no título. */}
        <p className={`text-xs font-semibold text-slate-600 leading-tight ${extra ? "sm:pr-8" : ""}`}>{titulo}</p>
        <p className="text-2xl font-black text-slate-800 leading-none mt-1 tabular-nums">{valor}</p>
        <p className={`text-xs font-semibold mt-1 leading-tight ${cor} [overflow-wrap:anywhere]`}>{detalhe}</p>
      </div>
      {extra}
    </div>
  );
}

export default function DashboardAlmoxarifado({
  reqs,
  lastUpdated,
  updating,
  onRefresh,
}: Props) {
  const navigate = useNavigate();
  const { bloqueio } = useBloqueio();
  const { user } = useAuth();

  const [listaReposicao, setListaReposicao] = useState<ItemReposicao[]>([]);

  const fetchListaReposicao = useCallback(async () => {
    try {
      const data = await getListaReposicao();
      setListaReposicao(data.filter(i => !i.resolvido));
    } catch (error) {
      console.error("Erro ao carregar lista de reposição no dashboard", error);
    }
  }, []);

  // Antes isso dependia de `updating`, que alterna true/false e disparava duas
  // buscas por atualização — e nunca reagia a mudanças na própria reposição.
  useEffect(() => {
    const channel = supabase
      .channel(`dashboard-reposicao-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reposicao_itens" },
        () => fetchListaReposicao(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchListaReposicao]);

  // Carga inicial + realinhamento a cada sync/refresh da lista de requisições.
  useEffect(() => {
    fetchListaReposicao();
  }, [lastUpdated, fetchListaReposicao]);

  // Relógio de 1 minuto: o "esperando há 38 min" anda sozinho na tela.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  // --- OS QUATRO NÚMEROS ---
  const pendentes = useMemo(
    () => reqs.filter((r) => r.status === "PENDENTE")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [reqs],
  );
  const separando = useMemo(() => reqs.filter((r) => r.status === "SEPARANDO"), [reqs]);
  const aLancar = useMemo(() => reqs.filter((r) => precisaLancar(r.status) && !r.lancado), [reqs]);

  // --- ENTREGUES HOJE ---
  // A requisição não guarda a hora da entrega, mas o aceite do termo é
  // gravado na entrega (é obrigatório para finalizar): em produção bate com o
  // evento de finalização do histórico em todas as encerradas. Conta toda
  // entrega, inclusive complementar e balcão.
  const entregas = useMemo(() => {
    const hoje = startOfDay(new Date(agora)).getTime();
    const ontem = hoje - 864e5;
    let deHoje = 0;
    let deOntem = 0;
    for (const r of reqs) {
      if (!foiEntregue(r.status) || !r.termo_aceito_em) continue;
      const t = new Date(r.termo_aceito_em).getTime();
      if (t >= hoje) deHoje += 1;
      else if (t >= ontem) deOntem += 1;
    }
    return { hoje: deHoje, ontem: deOntem };
  }, [reqs, agora]);
  const aLancarAtrasadas = aLancar.filter(
    (r) => agora - new Date(r.created_at).getTime() > LANCAMENTO_ATRASADO_DIAS * 864e5,
  ).length;

  // --- LISTA DE REPOSIÇÃO (Indicadores) ---
  const reposicao = useMemo(() => {
    const ativos = listaReposicao.filter(item => {
      if (item.resolvido) return false;
      if (item.tipo_origem === "RUPTURA" && item.requisicao?.status !== "AGUARDANDO") return false;
      return true;
    });
    // Itens distintos, como na Lista de Reposição (o mesmo material de duas
    // requisições é uma linha só lá).
    const itens = new Set(ativos.map((i) => i.item_id));
    const urgentes = new Set(ativos.filter((i) => i.urgente).map((i) => i.item_id));
    return { itens: itens.size, urgentes: urgentes.size };
  }, [listaReposicao]);
  const aguardando = useMemo(
    () => reqs.filter((r) => r.status === "AGUARDANDO")
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [reqs],
  );
  const aguardandoMaterial = aguardando.length;

  // --- GRÁFICO: requisições e rupturas dos últimos 6 meses ---
  // Começa no primeiro pedido quando ele é mais recente que 6 meses (sem isso,
  // o começo da linha ficava vazio, de antes de o app existir). Com até 2
  // meses de dados vai por dia; com mais, por semana — 180 pontos diários
  // virariam um serrote ilegível. Complementar não conta (não é pedido novo);
  // cancelada também não.
  const grafico = useMemo(() => {
    const hoje = startOfDay(new Date(agora));
    const limite = startOfDay(subMonths(hoje, MESES_NO_GRAFICO));
    const primeiro = reqs.reduce(
      (min, r) => Math.min(min, new Date(r.created_at).getTime()),
      Number.POSITIVE_INFINITY,
    );
    const inicio = Number.isFinite(primeiro) && primeiro > limite.getTime()
      ? startOfDay(new Date(primeiro))
      : limite;
    const diasDeDados = differenceInCalendarDays(hoje, inicio) + 1;
    const porSemana = diasDeDados > DIAS_ATE_AGRUPAR_POR_SEMANA;
    const inicioDoPonto = (d: Date) => (porSemana ? startOfWeek(d, { weekStartsOn: 1 }) : startOfDay(d));

    const pontos: { chave: string; nome: string; reqs: number; rupturas: number }[] = [];
    for (
      let d = inicioDoPonto(inicio);
      d <= hoje;
      d = porSemana ? addWeeks(d, 1) : addDays(d, 1)
    ) {
      pontos.push({ chave: format(d, "yyyy-MM-dd"), nome: format(d, "dd/MM"), reqs: 0, rupturas: 0 });
    }
    if (pontos.length === 1) {
      // Uma linha precisa de dois pontos: no primeiro dia, mostra a véspera.
      const vespera = subDays(hoje, 1);
      pontos.unshift({ chave: format(vespera, "yyyy-MM-dd"), nome: format(vespera, "dd/MM"), reqs: 0, rupturas: 0 });
    }
    const porChave = new Map(pontos.map((p) => [p.chave, p]));
    for (const r of reqs) {
      if (r.requisicao_origem_id || r.status === "CANCELADA") continue;
      const quando = new Date(r.created_at);
      if (quando < inicio) continue;
      const ponto = porChave.get(format(inicioDoPonto(quando), "yyyy-MM-dd"));
      if (!ponto) continue;
      ponto.reqs += 1;
      if (r.status === "RUPTURA_PARCIAL" || r.status === "RUPTURA_TOTAL") ponto.rupturas += 1;
    }
    const total = pontos.reduce((s, p) => s + p.reqs, 0);
    const rupturas = pontos.reduce((s, p) => s + p.rupturas, 0);
    return {
      pontos,
      porSemana,
      desde: inicio.getTime() > limite.getTime() ? format(inicio, "dd/MM") : null,
      total,
      rupturas,
      pct: total ? Math.round((rupturas / total) * 100) : 0,
    };
  }, [reqs, agora]);

  // --- FILA DE ATENDIMENTO: quem espera há mais tempo primeiro ---
  const fila = useMemo(
    () => [...pendentes, ...[...separando].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())],
    [pendentes, separando],
  );

  // --- DO MÊS: quem mais pede ---
  const inicioDoMes = startOfMonth(new Date(agora));
  const quemMaisPede = useMemo(() => {
    const contas: Record<string, { nome: string; dep: string; count: number }> = {};
    for (const r of reqs) {
      if (r.status === "CANCELADA" || r.requisicao_origem_id) continue;
      if (new Date(r.created_at) < inicioDoMes) continue;
      const chave = `${r.usuario?.nome || "Desconhecido"}|${r.departamento}`;
      contas[chave] ??= { nome: r.usuario?.nome || "Desconhecido", dep: r.departamento, count: 0 };
      contas[chave].count += 1;
    }
    // Só as 3 pessoas que mais pedem; o total do mês dá o tamanho de cada
    // barra (a parte do mês que é dela).
    const ordenado = Object.values(contas).sort((a, b) => b.count - a.count);
    const total = ordenado.reduce((s, c) => s + c.count, 0);
    return { top: ordenado.slice(0, 3), total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqs, inicioDoMes.getTime()]);
  const nomeDoMes = format(new Date(agora), "MMMM", { locale: ptBR });

  const handlePrint = () => {
    // Primeiro, vamos agrupar os itens
    const groups = new Map<string, GroupedItem>();

    for (const item of listaReposicao) {
      if (item.resolvido) continue;
      if (item.tipo_origem === "RUPTURA" && item.requisicao?.status !== "AGUARDANDO") continue;

      if (!groups.has(item.item_id)) {
        groups.set(item.item_id, {
          item_id: item.item_id,
          item: item.item,
          tipo_origem: item.tipo_origem,
          manual_items: [],
          rupturas: [],
          all_ids: [],
          total_quantidade: 0,
          urgente: item.urgente,
          prazo_target_date: item.prazo_target_date,
          prazo_original: item.prazo_original
        });
      } else {
        const group = groups.get(item.item_id)!;
        if (item.urgente) {
           group.urgente = item.urgente;
           group.prazo_target_date = item.prazo_target_date;
           group.prazo_original = item.prazo_original;
        }
      }

      const group = groups.get(item.item_id)!;
      group.all_ids.push(item.id);
      group.total_quantidade += (item.quantidade || 1);

      if (item.tipo_origem === "MANUAL" && !item.resolvido) {
        group.manual_items.push(item);
      }
      if (item.tipo_origem === "RUPTURA" && item.requisicao?.status === "AGUARDANDO") {
        group.rupturas.push(item);
        group.tipo_origem = "RUPTURA";
      }
    }

    const groupedItems = Array.from(groups.values()).sort((a, b) => {
      if (a.urgente && !b.urgente) return -1;
      if (!a.urgente && b.urgente) return 1;
      return (formatItemName(a.item?.nome) || "").localeCompare(formatItemName(b.item?.nome) || "");
    });

    const doc = new jsPDF();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Castelo Inn", 105, 20, { align: "center" });

    doc.setFontSize(14);
    doc.text("Lista de Reposição de Estoque", 105, 28, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, 105, 36, { align: "center" });

    const head = [["Nome do Item", "Qtd. Nec.", "Origem", "Status"]];
    const body = groupedItems.map((group) => {
      const origens = [];
      if (group.rupturas.length > 0) origens.push(`Reqs: ${group.rupturas.map(r => r.requisicao?.codigo_requisicao || '?').join(', ')}`);
      if (group.manual_items.length > 0) origens.push('Manual');
      const origemStr = origens.join(" | ");

      return [
        formatItemName(group.item?.nome) || "Item Desconhecido",
        descreverQuantidades([...group.manual_items, ...group.rupturas]),
        origemStr,
        group.urgente ? "Urgente" : "Normal"
      ];
    });

    autoTable(doc, {
      head: head,
      body: body,
      startY: 42,
      styles: { fontSize: 10, cellPadding: 3 },
      headStyles: { fillColor: [15, 118, 110] }, // teal-700
      alternateRowStyles: { fillColor: [248, 250, 252] } // slate-50
    });

    doc.save(`lista_reposicao_${format(new Date(), "yyyyMMdd_HHmm")}.pdf`);
  };


  /** Uma linha da fila: número, setor, quem pediu, observação e a espera. */
  const linhaDaFila = (r: Requisicao) => {
    const espera = agora - new Date(r.created_at).getTime();
    const separandoAgora = r.status === "SEPARANDO";
    const demorando = !separandoAgora && espera > ESPERA_LONGA_MIN * 60000;
    const qtdItens = r.itens?.length ?? 0;
    return (
      <li key={r.id}>
        <button
          type="button"
          onClick={() => navigate(`/requisicoes/${r.id}`)}
          className="w-full flex items-start gap-3 py-3 text-left hover:bg-slate-50 rounded-lg px-2 -mx-2"
        >
          <span className="w-14 shrink-0 text-lg font-black text-slate-800 leading-tight tabular-nums">
            #{r.codigo_requisicao}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-slate-800 leading-tight [overflow-wrap:anywhere]">
              {r.departamento}
            </span>
            <span className="block text-xs font-medium text-slate-500 mt-0.5 [overflow-wrap:anywhere]">
              {r.usuario?.nome || "---"}
              {qtdItens > 0 && ` · ${qtdItens} ${qtdItens === 1 ? "item" : "itens"}`}
            </span>
            {r.observacao?.trim() && (
              <span className="mt-1 flex items-start gap-1 text-xs font-semibold text-amber-800" title={r.observacao.trim()}>
                <MessageSquareWarning className="h-3.5 w-3.5 mt-px shrink-0" />
                <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">{r.observacao.trim()}</span>
              </span>
            )}
          </span>
          <span
            className={`shrink-0 text-xs font-bold px-2 py-1 rounded-md tabular-nums ${
              separandoAgora
                ? "bg-teal-50 text-teal-800 border border-teal-200"
                : demorando
                  ? "bg-amber-50 text-amber-800 border border-amber-200"
                  : "bg-slate-100 text-slate-700"
            }`}
          >
            {separandoAgora ? "separando" : tempoDesde(r.created_at, agora)}
          </span>
        </button>
      </li>
    );
  };

  /**
   * Uma linha de "Aguardando material": diz O QUE falta (os itens da
   * complementar), que é o que importa quando a compra chega.
   */
  const linhaAguardando = (r: Requisicao) => {
    const nomes = (r.itens ?? []).map((l) => formatItemName(l.item?.nome) || "Item");
    const resumo = nomes.length > 2 ? `${nomes.slice(0, 2).join(", ")} +${nomes.length - 2}` : nomes.join(", ");
    return (
      <li key={r.id}>
        <button
          type="button"
          onClick={() => navigate(`/requisicoes/${r.id}`)}
          className="w-full flex items-start gap-2.5 py-2 text-left hover:bg-slate-50 rounded-lg px-2 -mx-2"
        >
          <span className="w-11 shrink-0 text-sm font-black text-slate-700 tabular-nums">#{r.codigo_requisicao}</span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-slate-800 leading-tight truncate">{r.departamento}</span>
            {resumo && (
              <span className="block text-xs text-slate-500 truncate" title={nomes.join(", ")}>{resumo}</span>
            )}
          </span>
          <span className="shrink-0 text-xs font-semibold text-slate-500 tabular-nums mt-px">
            {tempoDesde(r.created_at, agora)}
          </span>
        </button>
      </li>
    );
  };

  return (
    // No computador o painel tem a altura da tela (lg:h-full) e só a fila rola
    // por dentro. O mínimo evita espremer os gráficos numa janela muito baixa:
    // abaixo dele, quem rola é a página, como antes.
    <div className="flex flex-col w-full gap-3 bg-slate-50 animate-in fade-in pb-4 lg:pb-0 lg:h-full lg:min-h-[600px]">

      {/* OS NÚMEROS DO TOPO. O primeiro cartão é o próprio cabeçalho (título,
          data, atualizar e pausar): a linha de título separada ocupava espaço
          só para isso. Escuro, na cor do menu, para não parecer um número.
          "Pendentes agora" e "Em separação" saíram (a fila já mostra os
          dois); tempo de atendimento também não entra: muitos setores pedem
          para entregar mais tarde, então o tempo não mede o almoxarifado. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        <div className="rounded-xl bg-teal-900 text-white shadow-sm p-3 flex flex-col justify-between gap-2 min-w-0">
          {/* Saudação no lugar de "Painel": o menu já diz onde a pessoa está.
              O nome tem a largura toda e só quebra entre palavras. */}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-teal-100/90 leading-tight">{saudacao(new Date(agora))},</p>
            <h1
              className="text-base sm:text-lg font-black leading-tight tracking-tight break-words"
              title={user?.nome || undefined}
            >
              {primeiroNome(user?.nome) || "Equipe"}
            </h1>
            <p className="text-xs text-teal-100/90 leading-tight mt-1 first-letter:uppercase tabular-nums">
              {format(new Date(agora), "EEE, dd/MM", { locale: ptBR })} · atualizado às {format(lastUpdated, "HH:mm")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Pausa para inventário. Ligada, quem libera é a faixa do topo;
                aqui só fica o aviso. */}
            {bloqueio.ativo ? (
              <span className="flex-1 min-w-0 text-xs font-bold text-amber-200 leading-tight">Requisições pausadas</span>
            ) : (
              <BotaoSuspenderRequisicoes
                curto
                className="h-8 flex-1 min-w-0 border-0 bg-white text-amber-900 hover:bg-amber-50"
              />
            )}
            <button
              type="button"
              onClick={onRefresh}
              disabled={updating}
              title="Atualizar agora"
              aria-label="Atualizar o painel"
              className="h-8 w-8 shrink-0 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            >
              <RefreshCcw className={`h-4 w-4 ${updating ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
        <Indicador
          icone={<PackageCheck />}
          titulo="Entregues hoje"
          valor={entregas.hoje}
          detalhe={`ontem: ${entregas.ontem}`}
          aoTocar={() => navigate("/requisicoes?filter=finalizada")}
        />
        <Indicador
          icone={<ClipboardList />}
          titulo="A lançar no TOTVS"
          valor={aLancar.length}
          detalhe={
            aLancarAtrasadas > 0
              ? `${aLancarAtrasadas} há mais de ${LANCAMENTO_ATRASADO_DIAS} dias`
              : aLancar.length > 0 ? "todas em dia" : "nada a lançar"
          }
          tomDetalhe={aLancarAtrasadas > 0 ? "perigo" : "neutro"}
          aoTocar={() => navigate("/requisicoes?lancamento=a_lancar")}
        />
        <Indicador
          icone={<ShoppingCart />}
          titulo="Reposição"
          valor={reposicao.itens}
          detalhe={
            [
              reposicao.urgentes > 0 ? `${reposicao.urgentes} urgentes` : "",
              aguardandoMaterial > 0 ? `${aguardandoMaterial} req. aguardando` : "",
            ].filter(Boolean).join(" · ") || "nada pendente"
          }
          tomDetalhe={reposicao.urgentes > 0 ? "perigo" : "neutro"}
          aoTocar={() => navigate("/reposicao")}
          extra={
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handlePrint(); }}
              title="Imprimir lista de reposição"
              aria-label="Imprimir lista de reposição"
              className="absolute top-2.5 right-2.5 h-8 w-8 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 flex items-center justify-center"
            >
              <Printer className="h-4 w-4" />
            </button>
          }
        />
      </div>

      {/* CORPO: no computador cabe numa tela só. A fila (o que fazer agora)
          é a coluna alta da esquerda e rola por dentro; à direita o gráfico
          em cima e, embaixo, "aguardando material" e "quem mais pede". No
          celular tudo empilha nesta ordem e a página rola. */}
      <div className="grid grid-cols-1 gap-3 lg:flex-1 lg:min-h-0 lg:grid-cols-[minmax(0,10fr)_minmax(0,7fr)_minmax(0,7fr)] lg:grid-rows-[minmax(0,1.15fr)_minmax(0,1fr)]">

        {/* FILA DE ATENDIMENTO: pendentes e em separação. */}
        <section className={`${CARTAO} p-4 min-w-0 flex flex-col lg:col-start-1 lg:row-start-1 lg:row-span-2 lg:min-h-0`}>
          <div className="flex items-start justify-between gap-3 mb-1 shrink-0">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-800">Fila de atendimento</h2>
              <p className="text-xs font-semibold text-slate-500">
                {pendentes.length} {pendentes.length === 1 ? "pendente" : "pendentes"} · {separando.length} em separação · mais antiga primeiro
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate("/requisicoes?filter=pendente")}
              className="shrink-0 text-xs font-bold text-teal-700 hover:underline flex items-center mt-1"
            >
              Ver todas <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {fila.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-10 text-center">
              <span className="h-12 w-12 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center mb-2">
                <Inbox className="h-6 w-6" />
              </span>
              <p className="text-sm font-semibold text-slate-700">Nenhum pedido esperando</p>
              <p className="text-xs text-slate-500">Quando chegar requisição nova, ela aparece aqui.</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 lg:flex-1 lg:min-h-0 lg:overflow-y-auto -mx-2 px-2">
              {fila.map(linhaDaFila)}
            </ul>
          )}
        </section>

        {/* AGUARDANDO MATERIAL: cartão próprio, para não se misturar com a
            fila — não há o que separar até a compra chegar. */}
        <section className={`${CARTAO} p-4 min-w-0 flex flex-col lg:col-start-2 lg:row-start-2 lg:min-h-0`}>
          <div className="flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-8 w-8 shrink-0 rounded-lg bg-sky-50 text-sky-700 flex items-center justify-center">
                <PackageSearch className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-800 leading-tight">
                  Aguardando material <span className="font-medium text-slate-500">· {aguardando.length}</span>
                </h2>
                <p className="text-xs text-slate-500 leading-tight">esperando a compra chegar</p>
              </div>
            </div>
            {aguardando.length > 0 && (
              <button
                type="button"
                onClick={() => navigate("/requisicoes?filter=aguardando")}
                className="shrink-0 text-xs font-bold text-teal-700 hover:underline flex items-center mt-1"
              >
                Ver <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {aguardando.length === 0 ? (
            <p className="text-sm text-slate-500 mt-3">Nenhuma requisição esperando material.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 lg:flex-1 lg:min-h-0 lg:overflow-y-auto -mx-2 px-2">
              {aguardando.map(linhaAguardando)}
            </ul>
          )}
        </section>

        {/* GRÁFICO: requisições e rupturas, últimos 6 meses. */}
        <section className={`${CARTAO} p-4 min-w-0 flex flex-col lg:col-start-2 lg:col-span-2 lg:row-start-1 lg:min-h-0`}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 shrink-0">
            <h2 className="text-sm font-bold text-slate-800">
              Requisições e rupturas{" "}
              <span className="font-medium text-slate-500">
                · últimos {MESES_NO_GRAFICO} meses, {grafico.porSemana ? "por semana" : "por dia"}
                {grafico.desde && ` · desde ${grafico.desde}`}
              </span>
            </h2>
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-teal-600" /> Requisições {grafico.total}</span>
              <span className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded bg-red-500" /> Rupturas {grafico.rupturas} ({grafico.pct}%)</span>
            </div>
          </div>
          <div className="h-[200px] lg:h-auto lg:flex-1 lg:min-h-0 mt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={grafico.pontos} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="nome" axisLine={false} tickLine={false} minTickGap={24} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
                <RechartsTooltip
                  contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                  labelFormatter={(rotulo) => (grafico.porSemana ? `Semana de ${rotulo}` : String(rotulo))}
                  formatter={(v: number, nome: string) => [v, nome === "reqs" ? "Requisições" : "Rupturas"]}
                />
                {/* Sem animação: o painel abre direto pronto, e no celular lento
                    a linha "crescendo" atrasava a leitura. */}
                <Line type="monotone" dataKey="reqs" stroke="#0d9488" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                <Line type="monotone" dataKey="rupturas" stroke="#ef4444" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* QUEM MAIS PEDE: as 3 pessoas do mês. A própria barra traz o nome e
            o número — sem legenda repetindo o gráfico. */}
        <section
          role="button"
          tabIndex={0}
          onClick={() => navigate("/admin/usuarios")}
          onKeyDown={(e) => { if (e.key === "Enter") navigate("/admin/usuarios"); }}
          className={`${CARTAO} p-4 min-w-0 flex flex-col lg:col-start-3 lg:row-start-2 lg:min-h-0 cursor-pointer hover:border-teal-300 transition-colors`}
        >
          <div className="shrink-0">
            <h2 className="text-sm font-bold text-slate-800 leading-tight">
              Quem mais pede <span className="font-medium text-slate-500">· {nomeDoMes}</span>
            </h2>
            {quemMaisPede.total > 0 && (
              <p className="text-xs text-slate-500 leading-tight tabular-nums">de {quemMaisPede.total} pedidos no mês</p>
            )}
          </div>
          {quemMaisPede.top.length === 0 ? (
            <p className="text-sm text-slate-500 mt-3">Sem pedidos neste mês ainda.</p>
          ) : (
            <ul className="mt-3 space-y-2 lg:flex-1 lg:flex lg:flex-col lg:justify-center">
              {quemMaisPede.top.map((p) => {
                const pct = Math.round((p.count / quemMaisPede.total) * 100);
                // Comprimento em relação ao 1º lugar (a barra dele vai até o fim);
                // a porcentagem diz quanto do mês é de cada um.
                const largura = Math.max(8, (p.count / quemMaisPede.top[0].count) * 100);
                return (
                  <li
                    key={`${p.nome}|${p.dep}`}
                    className="relative h-11 rounded-lg bg-white border border-slate-200 overflow-hidden"
                    title={`${p.nome} — ${p.dep}: ${p.count} pedidos (${pct}% do mês)`}
                  >
                    {/* Cor clara: o texto escuro fica legível por cima. */}
                    <div className="absolute inset-y-0 left-0 bg-teal-100" style={{ width: `${largura}%` }} />
                    <div className="relative h-full flex items-center gap-2 px-3">
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block text-xs font-bold text-slate-800 truncate">{p.dep}</span>
                        <span className="block text-[11px] font-medium text-slate-600 truncate">{p.nome}</span>
                      </span>
                      <span className="shrink-0 text-sm font-black text-slate-800 tabular-nums">
                        {p.count} <span className="text-[11px] font-semibold text-slate-500">({pct}%)</span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
