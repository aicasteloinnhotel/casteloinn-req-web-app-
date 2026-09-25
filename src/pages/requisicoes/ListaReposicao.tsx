import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import {
  getListaReposicao,
  adicionarItemReposicao,
  baixarQuantidadeReposicaoEmMassa,
  updateUrgenciaReposicao,
  updateStatusReposicao,
  excluirItemReposicaoManual,
  editarQuantidadeManual,
  ModalidadeReposicao
} from "@/services/reposicao";
import { ItemReposicao, Item } from "@/types";
import { getItens, getUsuarios } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { contemTexto, descreverQuantidades, formatItemName } from "@/lib/utils";
import { CampoBusca } from "@/components/CampoBusca";
import { BOTAO_ICONE, BOTAO_PRIMARIO, SUBTITULO, TITULO } from "@/lib/estilos";
import { 
  Search, 
  History, 
  Check, 
  Clock, 
  AlertTriangle, 
  Printer, 
  Plus, 
  CheckCircle2, 
  CheckSquare, 
  Truck, 
  ChevronDown, 
  Package, 
  ChevronsUpDown,
  Maximize2,
  Minimize2,
  Pencil,
  Trash2
} from "lucide-react";
import { format, addDays, addWeeks, endOfDay } from "date-fns";
import { toast } from "@/lib/toast";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { AnimatePresence, motion } from "motion/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export type GroupedItem = {
  item_id: string;
  item?: Item;
  tipo_origem: "MANUAL" | "RUPTURA";
  manual_items: ItemReposicao[];
  rupturas: ItemReposicao[];
  all_ids: string[];
  total_quantidade: number;
  modalidade: ModalidadeReposicao;
  urgente?: boolean;
  prazo_target_date?: number | null;
  prazo_original?: string | null;
};

function formatRemainingTime(targetDate: number | null | undefined, now: number) {
  if (!targetDate) return "Indefinido";
  const diff = targetDate - now;
  if (diff <= 0) return "Atrasado";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (days > 0) {
    return `Resta${days > 1 ? 'm' : ''} ${days} dia${days > 1 ? 's' : ''}`;
  } else {
    if (hours > 0) return `Resta${hours > 1 ? 'm' : ''} ${hours} hora${hours > 1 ? 's' : ''} e ${minutes} min`;
    if (minutes > 0) return `Restam ${minutes} min`;
    return "Menos de 1 min";
  }
}

/**
 * Cor de cada modalidade, usada só como ACENTO.
 *
 * Antes a seção inteira era um retângulo tingido (`bg-red-50/20`) com o corpo
 * em `bg-white/60` por cima — daí os "pedaços sem pintar". E nenhuma outra tela
 * do app faz isso: todas usam cartão branco sobre fundo cinza-claro, com a cor
 * aparecendo só em detalhes. Aqui a seção passa a ser um cartão branco igual
 * aos outros, e a cor fica no ícone, no contador e na borda lateral do item.
 */
const ACENTO: Record<ModalidadeReposicao, {
  icone: string; contador: string; bordaItem: string;
}> = {
  URGENTE:    { icone: "bg-red-50 text-red-600",     contador: "bg-red-50 text-red-700 border-red-200",       bordaItem: "border-l-red-400" },
  AGUARDANDO: { icone: "bg-amber-50 text-amber-700", contador: "bg-amber-50 text-amber-800 border-amber-200", bordaItem: "border-l-amber-400" },
  NORMAL:     { icone: "bg-teal-50 text-teal-700",   contador: "bg-slate-50 text-slate-700 border-slate-200", bordaItem: "border-l-slate-300" },
};

/** Uma seção da lista (Urgentes / Aguardando / Normais). */
function SecaoReposicao({
  modalidade, titulo, icone, grupos, aberta, onToggle, renderCard,
}: {
  modalidade: ModalidadeReposicao;
  titulo: string;
  icone: React.ReactNode;
  grupos: GroupedItem[];
  aberta: boolean;
  onToggle: () => void;
  renderCard: (g: GroupedItem) => React.ReactNode;
}) {
  const c = ACENTO[modalidade];
  const vazia = grupos.length === 0;

  // Seção sem item vira uma faixa fina, sem corpo.
  if (vazia) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 flex items-center gap-2.5">
        <span className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 opacity-50 ${c.icone} [&_svg]:w-3.5 [&_svg]:h-3.5`}>
          {icone}
        </span>
        <span className="text-sm font-semibold text-slate-400">{titulo}</span>
        <span className="text-xs text-slate-400 ml-auto">nenhum item</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-lg shadow-slate-200/50">
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center justify-between transition-colors select-none hover:bg-slate-50"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${c.icone}`}>
            {icone}
          </div>
          {/* A descrição de cada seção saiu: o título já diz o que é. */}
          <h2 className="text-base font-bold text-slate-800 truncate">{titulo}</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${c.contador}`}>
            {grupos.length}
          </span>
          <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${aberta ? "rotate-180" : ""}`} />
        </div>
      </button>

      {aberta && (
        <div className="border-t border-slate-100 divide-y divide-slate-100">
          <AnimatePresence>{grupos.map((g) => renderCard(g))}</AnimatePresence>
        </div>
      )}
    </div>
  );
}

export default function ListaReposicao() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  // State
  const [lista, setLista] = useState<ItemReposicao[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [estoqueItens, setEstoqueItens] = useState<Item[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  
  // Mapa id -> nome: a coluna resolvido_por guarda o UUID do usuário, então sem
  // isso o histórico de baixas mostrava o UUID cru na tela.
  const [nomesUsuarios, setNomesUsuarios] = useState<Record<string, string>>({});
  const nomeDoResponsavel = (id?: string | null) =>
    (id && nomesUsuarios[id]) || "Sistema";

  // Histórico Modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const historicoItems = useMemo(
    () =>
      lista
        .filter(i => i.resolvido)
        .sort(
          (a, b) =>
            new Date(b.resolvido_em || b.created_at).getTime() -
            new Date(a.resolvido_em || a.created_at).getTime(),
        ),
    [lista],
  );

  // Modal Adicionar
  const [showAddModal, setShowAddModal] = useState(false);
  const [buscaItem, setBuscaItem] = useState("");
  const [itemAtual, setItemAtual] = useState<Item | null>(null);
  const [qtdAdicionar, setQtdAdicionar] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resolver States
  const [inlineResolveId, setInlineResolveId] = useState<string | null>(null);
  const [inlineResolveQtd, setInlineResolveQtd] = useState<number | "">("");
  const [isResolving, setIsResolving] = useState(false);
  const [resolvingGroup, setResolvingGroup] = useState<GroupedItem | null>(null);
  const [manualResolveQtd, setManualResolveQtd] = useState<number | "">("");
  const [grupoParaExcluir, setGrupoParaExcluir] = useState<GroupedItem | null>(null);
  const [grupoParaEditar, setGrupoParaEditar] = useState<GroupedItem | null>(null);
  const [novaQtdManual, setNovaQtdManual] = useState<number | "">("");
  
  // Urgency time refresh
  const [nowTime, setNowTime] = useState(Date.now());
  useEffect(() => {
    const int = setInterval(() => setNowTime(Date.now()), 60000);
    return () => clearInterval(int);
  }, []);

  // Accordion state
  const [openSections, setOpenSections] = useState<Record<ModalidadeReposicao, boolean>>({
    URGENTE: true,
    AGUARDANDO: true,
    NORMAL: true
  });

  const toggleSection = (section: ModalidadeReposicao) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  // Um controle só, que alterna: dois botões para uma escolha binária era
  // desperdício de espaço, ainda mais no celular.
  const algumaSecaoAberta =
    openSections.URGENTE || openSections.AGUARDANDO || openSections.NORMAL;

  const alternarTodasSecoes = () => {
    const novoEstado = !algumaSecaoAberta;
    setOpenSections({ URGENTE: novoEstado, AGUARDANDO: novoEstado, NORMAL: novoEstado });
  };

  const handleAlterarStatus = async (
    itemId: string,
    novaModalidade: ModalidadeReposicao,
    prazoStr?: string
  ) => {
    try {
      if (novaModalidade === "NORMAL") {
        await updateStatusReposicao(itemId, "NORMAL");
        toast.success("Status redefinido para Normal.");
      } else if (novaModalidade === "AGUARDANDO") {
        const p = prazoStr || "Já Solicitado";
        let targetDate: number | null = null;
        const now = new Date();
        if (prazoStr === "Hoje") {
          targetDate = endOfDay(now).getTime();
        } else if (prazoStr === "2 a 3 dias") {
          targetDate = addDays(now, 3).getTime();
        } else if (prazoStr === "1 semana") {
          targetDate = addWeeks(now, 1).getTime();
        }
        await updateStatusReposicao(itemId, "AGUARDANDO", p, targetDate);
        toast.success(`Marcado como Aguardando Chegada (${p})`);
      } else if (novaModalidade === "URGENTE") {
        const p = prazoStr || "Hoje";
        const now = new Date();
        let targetDate = Date.now();
        if (p === "Hoje") {
          targetDate = endOfDay(now).getTime();
        } else if (p === "2 dias") {
          targetDate = addDays(now, 2).getTime();
        } else if (p === "3 dias") {
          targetDate = addDays(now, 3).getTime();
        } else if (p === "4 dias") {
          targetDate = addDays(now, 4).getTime();
        } else if (p === "5 dias") {
          targetDate = addDays(now, 5).getTime();
        } else if (p === "6 dias") {
          targetDate = addDays(now, 6).getTime();
        } else if (p === "1 semana") {
          targetDate = addWeeks(now, 1).getTime();
        }
        await updateStatusReposicao(itemId, "URGENTE", p, targetDate);
        toast.success(`Marcado como Urgente (${p})`);
      }
      recarregarLista(false);
    } catch (e: any) {
      console.error(e);
      toast.error("Erro ao atualizar status do item.");
    }
  };

  const recarregarLista = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    try {
      const data = await getListaReposicao();
      setLista(data);
    } catch (e: any) {
      // Sem o try/catch a tela ficava presa no "carregando" para sempre.
      console.error("Erro ao carregar lista de reposição:", e);
      toast.error(`Erro ao carregar a lista de reposição: ${e?.message || "falha de conexão"}`);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    recarregarLista(true);
    const channelName = `lista-reposicao-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "reposicao_itens" },
        () => {
          recarregarLista(false);
        }
      )
      .subscribe();

    getItens().then(data => {
      setEstoqueItens(data.filter(i => i.ativo));
    }).catch(e => console.error("Erro ao carregar itens do estoque:", e));

    getUsuarios().then(data => {
      setNomesUsuarios(
        Object.fromEntries(data.map(u => [u.id, u.nome])),
      );
    }).catch(e => console.error("Erro ao carregar usuários:", e));

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const itensFiltrados = useMemo(() => {
    if (!buscaItem.trim()) return estoqueItens;
    return estoqueItens.filter((i) => contemTexto(i.nome, buscaItem));
  }, [buscaItem, estoqueItens]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, GroupedItem>();

    for (const item of lista) {
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
          modalidade: "NORMAL",
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
        } else if (!group.urgente && item.prazo_original && (
          item.prazo_original === "PEDIDO" || 
          item.prazo_original === "AGUARDANDO" || 
          item.prazo_original.startsWith("PEDIDO") ||
          item.prazo_original.startsWith("AGUARDANDO")
        )) {
          group.prazo_original = item.prazo_original;
          group.prazo_target_date = item.prazo_target_date;
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

    // Set modalidade for each group
    for (const group of groups.values()) {
      if (group.urgente) {
        group.modalidade = "URGENTE";
      } else if (group.prazo_original && (
        group.prazo_original === "PEDIDO" ||
        group.prazo_original === "AGUARDANDO" ||
        group.prazo_original.startsWith("PEDIDO") ||
        group.prazo_original.startsWith("AGUARDANDO")
      )) {
        group.modalidade = "AGUARDANDO";
      } else {
        group.modalidade = "NORMAL";
      }
    }
    
    return Array.from(groups.values()).sort((a, b) => {
      const order = { URGENTE: 0, AGUARDANDO: 1, NORMAL: 2 };
      const diff = order[a.modalidade] - order[b.modalidade];
      if (diff !== 0) return diff;
      return (formatItemName(a.item?.nome) || "").localeCompare(formatItemName(b.item?.nome) || "");
    });
  }, [lista]);

  const displayedItems = useMemo(() => {
    if (!searchTerm.trim()) return groupedItems;
    return groupedItems.filter(g => contemTexto(formatItemName(g.item?.nome), searchTerm));
  }, [groupedItems, searchTerm]);

  // Automatic grouping into the 3 modalities
  const itensUrgentes = useMemo(() => {
    return displayedItems.filter(i => i.modalidade === "URGENTE");
  }, [displayedItems]);

  const itensAguardando = useMemo(() => {
    return displayedItems.filter(i => i.modalidade === "AGUARDANDO");
  }, [displayedItems]);

  const itensNormais = useMemo(() => {
    return displayedItems.filter(i => i.modalidade === "NORMAL");
  }, [displayedItems]);

  const handleAddItemManual = async () => {
    if (!itemAtual || !user) return;
    setIsSubmitting(true);
    try {
      await adicionarItemReposicao(itemAtual.id, "MANUAL", undefined, qtdAdicionar);
      toast.success("Item adicionado à lista com sucesso!");
      setShowAddModal(false);
      setItemAtual(null);
      setBuscaItem("");
      setQtdAdicionar(1);
      recarregarLista(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao adicionar item.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Excluir != resolver. Resolver grava uma baixa no histórico (o material
  // chegou); excluir apaga uma linha que entrou por engano.
  const handleExcluirManual = async (group: GroupedItem) => {
    setIsResolving(true);
    try {
      for (const item of group.manual_items) {
        await excluirItemReposicaoManual(item.id);
      }
      toast.success("Item removido da lista de reposição.");
      setGrupoParaExcluir(null);
      recarregarLista(false);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível remover o item.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleSalvarQuantidadeManual = async () => {
    if (!grupoParaEditar) return;
    const nova = Number(novaQtdManual);
    if (!nova || nova <= 0) {
      toast.error("Informe uma quantidade maior que zero.");
      return;
    }
    setIsResolving(true);
    try {
      // Concentra o total na primeira linha manual e remove as demais, para o
      // item não ficar espalhado em várias entradas com o mesmo nome.
      const [principal, ...extras] = grupoParaEditar.manual_items;
      await editarQuantidadeManual(principal.id, nova);
      for (const extra of extras) {
        await excluirItemReposicaoManual(extra.id);
      }
      toast.success("Quantidade atualizada.");
      setGrupoParaEditar(null);
      setNovaQtdManual("");
      recarregarLista(false);
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível atualizar a quantidade.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleResolverManuaisModal = async () => {
    if (!resolvingGroup || !user) return;
    const qtdResolver = Number(manualResolveQtd);
    if (qtdResolver <= 0) return;
    setIsResolving(true);
    try {
      let qtdRestante = qtdResolver;
      const atualizacoes = [];
      for (const item of resolvingGroup.manual_items) {
        if (qtdRestante <= 0) break;
        const subtracao = Math.min(item.quantidade || 1, qtdRestante);
        atualizacoes.push({ id: item.id, subtracao, itemOriginal: item });
        qtdRestante -= subtracao;
      }
      
      if (atualizacoes.length > 0) {
        await baixarQuantidadeReposicaoEmMassa(atualizacoes, user.id);
      }
      
      toast.success("Baixa manual realizada com sucesso!");
      setResolvingGroup(null);
      recarregarLista(false);
    } catch (e: any) {
      console.error(e); 
      toast.error("Falha ao dar baixa nos itens.");
    } finally {
      setIsResolving(false);
    }
  };

  const handleResolverParcialInline = async (group: GroupedItem) => {
    const qtdResolver = Number(inlineResolveQtd);
    if (!user || qtdResolver <= 0) return;
    setIsResolving(true);
    try {
      let qtdRestante = qtdResolver;
      const allItems = [...group.manual_items, ...group.rupturas];
      const atualizacoes = [];
      
      for (const item of allItems) {
        if (qtdRestante <= 0) break;
        const subtracao = Math.min(item.quantidade || 1, qtdRestante);
        atualizacoes.push({ id: item.id, subtracao, itemOriginal: item });
        qtdRestante -= subtracao;
      }
      
      if (atualizacoes.length > 0) {
        await baixarQuantidadeReposicaoEmMassa(atualizacoes, user.id);
      }
      
      toast.success("Baixa realizada com sucesso!");
      setInlineResolveId(null);
      recarregarLista(false);
    } catch (e: any) {
      console.error(e); 
      toast.error("Falha ao dar baixa nos itens.");
    } finally {
      setIsResolving(false);
    }
  };

  const handlePrint = () => {
    const doc = new jsPDF({ compress: true });
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("Castelo Inn", 105, 20, { align: "center" });
    
    doc.setFontSize(14);
    doc.text("Lista de Reposição de Estoque", 105, 28, { align: "center" });
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Gerado em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, 105, 36, { align: "center" });

    const head = [["Nome do Item", "Qtd. Nec.", "Origem", "Modalidade / Status"]];
    const body = groupedItems.map((group) => {
      const origens = [];
      if (group.rupturas.length > 0) origens.push(`Reqs: ${group.rupturas.map(r => r.requisicao?.codigo_requisicao || '?').join(', ')}`);
      if (group.manual_items.length > 0) origens.push('Manual');
      const origemStr = origens.join(" | ");
      
      let statusStr = "Normal";
      if (group.modalidade === 'URGENTE') {
        statusStr = `URGENTE${group.prazo_original ? ` (${group.prazo_original})` : ''}`;
      } else if (group.modalidade === 'AGUARDANDO') {
        statusStr = `AGUARDANDO CHEGADA / PEDIDO${group.prazo_original && group.prazo_original !== 'PEDIDO' ? ` (${group.prazo_original})` : ''}`;
      }
      
      return [
        formatItemName(group.item?.nome) || "Item Desconhecido",
        descreverQuantidades([...group.manual_items, ...group.rupturas]),
        origemStr,
        statusStr
      ];
    });

    autoTable(doc, {
      startY: 45,
      head: head,
      body: body,
      headStyles: { fillColor: [13, 148, 136] },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { cellWidth: 70 },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 45 },
        3: { cellWidth: 45, halign: 'center' },
      },
    });

    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  // Render individual item card
  const renderItemCard = (group: GroupedItem) => {
    const isUrgente = group.modalidade === "URGENTE";
    const isAguardando = group.modalidade === "AGUARDANDO";

    return (
      <motion.div
        key={group.item_id}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
      >
        {/* Item = linha branca com borda colorida à esquerda, o mesmo padrão
            do cartão de requisição no resto do app. Antes era um cartão com o
            fundo inteiro tingido, que destoava de todas as outras telas. */}
        <div
          className={`bg-white border-l-4 transition-colors hover:bg-slate-50/70 ${
            isUrgente ? "border-l-red-400" : isAguardando ? "border-l-amber-400" : "border-l-slate-200"
          }`}
        >
          <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            
            <div className="flex-1 min-w-0">
              {/* A etiqueta de status que existia aqui foi removida: o cartão
                  já está dentro da seção "Itens Urgentes" / "Aguardando
                  Chegada", o botão ao lado mostra o estado e a contagem
                  regressiva abaixo repete a mesma informação. Eram três avisos
                  para o mesmo fato. */}
              <div className="mb-1.5">
                <h3 className="font-bold text-teal-950 text-base sm:text-lg break-words">
                  {formatItemName(group.item?.nome) || "Item Excluído"}
                </h3>
              </div>

              <p className="text-sm text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1">
                {/* Unidade de cada falta, não a do catálogo: quem pediu 10 UN
                    de um material cadastrado em L precisa de 10 UN. */}
                <span className="font-bold text-teal-800">
                  Qtd: {descreverQuantidades([...group.manual_items, ...group.rupturas])}
                </span>
                <span>•</span>
                {group.rupturas.length > 0 ? (
                  <span>Ruptura: REQ {group.rupturas.map(r => `#${r.requisicao?.codigo_requisicao}`).join(", ")}</span>
                ) : (
                  <span>Manual</span>
                )}

                {isUrgente && group.prazo_target_date && (
                  <>
                    <span>•</span>
                    <span className={`font-bold flex items-center gap-1 ${group.prazo_target_date < nowTime ? 'text-red-600' : 'text-orange-600'}`}>
                      <Clock className="w-3.5 h-3.5"/> {formatRemainingTime(group.prazo_target_date, nowTime)} ({group.prazo_original})
                    </span>
                  </>
                )}

                {isAguardando && (
                  <>
                    <span>•</span>
                    <span className="font-bold text-amber-800 flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-amber-600" />
                      {group.prazo_original && group.prazo_original !== 'PEDIDO' && group.prazo_original !== 'AGUARDANDO' 
                        ? group.prazo_original.replace('PEDIDO: ', 'Previsão: ') 
                        : 'Pedido Realizado (Aguardando Entrega)'}
                    </span>
                  </>
                )}
              </p>
            </div>

            {/* Em linha também no celular. Empilhados, cada cartão passava de
                290px de altura e cabiam só dois por tela. */}
            <div className="flex flex-row flex-wrap items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0 shrink-0">
              {/* DROPDOWN MENU DE STATUS */}
              <DropdownMenu>
                <DropdownMenuTrigger render={
                  <Button 
                    variant="outline" 
                    className={`font-bold text-xs h-9 px-3 flex items-center justify-center gap-1.5 transition-colors shrink-0 ${
                      isUrgente
                        ? 'border-red-200 text-red-700 bg-red-100/60 hover:bg-red-100'
                        : isAguardando
                        ? 'border-amber-300 text-amber-900 bg-amber-100/80 hover:bg-amber-200'
                        : 'border-slate-200 text-slate-700 bg-white hover:bg-slate-50'
                    }`}
                  />
                }>
                  {isUrgente ? (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                      <span>Urgente {group.prazo_original ? `(${group.prazo_original})` : ''}</span>
                    </>
                  ) : isAguardando ? (
                    <>
                      <Truck className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                      <span>Aguardando</span>
                    </>
                  ) : (
                    <>
                      <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>Definir Status</span>
                    </>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 p-2 shadow-xl bg-white border border-slate-200 rounded-xl">
                  
                  {/* GRUPO AGUARDANDO / PEDIDO */}
                  <div className="px-2 py-1 text-[10px] font-black text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-amber-600" />
                    Aguardando Chegada (Pedido)
                  </div>
                  <DropdownMenuItem 
                    onClick={() => handleAlterarStatus(group.item_id, 'AGUARDANDO', 'Já Solicitado')}
                    className="font-bold text-amber-950 focus:bg-amber-50 cursor-pointer rounded-lg text-xs py-2"
                  >
                    <Truck className="w-3.5 h-3.5 mr-2 text-amber-600" />
                    Marcar como Já Pedido
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleAlterarStatus(group.item_id, 'AGUARDANDO', 'Hoje')}
                    className="text-xs text-amber-900 focus:bg-amber-50 cursor-pointer rounded-lg py-1.5 pl-7"
                  >
                    Previsão: Chega Hoje
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleAlterarStatus(group.item_id, 'AGUARDANDO', '2 a 3 dias')}
                    className="text-xs text-amber-900 focus:bg-amber-50 cursor-pointer rounded-lg py-1.5 pl-7"
                  >
                    Previsão: Chega em 2 a 3 dias
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleAlterarStatus(group.item_id, 'AGUARDANDO', '1 semana')}
                    className="text-xs text-amber-900 focus:bg-amber-50 cursor-pointer rounded-lg py-1.5 pl-7"
                  >
                    Previsão: Chega em 1 semana
                  </DropdownMenuItem>

                  <div className="h-px bg-slate-100 my-1.5" />

                  {/* GRUPO URGENTE */}
                  <div className="px-2 py-1 text-[10px] font-black text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    Marcar como Urgente
                  </div>
                  <DropdownMenuItem 
                    onClick={() => handleAlterarStatus(group.item_id, 'URGENTE', 'Hoje')} 
                    className="font-bold text-red-700 focus:bg-red-50 cursor-pointer rounded-lg text-xs py-1.5 pl-7"
                  >
                    Prazo: Hoje
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleAlterarStatus(group.item_id, 'URGENTE', '2 dias')} 
                    className="font-bold text-red-700 focus:bg-red-50 cursor-pointer rounded-lg text-xs py-1.5 pl-7"
                  >
                    Prazo: 2 dias
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleAlterarStatus(group.item_id, 'URGENTE', '3 dias')} 
                    className="font-bold text-red-700 focus:bg-red-50 cursor-pointer rounded-lg text-xs py-1.5 pl-7"
                  >
                    Prazo: 3 dias
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    onClick={() => handleAlterarStatus(group.item_id, 'URGENTE', '1 semana')} 
                    className="font-bold text-orange-600 focus:bg-orange-50 cursor-pointer rounded-lg text-xs py-1.5 pl-7"
                  >
                    Prazo: 1 semana
                  </DropdownMenuItem>

                  <div className="h-px bg-slate-100 my-1.5" />

                  {/* NORMAL */}
                  <DropdownMenuItem 
                    onClick={() => handleAlterarStatus(group.item_id, 'NORMAL')} 
                    className="font-medium text-slate-600 focus:bg-slate-50 cursor-pointer rounded-lg text-xs py-2 flex items-center gap-2"
                  >
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    Marcar como Normal (Padrão)
                  </DropdownMenuItem>

                </DropdownMenuContent>
              </DropdownMenu>

              {/* RESOLVER / DAR BAIXA */}
              {inlineResolveId === group.item_id ? (
                <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200/80 shadow-md shadow-slate-200/50 w-full sm:w-auto">
                  <Input
                    type="number"
                    min={0.1}
                    max={group.total_quantidade}
                    step={0.1}
                    value={inlineResolveQtd}
                    onChange={(e) => setInlineResolveQtd(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-20 h-8 text-sm font-bold bg-white text-center"
                    placeholder="Qtd"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    className="h-8 bg-teal-600 hover:bg-teal-700 px-3 font-bold text-white"
                    disabled={isResolving || !inlineResolveQtd || Number(inlineResolveQtd) <= 0}
                    onClick={() => handleResolverParcialInline(group)}
                  >
                    OK
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-2 font-medium bg-white text-slate-700"
                    onClick={() => setInlineResolveQtd(group.total_quantidade)}
                  >
                    Tudo
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-slate-700 hover:text-slate-600 hover:bg-slate-200"
                    onClick={() => setInlineResolveId(null)}
                  >
                    X
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  onClick={() => {
                    if (group.rupturas.length > 0 || group.manual_items.length > 1) {
                      setResolvingGroup(group);
                      const totalManual = group.manual_items.reduce((acc, curr) => acc + curr.quantidade, 0);
                      setManualResolveQtd(totalManual);
                    } else {
                      setInlineResolveId(group.item_id);
                      setInlineResolveQtd(group.total_quantidade);
                    }
                  }}
                  className={`font-bold h-9 px-3 hover:bg-slate-100 shrink-0 ${
                    isUrgente
                      ? 'text-red-700 hover:text-red-800' 
                      : isAguardando
                      ? 'text-amber-900 hover:text-amber-950'
                      : 'text-teal-700 hover:text-teal-800'
                  }`}
                >
                  <Check className="h-4 w-4 mr-1.5 shrink-0" /> Resolver
                </Button>
              )}

              {/* Corrigir/remover: só para linhas MANUAIS. Item de ruptura vem
                  de uma requisição real e precisa ser tratado dentro dela. */}
              {group.manual_items.length > 0 && group.rupturas.length === 0 && inlineResolveId !== group.item_id && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Corrigir quantidade"
                    onClick={() => {
                      setGrupoParaEditar(group);
                      setNovaQtdManual(group.total_quantidade);
                    }}
                    className="h-9 w-9 text-slate-500 hover:text-teal-700 hover:bg-teal-50"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Remover da lista (incluído por engano)"
                    onClick={() => setGrupoParaExcluir(group)}
                    className="h-9 w-9 text-slate-500 hover:text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto pb-10 print:hidden">
        
        {/* CABEÇALHO */}
        <div>
          <h1 className={TITULO}>Lista de Reposição</h1>
          <p className={SUBTITULO}>Quadro de compras e reposição organizado por prioridade.</p>
        </div>

        {/* BARRA DE AÇÕES — uma linha, no padrão das outras telas: a busca
            ocupa o espaço livre e a ação principal fica logo ao lado dela. */}
        <div className="flex flex-col sm:flex-row gap-2">
          <CampoBusca
            valor={searchTerm}
            onMudar={setSearchTerm}
            placeholder="Buscar item..."
            className="flex-1"
          />

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowAddModal(true)}
              className={`${BOTAO_PRIMARIO} flex-1 sm:flex-none`}
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar item
            </Button>
            <Button
              onClick={handlePrint}
              type="button"
              variant="outline"
              title="Imprimir lista para cotação"
              className={BOTAO_ICONE}
            >
              <Printer className="w-4 h-4" />
            </Button>
            <Button
              onClick={() => setShowHistoryModal(true)}
              variant="outline"
              title="Histórico de baixas"
              className={BOTAO_ICONE}
            >
              <History className="w-4 h-4" />
            </Button>
          </div>
        </div>
        {/* CONTEÚDO PRINCIPAL (ACCORDION DE 3 MODALIDADES) */}
        {isLoading ? (
          <div className="text-center py-10 text-slate-700">
            <div className="animate-pulse space-y-4">
              <div className="h-20 bg-slate-200 rounded-2xl"></div>
              <div className="h-20 bg-slate-200 rounded-2xl"></div>
              <div className="h-20 bg-slate-200 rounded-2xl"></div>
            </div>
          </div>
        ) : displayedItems.length === 0 ? (
          <div className="text-center py-16 bg-white border border-slate-200/80 shadow-md shadow-slate-200/50 border-dashed rounded-3xl">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-teal-500" />
            </div>
            <p className="text-slate-700 mb-1 font-bold">Nenhum item pendente de reposição.</p>
            <p className="text-sm font-medium text-slate-600">O estoque e as requisições estão em dia!</p>
          </div>
        ) : (
          <div className="space-y-4">
            
            <SecaoReposicao
              modalidade="URGENTE"
              titulo="Itens Urgentes"
              icone={<AlertTriangle className="w-5 h-5" />}
              grupos={itensUrgentes}
              aberta={openSections.URGENTE}
              onToggle={() => toggleSection("URGENTE")}
              renderCard={renderItemCard}
            />

            <SecaoReposicao
              modalidade="AGUARDANDO"
              titulo="Aguardando Chegada"
              icone={<Truck className="w-5 h-5" />}
              grupos={itensAguardando}
              aberta={openSections.AGUARDANDO}
              onToggle={() => toggleSection("AGUARDANDO")}
              renderCard={renderItemCard}
            />

            <SecaoReposicao
              modalidade="NORMAL"
              titulo="Itens Normais"
              icone={<Package className="w-5 h-5" />}
              grupos={itensNormais}
              aberta={openSections.NORMAL}
              onToggle={() => toggleSection("NORMAL")}
              renderCard={renderItemCard}
            />

          </div>
        )}
      </div>

      {/* MODAL HISTÓRICO DE BAIXAS */}
      <Dialog open={showHistoryModal} onOpenChange={setShowHistoryModal}>
        <DialogContent className="sm:max-w-2xl bg-white border-slate-200 shadow-2xl rounded-2xl p-0 overflow-hidden">
          <div className="bg-slate-50 p-6 border-b border-slate-100 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-white rounded-xl shadow-md border border-slate-200 flex items-center justify-center mb-3">
              <History className="w-6 h-6 text-teal-700" />
            </div>
            <DialogTitle className="text-xl font-black text-slate-800 mb-1">
              Histórico de Baixas
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-sm">
              Registro auditável dos itens que já foram resolvidos ou repostos no estoque.
            </DialogDescription>
          </div>

          <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
            {historicoItems.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-sm bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                Nenhum item com baixa registrada no histórico recente.
              </div>
            ) : (
              historicoItems.map((item) => (
                <div 
                  key={item.id} 
                  className="flex flex-col sm:flex-row justify-between sm:items-center p-4 bg-slate-50/60 border border-slate-200/80 rounded-xl gap-3 text-sm hover:border-slate-300 transition-colors"
                >
                  <div>
                    <div className="font-bold text-slate-900 text-base">
                      {formatItemName(item.item?.nome) || "Item"}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2 mt-1">
                      <span>Quantidade: <strong className="text-slate-800">{item.quantidade} {item.unidade || item.item?.unidade || 'UN'}</strong></span>
                      <span>•</span>
                      <span>Origem: {item.tipo_origem === 'RUPTURA' ? `Requisição #${item.requisicao?.codigo_requisicao || '?'}` : 'Manual'}</span>
                    </div>
                  </div>
                  <div className="text-left sm:text-right text-xs text-slate-600 shrink-0">
                    <div>Baixa por: <strong className="text-slate-800">{nomeDoResponsavel(item.resolvido_por)}</strong></div>
                    {item.resolvido_em && (
                      <div className="text-slate-500 mt-0.5">
                        {format(new Date(item.resolvido_em), "dd/MM/yyyy 'às' HH:mm")}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <DialogFooter className="bg-slate-50 p-4 border-t border-slate-100 flex justify-end">
            <Button variant="outline" onClick={() => setShowHistoryModal(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL RESOLVER REPOSICAO */}
      <Dialog open={!!resolvingGroup} onOpenChange={(o) => { if (!o) setResolvingGroup(null); }}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200 shadow-2xl rounded-2xl p-0 overflow-hidden">
          <div className="bg-slate-50 p-6 border-b border-slate-100 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-white rounded-xl shadow-lg shadow-slate-200/50 border border-slate-200/80 flex items-center justify-center mb-4">
              <CheckSquare className="w-6 h-6 text-slate-700" />
            </div>
            <DialogTitle className="text-2xl font-black text-slate-800 mb-2">Fontes de Reposição</DialogTitle>
            <DialogDescription className="text-slate-700 text-base">
              Deseja dar baixa para o item <span className="font-bold text-slate-800">{formatItemName(resolvingGroup?.item?.nome)}</span>?
            </DialogDescription>
          </div>
          
          <div className="p-6 space-y-8 max-h-[65vh] overflow-y-auto">
            {resolvingGroup?.manual_items && resolvingGroup.manual_items.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-slate-400" />
                  Adicionados Manualmente
                </h4>
                
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-slate-50 border border-slate-200/80 p-5 rounded-xl">
                  <div className="flex flex-col">
                    <span className="text-slate-700 text-xs font-semibold uppercase tracking-wider mb-1">Qtd Pendente</span>
                    <span className="text-slate-800 text-2xl font-black tracking-tight">
                      {descreverQuantidades(resolvingGroup.manual_items)}
                    </span>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                    <Input 
                      type="number" 
                      min={0.1} 
                      step={0.1}
                      className="w-full sm:w-28 h-12 font-bold bg-white border-slate-300 text-center text-lg focus-visible:ring-teal-500 rounded-lg shadow-md" 
                      value={manualResolveQtd} 
                      onChange={(e) => setManualResolveQtd(e.target.value === "" ? "" : Number(e.target.value))} 
                      placeholder="0.0" 
                    />
                    <Button 
                      className="w-full sm:w-auto bg-teal-600 hover:bg-teal-700 font-bold h-12 px-8 rounded-lg text-white" 
                      disabled={isResolving || !manualResolveQtd || Number(manualResolveQtd) <= 0} 
                      onClick={handleResolverManuaisModal}
                    >
                      Confirmar Baixa
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            {resolvingGroup?.rupturas && resolvingGroup.rupturas.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-widest flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-orange-400" />
                  Ruptura de Requisições
                </h4>
                <div className="grid gap-3">
                  {resolvingGroup.rupturas.map(rup => (
                    <div key={rup.id} className="flex flex-col sm:flex-row justify-between sm:items-center bg-white p-5 border border-slate-200/80 rounded-xl gap-4 transition-colors hover:border-slate-300">
                      <div className="flex flex-col">
                        <span className="text-slate-700 text-xs font-semibold uppercase tracking-wider mb-1">Requisição #{rup.requisicao?.codigo_requisicao}</span>
                        <span className="text-slate-800 text-xl font-black tracking-tight">
                          {rup.quantidade} <span className="text-sm font-medium text-slate-700 ml-1">{rup.unidade || resolvingGroup.item?.unidade || "UN"}</span>
                        </span>
                      </div>
                      <Button 
                        variant="outline" 
                        className="w-full sm:w-auto h-12 border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-teal-900 font-bold rounded-lg px-8 shadow-md" 
                        onClick={() => {
                          setResolvingGroup(null);
                          navigate(`/requisicoes/${rup.requisicao_id}/separacao`);
                        }}
                      >
                        Resolver na Requisição
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL CORRIGIR QUANTIDADE (item manual) */}
      <Dialog open={!!grupoParaEditar} onOpenChange={(o) => { if (!o) { setGrupoParaEditar(null); setNovaQtdManual(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Corrigir quantidade</DialogTitle>
            <DialogDescription>
              {formatItemName(grupoParaEditar?.item?.nome)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700">
                Quantidade necessária ({grupoParaEditar?.item?.unidade || "UN"})
              </label>
              <Input
                type="number"
                min={0.1}
                step={0.1}
                value={novaQtdManual}
                onChange={(e) => setNovaQtdManual(e.target.value === "" ? "" : Number(e.target.value))}
                className="h-12 text-lg font-bold text-center"
                autoFocus
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="outline" onClick={() => setGrupoParaEditar(null)} disabled={isResolving}>
                Cancelar
              </Button>
              <Button
                className="bg-teal-600 hover:bg-teal-700 font-bold"
                onClick={handleSalvarQuantidadeManual}
                disabled={isResolving || !novaQtdManual || Number(novaQtdManual) <= 0}
              >
                {isResolving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL REMOVER ITEM MANUAL */}
      <Dialog open={!!grupoParaExcluir} onOpenChange={(o) => { if (!o) setGrupoParaExcluir(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover da lista de reposição?</DialogTitle>
            <DialogDescription>
              <span className="font-bold text-slate-800">
                {formatItemName(grupoParaExcluir?.item?.nome)}
              </span>{" "}
              sai da lista sem registrar baixa no histórico. Use isto quando o
              item foi incluído por engano — se o material chegou, use
              "Resolver" para ficar registrado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setGrupoParaExcluir(null)} disabled={isResolving}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              className="font-bold"
              disabled={isResolving}
              onClick={() => grupoParaExcluir && handleExcluirManual(grupoParaExcluir)}
            >
              {isResolving ? "Removendo..." : "Remover"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL ADICIONAR ITEM MANUAL */}
      <Dialog open={showAddModal} onOpenChange={(o) => { if (!o) { setShowAddModal(false); setItemAtual(null); setBuscaItem(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Item Manual</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!itemAtual ? (
              <div className="space-y-2 relative">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-5 w-5 text-slate-700" />
                  <Input
                    placeholder="Pesquisar item no estoque..."
                    value={buscaItem}
                    onChange={(e) => setBuscaItem(e.target.value)}
                    className="pl-10 h-12 bg-slate-50 border-slate-300 focus-visible:ring-slate-500 rounded-xl"
                  />
                </div>
                {(buscaItem || itensFiltrados.length <= 5) && (
                  <div className="border border-slate-200/80 shadow-md shadow-slate-200/50 rounded-xl max-h-48 overflow-y-auto bg-white shadow-lg absolute w-full z-10 mt-1">
                    {itensFiltrados.length > 0 ? (
                      itensFiltrados.map((i) => (
                        <button
                          key={i.id}
                          onClick={() => {
                            setItemAtual(i);
                            setBuscaItem("");
                          }}
                          className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0"
                        >
                          <span className="font-medium text-teal-900 block">{i.nome}</span>
                          <span className="text-slate-700 text-xs">Unidade: {i.unidade}</span>
                        </button>
                      ))
                    ) : (
                      <div className="p-4 text-center text-sm text-slate-700">
                        Nenhum item encontrado.
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200/80 shadow-md shadow-slate-200/50 p-4 rounded-xl flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-teal-900">{itemAtual.nome}</h3>
                    <p className="text-sm text-slate-700">Unidade: {itemAtual.unidade}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setItemAtual(null)} className="text-slate-700">
                    Trocar
                  </Button>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-bold text-slate-700">Quantidade Necessária</label>
                  <Input 
                    type="number" 
                    min={0.1} 
                    step={0.1}
                    value={qtdAdicionar}
                    onChange={(e) => setQtdAdicionar(Number(e.target.value))}
                    className="h-12 text-lg font-medium"
                  />
                </div>

                <Button 
                  onClick={handleAddItemManual} 
                  disabled={isSubmitting || qtdAdicionar <= 0}
                  className="w-full h-12 text-lg font-bold bg-teal-600 hover:bg-teal-700"
                >
                  {isSubmitting ? "Adicionando..." : "Adicionar à Lista"}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
