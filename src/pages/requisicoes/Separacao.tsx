import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { contemTexto, formatItemName, unidadeDoItem } from "@/lib/utils";
import {
  avaliarSeparacao,
  formatarQtd,
  opcoesDeUnidade,
  unidadeEntregue,
  unidadesDoItem,
} from "@/lib/unidades";
import {
  getRequisicao,
  updateRequisicaoStatus,
  unlockRequisicao,
  updateRequisicaoItem,
  addHistorico,
  addRequisicaoItem,
  getItens,
  processarRuptura,
  uploadAssinatura,
  salvarAssinaturas,
  lockRequisicao,
  renovarLockRequisicao,
  LOCK_TTL_MS
} from "@/services/api";
import { atualizarQuantidadeReposicao } from "@/services/reposicao";
import { Requisicao, Item, RequisicaoItemComDetalhes } from "@/types";
import { toast } from "@/lib/toast";
import { format } from "date-fns";
import { ArrowLeft, CheckSquare, Square, Edit3, Save, Plus, Search, X, FileText, ShieldCheck } from "lucide-react";
import {
  TERMO_VERSAO,
  TERMO_TITULO,
  TERMO_ITENS,
  TERMO_RODAPE,
} from "@/lib/termoEntrega";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/StatusBadge";
import { playSound } from "@/lib/sounds";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import SignatureCanvas from 'react-signature-canvas';

const ITEMS_PER_PAGE = 20;

export default function Separacao() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [req, setReq] = useState<Requisicao | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [qtds, setQtds] = useState<Record<string, number>>({});
  // Unidade em que cada linha está sendo entregue. Começa na unidade do pedido
  // e o almoxarifado pode trocar (pedido 5 UN de carne, entregue 6,2 KG).
  const [unids, setUnids] = useState<Record<string, string>>({});
  const [isFinishing, setIsFinishing] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);

  // Add item state
  const [showAddItem, setShowAddItem] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [conferenciaChecks, setConferenciaChecks] = useState<Record<string, boolean>>({});
  const [signatureStep, setSignatureStep] = useState<1 | 2 | 3>(1);
  // "Recebedor" e "Conferente" confundiam quem assina onde. Aqui e no banco as
  // duas assinaturas são: SOLICITANTE (quem recebe) e ALMOXARIFADO (quem entrega).
  const refAssinaturaSolicitante = React.useRef<SignatureCanvas>(null);
  const refAssinaturaAlmoxarifado = React.useRef<SignatureCanvas>(null);
  const [temAssinaturaSolicitante, setTemAssinaturaSolicitante] = useState(false);
  const [temAssinaturaAlmoxarifado, setTemAssinaturaAlmoxarifado] = useState(false);
  const [assinaturaSolicitanteBase64, setAssinaturaSolicitanteBase64] = useState<string | undefined>();
  const [assinaturaAlmoxarifadoBase64, setAssinaturaAlmoxarifadoBase64] = useState<string | undefined>();
  // Aceite do termo de recebimento: obrigatório antes do solicitante assinar.
  const [termoAceito, setTermoAceito] = useState(false);
  const [showTermo, setShowTermo] = useState(false);
  const [catalog, setCatalog] = useState<Item[]>([]);
  const [searchItem, setSearchItem] = useState("");
  const [selectedNewItem, setSelectedNewItem] = useState<Item | null>(null);
  const [newItemQtd, setNewItemQtd] = useState<number | "">("");
  const [newItemUnidade, setNewItemUnidade] = useState("");
  const [isAddingItem, setIsAddingItem] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (id) {
      carregarDetalhes(id);
    }
  }, [id]);

  useEffect(() => {
    if (req) {
      playSound('start');
      const initialQtds: Record<string, number> = {};
      const initialUnids: Record<string, string> = {};
      const initialChecked = new Set<string>();
      req.itens?.forEach(item => {
        const qt = item.quantidade_separada !== undefined && item.quantidade_separada !== null
          ? item.quantidade_separada
          : item.quantidade;
        initialQtds[item.id] = qt;
        initialUnids[item.id] = unidadeEntregue(item);
        if (item.quantidade_separada !== undefined && item.quantidade_separada !== null) {
          initialChecked.add(item.id);
        }
      });
      setQtds(initialQtds);
      setUnids(initialUnids);
      setCheckedItems(initialChecked);
      setEditingItemId(null);
    }
  }, [req?.id]); // load initial quantities only on first load

  
  const carregarDetalhes = async (reqId: string) => {
    setLoading(true);
    try {
      const data = await getRequisicao(reqId);

      // Entrar pela URL (link antigo, lista de reposição desatualizada) numa
      // requisição já encerrada abria a separação de novo: dava para
      // "finalizar" outra vez, trocar as assinaturas e gerar outra complementar.
      if (data && !["PENDENTE", "SEPARANDO", "AGUARDANDO"].includes(data.status)) {
        toast.error("Esta requisição já foi encerrada e não pode ser separada de novo.", { id: `encerrada-${reqId}` });
        navigate(`/requisicoes/${reqId}`, { replace: true });
        return;
      }

      // Trava de concorrência: vale para quem chega pelo botão "Iniciar
      // Separação" e também para quem abre a URL direto (ex.: pelo atalho
      // "Resolver na Requisição" da lista de reposição, que antes entrava
      // sem travar nada).
      if (data && user) {
        const trava = await lockRequisicao(reqId, user.id);
        if (!trava.ok) {
          toast.error("Esta requisição já está sendo separada por outro operador.", { id: `travada-${reqId}` });
          navigate(`/requisicoes/${reqId}`, { replace: true });
          return;
        }
      }

      setReq(data);
    } catch (e) {
      toast.error("Erro ao carregar detalhes");
      navigate('/requisicoes');
    } finally {
      setLoading(false);
    }
  };

  // Renova a trava enquanto a tela estiver aberta, para ela não expirar no meio
  // de uma separação longa (e expirar sozinha se o operador sumir).
  useEffect(() => {
    if (!req?.id || !user) return;
    const intervalo = setInterval(() => {
      renovarLockRequisicao(req.id, user.id);
    }, Math.floor(LOCK_TTL_MS / 3));
    return () => clearInterval(intervalo);
  }, [req?.id, user?.id]);

  const loadCatalog = async () => {
    try {
      const allItens = await getItens();
      setCatalog(allItens.filter(i => i.ativo));
    } catch (e) {
      toast.error("Erro ao carregar itens");
    }
  };

  useEffect(() => {
    if (showAddItem && catalog.length === 0) {
      loadCatalog();
    }
  }, [showAddItem]);

  const toggleCheck = async (itemId: string) => {
    const newChecked = new Set(checkedItems);
    let isChecked = false;
    if (newChecked.has(itemId)) {
      newChecked.delete(itemId);
    } else {
      newChecked.add(itemId);
      isChecked = true;
      playSound('check');
    }
    setCheckedItems(newChecked);

    // Auto-save logic
    try {
      const currentQt = qtds[itemId] || 0;
      await updateRequisicaoItem(itemId, isChecked ? currentQt : null, unids[itemId]);
    } catch (e) {
      console.error("Auto-save failed:", e);
    }
  };

  /** Unidade em que a linha está sendo entregue agora. */
  const unidadeSeparadaDe = (linha: RequisicaoItemComDetalhes) =>
    unids[linha.id] || unidadeDoItem(linha);

  const allItems = req?.itens || [];
  const totalItems = allItems.length;
  const isAllChecked = checkedItems.size === totalItems && totalItems > 0;
  const isAllConferidos = totalItems > 0 && allItems.every(item => !!conferenciaChecks[item.id]);
  
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentItems = allItems.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  /** Leva à página onde está o primeiro item ainda não conferido. */
  const irParaPrimeiroPendente = () => {
    const indice = allItems.findIndex((item) => !checkedItems.has(item.id));
    if (indice < 0) return;
    const pagina = Math.floor(indice / ITEMS_PER_PAGE) + 1;
    if (pagina !== currentPage) setCurrentPage(pagina);
  };

  const handleCancelar = async () => {
    if (!req || !user) return;
    try {
      await unlockRequisicao(req.id);
      if (req.status === 'SEPARANDO') {
        await updateRequisicaoStatus(req.id, 'PENDENTE', user.id);
        toast.info("Separação cancelada, status revertido para PENDENTE.");
      }
    } catch (e) {
      console.error(e);
    } finally {
      navigate(`/requisicoes/${req.id}`, { replace: true });
    }
  };

  const prepareConference = () => {
    // Complementar sem nada entregue: finalizar só criaria outra complementar
    // igual, com termo e assinaturas de uma entrega que não houve.
    const nadaEntregue = (req?.itens || []).every((item) => !(Number(qtds[item.id]) > 0));
    if (req?.status === "AGUARDANDO" && nadaEntregue) {
      toast.error(
        "Nada foi entregue nesta complementar. Use Cancelar: ela continua aguardando até o material chegar.",
      );
      return;
    }
    setConferenciaChecks({});
    setSignatureStep(1);
    setTemAssinaturaSolicitante(false);
    setTemAssinaturaAlmoxarifado(false);
    setAssinaturaSolicitanteBase64(undefined);
    setAssinaturaAlmoxarifadoBase64(undefined);
    setTermoAceito(false);
    setShowSignatureModal(true);
  };

  const handleFinalizarRequisicao = async () => {
    if (!req || !user) return;
    setIsFinishing(true);

    const signatureRecebedorBase64: string | undefined = assinaturaSolicitanteBase64;
    const signatureConferenteBase64: string | undefined = assinaturaAlmoxarifadoBase64;

    try {
      let assinaturaSolicitanteFinal: string | undefined = undefined;
      let assinaturaAlmoxarifadoFinal: string | undefined = undefined;

      if (signatureRecebedorBase64 || signatureConferenteBase64) {
        try {
          if (signatureRecebedorBase64) {
            const path = `req_${req.id}_solicitante_${Date.now()}.png`;
            assinaturaSolicitanteFinal = await uploadAssinatura(signatureRecebedorBase64, path);
          }
          if (signatureConferenteBase64) {
            const path = `req_${req.id}_almoxarifado_${Date.now()}.png`;
            assinaturaAlmoxarifadoFinal = await uploadAssinatura(signatureConferenteBase64, path);
          }
        } catch (err) {
          console.error("Erro no upload de assinaturas:", err);
          toast.error("Erro ao salvar a imagem da assinatura. Tente novamente.");
          setIsFinishing(false);
          return;
        }

        // Persistir as assinaturas ANTES de mexer em status/ruptura: assim elas
        // ficam no banco mesmo se algum passo seguinte falhar, e a requisição
        // reaberta amanhã ainda mostra as duas assinaturas no PDF.
        if (assinaturaSolicitanteFinal || assinaturaAlmoxarifadoFinal) {
          const gravou = await salvarAssinaturas(
            req.id,
            {
              assinatura_solicitante: assinaturaSolicitanteFinal,
              assinatura_almoxarifado: assinaturaAlmoxarifadoFinal,
              // O aceite do termo anda junto da assinatura: é ela que o valida.
              ...(termoAceito
                ? { termo_aceito_em: new Date().toISOString(), termo_versao: TERMO_VERSAO }
                : {}),
            },
            user.id,
          );
          if (!gravou) {
            toast.warning(
              "As assinaturas não puderam ser gravadas no banco. Imprima ou exporte o PDF agora.",
            );
          } else if (termoAceito) {
            await addHistorico(
              req.id,
              "TERMO_ACEITO",
              user.id,
              `${req.usuario?.nome || "Solicitante"} aceitou o ${TERMO_TITULO} (versão ${TERMO_VERSAO}) antes de assinar.`,
            );
          }
        }
      }

      const isComplementarAct = req.status === "AGUARDANDO";
      let hasRuptureChanges = false;
      let allItemsZero = true;
      const itemsInRupture: { item_id: string; nome: string; unidade: string; quantidade: number }[] = [];

      for (const item of req.itens || []) {
        let qtSeparada = qtds[item.id];
        if (qtSeparada === undefined) {
           qtSeparada = item.quantidade_separada !== undefined && item.quantidade_separada !== null ? item.quantidade_separada : item.quantidade;
        }
        const qtSolicitada = item.quantidade;
        const unPedida = unidadeDoItem(item);
        const unEntregue = unidadeSeparadaDe(item);
        const nomeItem = formatItemName(item.item?.nome);
        const resultado = avaliarSeparacao(qtSolicitada, unPedida, qtSeparada, unEntregue);

        // 1. Grava o que foi entregue: quantidade E unidade. É o que fica
        //    registrado no fim (pedido 5 UN, entregue 6,2 KG → 6,2 KG).
        await updateRequisicaoItem(item.id, qtSeparada, unEntregue);

        if (qtSeparada > 0) {
          allItemsZero = false;
        }

        const qtFaltante = resultado.situacao === "falta" ? resultado.faltante : 0;

        // Atualizar a quantidade da lista de reposicao se for complementar
        if (isComplementarAct) {
          try {
            await atualizarQuantidadeReposicao(req.id, item.item_id, qtFaltante, user.id, unPedida);
          } catch (err) {
            console.error("Erro ao atualizar da reposicao:", err);
          }
        }

        if (resultado.situacao === "falta") {
          hasRuptureChanges = true;

          // A falta é sempre na unidade em que foi PEDIDO: é o que a
          // complementar e a lista de compras precisam repor.
          itemsInRupture.push({
            item_id: item.item_id,
            nome: nomeItem || "Item",
            unidade: unPedida,
            quantidade: qtFaltante
          });

          const rupturaTipo = qtSeparada === 0 ? "RUPTURA TOTAL" : "RUPTURA PARCIAL";
          const msg = `Item: ${nomeItem} | Solicitado: ${formatarQtd(qtSolicitada)} ${unPedida} | Separado: ${formatarQtd(qtSeparada)} ${unEntregue} | Faltante: ${formatarQtd(qtFaltante)} ${unPedida} | Tipo: ${rupturaTipo}`;
          await addHistorico(req.id, qtSeparada === 0 ? "RUPTURA_TOTAL" : "RUPTURA_PARCIAL", user.id, msg);
        } else if (resultado.situacao === "excedente") {
          const msg = `Item: ${nomeItem} | Solicitado: ${formatarQtd(qtSolicitada)} ${unPedida} | Separado: ${formatarQtd(qtSeparada)} ${unEntregue} | Excedente: +${formatarQtd(resultado.excedente)} ${unPedida}`;
          await addHistorico(req.id, "ITENS_EDITADOS", user.id, msg);
        } else if (resultado.situacao === "outra_unidade") {
          const msg = `Item: ${nomeItem} | Solicitado: ${formatarQtd(qtSolicitada)} ${unPedida} | Entregue: ${formatarQtd(qtSeparada)} ${unEntregue} (em outra unidade)`;
          await addHistorico(req.id, "ITENS_EDITADOS", user.id, msg);
        }
      }

      // Requisição comum e complementar seguem a MESMA regra: fecha com o que
      // foi entregue e, se faltou algo, nasce uma complementar só com a falta.
      //
      // Antes a complementar entregue pela metade ficava AGUARDANDO para
      // sempre: cada tentativa regravava a mesma requisição (outro termo,
      // outras assinaturas) e ela nunca podia ser lançada no TOTVS.
      if (hasRuptureChanges) {
        const statusGeral = allItemsZero ? "RUPTURA_TOTAL" : "RUPTURA_PARCIAL";

        // A função do banco faz tudo numa transação só: fecha esta
        // requisição, cria a complementar e põe cada falta na lista de
        // reposição, na unidade em que foi pedida. Se esta já era
        // complementar, a falta que estava na lista MUDA para a nova (com
        // urgência e "já pedido" preservados), em vez de duplicar.
        await processarRuptura(
          req.id,
          statusGeral,
          itemsInRupture.map(i => ({
            item_id: i.item_id,
            quantidade: i.quantidade,
            unidade: i.unidade,
          }))
        );

        playSound('finish');
        toast.success(
          isComplementarAct
            ? "Entrega registrada. O que ainda faltou foi para uma nova complementar."
            : "Requisição finalizada com rupturas.",
        );
      } else {
        // Tudo entregue.
        await updateRequisicaoStatus(req.id, "FINALIZADA", user.id);
        playSound('finish');
        toast.success(
          isComplementarAct ? "Requisição complementar finalizada com sucesso!" : "Requisição finalizada com sucesso!",
        );
      }

      await unlockRequisicao(req.id);
      navigate(`/requisicoes/${req.id}`, {
        state: {
          showPrintModal: true,
          assinaturaSolicitante: assinaturaSolicitanteFinal,
          assinaturaAlmoxarifado: assinaturaAlmoxarifadoFinal,
        },
        replace: true,
      });

    } catch (e: any) {
      console.error("Erro ao finalizar requisição:", e);
      // Mostrar o motivo: "Erro ao finalizar" sozinho não dá o que reportar.
      toast.error(
        `Erro ao finalizar requisição: ${e?.message || e?.details || "falha de comunicação com o servidor"}`,
      );
      setIsFinishing(false);
    }
  };

  const handleAddItemToReq = async () => {
    if (!selectedNewItem || !req || !user || !newItemQtd) return;
    if (!newItemUnidade) {
      toast.error("Escolha a unidade do item.");
      return;
    }
    setIsAddingItem(true);
    try {
      const newItemInfo = {
        requisicao_id: req.id,
        item_id: selectedNewItem.id,
        quantidade: 0, // Solicitado originalmente 0
        quantidade_separada: Number(newItemQtd),
        unidade: newItemUnidade,
        unidade_separada: newItemUnidade,
      };
      
      const addedItem = await addRequisicaoItem(newItemInfo);
      if (addedItem) {
        // Atualiza UI
        const detailedItem: RequisicaoItemComDetalhes = {
          ...addedItem,
          item: selectedNewItem
        };
        
        const updatedItems = [...(req.itens || []), detailedItem];
        setReq({ ...req, itens: updatedItems });
        
        setQtds(prev => ({ ...prev, [addedItem.id]: Number(newItemQtd) }));
        setUnids(prev => ({ ...prev, [addedItem.id]: newItemUnidade }));
        
        // O item adicionado inicia desmarcado (pendente de conferência) conforme solicitado
        // Não é mais adicionado automaticamente a checkedItems

        await addHistorico(
          req.id,
          "ITENS_EDITADOS",
          user.id,
          `Item adicionado durante separação: ${formatItemName(selectedNewItem.nome)} | Adicionado: ${formatarQtd(Number(newItemQtd))} ${newItemUnidade}`
        );

        toast.success("Item adicionado com sucesso!");
        setShowAddItem(false);
        setSelectedNewItem(null);
        setNewItemQtd("");
        setNewItemUnidade("");
        setSearchItem("");
      }
    } catch (e) {
      toast.error("Erro ao adicionar item");
    } finally {
      setIsAddingItem(false);
    }
  };

  const filteredCatalog = catalog.filter(i => 
    contemTexto(i.nome, searchItem) &&
    !req?.itens?.some(reqItem => reqItem.item_id === i.id)
  ).slice(0, 50);

  if (user?.perfil === 'SOLICITANTE') {
    return <Navigate to="/" replace />;
  }

  if (loading) {
    return <div className="flex h-screen items-center justify-center bg-slate-50 font-medium">Carregando...</div>;
  }

  if (!req) return null;

  return (
    <div className="flex flex-col bg-white text-slate-800 rounded-xl shadow-lg shadow-slate-200/50 border border-slate-200/80 relative h-[calc(100dvh-6rem)] overflow-hidden">
      {/* Header Compacto */}
      <div className="flex items-center justify-between px-3 py-3 sm:py-4 bg-slate-100 border-b shrink-0 rounded-t-xl">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            className="w-8 h-8 md:hidden mr-1"
            onClick={handleCancelar}
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Button>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="w-8 h-8 hidden md:flex mr-1"
                onClick={handleCancelar}
              >
                <ArrowLeft className="w-5 h-5 text-slate-600" />
              </Button>
              <h1 className="text-base sm:text-lg font-black leading-none break-words whitespace-normal">Req #{req.codigo_requisicao}</h1>
              {/* Mesma pílula do resto do app. A de antes era cinza-claro sobre
                  cinza e quase não se lia. */}
              <StatusBadge status={req.status} />
            </div>
            <p className="text-[11px] sm:text-sm text-slate-700 font-medium leading-tight mt-1 break-words whitespace-normal">
              {req.departamento} • {req.usuario?.nome} 
              {req.observacao && <span className="text-orange-600 font-bold ml-1">Obs: {req.observacao}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right hidden sm:block leading-tight">
            <p className="text-[10px] font-bold text-slate-700 uppercase">Progresso</p>
            <p className="text-sm font-black text-teal-700">{checkedItems.size} <span className="text-slate-600 font-normal">/ {totalItems}</span></p>
          </div>
          <Button size="sm" onClick={() => setShowAddItem(true)} className="h-8 px-2.5 text-xs bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg shrink-0">
            <Plus className="w-3 h-3 mr-1" /> Item
          </Button>
        </div>
      </div>

      {/* Lista de Itens. Ocupa o espaço que sobra entre o cabeçalho e o rodapé:
          antes o rodapé ficava POR CIMA da lista, e numa requisição grande o
          aviso "Faltam N itens" tampava os últimos itens, impedindo marcá-los. */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto overflow-x-hidden w-full">
        <div className="w-full min-w-[320px]">
          {currentItems.map((prod) => {
            const isChecked = checkedItems.has(prod.id);
            const isEditing = editingItemId === prod.id;
            const qtSolicitada = prod.quantidade;
            const qtSeparada = qtds[prod.id] !== undefined ? qtds[prod.id] : qtSolicitada;
            const unPedida = unidadeDoItem(prod);
            const unSep = unidadeSeparadaDe(prod);
            const resultado = avaliarSeparacao(qtSolicitada, unPedida, qtSeparada, unSep);

            const etiqueta =
              resultado.situacao === "falta" ? (
                <span className="text-[11px] font-bold text-orange-700 bg-orange-50 border border-orange-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                  Falta {formatarQtd(resultado.faltante)} {unPedida}
                </span>
              ) : resultado.situacao === "excedente" ? (
                <span className="text-[11px] font-bold text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                  A mais {formatarQtd(resultado.excedente)}
                </span>
              ) : resultado.situacao === "outra_unidade" ? (
                <span className="text-[11px] font-bold text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded whitespace-nowrap">
                  Entregue em {unSep}
                </span>
              ) : null;

            return (
              <div key={prod.id} className="border-b border-slate-100 flex flex-col">
                <div
                  className={`flex items-center px-2 sm:px-4 py-1.5 sm:py-2 transition-colors cursor-pointer ${isChecked ? 'bg-slate-50/50' : 'hover:bg-slate-50'}`}
                  onClick={() => {
                    if (!isEditing) toggleCheck(prod.id);
                  }}
                >
                  <div className="shrink-0 w-10 flex justify-center">
                    {isChecked ? (
                      <CheckSquare className="w-6 h-6 sm:w-7 sm:h-7 text-emerald-600 stroke-[2.5]" />
                    ) : (
                      <Square className="w-6 h-6 sm:w-7 sm:h-7 text-slate-600 stroke-[2.5]" />
                    )}
                  </div>

                  {/* No celular o nome ocupa a linha inteira e os números vêm
                      embaixo. */}
                  <div className={`flex-1 min-w-0 pr-2 ${isChecked && !isEditing ? 'opacity-60' : ''}`}>
                    <p className={`text-sm sm:text-base font-bold text-slate-800 break-words whitespace-normal leading-tight ${isChecked && !isEditing ? 'line-through' : ''}`}>
                      {formatItemName(prod.item?.nome)}
                    </p>

                    <div className="flex sm:hidden items-center flex-wrap gap-x-2 gap-y-0.5 mt-1">
                      <span className="text-xs text-slate-600">
                        Sol <span className="font-bold text-slate-700">{formatarQtd(qtSolicitada)}</span> {unPedida}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-xs text-slate-600">
                        Sep <span className={`font-black ${isChecked ? 'text-slate-700' : 'text-teal-700'}`}>{formatarQtd(qtSeparada)}</span> {unSep}
                      </span>
                      {etiqueta}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 sm:gap-4 shrink-0">
                    <div className="w-20 text-right hidden sm:block">
                      <p className="text-[10px] text-slate-600 uppercase font-bold leading-none">Sol</p>
                      <p className="text-base font-semibold leading-tight text-slate-600">
                        {formatarQtd(qtSolicitada)} <span className="text-xs font-medium text-slate-600 ml-0.5">{unPedida}</span>
                      </p>
                    </div>

                    <div className="w-20 text-right hidden sm:block">
                      <p className="text-[10px] text-slate-600 uppercase font-bold leading-none">Sep</p>
                      <p className={`text-base font-black leading-tight ${isChecked ? 'text-slate-700' : 'text-teal-700'}`}>
                        {formatarQtd(qtSeparada)} <span className="text-xs font-medium opacity-60 ml-0.5">{unSep}</span>
                      </p>
                    </div>

                    <div className="w-28 text-right hidden sm:block">{etiqueta}</div>

                    <div className="w-9 sm:w-10 flex justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-slate-600 hover:text-teal-600 hover:bg-teal-50"
                        title="Ajustar quantidade e unidade"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingItemId(isEditing ? null : prod.id);
                        }}
                      >
                        {isEditing ? <X className="w-4 h-4" /> : <Edit3 className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Editor da linha: quantidade E unidade entregue. */}
                {isEditing && (
                  <div className="bg-slate-100 border-t border-slate-200 px-4 py-2 flex items-center justify-end gap-2 sm:gap-3 flex-wrap" onClick={e => e.stopPropagation()}>
                    <span className="text-xs font-bold text-slate-600 uppercase hidden sm:inline">Entregue:</span>

                    {/* Atalho para o caso mais comum de ajuste. */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 bg-white border-orange-200 text-orange-700 hover:bg-orange-50 hover:text-orange-800 font-bold shrink-0"
                      onClick={async () => {
                        setQtds({ ...qtds, [prod.id]: 0 });
                        setEditingItemId(null);
                        if (!checkedItems.has(prod.id)) {
                          const novos = new Set(checkedItems);
                          novos.add(prod.id);
                          setCheckedItems(novos);
                        }
                        playSound('check');
                        try {
                          await updateRequisicaoItem(prod.id, 0, unSep);
                        } catch (e) {
                          console.error("Auto-save failed:", e);
                        }
                      }}
                    >
                      Em falta
                    </Button>


                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0 bg-white"
                        onClick={() => {
                          const current = qtds[prod.id] === undefined ? qtSolicitada : qtds[prod.id];
                          setQtds({ ...qtds, [prod.id]: Math.max(0, current - 1) });
                        }}
                      >
                        -
                      </Button>
                      <Input
                        type="number"
                        step="any"
                        inputMode="decimal"
                        className="w-16 sm:w-20 h-8 text-center font-bold bg-white"
                        value={qtds[prod.id] === undefined ? "" : qtds[prod.id]}
                        onChange={(e) => {
                          const val = e.target.value;
                          setQtds({ ...qtds, [prod.id]: val === "" ? 0 : Number(val) });
                        }}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0 bg-white"
                        onClick={() => {
                          const current = qtds[prod.id] === undefined ? qtSolicitada : qtds[prod.id];
                          setQtds({ ...qtds, [prod.id]: current + 1 });
                        }}
                      >
                        +
                      </Button>
                    </div>

                    {/* Pedido em UN, entregue em KG: é aqui que se troca. */}
                    <select
                      value={unSep}
                      onChange={(e) => setUnids({ ...unids, [prod.id]: e.target.value })}
                      aria-label={`Unidade entregue de ${formatItemName(prod.item?.nome)}`}
                      className="h-8 w-20 shrink-0 rounded-md border border-slate-300 bg-white px-2 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      {opcoesDeUnidade(prod.item, unPedida, unSep).map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>

                    <Button
                      size="sm"
                      className="h-8 bg-teal-600 hover:bg-teal-700 font-bold px-3 sm:px-4 shrink-0"
                      onClick={async () => {
                        setEditingItemId(null);
                        if (isChecked) {
                          try {
                            await updateRequisicaoItem(prod.id, qtds[prod.id], unSep);
                          } catch (e) {
                            console.error("Auto-save failed:", e);
                          }
                        }
                      }}
                    >
                      <Save className="w-4 h-4 sm:mr-1" />
                      <span className="hidden sm:inline">Salvar</span>
                    </Button>

                    {unSep !== unPedida && (
                      <p className="w-full text-right text-[11px] text-sky-800">
                        Pedido em {unPedida}, entregue em {unSep}: conta como atendido, e o que fica registrado é o entregue.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2 bg-slate-50 border-t shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 text-xs font-bold"
            >
              Anterior
            </Button>
            <span className="text-xs font-bold text-slate-700">Página {currentPage} de {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 text-xs font-bold"
            >
              Próxima
            </Button>
          </div>
        )}
      </div>

      {/* Rodapé fixo EMBAIXO da lista (não por cima dela). */}
      <div className="shrink-0 w-full bg-white border-t p-3 sm:p-4 shadow-[0_-5px_15px_rgba(0,0,0,0.08)] rounded-b-xl">
        {/* Com paginação, o item que falta conferir pode estar em outra página. */}
        {!isAllChecked && totalItems > 0 && (
          <button
            type="button"
            onClick={irParaPrimeiroPendente}
            className="w-full mb-2 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg py-1.5 px-3 hover:bg-amber-100 transition-colors flex flex-wrap items-center justify-center gap-x-1.5 text-center"
          >
            <span>Faltam {totalItems - checkedItems.size} de {totalItems} para conferir</span>
            {totalPages > 1 && <span className="font-medium opacity-80">— toque para ir ao próximo</span>}
          </button>
        )}
        <div className="flex flex-row gap-2 sm:gap-3">
          <Button
            type="button"
            variant="destructive"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCancelar();
            }}
            className="shrink-0 h-12 sm:h-14 px-4 sm:px-6 text-sm sm:text-base font-bold rounded-xl shadow-md"
          >
            Cancelar
          </Button>
          <Button
            onClick={prepareConference}
            disabled={!isAllChecked || isFinishing || totalItems === 0}
            className={`flex-1 min-w-0 h-12 sm:h-14 text-sm sm:text-lg font-black rounded-xl transition-all ${isAllChecked ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg' : 'bg-slate-200 text-slate-500'}`}
          >
            {isFinishing ? "FINALIZANDO..." : isAllChecked ? "FINALIZAR REQUISIÇÃO" : `${checkedItems.size} / ${totalItems} SEPARADOS`}
          </Button>
        </div>
      </div>

      {/* Dialog Conferência e Assinatura */}
      <Dialog open={showSignatureModal} onOpenChange={setShowSignatureModal}>
        <DialogContent className="p-0 overflow-hidden flex flex-col bg-slate-50 w-full h-[100dvh] max-h-[100dvh] max-w-full sm:max-w-3xl sm:h-[90vh] sm:max-h-[95vh] sm:rounded-xl sm:w-11/12 border-0">
          <DialogHeader className="p-4 landscape:p-2 landscape:py-2 border-b bg-white shrink-0">
            <DialogTitle className="text-xl landscape:text-lg font-bold text-teal-900">
              {signatureStep === 1 && "1. Conferência dos Itens"}
              {signatureStep === 2 && "2. Assinatura do Solicitante (quem recebe)"}
              {signatureStep === 3 && "3. Assinatura do Almoxarifado (quem entrega)"}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 landscape:p-2 flex-1 overflow-y-auto flex flex-col gap-4">
            {signatureStep === 1 && (
              <div className="bg-white border border-slate-200/80 shadow-md shadow-slate-200/50 rounded-xl p-4 landscape:p-2 flex-1 flex flex-col h-full min-h-[200px]">
                <h3 className="font-bold text-slate-800 mb-3 landscape:mb-1 text-sm uppercase tracking-wide border-b pb-2">Resumo da Separação</h3>
                <div className="space-y-3 flex-1 overflow-y-auto pr-2">
                  {req?.itens?.map(item => {
                    let qtSeparada = qtds[item.id];
                    if (qtSeparada === undefined) {
                       qtSeparada = item.quantidade_separada !== undefined && item.quantidade_separada !== null ? item.quantidade_separada : item.quantidade;
                    }
                    return (
                      <div key={item.id} className="flex justify-between items-center text-sm border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <Checkbox 
                            checked={!!conferenciaChecks[item.id]} 
                            onCheckedChange={(checked) => setConferenciaChecks(prev => ({ ...prev, [item.id]: !!checked }))}
                            id={`conf-${item.id}`}
                            className="h-7 w-7 sm:h-8 sm:w-8 landscape:h-6 landscape:w-6 border-2 border-slate-400 data-unchecked:border-slate-400 data-checked:bg-emerald-600 data-checked:border-emerald-600 shadow-sm [&_svg]:size-5"
                          />
                          <label htmlFor={`conf-${item.id}`} className="font-medium text-slate-700 cursor-pointer select-none text-base landscape:text-sm">
                            {formatItemName(item.item?.nome)}
                          </label>
                        </div>
                        <span className="font-bold text-teal-900 text-base landscape:text-sm whitespace-nowrap">{formatarQtd(qtSeparada)} {unidadeSeparadaDe(item)}</span>
                      </div>
                    );
                  })}
                </div>
                {!isAllConferidos && (
                  <div className="mt-4 landscape:mt-2 bg-amber-50 text-amber-800 p-3 landscape:p-2 rounded-lg text-sm landscape:text-xs text-center font-medium border border-amber-200">
                    ⚠️ Confirme todos os itens na lista acima para liberar as assinaturas.
                  </div>
                )}
              </div>
            )}

            {signatureStep === 2 && (
              <div className="flex-1 flex flex-col h-full min-h-0 gap-3 landscape:gap-2">
                {/* Termo de recebimento: a pessoa precisa marcar que concorda
                    antes de assinar. O texto completo abre no botão "Ler termo". */}
                <div
                  className={`shrink-0 rounded-xl border p-3 landscape:p-2 transition-colors ${
                    termoAceito
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-amber-50 border-amber-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="aceite-termo"
                      checked={termoAceito}
                      onCheckedChange={(marcado) => setTermoAceito(!!marcado)}
                      className="h-7 w-7 landscape:h-6 landscape:w-6 mt-0.5 shrink-0 border-2 border-slate-400 data-unchecked:border-slate-400 data-checked:bg-emerald-600 data-checked:border-emerald-600 shadow-sm [&_svg]:size-5"
                    />
                    <div className="min-w-0 flex-1">
                      <label
                        htmlFor="aceite-termo"
                        className="block font-bold text-slate-800 text-sm landscape:text-xs cursor-pointer select-none leading-snug"
                      >
                        Li e concordo com os termos de recebimento
                      </label>
                      <p className="text-xs landscape:text-[11px] text-slate-600 leading-snug mt-0.5">
                        Quantidades conferidas, validade, embalagem e condições de uso.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowTermo(true)}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-teal-700 underline underline-offset-2 hover:text-teal-900"
                      >
                        <FileText className="h-3.5 w-3.5" /> Ler termo completo
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center shrink-0">
                  <h3 className="font-bold text-slate-800 text-sm landscape:text-xs uppercase tracking-wide">
                    Assinatura do Solicitante
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => { refAssinaturaSolicitante.current?.clear(); setTemAssinaturaSolicitante(false); setAssinaturaSolicitanteBase64(undefined); }} className="h-8 landscape:h-6 text-xs font-bold text-slate-700">Limpar</Button>
                </div>
                <div className="flex-1 border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden relative touch-none w-full min-h-[120px]">
                  <SignatureCanvas
                    ref={refAssinaturaSolicitante}
                    canvasProps={{className: 'w-full h-full absolute top-0 left-0'}}
                    backgroundColor="white"
                    onEnd={() => {
                      setTemAssinaturaSolicitante(true);
                      if (refAssinaturaSolicitante.current && !refAssinaturaSolicitante.current.isEmpty()) {
                        setAssinaturaSolicitanteBase64(refAssinaturaSolicitante.current.getCanvas().toDataURL('image/png'));
                      }
                    }}
                  />
                </div>
              </div>
            )}

            {signatureStep === 3 && (
              <div className="flex-1 flex flex-col h-full min-h-0">
                <div className="flex justify-between items-center mb-2 landscape:mb-1 shrink-0">
                  <h3 className="font-bold text-slate-800 text-sm landscape:text-xs uppercase tracking-wide">Assinatura do Almoxarifado</h3>
                  <Button variant="ghost" size="sm" onClick={() => { refAssinaturaAlmoxarifado.current?.clear(); setTemAssinaturaAlmoxarifado(false); setAssinaturaAlmoxarifadoBase64(undefined); }} className="h-8 landscape:h-6 text-xs font-bold text-slate-700">Limpar</Button>
                </div>
                <div className="flex-1 border-2 border-dashed border-slate-300 rounded-xl bg-white overflow-hidden relative touch-none w-full min-h-0">
                  <SignatureCanvas
                    ref={refAssinaturaAlmoxarifado}
                    canvasProps={{className: 'w-full h-full absolute top-0 left-0'}}
                    backgroundColor="white"
                    onEnd={() => {
                      setTemAssinaturaAlmoxarifado(true);
                      if (refAssinaturaAlmoxarifado.current && !refAssinaturaAlmoxarifado.current.isEmpty()) {
                        setAssinaturaAlmoxarifadoBase64(refAssinaturaAlmoxarifado.current.getCanvas().toDataURL('image/png'));
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <div className="p-4 landscape:p-2 border-t bg-white shrink-0 flex flex-col sm:flex-row landscape:flex-row gap-3">
            {signatureStep === 1 && (
              <Button 
                onClick={() => setSignatureStep(2)} 
                disabled={!isAllConferidos}
                className="w-full sm:flex-1 h-14 landscape:h-10 bg-teal-600 hover:bg-teal-700 text-white font-bold text-lg landscape:text-base rounded-xl shadow-sm"
              >
                Avançar para o Solicitante
              </Button>
            )}

            {signatureStep === 2 && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setSignatureStep(1)}
                  className="w-full sm:w-auto h-14 landscape:h-10 text-slate-700 font-bold text-lg landscape:text-base rounded-xl"
                  disabled={isFinishing}
                >
                  Voltar
                </Button>
                <Button
                  onClick={() => setSignatureStep(3)}
                  disabled={!temAssinaturaSolicitante || !termoAceito}
                  title={!termoAceito ? "Marque o aceite dos termos de recebimento" : undefined}
                  className="w-full sm:flex-1 h-14 landscape:h-10 bg-teal-600 hover:bg-teal-700 text-white font-bold text-lg landscape:text-base rounded-xl shadow-sm"
                >
                  {!termoAceito ? "Aceite os termos para avançar" : "Avançar para o Almoxarifado"}
                </Button>
              </>
            )}

            {signatureStep === 3 && (
              <>
                <Button 
                  variant="outline"
                  onClick={() => setSignatureStep(2)} 
                  className="w-full sm:w-auto h-14 landscape:h-10 text-slate-700 font-bold text-lg landscape:text-base rounded-xl"
                  disabled={isFinishing}
                >
                  Voltar
                </Button>
                <Button 
                  onClick={handleFinalizarRequisicao}
                  disabled={isFinishing || !temAssinaturaSolicitante || !temAssinaturaAlmoxarifado || !termoAceito}
                  className="w-full sm:flex-1 h-14 landscape:h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg landscape:text-base rounded-xl shadow-sm"
                >
                  {isFinishing ? "Processando..." : "Finalizar Entrega"}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Termo de recebimento, aberto pelo link "Ler termo completo" */}
      <Dialog open={showTermo} onOpenChange={setShowTermo}>
        <DialogContent className="sm:max-w-lg w-[92vw] max-h-[85vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="p-4 border-b bg-slate-50 shrink-0">
            <DialogTitle className="text-teal-900 flex items-center gap-2 text-base sm:text-lg">
              <ShieldCheck className="h-5 w-5 shrink-0" /> {TERMO_TITULO}
            </DialogTitle>
          </DialogHeader>

          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            <p className="text-sm text-slate-700">
              Ao assinar esta entrega, o solicitante declara que:
            </p>
            <ul className="space-y-2.5">
              {TERMO_ITENS.map((linha, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-slate-700 leading-snug">
                  <span className="shrink-0 mt-0.5 h-5 w-5 rounded-full bg-teal-100 text-teal-800 text-xs font-bold flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span>{linha}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-3">
              {TERMO_RODAPE}
            </p>
            <p className="text-[11px] text-slate-500">Versão {TERMO_VERSAO}</p>
          </div>

          <div className="p-4 border-t bg-white shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setShowTermo(false)} className="font-bold h-11">
              Fechar
            </Button>
            <Button
              onClick={() => { setTermoAceito(true); setShowTermo(false); }}
              className="bg-emerald-600 hover:bg-emerald-700 font-bold h-11"
            >
              Li e concordo
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Adicionar Item */}
      <Dialog open={showAddItem} onOpenChange={setShowAddItem}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden flex flex-col h-[80vh] sm:h-auto max-h-[90vh]">
          <DialogHeader className="p-4 border-b bg-slate-50 shrink-0">
            <DialogTitle>Adicionar Item à Separação</DialogTitle>
          </DialogHeader>
          
          <div className="p-4 flex-1 overflow-hidden flex flex-col gap-4">
            {!selectedNewItem ? (
              <>
                <div className="relative shrink-0">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-600" />
                  <Input
                    placeholder="Buscar material..."
                    value={searchItem}
                    onChange={(e) => setSearchItem(e.target.value)}
                    className="pl-9 h-10 bg-white"
                    autoFocus
                  />
                </div>
                <div className="flex-1 overflow-y-auto border rounded-lg bg-slate-50 p-2 space-y-1">
                  {filteredCatalog.length === 0 ? (
                    <p className="text-sm text-center text-slate-700 py-4">Nenhum item encontrado.</p>
                  ) : (
                    filteredCatalog.map(item => (
                      <div 
                        key={item.id}
                        className="px-3 py-2 hover:bg-teal-50 hover:text-teal-900 cursor-pointer rounded-md text-sm font-medium border border-transparent transition-colors"
                        onClick={() => {
                          setSelectedNewItem(item);
                          const unidades = unidadesDoItem(item);
                          setNewItemUnidade(unidades.length === 1 ? unidades[0] : "");
                        }}
                      >
                        {item.nome}
                        <span className="ml-2 text-xs font-normal text-slate-500">{unidadesDoItem(item).join(" · ")}</span>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 space-y-6">
                <div className="text-center">
                  <p className="text-sm text-slate-700 font-medium">Item selecionado:</p>
                  <p className="text-lg font-black text-slate-800">{selectedNewItem.nome}</p>
                </div>
                
                <div className="flex flex-col items-center gap-2">
                  <label className="text-xs font-bold uppercase text-slate-700">Quantidade a adicionar</label>
                  <div className="flex items-center gap-2">
                    <Input 
                      type="number" 
                      value={newItemQtd}
                      onChange={e => setNewItemQtd(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-24 h-12 text-center text-xl font-black"
                      min={1}
                      step="any"
                      inputMode="decimal"
                      autoFocus
                    />
                    <select
                      value={newItemUnidade}
                      onChange={(e) => setNewItemUnidade(e.target.value)}
                      aria-label="Unidade do item adicionado"
                      className="h-12 w-24 rounded-md border border-slate-300 bg-white px-2 text-base font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    >
                      <option value="" disabled>Unid.</option>
                      {unidadesDoItem(selectedNewItem).map((u) => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t bg-slate-50 shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            {selectedNewItem && (
              <Button variant="ghost" onClick={() => setSelectedNewItem(null)}>Voltar</Button>
            )}
            <Button 
              variant="outline" 
              onClick={() => { setShowAddItem(false); setSelectedNewItem(null); }}
            >
              Cancelar
            </Button>
            {selectedNewItem && (
              <Button 
                className="bg-teal-600 hover:bg-teal-700" 
                onClick={handleAddItemToReq}
                disabled={isAddingItem || !newItemQtd || Number(newItemQtd) <= 0 || !newItemUnidade}
              >
                {isAddingItem ? "Adicionando..." : "Adicionar à Separação"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
