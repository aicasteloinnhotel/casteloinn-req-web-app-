import React, { useMemo, useEffect, useState, useCallback } from "react";
import { format, parseISO, getMonth, getYear } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Requisicao, ItemReposicao } from "@/types";
import { getListaReposicao } from "@/services/reposicao";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Legend
} from "recharts";
import { descreverQuantidades, formatItemName } from "@/lib/utils";
import { calcularSaidas } from "@/lib/saidas";
import { StatusBadge } from "@/components/StatusBadge";
import { BotaoSuspenderRequisicoes } from "@/components/PausaInventario";
import { useBloqueio } from "@/contexts/BloqueioContext";
import { Calendar, Users, Hourglass, ShoppingCart, BarChart3, ClipboardList, Printer, AlertTriangle, Truck, MessageSquareWarning } from "lucide-react";


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

export default function DashboardAlmoxarifado({
  reqs,
  lastUpdated,
  updating,
  onRefresh,
}: Props) {
  const navigate = useNavigate();
  const { bloqueio } = useBloqueio();

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

  // --- CHART DATA ---
  const chartData = useMemo(() => {
    const months = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const data = months.map(m => ({ name: m, reqs: 0, rupturas: 0 }));
    const currentYear = new Date().getFullYear();

    reqs.forEach(req => {
      const d = parseISO(req.created_at);
      if (getYear(d) === currentYear) {
        const m = getMonth(d);
        data[m].reqs += 1;
        if (req.status === "AGUARDANDO" || req.status === "RUPTURA_PARCIAL" || req.status === "RUPTURA_TOTAL") {
          data[m].rupturas += 1;
        }
      }
    });

    return data;
  }, [reqs]);

  // --- TOP SOLICITANTES ---
  const topSolicitantes = useMemo(() => {
    const counts: Record<string, { nome: string, dep: string, count: number }> = {};
    reqs.forEach(req => {
      if (req.status !== 'CANCELADA') {
        const key = `${req.usuario?.nome || 'Desconhecido'}|${req.departamento}`;
        if (!counts[key]) counts[key] = { nome: req.usuario?.nome || 'Desconhecido', dep: req.departamento, count: 0 };
        counts[key].count += 1;
      }
    });
    return Object.values(counts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [reqs]);


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

  // --- REQ AGUARDANDO ---
  const reqsAguardando = useMemo(() => {
    // Only consider requisitions that actually have pending items in the reposicao list
    // AND are still in "AGUARDANDO" status
    const requisicoesComRuptura = new Set<string>();
    listaReposicao.forEach(item => {
      if (item.requisicao_id && !item.resolvido) {
        if (item.tipo_origem === "RUPTURA" && item.requisicao?.status !== "AGUARDANDO") return;
        requisicoesComRuptura.add(item.requisicao_id);
      }
    });
    return reqs.filter(r => requisicoesComRuptura.has(r.id) && r.status === "AGUARDANDO").slice(0, 24);
  }, [reqs, listaReposicao]);

  // --- LISTA DE REPOSIÇÃO (Indicadores) ---
  const listaComprasIndicadores = useMemo(() => {
    const activeItems = listaReposicao.filter(item => {
      if (item.resolvido) return false;
      if (item.tipo_origem === "RUPTURA" && item.requisicao?.status !== "AGUARDANDO") return false;
      return true;
    });
    
    let totalItens = activeItems.length;
    let urgentes = activeItems.filter(i => i.urgente).length;
    let pedidos = activeItems.filter(i => !i.urgente && (i.prazo_original === 'PEDIDO' || i.prazo_original?.startsWith('PEDIDO') || i.prazo_original === 'AGUARDANDO')).length;

    return { total: totalItens, urgentes, pedidos };
  }, [listaReposicao]);

  // --- CURVA ABC ---
  // Mesma conta da tela de Itens (lib/saidas): cada unidade é uma linha, e o
  // nulo do banco não é mais tratado como "já separado".
  const curvaABC = useMemo(() => {
    const saidas = calcularSaidas(reqs).filter((s) => s.valor > 0);
    const rotulo = (s: { nome: string; unidade: string }) => `${s.nome} (${s.unidade})`;
    return {
      maior: saidas.slice(0, 5).map((s) => ({ nome: rotulo(s), valor: s.valor })),
      menor: saidas.slice(-5).reverse().map((s) => ({ nome: rotulo(s), valor: s.valor })),
    };
  }, [reqs]);

  // --- REQ PENDENTES ---
  const pendentes = useMemo(() => {
    return reqs
      .filter((r) => r.status === "PENDENTE" || r.status === "SEPARANDO")
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);
  }, [reqs]);
  
  const totalPendentesCount = reqs.filter((r) => r.status === "PENDENTE" || r.status === "SEPARANDO").length;

  // Tela alta: o painel cabe inteiro. Tela baixa (notebook 1366×768,
  // 1024×768): rola um pouco, em vez de espremer os cartões de baixo.
  return (
    <div className="flex flex-col h-auto lg:h-full w-full gap-4 bg-slate-50 overflow-y-auto animate-in fade-in lg:pb-0 pb-4">

      {/* Pausa para inventário. Ligada, quem libera é a faixa do topo. */}
      {!bloqueio.ativo && (
        <div className="flex shrink-0 items-center justify-end">
          <BotaoSuspenderRequisicoes />
        </div>
      )}

      {/* HEADER ROW (CHART) */}
      <Card className="shrink-0 h-[260px] lg:h-[32%] shadow-xl shadow-slate-200/60 border-slate-200/60 border-slate-200 relative overflow-hidden p-0">
        <div className="absolute top-0 right-0 z-10">
          <div className="flex items-center gap-2 text-sm text-teal-900 font-bold border-b border-l border-teal-200/50 px-4 py-2 rounded-bl-xl bg-teal-50 shadow-sm backdrop-blur-sm">
            <Calendar className="w-4 h-4 text-teal-600" />
            {format(new Date(), "dd/MM/yyyy HH:mm")}
          </div>
        </div>
        <CardContent className="flex-1 w-full min-h-0 pt-10 px-4 pb-2 flex flex-col">
          <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 12, fill: '#334155', fontWeight: 500 }}
                />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', color: '#1e293b' }}
                  itemStyle={{ color: '#1e293b', fontWeight: 500 }}
                />
                <Legend 
                  verticalAlign="top" 
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', paddingBottom: '10px' }}
                />
                <Line 
                  name="Total de Requisições"
                  type="monotone" 
                  dataKey="reqs" 
                  stroke="#0f766e" 
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#0f766e', strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
                <Line 
                  name="Total de Rupturas"
                  type="monotone" 
                  dataKey="rupturas" 
                  stroke="#dc2626" 
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#dc2626', strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* BOTTOM AREA - 3 COLUMNS */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 lg:min-h-[400px]">
        
        {/* COLUNA 1: reposicao */}
        <div className="lg:col-span-3 flex flex-col gap-4 min-h-0 h-full">
          
          {/* Card 1: Top Solicitantes */}
          <Card 
            className="flex-shrink-0 gap-0! cursor-pointer hover:shadow-md transition-all border-slate-200 group"
            onClick={() => navigate("/admin/usuarios")}
          >
            <CardHeader className="p-3 pb-1 flex flex-row items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800">
                <Users className="w-4 h-4" />
                <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800">Top 3 Solicitantes</CardTitle>
              </div>
              <span className="text-[10px] font-bold text-slate-600 uppercase">Qtd.</span>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="flex flex-col gap-1.5 mt-1">
                {topSolicitantes.length > 0 ? topSolicitantes.map((s, idx) => (
                  <div key={idx} className="flex items-center justify-between group-hover:bg-slate-50 p-1 rounded transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-slate-700 w-4 text-center shrink-0">
                        {idx + 1}
                      </span>
                      {/* O agrupamento é por pessoa; antes exibia só o setor, o
                          que fazia o mesmo departamento aparecer repetido. */}
                      {/* Uma linha só, nome completo no title. Quebrando linha,
                          em notebook (1280×720, 1024×768) este cartão crescia e
                          espremia o "Aguardando Reposição" até sumir o conteúdo. */}
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-700 leading-snug" title={`${s.nome} — ${s.dep}`}>
                        {s.nome}{" "}
                        <span className="text-xs font-normal text-slate-500">({s.dep})</span>
                      </span>
                    </div>
                    <span className="text-sm font-bold text-teal-700 shrink-0">{s.count}</span>
                  </div>
                )) : (
                  <div className="text-sm text-slate-700 text-center py-1">Sem dados no período</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Card 2 & 3 Merged: Aguardando Reposição e Lista de Reposição */}
          <Card 
            className="flex-1 flex flex-col gap-0! min-h-0 lg:min-h-[180px] cursor-pointer hover:shadow-md transition-all border-slate-200 group"
            onClick={() => navigate("/reposicao")}
          >
            <CardHeader className="p-3 pb-2 border-b border-slate-100 flex flex-row items-center justify-between bg-white">
              <div className="flex items-center gap-2 text-slate-800 min-w-0">
                <Hourglass className="w-5 h-5 shrink-0" />
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-800 truncate">Aguardando Reposição</CardTitle>
              </div>
              {/* Impressão movida para o cabeçalho: no celular ela roubava
                  largura dos três indicadores, que é onde está o número. */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePrint(); }}
                title="Imprimir lista de reposição"
                className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Printer className="w-4 h-4" />
              </button>
            </CardHeader>
            <CardContent className="p-4 overflow-y-auto min-h-0 flex-1 flex flex-col gap-4 bg-slate-50/50">
              
              {/* Três colunas iguais ocupando toda a largura disponível. */}
              <div className="grid grid-cols-3 gap-2 shrink-0">
                <div className="bg-white border border-slate-200/80 rounded-lg flex flex-col items-center justify-center py-2.5 shadow-md shadow-slate-200/50">
                  <span className="text-[10px] font-bold text-slate-700 uppercase text-center leading-tight">Faltantes</span>
                  <span className="text-xl font-black text-slate-800 leading-none mt-1">{listaComprasIndicadores.total}</span>
                </div>
                <div className="bg-red-50 border border-red-100 rounded-lg flex flex-col items-center justify-center py-2.5 shadow-md">
                  <span className="text-[10px] font-bold text-red-600 uppercase flex items-center gap-1 text-center leading-tight">
                    Urgentes <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />
                  </span>
                  <span className="text-xl font-black text-red-700 leading-none mt-1">{listaComprasIndicadores.urgentes}</span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg flex flex-col items-center justify-center py-2.5 shadow-md">
                  <span className="text-[10px] font-bold text-amber-800 uppercase flex items-center gap-1 text-center leading-tight">
                    Pedidos <Truck className="w-3 h-3 text-amber-600 shrink-0" />
                  </span>
                  <span className="text-xl font-black text-amber-900 leading-none mt-1">{listaComprasIndicadores.pedidos}</span>
                </div>
              </div>

              <div className="flex-1 mt-1">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-2.5">Requisições Afetadas ({reqsAguardando.length})</div>
                <div className="flex flex-wrap gap-2">
                  {reqsAguardando.length > 0 ? reqsAguardando.map(r => (
                    <div 
                      key={r.id} 
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/requisicoes/${r.id}`);
                      }}
                      className="bg-white border border-slate-200/80 shadow-md shadow-slate-200/50 text-slate-700 font-semibold text-xs px-2.5 py-1.5 rounded-md hover:bg-teal-50 hover:text-teal-700 hover:border-teal-200 transition-colors cursor-pointer shadow-lg shadow-slate-200/50 flex items-center"
                    >
                      #{r.codigo_requisicao}
                    </div>
                  )) : (
                    <div className="text-sm text-slate-700 py-1 bg-white border border-slate-200/80 shadow-md shadow-slate-200/50 rounded-lg px-3 flex items-center justify-center h-10 w-full italic">Nenhuma requisição aguardando.</div>
                  )}
                </div>
              </div>

            </CardContent>
          </Card>
        </div>

        {/* COLUNA 2: curva ABC */}
        <Card 
          className="lg:col-span-3 flex flex-col min-h-0 cursor-pointer hover:shadow-md transition-all border-slate-200"
          onClick={() => navigate("/admin/itens", { state: { tab: "relatorio" } })}
        >
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2 text-slate-800">
              <BarChart3 className="w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-800">Curva ABC Itens</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-4 pt-0 flex flex-col flex-1 min-h-0 gap-6 overflow-y-auto">
            
            <div className="flex flex-col gap-3">
              <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">Top Maior Saída:</h4>
              <div className="flex flex-col gap-2.5">
                {curvaABC.maior.length === 0 && <span className="text-sm text-slate-700">Sem dados</span>}
                {curvaABC.maior.map((item, idx) => {
                  const max = Math.max(...curvaABC.maior.map(i => i.valor));
                  const pct = Math.max(10, (item.valor / max) * 100);
                  return (
                    <div key={idx} className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-3">
                      {/* No celular o nome ocupa a linha inteira; a largura fixa
                          de 96px cortava nomes que precisavam de 200px. */}
                      <span className="text-xs font-semibold text-slate-800 lg:flex-1 lg:min-w-0 break-words leading-snug" title={formatItemName(item.nome)}>{formatItemName(item.nome)}</span>
                      <div className="flex items-center gap-2 lg:contents">
                        <div className="flex-1 lg:flex-none lg:w-20 h-2.5 bg-slate-200 rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-teal-700 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 w-8 text-right shrink-0">{item.valor}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="h-[1px] w-full bg-slate-200" />

            <div className="flex flex-col gap-3">
              <h4 className="text-[11px] font-bold text-slate-800 uppercase tracking-wider">Top Menor Saída:</h4>
              <div className="flex flex-col gap-2.5">
                {curvaABC.menor.length === 0 && <span className="text-sm text-slate-700">Sem dados</span>}
                {curvaABC.menor.map((item, idx) => {
                  const max = Math.max(...curvaABC.menor.map(i => i.valor));
                  const pct = Math.max(10, (item.valor / max) * 100);
                  return (
                    <div key={idx} className="flex flex-col lg:flex-row lg:items-center gap-1 lg:gap-3">
                      {/* No celular o nome ocupa a linha inteira; a largura fixa
                          de 96px cortava nomes que precisavam de 200px. */}
                      <span className="text-xs font-semibold text-slate-800 lg:flex-1 lg:min-w-0 break-words leading-snug" title={formatItemName(item.nome)}>{formatItemName(item.nome)}</span>
                      <div className="flex items-center gap-2 lg:contents">
                        <div className="flex-1 lg:flex-none lg:w-20 h-2.5 bg-slate-200 rounded-full overflow-hidden shrink-0">
                          <div className="h-full bg-slate-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs font-bold text-slate-700 w-8 text-right shrink-0">{item.valor}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
          </CardContent>
        </Card>

        {/* COLUNA 3: req. pendentes - a unica parte acionavel, entao a mais larga */}
        <Card 
          className="lg:col-span-6 flex flex-col min-h-0 cursor-pointer hover:shadow-md transition-all border-slate-200"
          onClick={() => navigate("/requisicoes")}
        >
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center gap-2 text-slate-800">
              <ClipboardList className="w-5 h-5" />
              <CardTitle className="text-sm font-bold uppercase tracking-wider text-slate-800">Req. Pendentes</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="p-0 flex flex-col flex-1 min-h-0">
            {/* CELULAR: lista. Seis colunas numa tela de 375px obrigavam a
                rolagem lateral e cortavam departamento e solicitante. */}
            <div className="lg:hidden flex-1 overflow-y-auto px-3 pb-2 divide-y divide-slate-100">
              {pendentes.length > 0 ? pendentes.map(req => (
                <button
                  key={req.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); navigate(`/requisicoes/${req.id}`); }}
                  className="w-full text-left py-3 flex items-start justify-between gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-slate-800 text-sm">#{req.codigo_requisicao}</span>
                      <StatusBadge status={req.status} />
                    </div>
                    <p className="text-sm font-semibold text-slate-800 mt-1 break-words">{req.departamento}</p>
                    <p className="text-xs text-slate-600 break-words">{req.usuario?.nome || "Sistema"}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {req.itens?.length || 0} {req.itens?.length === 1 ? "item" : "itens"} • {format(parseISO(req.created_at), "dd/MM/yy HH:mm")}
                    </p>
                    {/* Observação à vista antes de abrir: é onde vem o aviso. */}
                    {req.observacao?.trim() && (
                      <p className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-amber-950 bg-amber-50 border border-amber-300 rounded-md px-2 py-1">
                        <MessageSquareWarning className="w-3.5 h-3.5 mt-px shrink-0 text-amber-700" />
                        <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">{req.observacao.trim()}</span>
                      </p>
                    )}
                  </div>
                </button>
              )) : (
                <div className="text-center py-8 text-slate-700 font-medium text-sm">
                  Nenhuma requisição pendente
                </div>
              )}
            </div>

            {/* COMPUTADOR: tabela */}
            <div className="hidden lg:block overflow-auto flex-1 px-4">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="border-b border-slate-300">
                    <th className="py-2 font-bold text-slate-700 text-xs uppercase tracking-wider">Nº</th>
                    <th className="py-2 font-bold text-slate-700 text-xs uppercase tracking-wider">Departamento</th>
                    <th className="py-2 font-bold text-slate-700 text-xs uppercase tracking-wider">Solicitante</th>
                    <th className="py-2 font-bold text-slate-700 text-xs uppercase tracking-wider text-center">Itens</th>
                    <th className="py-2 font-bold text-slate-700 text-xs uppercase tracking-wider">Data/Hora</th>
                    <th className="py-2 font-bold text-slate-700 text-xs uppercase tracking-wider text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {pendentes.length > 0 ? pendentes.map(req => (
                    <tr 
                      key={req.id} 
                      className="hover:bg-slate-100 transition-colors group cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/requisicoes/${req.id}`);
                      }}
                    >
                      <td className="py-2.5 font-bold text-slate-800">#{req.codigo_requisicao}</td>
                      {/* Sem max-w fixo: a coluna agora tem 143px reais e o
                          limite de 100px cortava nomes à toa. Deixa quebrar. */}
                      <td className="py-2.5 pr-2 text-slate-800 font-semibold break-words">
                        {req.departamento}
                        {/* Observação à vista, embaixo do setor; inteira ao passar o mouse. */}
                        {req.observacao?.trim() && (
                          <span
                            className="mt-1 flex items-start gap-1 text-xs font-semibold text-amber-900"
                            title={req.observacao.trim()}
                          >
                            <MessageSquareWarning className="w-3.5 h-3.5 mt-px shrink-0 text-amber-700" />
                            <span className="min-w-0 line-clamp-2 [overflow-wrap:anywhere]">{req.observacao.trim()}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-2 text-slate-700 font-medium break-words">{req.usuario?.nome || "Sistema"}</td>
                      <td className="py-2.5 text-center text-slate-700 font-bold">{req.itens?.length || 0}</td>
                      <td className="py-2.5 text-slate-600 text-xs font-medium">{format(parseISO(req.created_at), "dd/MM/yy HH:mm")}</td>
                      <td className="py-2.5 text-right">
                        {/* Mesma pílula da lista de requisições: antes PENDENTE
                            era laranja aqui e amarelo lá. */}
                        <StatusBadge status={req.status} />
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-700 font-medium text-sm">
                        Nenhuma requisição pendente
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-200 p-3 bg-slate-50 text-xs text-slate-600 font-medium flex justify-between mt-auto">
              <span>Total de registros: <span className="font-bold text-slate-800">{totalPendentesCount}</span></span>
              <span className="text-teal-700 font-bold hover:underline">Ver todas</span>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
