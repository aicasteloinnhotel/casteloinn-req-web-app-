import { useLocation } from "react-router-dom";
import React, { useState, useEffect, useRef, useMemo } from "react";
import Papa from "papaparse";
import { getItens, createItem, createItens, updateItem, deleteItem, checkItemUsage, getRequisicoes } from "@/services/api";
import { Item, Requisicao } from "@/types";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Edit2, CheckCircle2, XCircle, Trash2, Upload, BarChart3, Package, ArrowUpDown, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { hasSupabaseKeys } from "@/lib/supabase";
import { contemTexto, dataInputParaLocal, formatItemName, UNIDADE_PADRAO } from "@/lib/utils";
import { rotuloUnidade, UNIDADES_CADASTRO, unidadesDoItem } from "@/lib/unidades";
import { calcularSaidas } from "@/lib/saidas";
import { CampoBusca } from "@/components/CampoBusca";
import {
  ABA, ABA_ATIVA, ABA_INATIVA, ABAS, BOTAO_ICONE, BOTAO_PRIMARIO, BOTAO_SECUNDARIO,
  CAMPO, SELETOR, SUBTITULO, TITULO,
} from "@/lib/estilos";
import { endOfDay, format, startOfDay } from "date-fns";

/** Unidades de uma célula da planilha: "UN", "UN/KG", "UN|KG" ou "UN+KG". */
const unidadesDaPlanilha = (celula?: string): string[] =>
  (celula || "")
    .split(/[\/|+]/)
    .map((u) => u.trim().toUpperCase())
    .filter((u, i, todas) => u && todas.indexOf(u) === i);

/**
 * Lê a planilha respeitando a codificação. O Excel no Windows salva "CSV" em
 * ANSI (windows-1252), não em UTF-8: lido como UTF-8, "Água Sanitária" virava
 * "�gua Sanit�ria" no catálogo. Tenta UTF-8 estrito e, se não for, ANSI.
 */
const lerTextoDaPlanilha = async (arquivo: File): Promise<string> => {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
};

/** Traduz os erros do banco que o usuário consegue resolver sozinho. */
const mensagemDeErro = (err: any, padrao: string): string => {
  if (err?.code === "23505") return "Já existe um item cadastrado com esse nome.";
  return err?.message || padrao;
};

export default function Itens() {
  const location = useLocation() as { state: { tab?: "gerenciar" | "relatorio" } };
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [editId, setEditId] = useState("");
  const [form, setForm] = useState<{ nome: string; unidades: string[]; ativo: boolean }>({
    nome: "",
    unidades: [],
    ativo: true,
  });

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);
  const [isCheckingUsage, setIsCheckingUsage] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<"gerenciar" | "relatorio">(location.state?.tab || "gerenciar");
  const [filterType, setFilterType] = useState<"todos" | "inativos" | "com_saida" | "sem_saida">("todos");
  const [sortConfig, setSortConfig] = useState<{ key: "nome" | "unidade" | "ativo", direction: "asc" | "desc" }>({ key: "nome", direction: "asc" });
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [rankingDataInicio, setRankingDataInicio] = useState("");
  const [rankingDataFim, setRankingDataFim] = useState("");

  useEffect(() => {
    carregar();
  }, []);

  const carregar = async () => {
    setLoading(true);
    try {
      const data = await getItens();
      setItens(data.filter(i => !i.nome.toUpperCase().startsWith('[EXCLUIDO]')));
      const reqsData = await getRequisicoes();
      setRequisicoes(reqsData);
    } catch (e: any) {
      console.error("Erro ao carregar itens:", e);
      toast.error(`Erro ao carregar itens: ${e?.message || JSON.stringify(e)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (item?: Item) => {
    if (item) {
      setEditId(item.id);
      setForm({ nome: item.nome, unidades: unidadesDoItem(item), ativo: item.ativo });
    } else {
      setEditId("");
      setForm({ nome: "", unidades: [], ativo: true });
    }
    setOpen(true);
  };

  const handleSort = (key: "nome" | "unidade" | "ativo") => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasSupabaseKeys) {
      toast.error("O sistema não está conectado ao banco de dados.");
      return;
    }

    // Espaço sobrando no nome virava "outro" item para quem lê, mas o mesmo
    // para o banco — e o erro que voltava era técnico.
    const unidades = form.unidades.map((u) => u.trim().toUpperCase()).filter(Boolean);
    const dados = {
      nome: form.nome.trim(),
      ativo: form.ativo,
      // A primeira marcada é a principal (usada na lista de reposição).
      unidade: unidades[0],
      unidades,
    };
    if (!dados.nome) {
      toast.error("Informe o nome do item.");
      return;
    }
    if (unidades.length === 0) {
      toast.error("Marque pelo menos uma unidade em que o item pode ser pedido.");
      return;
    }

    setSalvando(true);
    try {
      if (editId) {
        await updateItem(editId, dados);
        toast.success("Item atualizado!");
      } else {
        await createItem(dados);
        toast.success("Item criado!");
      }
      setOpen(false);
      carregar();
    } catch (err: any) {
      toast.error(mensagemDeErro(err, "Erro ao salvar o item."));
    } finally {
      setSalvando(false);
    }
  };

  const toggleAtivo = async (item: Item) => {
    try {
      await updateItem(item.id, { ativo: !item.ativo });
      toast.success(item.ativo ? "Item desativado." : "Item reativado.");
      carregar();
    } catch (e: any) {
      // Antes o erro era engolido e o botão simplesmente não fazia nada.
      toast.error(e?.message || "Não foi possível alterar o item.");
    }
  };

  const handleDeleteRequest = async (item: Item) => {
    setItemToDelete(item);
    setDeleteError("");
    setDeleteConfirmOpen(true);
    setIsCheckingUsage(true);

    try {
      const used = await checkItemUsage(item.id);
      if (used) {
        setDeleteError("Este item já foi utilizado em requisições. Ele será desativado e ocultado do catálogo, mas seu nome permanecerá visível no histórico de requisições.");
      }
    } catch (err) {
      setDeleteError("Erro ao verificar uso do item.");
    } finally {
      setIsCheckingUsage(false);
    }
  };

  /**
   * Arquiva o item em vez de apagar: some do catálogo mas continua legível no
   * histórico das requisições antigas. O sufixo de data evita conflito com o
   * índice único quando um material de mesmo nome é arquivado mais de uma vez.
   */
  const arquivarItem = async (item: Item) => {
    const carimbo = format(new Date(), "dd/MM/yy HH:mm");
    await updateItem(item.id, {
      nome: `[EXCLUIDO] ${formatItemName(item.nome)} (${carimbo})`,
      ativo: false,
    });
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      if (deleteError && deleteError.includes("já foi utilizado")) {
        await arquivarItem(itemToDelete);
        toast.success("Item arquivado. Ele sai do catálogo e continua no histórico.");
      } else {
        await deleteItem(itemToDelete.id);
        toast.success("Item excluído com sucesso!");
      }
      setDeleteConfirmOpen(false);
      carregar();
    } catch (err: any) {
      console.error("Erro ao excluir item:", err);

      // 23503 = o banco recusou porque o item aparece em alguma requisição.
      // É a rede de proteção do histórico de entregas: em vez de mostrar erro
      // técnico, arquivamos o item, que é o que o usuário queria de fato.
      if (err?.code === "23503") {
        try {
          await arquivarItem(itemToDelete);
          toast.success(
            "Este material já foi entregue em alguma requisição, então foi arquivado em vez de apagado — o histórico fica preservado.",
          );
          setDeleteConfirmOpen(false);
          carregar();
          return;
        } catch (err2: any) {
          console.error("Erro ao arquivar item:", err2);
          toast.error(err2?.message || "Não foi possível arquivar o item.");
          return;
        }
      }

      toast.error(err.message || "Erro ao excluir item");
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);

    let texto: string;
    try {
      texto = await lerTextoDaPlanilha(file);
    } catch (e: any) {
      toast.error(`Erro ao ler o arquivo: ${e?.message || "arquivo ilegível"}`);
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    Papa.parse<string[]>(texto, {
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as string[][];
        if (data.length === 0) {
          toast.error("O arquivo está vazio.");
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
          return;
        }

        // Detecta linha de cabeçalho
        let startIndex = 0;
        const firstRow = data[0];
        if (
          firstRow && firstRow[0] &&
          (firstRow[0].toString().toUpperCase().includes("NOME") ||
           firstRow[0].toString().toUpperCase().includes("ITEM"))
        ) {
          startIndex = 1;
        }

        try {
          // Catálogo atual, para não recadastrar o que já existe.
          const existentes = await getItens();
          const porNome = new Map(existentes.map((i) => [i.nome.trim().toLowerCase(), i]));
          const vistosNaPlanilha = new Set<string>();

          const aInserir: { nome: string; unidade: string; unidades: string[]; ativo: boolean }[] = [];
          // Item que já existe e a planilha traz unidade nova: a unidade é
          // ACRESCENTADA (nunca removida). É o jeito rápido de dar "UN/KG" para
          // centenas de itens de uma vez.
          const aCompletar: { id: string; unidade: string; unidades: string[] }[] = [];
          let ignoradas = 0;

          for (let i = startIndex; i < data.length; i++) {
            const row = data[i];
            const nome = row[0]?.trim();
            // Maiúscula sempre: "cx" e "CX" eram duas unidades diferentes.
            const daPlanilha = unidadesDaPlanilha(row[1]);

            if (!nome) {
              ignoradas++;
              continue;
            }

            const chave = nome.toLowerCase();
            if (vistosNaPlanilha.has(chave)) {
              ignoradas++;
              continue;
            }
            vistosNaPlanilha.add(chave);

            const existente = porNome.get(chave);
            if (existente) {
              const atuais = unidadesDoItem(existente);
              const novas = daPlanilha.filter((u) => !atuais.includes(u));
              if (novas.length > 0) {
                aCompletar.push({ id: existente.id, unidade: atuais[0], unidades: [...atuais, ...novas] });
              } else {
                ignoradas++;
              }
              continue;
            }

            const unidades = daPlanilha.length > 0 ? daPlanilha : [UNIDADE_PADRAO];
            aInserir.push({ nome, unidade: unidades[0], unidades, ativo: true });
          }

          let completados = 0;
          for (const item of aCompletar) {
            try {
              await updateItem(item.id, { unidade: item.unidade, unidades: item.unidades });
              completados++;
            } catch (erro) {
              console.error("Erro ao acrescentar unidades:", item.id, erro);
            }
          }
          if (completados > 0) {
            toast.success(`${completados} item(ns) já cadastrado(s) ganharam unidades novas.`);
            if (aInserir.length === 0) carregar();
          }

          if (aInserir.length === 0) {
            if (completados === 0) {
              toast.warning(
                `Nada novo na planilha (${ignoradas} linha(s) vazia(s) ou já cadastrada(s) com as mesmas unidades).`,
              );
            }
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
            return;
          }

          toast.info(`Importando ${aInserir.length} itens...`);

          // Em lotes: antes era uma chamada ao servidor por linha, o que deixava
          // a importação de um catálogo inteiro lentíssima.
          const TAMANHO_LOTE = 100;
          let inseridos = 0;
          let falhas = 0;

          for (let i = 0; i < aInserir.length; i += TAMANHO_LOTE) {
            const lote = aInserir.slice(i, i + TAMANHO_LOTE);
            try {
              await createItens(lote);
              inseridos += lote.length;
            } catch (erroLote) {
              // Um item problemático não pode derrubar o lote inteiro:
              // repete linha a linha para isolar só o que realmente falhou.
              console.error("Lote falhou, tentando item a item:", erroLote);
              for (const item of lote) {
                try {
                  await createItem(item);
                  inseridos++;
                } catch (erroItem) {
                  console.error("Erro ao importar item:", item.nome, erroItem);
                  falhas++;
                }
              }
            }
          }

          if (inseridos > 0) {
            toast.success(`${inseridos} itens importados com sucesso!`);
            carregar();
          }
          if (ignoradas > 0 || falhas > 0) {
            toast.warning(
              `${ignoradas} linha(s) ignorada(s) (vazias ou já cadastradas)` +
                (falhas > 0 ? ` e ${falhas} com erro.` : "."),
            );
          }
        } catch (e: any) {
          console.error("Erro na importação:", e);
          toast.error(`Falha na importação: ${e?.message || "erro desconhecido"}`);
        } finally {
          setIsImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      },
      error: (error) => {
        toast.error(`Erro ao ler o arquivo: ${error.message}`);
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  };

  // Total de saída por material (todas as unidades), para o filtro com/sem saída.
  const saidaPorItem = useMemo(() => {
    const total = new Map<string, number>();
    for (const s of calcularSaidas(requisicoes)) {
      total.set(s.item_id, (total.get(s.item_id) || 0) + s.valor);
    }
    return total;
  }, [requisicoes]);

  // Ranking do período, uma linha por material e unidade.
  const rankingItens = useMemo(() => {
    const de = dataInputParaLocal(rankingDataInicio);
    const ate = dataInputParaLocal(rankingDataFim);
    return calcularSaidas(requisicoes, {
      catalogo: itens,
      de: de ? startOfDay(de) : null,
      ate: ate ? endOfDay(ate) : null,
    });
  }, [itens, requisicoes, rankingDataInicio, rankingDataFim]);

  const itensFiltrados = itens.filter((i) => {
    if (busca.trim() && !contemTexto(i.nome, busca)) return false;
    if (filterType === "inativos") return !i.ativo;
    const saida = saidaPorItem.get(i.id) || 0;
    if (filterType === "com_saida") return saida > 0;
    if (filterType === "sem_saida") return saida === 0;
    return true;
  });

  const itensOrdenados = useMemo(() => {
    const ordenados = [...itensFiltrados];
    ordenados.sort((a, b) => {
      let aValue: any = a[sortConfig.key];
      let bValue: any = b[sortConfig.key];
      if (typeof aValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = String(bValue).toLowerCase();
      }
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
    return ordenados;
  }, [itensFiltrados, sortConfig]);

  // Unidade vinda de planilha que não esteja na lista padrão entra como opção
  // extra — senão ela sumiria ao salvar a edição do nome.
  const opcoesUnidade = [
    ...UNIDADES_CADASTRO,
    ...form.unidades
      .filter((u) => !UNIDADES_CADASTRO.some((x) => x.valor === u))
      .map((u) => ({ valor: u, rotulo: u })),
  ];

  const alternarUnidade = (u: string) =>
    setForm((f) => ({
      ...f,
      unidades: f.unidades.includes(u) ? f.unidades.filter((x) => x !== u) : [...f.unidades, u],
    }));

  const temFiltroDeData = !!(rankingDataInicio || rankingDataFim);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Cabeçalho: título à esquerda, abas à direita — mesma disposição da
          tela de Requisições. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className={TITULO}>Controle de Itens</h1>
          <p className={SUBTITULO}>Acompanhe a saída de materiais e gerencie o catálogo.</p>
        </div>

        <div className={`${ABAS} w-full sm:w-80 shrink-0`} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "relatorio"}
            onClick={() => setActiveTab("relatorio")}
            className={`${ABA} ${activeTab === "relatorio" ? ABA_ATIVA : ABA_INATIVA}`}
          >
            <BarChart3 className="w-4 h-4 shrink-0" /> Curva ABC
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "gerenciar"}
            onClick={() => setActiveTab("gerenciar")}
            className={`${ABA} ${activeTab === "gerenciar" ? ABA_ATIVA : ABA_INATIVA}`}
          >
            <Package className="w-4 h-4 shrink-0" /> Gerenciar Itens
          </button>
        </div>
      </div>

      {activeTab === 'relatorio' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          {/* Barra do período — uma linha, como as demais. */}
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={rankingDataInicio}
              onChange={(e) => setRankingDataInicio(e.target.value)}
              aria-label="Data inicial"
              title="Data inicial"
              className={`${CAMPO} px-3 flex-1 sm:flex-none sm:w-44 min-w-0`}
            />
            <span className="text-sm font-semibold text-slate-500 shrink-0">até</span>
            <input
              type="date"
              value={rankingDataFim}
              onChange={(e) => setRankingDataFim(e.target.value)}
              aria-label="Data final"
              title="Data final"
              className={`${CAMPO} px-3 flex-1 sm:flex-none sm:w-44 min-w-0`}
            />
            {temFiltroDeData && (
              <Button
                variant="outline"
                onClick={() => { setRankingDataInicio(""); setRankingDataFim(""); }}
                title="Limpar período"
                className={BOTAO_ICONE}
              >
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          <Card className="border-slate-200 overflow-hidden shadow-xl shadow-slate-200/60 p-0">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-bold text-teal-900 uppercase tracking-wide">
                Ranking de saída {temFiltroDeData ? "no período" : "(todo o histórico)"}
              </h3>
            </div>
            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="bg-slate-50 sticky top-0 z-10">
                  <TableRow>
                    <TableHead className="w-14 text-center font-bold text-slate-600">Pos.</TableHead>
                    <TableHead className="font-bold text-slate-600">Item</TableHead>
                    <TableHead className="w-32 text-right font-bold text-slate-600">Saída</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rankingItens.length > 0 ? rankingItens.map((item, idx) => (
                    <TableRow key={`${item.item_id}-${item.unidade}`} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="text-center">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                          {idx + 1}
                        </span>
                      </TableCell>
                      <TableCell className="font-semibold text-slate-700 whitespace-normal [overflow-wrap:anywhere]!">
                        {item.nome}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-black px-3 py-1 rounded-full whitespace-nowrap ${item.valor > 0 ? 'text-teal-700 bg-teal-50' : 'text-slate-600 bg-slate-100'}`}>
                          {item.valor} {item.unidade}
                        </span>
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center text-slate-700 font-medium">
                        Nenhum dado encontrado para o período.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'gerenciar' && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <input
            type="file"
            accept=".csv"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
          />

          {/* Barra de ações em uma linha no computador. No celular vira duas:
              busca + novo, e depois filtro + importar. */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex gap-2 flex-1 min-w-0">
              <CampoBusca
                valor={busca}
                onMudar={setBusca}
                placeholder="Buscar item..."
                className="flex-1"
              />
              <Button
                onClick={() => handleOpen()}
                title="Cadastrar novo item"
                className={`${BOTAO_PRIMARIO} sm:hidden w-11 px-0 shrink-0`}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex gap-2">
              <select
                className={`${SELETOR} flex-1 sm:flex-none sm:w-40`}
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                aria-label="Filtrar itens"
              >
                <option value="todos">Todos</option>
                <option value="inativos">Inativos</option>
                <option value="com_saida">Com saída</option>
                <option value="sem_saida">Sem saída</option>
              </select>

              <Button
                variant="outline"
                onClick={handleImportClick}
                disabled={isImporting}
                title="Importar CSV (coluna A: nome; coluna B: unidades, ex.: UN/KG). Item que já existe ganha as unidades novas."
                className={`${BOTAO_SECUNDARIO} shrink-0`}
              >
                <Upload className="h-4 w-4 sm:mr-2 shrink-0" />
                <span className="hidden sm:inline">{isImporting ? "Importando..." : "Importar CSV"}</span>
                <span className="sm:hidden ml-1.5">{isImporting ? "..." : "CSV"}</span>
              </Button>

              <Button
                onClick={() => handleOpen()}
                className={`${BOTAO_PRIMARIO} hidden sm:inline-flex shrink-0`}
              >
                <Plus className="mr-2 h-4 w-4 shrink-0" />
                Novo item
              </Button>
            </div>
          </div>

          <Card className="border-slate-200 overflow-hidden shadow-xl shadow-slate-200/60 p-0">
            <div className="overflow-x-auto">
              <Table className="w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:bg-slate-100 transition-colors select-none"
                      onClick={() => handleSort('nome')}
                    >
                      <div className="flex items-center gap-1">
                        Nome
                        <ArrowUpDown className="w-3 h-3 text-slate-700" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-slate-100 transition-colors select-none"
                      onClick={() => handleSort('unidade')}
                    >
                      <div className="flex items-center gap-1">
                        Unidade
                        <ArrowUpDown className="w-3 h-3 text-slate-700" />
                      </div>
                    </TableHead>
                    <TableHead
                      className="hidden md:table-cell cursor-pointer hover:bg-slate-100 transition-colors select-none"
                      onClick={() => handleSort('ativo')}
                    >
                      <div className="flex items-center gap-1">
                        Status
                        <ArrowUpDown className="w-3 h-3 text-slate-700" />
                      </div>
                    </TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-slate-700">
                        Carregando...
                      </TableCell>
                    </TableRow>
                  ) : itensOrdenados.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-10 text-slate-500 font-medium">
                        {itens.length === 0
                          ? "Nenhum item cadastrado. Use \"Novo item\" ou importe uma planilha CSV."
                          : "Nenhum item encontrado com esse filtro."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    itensOrdenados.map((i) => (
                      <TableRow key={i.id}>
                        {/* Quebra em qualquer ponto: "SHAMPOO/CONDICIONADOR"
                            não tem espaço e alargava a tabela no celular. O "!"
                            vence o break-words que a TableCell já traz. */}
                        <TableCell className="font-medium text-slate-800 whitespace-normal [overflow-wrap:anywhere]!">
                          {i.nome}
                        </TableCell>
                        <TableCell className="text-slate-600 font-medium text-xs sm:text-sm">
                          {unidadesDoItem(i).join(", ")}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {i.ativo ? (
                            <span className="flex items-center text-emerald-600 font-medium text-sm">
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Ativo
                            </span>
                          ) : (
                            <span className="flex items-center text-red-600 font-medium text-sm">
                              <XCircle className="w-4 h-4 mr-1" />
                              Inativo
                            </span>
                          )}
                        </TableCell>
                        {/* No celular a coluna tem 113px: com o texto "Desativar"
                            os três botões empilhavam em três linhas. Vira ícone
                            no estreito e volta a ser texto quando há espaço. */}
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5 sm:gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpen(i)}
                              title="Editar"
                              className="text-slate-700 h-9 w-9 shrink-0"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              onClick={() => toggleAtivo(i)}
                              title={i.ativo ? "Desativar" : "Ativar"}
                              className={`${i.ativo ? "text-slate-700" : "text-emerald-600"} h-9 w-9 sm:w-auto sm:px-3 p-0 sm:p-2 shrink-0 text-sm`}
                            >
                              <span className="hidden sm:inline">{i.ativo ? "Desativar" : "Ativar"}</span>
                              {i.ativo
                                ? <XCircle className="h-4 w-4 sm:hidden" />
                                : <CheckCircle2 className="h-4 w-4 sm:hidden" />}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteRequest(i)}
                              title="Excluir"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 h-9 w-9 shrink-0"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
          <div className="text-xs text-slate-700 font-medium">
            {itensOrdenados.length === itens.length
              ? `Total de itens cadastrados: ${itens.length}`
              : `Mostrando ${itensOrdenados.length} de ${itens.length} itens`}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? "Editar Item" : "Novo Item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="item-nome">Nome do Item</Label>
              <Input
                id="item-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                required
                placeholder="Ex: Copo Descartável 200ml"
                className="h-11"
              />
            </div>

            {/* Várias unidades por item: é o que aparece para escolher no
                pedido (ex.: carne em UN ou KG). A primeira marcada é a principal. */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium leading-none">
                Unidades em que pode ser pedido <span className="text-red-600">*</span>
              </legend>
              <p className="text-xs text-slate-500">
                Toque para marcar uma ou mais.
                {form.unidades.length > 0 && (
                  <> Marcadas: <strong className="text-slate-700">{form.unidades.join(", ")}</strong></>
                )}
              </p>
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {opcoesUnidade.map((u) => {
                  const marcada = form.unidades.includes(u.valor);
                  return (
                    <button
                      key={u.valor}
                      type="button"
                      role="checkbox"
                      aria-checked={marcada}
                      onClick={() => alternarUnidade(u.valor)}
                      className={`flex h-12 flex-col items-center justify-center rounded-lg border text-xs leading-tight transition-colors ${
                        marcada
                          ? "border-teal-600 bg-teal-600 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50"
                      }`}
                    >
                      <span className="text-sm font-black">{u.valor}</span>
                      <span className={marcada ? "text-teal-50" : "text-slate-500"}>{rotuloUnidade(u.valor)}</span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <Button
              type="submit"
              disabled={salvando}
              className="w-full h-11 bg-teal-600 hover:bg-teal-700 font-bold mt-2"
            >
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <p className="text-sm text-slate-600">
              Você está prestes a excluir o item <span className="font-bold text-teal-900">{itemToDelete?.nome}</span>.
            </p>

            {isCheckingUsage ? (
              <div className="text-sm text-slate-700 animate-pulse flex items-center">
                Verificando histórico do item...
              </div>
            ) : deleteError ? (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg text-sm">
                <p className="font-medium mb-1">Atenção</p>
                {deleteError}
              </div>
            ) : (
              <p className="text-sm font-medium text-red-600">
                Tem certeza que deseja excluir definitivamente este item? Esta ação não pode ser desfeita.
              </p>
            )}

            <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={isCheckingUsage || (!!deleteError && !deleteError.includes("já foi utilizado"))}
                onClick={confirmDelete}
              >
                {deleteError ? "Excluir e Ocultar" : "Excluir Definitivamente"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
