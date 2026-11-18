import { supabase } from "@/lib/supabase";
import { camposDoEstado } from "@/lib/estadoReposicao";
import type { EdicaoDeLinha, Fornecedor, PrecoCotado } from "@/lib/cotacao";

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

/** Todos, inclusive os excluídos (ativo = falso): a cotação antiga ainda mostra o nome. */
export async function getFornecedores(): Promise<Fornecedor[]> {
  // "*": funciona antes e depois do AJUSTE_09 (WhatsApp e mínimo).
  const { data, error } = await supabase.from("fornecedores").select("*").order("nome");
  tratar(error);
  return ((data || []) as Fornecedor[]).map((f) => ({
    ...f,
    pedido_minimo: f.pedido_minimo == null ? null : Number(f.pedido_minimo),
  }));
}

const nomeLimpo = (nome: string) => nome.trim().replace(/\s+/g, " ").toUpperCase();

/**
 * Cadastra; se o nome já existe (mesmo com outra caixa/espaço), devolve o que
 * existe — e, se tinha sido excluído, volta a valer.
 */
export async function criarFornecedor(nome: string): Promise<Fornecedor> {
  const limpo = nomeLimpo(nome);
  if (!limpo) throw new Error("Digite o nome do fornecedor.");
  const { data, error } = await supabase.from("fornecedores").insert([{ nome: limpo }]).select("*").single();
  if (error?.code === "23505") {
    const todos = await getFornecedores();
    const existente = todos.find((f) => f.nome.trim().toUpperCase() === limpo);
    if (existente) {
      if (existente.ativo === false) {
        const volta = await supabase.from("fornecedores").update({ ativo: true }).eq("id", existente.id);
        tratar(volta.error);
      }
      return { ...existente, ativo: true };
    }
  }
  tratar(error);
  return data as Fornecedor;
}

export const SEM_AJUSTE_09 = "Falta rodar o AJUSTE_09 no Supabase para guardar WhatsApp e pedido mínimo.";

/** Nome, WhatsApp e pedido mínimo. */
export async function atualizarFornecedor(
  id: string,
  campos: { nome: string; whatsapp: string | null; pedido_minimo: number | null },
) {
  const nome = nomeLimpo(campos.nome);
  if (!nome) throw new Error("Digite o nome do fornecedor.");
  const { error } = await supabase
    .from("fornecedores")
    .update({ nome, whatsapp: campos.whatsapp, pedido_minimo: campos.pedido_minimo })
    .eq("id", id);
  if (error?.code === "23505") throw new Error(`Já existe um fornecedor chamado ${nome}.`);
  if (error && ["PGRST204", "42703"].includes(error.code || "")) throw new Error(SEM_AJUSTE_09);
  tratar(error);
}

/**
 * Excluir = esconder (ativo = falso). Some das listas para incluir, mas o
 * histórico de preços e os pedidos antigos continuam com o nome dele.
 */
export async function excluirFornecedor(id: string) {
  const { error } = await supabase.from("fornecedores").update({ ativo: false }).eq("id", id);
  tratar(error);
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
  itens: {
    ids: string[];
    preco: number;
    /** Linha editada (outra unidade/quantidade): quanto de cada linha da reposição vai na compra. */
    compra?: { unidade: string; partes: { id: string; quantidade: number }[] };
  }[],
  fornecedorId: string,
  prazo: string,
) {
  const estado = camposDoEstado("AGUARDANDO", prazo);
  const base = { ...estado, cotacao_lote: null, cotacao_em: null, fornecedor_id: fornecedorId };
  for (const { ids, preco, compra } of itens) {
    if (!compra) {
      const { error } = await supabase
        .from("reposicao_itens")
        .update({ ...base, preco_unitario: preco })
        .in("id", ids)
        .eq("resolvido", false);
      tratar(error);
      continue;
    }
    // Comprado em outra unidade: cada linha guarda a unidade e a sua parte da compra.
    for (const p of compra.partes) {
      const { error } = await supabase
        .from("reposicao_itens")
        .update({ ...base, preco_unitario: preco, unidade_compra: compra.unidade, quantidade_compra: p.quantidade })
        .eq("id", p.id)
        .eq("resolvido", false);
      if (error && ["PGRST204", "42703"].includes(error.code || "")) throw new Error(SEM_AJUSTE_10);
      tratar(error);
    }
  }
}

export const SEM_AJUSTE_10 = "Falta rodar o AJUSTE_10 no Supabase para editar a linha da cotação.";

/** As linhas editadas da cotação. Antes do AJUSTE_10, nenhuma. */
export async function getLinhasEditadas(lote: string): Promise<EdicaoDeLinha[]> {
  const { data, error } = await supabase
    .from("cotacao_linhas")
    .select("item_id, unidade, nome, marca, unidade_compra, quantidade")
    .eq("cotacao_lote", lote);
  if (error && ["42P01", "PGRST205"].includes(error.code || "")) return [];
  tratar(error);
  return (data || []).map((l) => ({ ...l, quantidade: l.quantidade == null ? null : Number(l.quantidade) })) as EdicaoDeLinha[];
}

/** Grava como a linha vai na cotação; null = volta ao original. */
export async function salvarLinha(
  lote: string,
  itemId: string,
  unidade: string,
  campos: { nome: string | null; marca: string | null; unidade_compra: string | null; quantidade: number | null } | null,
) {
  const r = campos
    ? await supabase.from("cotacao_linhas").upsert(
        [{ cotacao_lote: lote, item_id: itemId, unidade, ...campos, updated_at: new Date().toISOString() }],
        { onConflict: "cotacao_lote,item_id,unidade" },
      )
    : await supabase.from("cotacao_linhas").delete().eq("cotacao_lote", lote).eq("item_id", itemId).eq("unidade", unidade);
  if (r.error && ["42P01", "PGRST205", "PGRST204", "42703"].includes(r.error.code || "")) throw new Error(SEM_AJUSTE_10);
  tratar(r.error);
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
    // "*": antes do AJUSTE_10 não existe unidade_compra.
    .select("*")
    .in("item_id", itemIds)
    .not("preco_unitario", "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  tratar(error);
  for (const l of (data || []) as any[]) {
    if (!r[l.item_id]) {
      // O preço é da unidade em que foi comprado (2 CX), não da necessidade (24 UN).
      r[l.item_id] = { preco: Number(l.preco_unitario), fornecedor_id: l.fornecedor_id, unidade: l.unidade_compra || l.unidade, em: l.created_at };
    }
  }
  return r;
}
