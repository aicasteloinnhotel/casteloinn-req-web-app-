import { supabase } from "@/lib/supabase";
import { camposDoEstado } from "@/lib/estadoReposicao";
import type { Fornecedor, PrecoCotado } from "@/lib/cotacao";

// ---------------------------------------------------------------------------
//  COTAÇÃO NO APP (AJUSTE_08): fornecedores, preços e o pedido que sai dela.
//  Erro vira erro de verdade, com a mensagem do que fazer.
// ---------------------------------------------------------------------------

export const SEM_AJUSTE_08 = "Falta rodar o AJUSTE_08 no Supabase para usar a cotação no app.";

const tratar = (error: { code?: string; message: string } | null) => {
  if (!error) return;
  // Tabela ou coluna que a API não conhece: o app subiu antes do SQL.
  if (["42P01", "PGRST205", "PGRST204", "42703"].includes(error.code || "")) throw new Error(SEM_AJUSTE_08);
  throw new Error(error.message);
};

export async function getFornecedores(): Promise<Fornecedor[]> {
  const { data, error } = await supabase.from("fornecedores").select("id, nome, ativo").order("nome");
  tratar(error);
  return (data || []) as Fornecedor[];
}

/** Cadastra; se o nome já existe (mesmo com outra caixa/espaço), devolve o que existe. */
export async function criarFornecedor(nome: string): Promise<Fornecedor> {
  const limpo = nome.trim().replace(/\s+/g, " ").toUpperCase();
  if (!limpo) throw new Error("Digite o nome do fornecedor.");
  const { data, error } = await supabase.from("fornecedores").insert([{ nome: limpo }]).select("id, nome, ativo").single();
  if (error?.code === "23505") {
    const todos = await getFornecedores();
    const existente = todos.find((f) => f.nome.trim().toUpperCase() === limpo);
    if (existente) return existente;
  }
  tratar(error);
  return data as Fornecedor;
}

export interface DadosDaCotacao {
  /** Fornecedores da cotação, na ordem em que entraram. */
  fornecedorIds: string[];
  precos: PrecoCotado[];
}

/** Fornecedores e preços de várias cotações de uma vez (a lista mostra o melhor preço). */
export async function getDadosDasCotacoes(lotes: string[]): Promise<Record<string, DadosDaCotacao>> {
  const r: Record<string, DadosDaCotacao> = {};
  if (lotes.length === 0) return r;
  for (const l of lotes) r[l] = { fornecedorIds: [], precos: [] };
  const [part, precos] = await Promise.all([
    supabase.from("cotacao_fornecedores").select("cotacao_lote, fornecedor_id, created_at").in("cotacao_lote", lotes).order("created_at"),
    supabase.from("cotacao_precos").select("cotacao_lote, item_id, unidade, fornecedor_id, preco, escolhido").in("cotacao_lote", lotes),
  ]);
  tratar(part.error);
  tratar(precos.error);
  for (const p of part.data || []) r[p.cotacao_lote]?.fornecedorIds.push(p.fornecedor_id);
  for (const p of precos.data || []) {
    r[p.cotacao_lote]?.precos.push({
      item_id: p.item_id,
      unidade: p.unidade,
      fornecedor_id: p.fornecedor_id,
      preco: p.preco == null ? null : Number(p.preco),
      escolhido: !!p.escolhido,
    });
  }
  return r;
}

export async function adicionarFornecedorNaCotacao(lote: string, fornecedorId: string) {
  const { error } = await supabase
    .from("cotacao_fornecedores")
    .upsert([{ cotacao_lote: lote, fornecedor_id: fornecedorId }], { onConflict: "cotacao_lote,fornecedor_id", ignoreDuplicates: true });
  tratar(error);
}

/** Tira o fornecedor da cotação, com os preços dele nela. */
export async function tirarFornecedorDaCotacao(lote: string, fornecedorId: string) {
  const precos = await supabase.from("cotacao_precos").delete().eq("cotacao_lote", lote).eq("fornecedor_id", fornecedorId);
  tratar(precos.error);
  const part = await supabase.from("cotacao_fornecedores").delete().eq("cotacao_lote", lote).eq("fornecedor_id", fornecedorId);
  tratar(part.error);
}

/** Grava (ou apaga, com null) o preço de um item num fornecedor. */
export async function salvarPreco(lote: string, itemId: string, unidade: string, fornecedorId: string, preco: number | null) {
  const { error } = await supabase.from("cotacao_precos").upsert(
    [{ cotacao_lote: lote, item_id: itemId, unidade, fornecedor_id: fornecedorId, preco, updated_at: new Date().toISOString() }],
    { onConflict: "cotacao_lote,item_id,unidade,fornecedor_id" },
  );
  tratar(error);
}

/** Escolhe à mão quem leva a linha; null volta a valer o menor preço. */
export async function escolherFornecedor(lote: string, itemId: string, unidade: string, fornecedorId: string | null) {
  const limpar = await supabase
    .from("cotacao_precos")
    .update({ escolhido: false })
    .eq("cotacao_lote", lote)
    .eq("item_id", itemId)
    .eq("unidade", unidade);
  tratar(limpar.error);
  if (!fornecedorId) return;
  const marcar = await supabase
    .from("cotacao_precos")
    .update({ escolhido: true })
    .eq("cotacao_lote", lote)
    .eq("item_id", itemId)
    .eq("unidade", unidade)
    .eq("fornecedor_id", fornecedorId);
  tratar(marcar.error);
}

/**
 * Pedido feito a um fornecedor: as linhas vão para Aguardando com a previsão,
 * saem da cotação e guardam fornecedor e preço (o histórico de preços).
 */
export async function fazerPedido(
  itens: { ids: string[]; preco: number }[],
  fornecedorId: string,
  prazo: string,
) {
  const estado = camposDoEstado("AGUARDANDO", prazo);
  for (const { ids, preco } of itens) {
    const { error } = await supabase
      .from("reposicao_itens")
      .update({ ...estado, cotacao_lote: null, cotacao_em: null, fornecedor_id: fornecedorId, preco_unitario: preco })
      .in("id", ids)
      .eq("resolvido", false);
    tratar(error);
  }
}

/**
 * Voltou de Aguardando para A comprar: o pedido foi desfeito, então tira o
 * fornecedor e o preço das linhas abertas. Antes do AJUSTE_08 não há o que tirar.
 */
export async function limparPedido(itemIds: string[]) {
  if (itemIds.length === 0) return;
  const { error } = await supabase
    .from("reposicao_itens")
    .update({ fornecedor_id: null, preco_unitario: null })
    .in("item_id", itemIds)
    .eq("resolvido", false);
  if (error && ["PGRST204", "42703"].includes(error.code || "")) return;
  tratar(error);
}

export interface UltimoPreco {
  preco: number;
  fornecedor_id: string | null;
  unidade: string | null;
  em: string;
}

/** O último preço pago de cada material (o mais recente com preço). */
export async function getUltimosPrecos(itemIds: string[]): Promise<Record<string, UltimoPreco>> {
  const r: Record<string, UltimoPreco> = {};
  if (itemIds.length === 0) return r;
  const { data, error } = await supabase
    .from("reposicao_itens")
    .select("item_id, preco_unitario, fornecedor_id, unidade, created_at")
    .in("item_id", itemIds)
    .not("preco_unitario", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  tratar(error);
  for (const l of data || []) {
    if (!r[l.item_id]) {
      r[l.item_id] = { preco: Number(l.preco_unitario), fornecedor_id: l.fornecedor_id, unidade: l.unidade, em: l.created_at };
    }
  }
  return r;
}
