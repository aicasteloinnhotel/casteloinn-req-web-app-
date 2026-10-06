import React, { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { formatItemName, precisaLancar, unidadeDoItem } from "@/lib/utils";
import { avaliarSeparacao, formatarQtd, unidadeEntregue } from "@/lib/unidades";
import { TERMO_TITULO, TERMO_RESUMO_PDF } from "@/lib/termoEntrega";
import {
  getRequisicao,
  updateRequisicaoStatus,
  updateRequisicaoInfo,
  getHistorico,
  addHistorico,
  getRequisicaoComplementar,
  getRequisicaoOriginal,
  getUsuarioNome,
  lockRequisicao,
  marcarRequisicaoLancada,
  desfazerLancamento
} from "@/services/api";
import { playSound } from "@/lib/sounds";
import { Requisicao, Historico } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { format } from "date-fns";
import {
  Printer,
  ArrowLeft,
  Check,
  Ban,
  PlayCircle,
  Download,
  AlertTriangle,
  Edit2,
  ClipboardCheck,
  ClipboardList,
  ShieldCheck,
  Undo2,
  Lock
} from "lucide-react";
import { toast } from "@/lib/toast";
import { supabase } from "@/lib/supabase";


const fetchImageAsBase64 = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url, { mode: 'cors' });
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Failed to fetch image as base64:", error);
    return "";
  }
};

/**
 * Texto de cada evento da linha do tempo. O código gravado no banco não tem
 * acento ("LANCADA_NO_TOTVS"); na tela ele aparece escrito direito.
 * Ação desconhecida cai no código com os "_" trocados por espaço, como antes.
 */
const ROTULOS_HISTORICO: Record<string, string> = {
  CRIADA: "CRIADA",
  EDITADA: "EDITADA",
  ITENS_EDITADOS: "ITENS AJUSTADOS NA SEPARAÇÃO",
  TERMO_ACEITO: "TERMO DE RECEBIMENTO ACEITO",
  RUPTURA_PARCIAL: "RUPTURA PARCIAL",
  RUPTURA_TOTAL: "RUPTURA TOTAL",
  RUPTURA_GEROU_COMPLEMENTAR: "RUPTURA GEROU COMPLEMENTAR",
  AGUARDANDO: "MANTIDA AGUARDANDO",
  IMPRESSO: "IMPRESSA",
  EXPORTADO: "PDF EXPORTADO",
  LANCADA_NO_TOTVS: "LANÇADA NO TOTVS",
  LANCAMENTO_DESFEITO: "LANÇAMENTO DESFEITO",
};

const rotuloDoHistorico = (acao: string): string => {
  if (acao.startsWith("STATUS_ALTERADO_")) {
    return `STATUS: ${acao.replace("STATUS_ALTERADO_", "").replace(/_/g, " ")}`;
  }
  return ROTULOS_HISTORICO[acao] || acao.replace(/_/g, " ");
};

/** Faixa que liga a requisição à sua origem ou à sua complementar. */
const VinculoRequisicao = ({
  texto,
  rotuloBotao,
  onAbrir,
}: {
  texto: React.ReactNode;
  rotuloBotao: string;
  onAbrir: () => void;
}) => (
  <div className="bg-slate-100 hover:bg-slate-200 border border-slate-200/80 text-slate-800 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all shadow-lg shadow-slate-200/50">
    <div className="flex items-center gap-2.5">
      <span className="flex h-3 w-3 relative shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-3 w-3 bg-teal-500"></span>
      </span>
      <p className="text-sm font-semibold text-slate-700">{texto}</p>
    </div>
    <Button
      size="sm"
      variant="outline"
      className="h-8 bg-white hover:bg-teal-50 hover:text-teal-900 border-slate-300 font-bold self-start sm:self-auto shrink-0 shadow-xs"
      onClick={onAbrir}
    >
      {rotuloBotao}
    </Button>
  </div>
);

export default function DetalheRequisicao() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [req, setReq] = useState<Requisicao | null>(null);
  const [historico, setHistorico] = useState<Historico[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [rel, setRel] = useState<{ original?: { id: string, codigo: number }, complementar?: { id: string, codigo: number } } | null>(null);

  useEffect(() => {
    if (!id) return;

    // "Abrir Original" / "Abrir Complemento" trocam de requisição sem desmontar
    // esta tela. Sem zerar aqui, a requisição nova aparecia por um instante com
    // os dados da anterior — e dava para tocar num botão da requisição errada.
    setLoading(true);
    setReq(null);
    setHistorico([]);
    setRel(null);

    carregarDetalhes(id);

    // Finalizar uma requisição escreve em 3 tabelas de uma vez; sem o atraso
    // curto abaixo, a tela recarregava tudo 3 ou mais vezes seguidas.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const recarregarComAtraso = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => carregarDetalhes(id), 300);
    };

    const channel = supabase
      .channel(`detalhes-${id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "requisicoes", filter: `id=eq.${id}` },
        recarregarComAtraso
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "requisicao_itens", filter: `requisicao_id=eq.${id}` },
        recarregarComAtraso
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "historico", filter: `requisicao_id=eq.${id}` },
        recarregarComAtraso
      )
      .subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [id]);

  const carregarDetalhes = async (reqId: string) => {
    try {
      const data = await getRequisicao(reqId);
      setReq(data);
      // As assinaturas vêm SEMPRE da requisição carregada. Antes só eram lidas
      // "se ainda não houvesse uma na tela": ao ir de uma requisição para outra
      // pelos botões de vínculo, a tela guardava as da anterior e o PDF da nova
      // saía com a assinatura de outra entrega.
      // O estado da navegação só cobre o instante logo após finalizar, caso a
      // gravação no banco tenha falhado e a pessoa precise imprimir mesmo assim.
      setSignatureRecebedorBase64(
        data?.assinatura_solicitante || location.state?.assinaturaSolicitante || null,
      );
      setSignatureConferenteBase64(
        data?.assinatura_almoxarifado || location.state?.assinaturaAlmoxarifado || null,
      );
      const hist = await getHistorico(reqId);
      setHistorico(hist);

      // Vínculos: uma requisição pode ser complementar de outra E ter gerado a
      // sua própria complementar (ruptura em cima de ruptura). Antes só um dos
      // dois lados aparecia e o outro ficava invisível.
      const [original, comp] = await Promise.all([
        data?.requisicao_origem_id
          ? getRequisicaoOriginal(data.requisicao_origem_id)
          : Promise.resolve(null),
        getRequisicaoComplementar(reqId),
      ]);

      const vinculos: { original?: { id: string, codigo: number }, complementar?: { id: string, codigo: number } } = {};
      if (original) vinculos.original = { id: original.id, codigo: original.codigo_requisicao || 0 };
      if (comp) vinculos.complementar = { id: comp.id, codigo: comp.codigo_requisicao || 0 };
      setRel(Object.keys(vinculos).length > 0 ? vinculos : null);
    } catch (e: any) {
      toast.error("Erro ao carregar requisição");
    } finally {
      setLoading(false);
    }
  };

  const location = useLocation();
  const [signatureRecebedorBase64, setSignatureRecebedorBase64] = useState<string | null>(location.state?.assinaturaSolicitante || null);
  const [signatureConferenteBase64, setSignatureConferenteBase64] = useState<string | null>(location.state?.assinaturaAlmoxarifado || null);

  // Logo depois de finalizar a separação. O passo seguinte é LANÇAR no TOTVS
  // (imprimir só vem depois), mas a requisição ainda está carregando aqui —
  // então só marca, e o efeito abaixo decide quando ela chegar.
  const [aposFinalizar, setAposFinalizar] = useState(false);
  useEffect(() => {
    if (location.state?.showPrintModal) {
      setAposFinalizar(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  
  const finalizacaoHist = historico.find(h =>
    h.acao.includes('FINALIZADA') ||
    h.acao.includes('RUPTURA_PARCIAL') ||
    h.acao.includes('RUPTURA_TOTAL') ||
    h.acao === 'CONFERÊNCIA_FINALIZADA'
  );

  // A consulta principal não traz o conferente (não há join para conferente_id),
  // então buscamos o nome à parte; se a coluna não existir, cai no histórico.
  const [conferenteNomeDb, setConferenteNomeDb] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    if (req?.conferente_id) {
      getUsuarioNome(req.conferente_id).then(nome => {
        if (ativo) setConferenteNomeDb(nome);
      });
    } else {
      setConferenteNomeDb(null);
    }
    return () => { ativo = false; };
  }, [req?.conferente_id]);

  const conferenteNome =
    req?.conferente?.nome || conferenteNomeDb || finalizacaoHist?.usuario?.nome;

  // Quem lançou no TOTVS: aparece no detalhe e no comprovante impresso.
  const [lancadoPorNome, setLancadoPorNome] = useState<string | null>(null);
  useEffect(() => {
    let ativo = true;
    if (req?.lancado && req.lancado_por) {
      getUsuarioNome(req.lancado_por).then((nome) => {
        if (ativo) setLancadoPorNome(nome);
      });
    } else {
      setLancadoPorNome(null);
    }
    return () => { ativo = false; };
  }, [req?.lancado, req?.lancado_por]);

  /** Entregue e ainda não lançada: a impressão espera o lançamento. */
  const aguardaLancamento = !!req && precisaLancar(req.status) && !req.lancado;

  const handleStartSeparacao = async () => {
    if (!req || !user) return;
    setUpdating(true);
    try {
      // A trava é decidida no banco (condicional + TTL), então dois conferentes
      // clicando ao mesmo tempo não entram os dois na separação.
      const trava = await lockRequisicao(req.id, user.id);
      if (!trava.ok) {
        toast.error("Esta requisição já está sendo separada por outro operador.");
        await carregarDetalhes(req.id);
        return;
      }

      // Marca SEPARANDO antes de navegar, para a lista de todo mundo refletir.
      if (req.status === "PENDENTE") {
        try {
          await updateRequisicaoStatus(req.id, "SEPARANDO", user.id);
        } catch (e) {
          console.error("Falha ao marcar status SEPARANDO:", e);
        }
      }

      navigate(`/requisicoes/${req.id}/separacao`);
    } catch (e: any) {
      console.error("Error in handleStartSeparacao:", e);
      toast.error(`Erro ao acessar separação: ${e?.message || 'Erro desconhecido'}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleStatusChange = async (novoStatus: string) => {
    if (!req || !user) return;

    setUpdating(true);
    try {
      await updateRequisicaoStatus(req.id, novoStatus, user.id);
      toast.success(`Status alterado para ${novoStatus}`);
      if (novoStatus === 'CANCELADA') playSound('cancel');
      await carregarDetalhes(req.id);
    } catch (e: any) {
      toast.error("Erro ao atualizar status");
    } finally {
      setUpdating(false);
    }
  };

  const exportPDF = async (mode: 'download' | 'print' = 'download') => {
    if (!req) return;
    if (user?.perfil !== "ALMOXARIFADO") return;
    // Regra da operação: o comprovante só sai depois do lançamento no TOTVS.
    if (aguardaLancamento) {
      toast.info("Lance no TOTVS antes de imprimir.");
      setShowLancamento(true);
      return;
    }
    setIsExporting(true);
    try {
    // A biblioteca de PDF (jsPDF + html2canvas) pesa quase 400 kB e só é usada
    // aqui: carregar sob demanda evita empurrá-la para o celular de quem só
    // consulta a requisição.
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);

    // Sem compressão, as duas assinaturas entravam como imagem crua e um
    // comprovante de uma página passava de 2 MB.
    const doc = new jsPDF({ compress: true });

    // Pedido e entregue cada um com a sua unidade: "5 UN" pedido, "6,2 KG" entregue.
    const head = [["Item", "Solicitado", "Entregue", "Conferência"]];
    const body = req.itens?.map((i) => [
      formatItemName(i.item?.nome),
      `${formatarQtd(i.quantidade)} ${unidadeDoItem(i)}`,
      i.quantidade_separada !== undefined && i.quantidade_separada !== null
        ? `${formatarQtd(i.quantidade_separada)} ${unidadeEntregue(i)}`
        : "",
      (req.status === 'FINALIZADA' || req.status === 'RUPTURA_PARCIAL' || req.status === 'RUPTURA_TOTAL' || signatureRecebedorBase64 || signatureConferenteBase64) ? "[X]" : ""
    ]) || [];

    const totalPagesExp = "{total_pages_count_string}";

    autoTable(doc, {
      startY: 45,
      head,
      body,
      theme: 'grid',
      headStyles: { 
        fillColor: [240, 240, 240],
        textColor: 0,
        fontStyle: 'bold',
        halign: 'center',
        lineWidth: 0.1,
        lineColor: [200, 200, 200]
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 'auto' }, // Item
        1: { halign: 'center', cellWidth: 32 }, // Solicitado (qtd + unidade)
        2: { halign: 'center', cellWidth: 32 }, // Entregue (qtd + unidade)
        3: { halign: 'center', cellWidth: 25 }  // Conferência
      },
      styles: { 
        fontSize: 9,
        cellPadding: 1.5,
        valign: 'middle',
        lineColor: [200, 200, 200],
        lineWidth: 0.1,
        textColor: 0
      },
      alternateRowStyles: { fillColor: [255, 255, 255] },
      didDrawPage: (data) => {
        // Cabeçalho (em todas as páginas)
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("Castelo Inn", 14, 15);
        
        doc.setFontSize(12);
        doc.text("REQUISIÇÃO DE ALMOXARIFADO", 14, 22);
        
        // Dados de Destaque
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(`REQ #${req.codigo_requisicao || "---"}`, 196, 15, { align: "right" });
        
        doc.setFontSize(11);
        doc.text(`DEPTO: ${req.departamento?.toUpperCase() || ""}`, 196, 22, { align: "right" });
        
        doc.setFontSize(10);
        doc.text(`DATA: ${format(new Date(req.created_at), "dd/MM/yyyy HH:mm")}`, 196, 28, { align: "right" });
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        
        doc.text(`Solicitante: ${req.usuario?.nome || "---"}`, 14, 32);
        
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.5);
        doc.line(14, 36, 196, 36);
        
        // Rodapé (em todas as páginas)
        const pageCurrent = data.pageNumber;
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        
        doc.text("Documento emitido automaticamente pelo Sistema Castelo Inn.", 14, 285);
        doc.text(`Emitido em: ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, 14, 290);
        
        doc.text(`Página ${pageCurrent} de ${totalPagesExp}`, 196, 290, { align: "right" });
        doc.setTextColor(0, 0, 0); // reset
      }
    });

    let finalY = (doc as any).lastAutoTable.finalY + 8;

    // Quem lançou no TOTVS e quem imprimiu: o papel diz de quem cobrar.
    const nomeDeQuemLancou =
      lancadoPorNome || (req.lancado && req.lancado_por ? await getUsuarioNome(req.lancado_por) : null);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    if (req.lancado) {
      doc.text(
        `Lançado no TOTVS por: ${nomeDeQuemLancou || "---"}` +
          (req.lancado_em ? ` em ${format(new Date(req.lancado_em), "dd/MM/yyyy 'às' HH:mm")}` : ""),
        14,
        finalY,
      );
      finalY += 5;
    }
    doc.text(
      `${mode === "print" ? "Impresso" : "PDF gerado"} por: ${user?.nome || "---"} em ${format(new Date(), "dd/MM/yyyy 'às' HH:mm")}`,
      14,
      finalY,
    );
    finalY += 9;

    if (req.observacao) {
      if (finalY > 260) {
        doc.addPage();
        finalY = 45;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text("Observações:", 14, finalY);
      doc.setFont("helvetica", "normal");
      doc.text(`${req.observacao}`, 14, finalY + 5, { maxWidth: 180 });
      finalY += 15 + (doc.splitTextToSize(req.observacao, 180).length * 4);
    }
    
    // Termo de recebimento + assinaturas (somente na última página)
    const alturaTermo = req.termo_aceito_em ? 24 : 0;
    if (finalY + alturaTermo > 240) {
       doc.addPage();
       finalY = 45;
    }

    // Declaração aceita pelo solicitante antes de assinar. Sem ela, o PDF
    // mostrava só um rabisco, sem dizer com o que a pessoa concordou.
    if (req.termo_aceito_em) {
      doc.setFillColor(245, 245, 245);
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      doc.rect(14, finalY, 182, 20, "FD");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(TERMO_TITULO.toUpperCase(), 17, finalY + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.text(doc.splitTextToSize(TERMO_RESUMO_PDF, 176), 17, finalY + 9.5);

      doc.setFont("helvetica", "bold");
      doc.text(
        `Aceito por ${req.usuario?.nome || "solicitante"} em ` +
          `${format(new Date(req.termo_aceito_em), "dd/MM/yyyy 'às' HH:mm")}` +
          `${req.termo_versao ? `  (versão ${req.termo_versao})` : ""}`,
        17,
        finalY + 17.5,
      );

      finalY += 24;
    }

    finalY += 20;
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.1);


    let confBase64 = signatureConferenteBase64;
    let recBase64 = signatureRecebedorBase64;
    
    if (confBase64 && confBase64.startsWith('http')) {
       confBase64 = await fetchImageAsBase64(confBase64);
    } else if (confBase64 && !confBase64.startsWith('data:image')) {
       confBase64 = `data:image/png;base64,${confBase64}`;
    }
    
    if (recBase64 && recBase64.startsWith('http')) {
       recBase64 = await fetchImageAsBase64(recBase64);
    } else if (recBase64 && !recBase64.startsWith('data:image')) {
       recBase64 = `data:image/png;base64,${recBase64}`;
    }

    if (confBase64) {
      doc.addImage(confBase64, "PNG", 40, finalY - 15, 40, 15);
    }
    doc.line(30, finalY, 90, finalY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("ALMOXARIFADO", 60, finalY + 4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("(quem entregou)", 60, finalY + 8, { align: "center" });
    if (conferenteNome) {
      doc.setFontSize(8);
      doc.text(conferenteNome, 60, finalY + 12, { align: "center" });
    }

    if (recBase64) {
      doc.addImage(recBase64, "PNG", 130, finalY - 15, 40, 15);
    }
    doc.line(120, finalY, 180, finalY);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text("SOLICITANTE", 150, finalY + 4, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.text("(quem recebeu)", 150, finalY + 8, { align: "center" });
    if (req.usuario?.nome) {
      doc.setFontSize(8);
      doc.text(req.usuario.nome, 150, finalY + 12, { align: "center" });
    }

    if (typeof doc.putTotalPages === 'function') {
        doc.putTotalPages(totalPagesExp);
    }

    if (mode === 'print') {
      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
    } else {
      doc.save(`Requisicao_${req.codigo_requisicao || req.id.substring(0, 5)}.pdf`);
    }

    if (user) {
      try {
        const updatePayload = mode === "print" ? { impresso: true } : { exportado: true };
        await updateRequisicaoInfo(req.id, updatePayload);
        await addHistorico(req.id, mode === "print" ? "IMPRESSO" : "EXPORTADO", user.id, `Requisição ${mode === "print" ? "impressa" : "exportada"}`);
        carregarDetalhes(req.id);
      } catch (e) {
        console.error(e);
      }
    }
    } finally {
      setIsExporting(false);
    }
  };

  const handlePrint = async () => {
    if (user?.perfil !== "ALMOXARIFADO") return;
    await exportPDF('print');
  };




  const [showPrintModal, setShowPrintModal] = React.useState(false);
  // Cancelar é irreversível e não tinha nenhuma confirmação: um toque errado
  // no celular matava o pedido.
  const [confirmarCancelamento, setConfirmarCancelamento] = React.useState(false);
  // Lançamento no TOTVS: a requisição só sai do radar depois de lançada.
  const [showLancamento, setShowLancamento] = React.useState(false);

  // Recém-finalizada: só confirma que deu certo. Lançar no TOTVS e imprimir
  // ficam para depois, quando der tempo — na operação real ninguém lança na
  // hora da entrega.
  const [showFinalizada, setShowFinalizada] = React.useState(false);
  useEffect(() => {
    if (!aposFinalizar || !req) return;
    setAposFinalizar(false);
    setShowFinalizada(true);
  }, [aposFinalizar, req]);

  const handleMarcarLancada = async () => {
    if (!req || !user) return;
    setUpdating(true);
    try {
      await marcarRequisicaoLancada(req.id, user.id);
      playSound('notification');
      toast.success(`REQ #${req.codigo_requisicao} marcada como lançada no TOTVS.`);
      setShowLancamento(false);
      await carregarDetalhes(req.id);
      // Lançou: agora sim, oferece imprimir o comprovante.
      setShowPrintModal(true);
    } catch (e: any) {
      toast.error(`Não foi possível marcar como lançada: ${e?.message || "erro de comunicação"}`);
    } finally {
      setUpdating(false);
    }
  };

  const handleDesfazerLancamento = async () => {
    if (!req || !user) return;
    setUpdating(true);
    try {
      await desfazerLancamento(req.id, user.id);
      toast.info("Marcação de lançado desfeita.");
      setShowLancamento(false);
      await carregarDetalhes(req.id);
    } catch (e: any) {
      toast.error(`Não foi possível desfazer: ${e?.message || "erro de comunicação"}`);
    } finally {
      setUpdating(false);
    }
  };


  if (loading)
    return (
      <div className="text-center py-10 text-slate-700">
        Carregando detalhes...
      </div>
    );
  // Com o app instalado não existe botão "voltar" do navegador (no iPhone,
  // nenhum): sem o botão aqui, a pessoa ficava presa nesta mensagem.
  if (!req)
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <p className="font-bold text-slate-800">Requisição não encontrada.</p>
        <p className="text-sm text-slate-600">Ela pode ter sido apagada, ou o link está incompleto.</p>
        <Button variant="outline" onClick={() => navigate("/requisicoes")} className="font-bold">
          Ver requisições
        </Button>
      </div>
    );

  const ehDono = !!user && req.usuario_id === user.id;
  const ehAlmoxarifado = user?.perfil === "ALMOXARIFADO";

  // Um solicitante só enxerga as próprias requisições. A lista já filtra por
  // usuário, mas abrir a URL de outra pessoa direto trazia o pedido inteiro
  // de outro setor na tela.
  if (user?.perfil === "SOLICITANTE" && !ehDono) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-4">
        <div className="w-14 h-14 rounded-full bg-orange-50 border border-orange-200 flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7 text-orange-500" />
        </div>
        <p className="font-bold text-slate-800">Esta requisição não é sua.</p>
        <p className="text-sm text-slate-600">
          Você só tem acesso às requisições que você mesmo criou.
        </p>
        <Button variant="outline" onClick={() => navigate("/requisicoes")} className="font-bold">
          Ver minhas requisições
        </Button>
      </div>
    );
  }

  const documentoFechado = req.impresso || req.exportado;

  const podeAlterarStatus =
    ehAlmoxarifado &&
    req.status !== "FINALIZADA" &&
    req.status !== "CANCELADA";

  // O solicitante pode desfazer o próprio pedido enquanto ninguém o pegou.
  // Antes ele precisava ligar para o almoxarifado para cancelar um engano.
  const podeCancelarComoDono =
    ehDono && !ehAlmoxarifado && req.status === "PENDENTE";


  const getImageUrl = (urlOrBase64: string) => {
    if (!urlOrBase64) return "";
    if (urlOrBase64.startsWith("http")) return urlOrBase64;
    if (urlOrBase64.startsWith("data:")) return urlOrBase64;
    return `data:image/png;base64,${urlOrBase64}`;
  };

    const podeEditarItens = user?.perfil !== "SOLICITANTE" && !documentoFechado;
  const isPendenteOuSeparando = req.status === "PENDENTE" || req.status === "SEPARANDO" || req.status === "AGUARDANDO";

  const podeExportarEImprimir = (user?.perfil === "ALMOXARIFADO") && !isPendenteOuSeparando;

  // Só se lança no TOTVS o que foi de fato entregue: cancelada e ruptura total
  // (nada saiu) não entram. Já lançada continua acessível, para desfazer.
  const podeLancar = ehAlmoxarifado && (precisaLancar(req.status) || !!req.lancado);

  /** Linhas do jeito que o TOTVS precisa: material, quantidade ENTREGUE e a
   *  unidade em que saiu (pedido 5 UN, entregue 6,2 KG → lança 6,2 KG). */
  const todasAsLinhas = (req.itens || []).map((linha) => {
    const separada = linha.quantidade_separada !== undefined && linha.quantidade_separada !== null;
    return {
      id: linha.id,
      nome: formatItemName(linha.item?.nome),
      quantidade: separada ? Number(linha.quantidade_separada) : linha.quantidade,
      unidade: separada ? unidadeEntregue(linha) : unidadeDoItem(linha),
    };
  });
  // Item que não saiu (entregue 0) não se lança: ele foi para a complementar.
  // Antes aparecia "PAPEL TOALHA — 0" na lista e no "Copiar lista".
  const linhasParaLancamento = todasAsLinhas.filter((l) => Number(l.quantidade) > 0);
  const linhasNaoEntregues = todasAsLinhas.length - linhasParaLancamento.length;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10 print:p-0 print:max-w-none">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden border-b pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            // Aberta direto (link, aviso do celular), não há tela anterior no
            // app: o "voltar" do navegador sairia do sistema. Vai para a lista.
            onClick={() =>
              (window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate("/requisicoes")
            }
            className="rounded-full bg-slate-100 hover:bg-slate-200 text-teal-900 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-teal-900 break-words whitespace-normal">
              Requisição #{req.codigo_requisicao || "---"}
            </h1>
          </div>
        </div>
        
        {/* Editar/cancelar: só o dono do pedido, e só enquanto está PENDENTE.
            O "|| perfil === SOLICITANTE" que havia aqui anulava a checagem de
            dono e deixava um solicitante editar o pedido de outro pela URL. */}
        {req.status === "PENDENTE" && ehDono && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button
              onClick={() => navigate(`/requisicoes/${req.id}/editar`)}
              className="bg-teal-600 hover:bg-teal-700 text-white w-full sm:w-auto flex items-center justify-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors"
            >
              <Edit2 className="h-4 w-4" /> Editar Requisição
            </Button>
            {podeCancelarComoDono && (
              <Button
                variant="outline"
                onClick={() => setConfirmarCancelamento(true)}
                disabled={updating}
                className="w-full sm:w-auto h-9 px-4 rounded-lg text-sm font-medium border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Ban className="h-4 w-4 mr-2" /> Cancelar
              </Button>
            )}
          </div>
        )}

        {(podeExportarEImprimir || podeLancar) && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            {/* Imprimir só depois de lançar no TOTVS. Antes disso o botão
                aparece apagado; tocar nele explica e abre o lançamento. */}
            {podeExportarEImprimir && (
              <button
                type="button"
                onClick={handlePrint}
                disabled={isExporting}
                title={aguardaLancamento ? "Lance no TOTVS antes de imprimir" : "Imprimir o comprovante"}
                className={`w-full sm:w-auto flex items-center justify-center gap-2 h-9 px-4 rounded-lg text-sm font-medium transition-colors border ${
                  aguardaLancamento
                    ? "border-slate-200 bg-slate-50 text-slate-400"
                    : "text-teal-900 hover:text-teal-950 hover:bg-slate-100 border-slate-300 bg-white"
                }`}
              >
                {aguardaLancamento ? <Lock className="h-4 w-4" /> : <Printer className="h-4 w-4" />} Imprimir
              </button>
            )}

            {/* Lançamento no TOTVS: pendente fica âmbar, lançada fica verde.
                Dá para saber a situação só de bater o olho no botão. */}
            {podeLancar && (
              <button
                type="button"
                onClick={() => setShowLancamento(true)}
                title={
                  req.lancado
                    ? "Já lançada no TOTVS — tocar para rever ou desfazer"
                    : "Abrir os dados para lançar no TOTVS"
                }
                className={`w-full sm:w-auto flex items-center justify-center gap-2 h-9 px-4 rounded-lg text-sm font-bold border transition-colors ${
                  req.lancado
                    ? "bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100"
                }`}
              >
                {req.lancado ? (
                  <><ClipboardCheck className="h-4 w-4" /> Lançada</>
                ) : (
                  <><ClipboardList className="h-4 w-4" /> Lançar</>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Vínculos: origem e/ou complementar. Podem existir os dois ao mesmo tempo. */}
      {rel && (
        <div className="space-y-3 print:hidden">
          {rel.original && (
            <VinculoRequisicao
              texto={<>Esta requisição complementar foi originada da <span className="font-extrabold text-teal-700">REQ #{rel.original.codigo}</span></>}
              rotuloBotao="Abrir Original"
              onAbrir={() => navigate(`/requisicoes/${rel.original!.id}`)}
            />
          )}
          {rel.complementar && (
            <VinculoRequisicao
              texto={<>Existe uma requisição complementar vinculada: <span className="font-extrabold text-teal-700">REQ #{rel.complementar.codigo}</span></>}
              rotuloBotao="Abrir Complemento"
              onAbrir={() => navigate(`/requisicoes/${rel.complementar!.id}`)}
            />
          )}
        </div>
      )}

      {documentoFechado && (
        <div className="p-4 bg-orange-50 text-orange-800 rounded-xl text-sm border border-orange-200 shadow-lg shadow-slate-200/50 print:hidden">
          <strong>Aviso:</strong> Esta requisição já foi documentada e não pode mais ser alterada.
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="print:shadow-none print:border-black border-none shadow-xl shadow-slate-200/60 border-slate-200/60 bg-teal-50/50">
            <CardContent className="p-4 sm:p-6 pb-2">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-xs text-slate-700 uppercase tracking-wider font-semibold">
                    Status
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {/* Mesma pílula da lista de requisições. Antes aqui o
                        status era texto solto e não batia com a lista. */}
                    <StatusBadge status={req.status} tamanho="md" />
                    {/* Finalizada é entregue; lançada é baixada no TOTVS. São
                        coisas diferentes e agora aparecem lado a lado.
                        Só para o almoxarifado, que é quem lança. */}
                    {podeLancar && (
                      req.lancado ? (
                        <span className="text-xs font-bold text-white bg-emerald-600 px-2 py-1 rounded-full flex items-center">
                          <ClipboardCheck className="w-3 h-3 mr-1" /> LANÇADA
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2 py-1 rounded-full flex items-center">
                          <ClipboardList className="w-3 h-3 mr-1" /> A LANÇAR
                        </span>
                      )
                    )}
                    {req.termo_aceito_em && (
                       <span className="text-xs font-semibold text-teal-800 bg-teal-100 px-2 py-1 rounded-full flex items-center" title={`Termo aceito em ${format(new Date(req.termo_aceito_em), "dd/MM/yyyy 'às' HH:mm")}`}>
                         <ShieldCheck className="w-3 h-3 mr-1" /> Termo aceito
                       </span>
                    )}
                    {req.impresso && (
                       <span className="text-xs font-semibold text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full flex items-center">
                         <Check className="w-3 h-3 mr-1" /> Impresso
                       </span>
                    )}
                    {req.exportado && (
                       <span className="text-xs font-semibold text-teal-700 bg-teal-100 px-2 py-1 rounded-full flex items-center">
                         <Check className="w-3 h-3 mr-1" /> Exportado PDF
                       </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-700 uppercase tracking-wider font-semibold">
                    Data
                  </p>
                  <p className="font-medium text-slate-700">
                    {format(new Date(req.created_at), "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 border-t pt-4 border-teal-100">
                <div>
                  <p className="text-xs text-slate-700 uppercase tracking-wider font-semibold">
                    Solicitante
                  </p>
                  <p className="font-medium text-slate-800">
                    {req.usuario?.nome || "---"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-700 uppercase tracking-wider font-semibold">
                    Departamento
                  </p>
                  <p className="font-medium text-slate-800">
                    {req.departamento}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <h3 className="font-bold text-teal-900 text-lg border-b pb-2 flex justify-between items-center">
              Itens Solicitados
              <div className="flex items-center gap-3">
                <span className="bg-teal-100 text-slate-800 text-sm px-2 py-1 rounded-full">
                  {req.itens?.length || 0}
                </span>

              </div>
            </h3>



            <div className="space-y-3">
              {req.itens?.map((prod) => (
                <div
                  key={prod.id}
                  className="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center p-4 bg-white border border-slate-200/80 shadow-md shadow-slate-200/50 rounded-xl shadow-lg shadow-slate-200/50 gap-3"
                >
                  <div className="flex-1 pr-4 min-w-0">
                    <p className="font-bold text-slate-800 text-sm sm:text-base break-words">
                      {formatItemName(prod.item?.nome)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6 self-end sm:self-auto">
                      <div className="text-center">
                        <p className="text-[10px] font-bold text-slate-700 uppercase mb-1">Solicitado</p>
                        <p className="text-lg font-black text-slate-700 whitespace-nowrap">{formatarQtd(prod.quantidade)} <span className="text-sm font-bold text-slate-700">{unidadeDoItem(prod)}</span></p>
                      </div>

                      {(() => {
                        if (prod.quantidade_separada === undefined || prod.quantidade_separada === null) return null;
                        const unEntregue = unidadeEntregue(prod);
                        const r = avaliarSeparacao(prod.quantidade, unidadeDoItem(prod), prod.quantidade_separada, unEntregue);
                        return (
                          <>
                            {/* O que fica registrado é o entregue, na unidade
                                em que saiu (pedido 5 UN, entregue 6,2 KG). */}
                            <div className="text-center">
                              <p className="text-[10px] font-bold text-teal-600 uppercase mb-1">Entregue</p>
                              <p className="text-lg font-black text-teal-700 whitespace-nowrap">{formatarQtd(prod.quantidade_separada)} <span className="text-sm font-bold text-teal-600">{unEntregue}</span></p>
                            </div>

                            {r.situacao === "falta" && (
                              <div className="text-center bg-orange-50 px-3 py-1 rounded-lg border border-orange-200">
                                <p className="text-[10px] font-bold text-orange-600 uppercase mb-1">Ruptura</p>
                                <p className="text-lg font-black text-orange-700 whitespace-nowrap">-{formatarQtd(r.faltante)} <span className="text-sm font-bold text-orange-500">{unidadeDoItem(prod)}</span></p>
                              </div>
                            )}

                            {r.situacao === "excedente" && (
                              <div className="text-center bg-teal-50 px-3 py-1 rounded-lg border border-teal-200">
                                <p className="text-[10px] font-bold text-teal-600 uppercase mb-1">Excedente</p>
                                <p className="text-lg font-black text-teal-700 whitespace-nowrap">+{formatarQtd(r.excedente)} <span className="text-sm font-bold text-teal-500">{unEntregue}</span></p>
                              </div>
                            )}

                            {r.situacao === "outra_unidade" && (
                              <div className="text-center bg-sky-50 px-3 py-1 rounded-lg border border-sky-200">
                                <p className="text-[10px] font-bold text-sky-700 uppercase mb-1">Unidade</p>
                                <p className="text-xs font-bold text-sky-800 leading-tight">trocada<br />na entrega</p>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                </div>
              ))}

              {req.itens?.length === 0 && (
                <div className="p-4 text-center text-slate-700">Nenhum item na requisição.</div>
              )}

              
            </div>
          </div>

          {req.observacao && (
            <Card className="print:shadow-none print:border-black border-none bg-red-50/50">
              <CardContent className="p-4 sm:p-5">
                <h3 className="font-bold text-red-800 text-sm uppercase tracking-wider mb-2">
                  Observações do Solicitante
                </h3>
                <p className="text-sm text-red-950 whitespace-pre-wrap">
                  {req.observacao}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Botões de Ação para Almoxarife/Gerente */}
          {podeAlterarStatus && (
            <div className="space-y-3 pt-6 print:hidden">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider mb-2">
                Ações de Atendimento
              </h3>

              {(req.status === "PENDENTE" || req.status === "AGUARDANDO") && (
                <Button
                  onClick={handleStartSeparacao}
                  className="w-full h-14 bg-teal-600 hover:bg-teal-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-slate-200/50 transition-all"
                  disabled={updating}
                >
                  <PlayCircle className="mr-2 h-6 w-6" /> Iniciar Separação
                </Button>
              )}

              {req.status === "SEPARANDO" && (
                <Button
                  onClick={handleStartSeparacao}
                  className="w-full h-14 bg-teal-600 hover:bg-teal-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-slate-200/50 transition-all"
                  disabled={updating}
                >
                  <PlayCircle className="mr-2 h-6 w-6" /> Continuar Separação
                </Button>
              )}

              {(req.status === "PENDENTE" || req.status === "AGUARDANDO") && (
                <Button
                  onClick={() => setConfirmarCancelamento(true)}
                  variant="outline"
                  className="w-full h-12 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 rounded-xl font-semibold mt-4"
                  disabled={updating}
                >
                  <Ban className="mr-2 h-5 w-5" /> Cancelar Pedido
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6 print:hidden">
          <Card className="border-none shadow-xl shadow-slate-200/60 border-slate-200/60 bg-white">
            <CardHeader className="pb-3 border-b border-slate-100">
              <CardTitle className="text-xs uppercase text-slate-700 tracking-widest">
                Histórico do Pedido
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="relative border-l-2 border-slate-200 ml-3 pl-4 sm:pl-6 py-2 overflow-hidden">
                {historico.length === 0 ? (
                  <p className="text-xs text-slate-700">
                    Nenhum evento registrado.
                  </p>
                ) : (
                  <div className="space-y-6">
                    {historico.map((h) => (
                      <div
                        key={h.id}
                        className="relative flex flex-col items-start gap-1 w-full"
                      >
                        <div className="absolute -left-[23px] sm:-left-[31px] mt-1 h-3 w-3 rounded-full bg-teal-500 ring-4 ring-white shrink-0" />
                        <div className="w-full space-y-1 min-w-0">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-800 text-sm break-words leading-tight whitespace-normal">
                              {rotuloDoHistorico(h.acao)}
                            </span>
                            <span className="text-[11px] text-slate-700 font-medium">
                              Por: {h.usuario?.nome || "Sistema"} &mdash; {format(new Date(h.created_at), "dd/MM/yy")} às {format(new Date(h.created_at), "HH:mm")}
                            </span>
                          </div>
                          {h.observacao && !h.observacao.startsWith('Status alterado para') && !['Requisição criada pelo usuário.', 'Requisição impressa', 'Requisição exportada'].includes(h.observacao) && (
                            <div className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-2 sm:p-3 rounded-lg mt-2 border border-slate-100 w-full whitespace-pre-wrap break-words overflow-wrap-anywhere">
                              {h.observacao}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer for print only */}
      <div className="hidden print:block mt-16 pt-8 border-t border-black text-center text-sm w-full">
        {req.termo_aceito_em && (
          <div className="border border-black/40 rounded p-3 mb-8 text-left">
            <p className="font-bold text-xs uppercase">{TERMO_TITULO}</p>
            <p className="text-xs mt-1">{TERMO_RESUMO_PDF}</p>
            <p className="text-xs font-semibold mt-1">
              Aceito por {req.usuario?.nome || "solicitante"} em{" "}
              {format(new Date(req.termo_aceito_em), "dd/MM/yyyy 'às' HH:mm")}
              {req.termo_versao ? ` (versão ${req.termo_versao})` : ""}
            </p>
          </div>
        )}
        <div className="flex justify-between px-8 w-full gap-8">
          <div className="w-1/2 text-center relative">
            {signatureRecebedorBase64 ? (
              <div className="border-b border-black w-full pb-1 flex justify-center">
                <img src={getImageUrl(signatureRecebedorBase64)} alt="Assinatura" className="h-12 object-contain" crossOrigin="anonymous" />
              </div>
            ) : (
              <p className="border-b border-black w-full inline-block pb-1"></p>
            )}
            <p className="mt-2 font-semibold">
              Assinatura Solicitante
              <span className="block text-xs text-slate-500 font-normal">(quem recebeu)</span>
              {req.usuario?.nome && <span className="block text-sm text-slate-500 font-normal">{req.usuario.nome}</span>}
            </p>
          </div>
          <div className="w-1/2 text-center relative">
            {signatureConferenteBase64 ? (
              <div className="border-b border-black w-full pb-1 flex justify-center">
                <img src={getImageUrl(signatureConferenteBase64)} alt="Assinatura Almoxarifado" className="h-12 object-contain" crossOrigin="anonymous" />
              </div>
            ) : (
              <p className="border-b border-black w-full inline-block pb-1"></p>
            )}
            <p className="mt-2 font-semibold">
              Assinatura Almoxarifado
              <span className="block text-xs text-slate-500 font-normal">(quem entregou)</span>
              {conferenteNome && <span className="block text-sm text-slate-500 font-normal">{conferenteNome}</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Confirmação de cancelamento */}
      <Dialog open={confirmarCancelamento} onOpenChange={setConfirmarCancelamento}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar a requisição #{req.codigo_requisicao}?</DialogTitle>
            <DialogDescription>
              O pedido sai da fila do almoxarifado e não pode ser reaberto.
              Se ainda precisar dos materiais, será necessário criar uma nova requisição.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setConfirmarCancelamento(false)}
              disabled={updating}
              className="font-bold"
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              disabled={updating}
              onClick={async () => {
                setConfirmarCancelamento(false);
                await handleStatusChange("CANCELADA");
              }}
              className="font-bold"
            >
              {updating ? "Cancelando..." : "Sim, cancelar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lançamento no TOTVS — só o que precisa ser digitado lá, sem o resto
          da tela atrapalhando a conferência. */}
      {podeLancar && (
      <Dialog open={showLancamento} onOpenChange={setShowLancamento}>
        <DialogContent className="sm:max-w-lg w-[94vw] max-h-[88vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="p-4 border-b bg-slate-50 shrink-0">
            <DialogTitle className="text-teal-900 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 shrink-0" />
              Lançar no TOTVS — REQ #{req.codigo_requisicao}
            </DialogTitle>
            <DialogDescription>
              {req.lancado
                ? "Esta requisição já está marcada como lançada."
                : "Confira os dados abaixo, lance no TOTVS e marque como lançada."}
            </DialogDescription>
          </DialogHeader>

          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            {/* Os três campos do cabeçalho da Requisição Manual do TOTVS, com
                os mesmos nomes de lá, para bater campo a campo sem tradução. */}
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 bg-teal-50 border-2 border-teal-300 rounded-lg p-3">
                <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wider">Destino — Almoxarifado</p>
                <p className="text-xl font-black text-teal-900 break-words leading-tight uppercase">
                  {req.departamento}
                </p>
              </div>
              <div className="bg-slate-50 border-2 border-slate-300 rounded-lg p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Nº da Requisição</p>
                <p className="text-xl font-black text-slate-800 tabular-nums">{req.codigo_requisicao ?? "---"}</p>
              </div>
              <div className="bg-slate-50 border-2 border-slate-300 rounded-lg p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Data</p>
                <p className="text-xl font-black text-slate-800 tabular-nums">
                  {format(new Date(req.created_at), "dd/MM/yyyy")}
                </p>
              </div>
            </div>

            {/* Colunas na mesma ordem e com os mesmos rótulos da aba Detalhe. */}
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="grid grid-cols-[1fr_3rem_4rem] gap-2 bg-slate-100 px-3 py-2 text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                <span>Descrição do Item</span>
                <span className="text-center">Unid.</span>
                <span className="text-right">Qtde.</span>
              </div>
              <div className="divide-y divide-slate-100">
                {linhasParaLancamento.map((linha) => (
                  <div key={linha.id} className="grid grid-cols-[1fr_3rem_4rem] gap-2 px-3 py-2.5 items-center">
                    <span className="text-sm font-semibold text-slate-800 break-words min-w-0 uppercase">{linha.nome}</span>
                    <span className="text-xs font-bold text-slate-600 text-center">{linha.unidade}</span>
                    <span className="text-base font-black text-teal-800 text-right tabular-nums">{formatarQtd(linha.quantidade)}</span>
                  </div>
                ))}
                {linhasParaLancamento.length === 0 && (
                  <p className="px-3 py-4 text-sm text-center text-slate-500">Nenhum item nesta requisição.</p>
                )}
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Solicitante: <span className="font-semibold text-slate-700">{req.usuario?.nome || "---"}</span>
              {" · "}Quantidades mostradas são as <strong>entregues</strong>.
              {linhasNaoEntregues > 0 && (
                <>
                  {" "}
                  {linhasNaoEntregues === 1
                    ? "1 item não foi entregue e ficou de fora"
                    : `${linhasNaoEntregues} itens não foram entregues e ficaram de fora`}
                  {rel?.complementar ? ` (vai na REQ #${rel.complementar.codigo}).` : "."}
                </>
              )}
            </p>

            <Button
              variant="outline"
              className="w-full h-10 font-bold text-slate-700"
              onClick={async () => {
                const texto = [
                  `Destino: ${req.departamento}`,
                  `Nº da Requisição: ${req.codigo_requisicao ?? ""}`,
                  `Data: ${format(new Date(req.created_at), "dd/MM/yyyy")}`,
                  "",
                  // Vírgula decimal (6,2), como o TOTVS espera.
                  ...linhasParaLancamento.map((l) => `${l.nome}\t${l.unidade}\t${formatarQtd(l.quantidade)}`),
                ].join("\n");
                try {
                  await navigator.clipboard.writeText(texto);
                  toast.success("Lista copiada.");
                } catch {
                  toast.error("O navegador não liberou a cópia. Selecione e copie na mão.");
                }
              }}
            >
              Copiar lista
            </Button>

            {req.lancado && req.lancado_em && (
              <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg p-3 font-medium">
                Lançada em {format(new Date(req.lancado_em), "dd/MM/yyyy 'às' HH:mm")}
                {lancadoPorNome ? <> por <strong>{lancadoPorNome}</strong></> : null}.
              </p>
            )}
          </div>

          <div className="p-4 border-t bg-white shrink-0 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button variant="outline" onClick={() => setShowLancamento(false)} className="font-bold h-11">
              Fechar
            </Button>
            {req.lancado ? (
              <Button
                variant="outline"
                onClick={handleDesfazerLancamento}
                disabled={updating}
                className="font-bold h-11 border-amber-300 text-amber-800 hover:bg-amber-50"
              >
                <Undo2 className="h-4 w-4 mr-2" />
                {updating ? "Desfazendo..." : "Desfazer lançamento"}
              </Button>
            ) : (
              <Button
                onClick={handleMarcarLancada}
                disabled={updating}
                className="font-bold h-11 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <ClipboardCheck className="h-4 w-4 mr-2" />
                {updating ? "Marcando..." : "Marcar como lançada"}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      )}

      {/* Confirmação logo depois de finalizar a separação. Só isso: lançar e
          imprimir são feitos depois, pelos botões do topo. */}
      <Dialog open={showFinalizada} onOpenChange={setShowFinalizada}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center gap-3 pt-2 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Check className="h-8 w-8" />
            </span>
            <DialogHeader className="items-center">
              <DialogTitle className="text-center">Requisição #{req.codigo_requisicao} finalizada com sucesso</DialogTitle>
              <DialogDescription className="text-center">
                {req.status === "RUPTURA_PARCIAL" || req.status === "RUPTURA_TOTAL"
                  ? `Entrega registrada. O que faltou foi para a requisição complementar${rel?.complementar ? ` REQ #${rel.complementar.codigo}` : ""} e para a Lista de Reposição.`
                  : req.status === "AGUARDANDO"
                    ? "Entrega registrada. Ainda há itens pendentes: a requisição continua aguardando reposição."
                    : "Entrega registrada com as assinaturas."}
                {precisaLancar(req.status) && " Quando der tempo, use o botão Lançar no topo; o Imprimir libera depois do lançamento."}
              </DialogDescription>
            </DialogHeader>
          </div>
          <Button
            onClick={() => setShowFinalizada(false)}
            className="mt-2 h-12 w-full bg-emerald-600 font-bold text-white hover:bg-emerald-700"
          >
            OK
          </Button>
        </DialogContent>
      </Dialog>

      {(user?.perfil === "ALMOXARIFADO") && (
      <Dialog open={showPrintModal} onOpenChange={setShowPrintModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{req.lancado ? "Lançada no TOTVS" : "Imprimir comprovante"}</DialogTitle>
            <DialogDescription>
              {req.lancado
                ? "Agora imprima ou exporte o comprovante. Ele sai com o nome de quem lançou e de quem imprimiu."
                : "Escolha como deseja documentar a requisição."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-4">
            <button
              type="button"
              onClick={() => { setShowPrintModal(false); handlePrint(); }}
              disabled={isExporting}
              className="w-full h-14 bg-teal-600 hover:bg-teal-700 text-white font-bold text-lg rounded-xl shadow-lg shadow-slate-200/50 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <Printer className="mr-2 h-6 w-6" /> Imprimir Documento
            </button>
            <Button
              onClick={() => { setShowPrintModal(false); exportPDF('download'); }}
              variant="outline"
              disabled={isExporting}
              className="w-full h-14 border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-lg rounded-xl"
            >
              <Download className="mr-2 h-6 w-6" /> Exportar PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      )}


    </div>
  );
}
