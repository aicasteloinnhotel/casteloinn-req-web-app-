import { supabase } from "@/lib/supabase";
import { ItemReposicao } from "@/types";
import { camposDoEstado, type FotoDeEstado, type ModalidadeReposicao } from "@/lib/estadoReposicao";

export async function getListaReposicao(): Promise<ItemReposicao[]> {
  try {
    const { data: itens, error } = await supabase
      .from("reposicao_itens")
      .select(`
        *,
        item:itens(*),
        requisicao:requisicoes(codigo_requisicao, status)
      `)
      .order("created_at", { ascending: false });

    if (error) throw error;
    
    return (itens || []) as ItemReposicao[];
  } catch (e: any) {
    throw e;
  }
}

export async function adicionarItemReposicao(
  item_id: string,
  tipo_origem: "MANUAL" | "RUPTURA",
  requisicao_id?: string,
  quantidade: number = 1
): Promise<ItemReposicao | null> {
  try {
    let query = supabase
      .from("reposicao_itens")
      .select("id, quantidade")
      .eq("item_id", item_id)
      .eq("resolvido", false)
      .eq("tipo_origem", tipo_origem);
    
    if (tipo_origem === "RUPTURA" && requisicao_id) {
      query = query.eq("requisicao_id", requisicao_id);
    }
    
    const { data: existing, error: selectError } = await query.limit(1);
    if (selectError) throw selectError;

    if (existing && existing.length > 0) {
      let novaQtd = (existing[0].quantidade || 0) + quantidade;
      
      // The SQL RPC processar_ruptura inserts the rupture with quantidade = 1 by default.
      // So when the frontend immediately updates it, we must SET the quantity exactly to 
      // the calculated missing quantity, rather than adding to the existing 1.
      if (tipo_origem === "RUPTURA") {
        novaQtd = quantidade;
      }

      const { data: updated, error: updateError } = await supabase
        .from("reposicao_itens")
        .update({ quantidade: novaQtd })
        .eq("id", existing[0].id)
        .select()
        .single();
      if (updateError) throw updateError;
      return updated as ItemReposicao;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("reposicao_itens")
      .insert([{
        item_id,
        tipo_origem,
        quantidade,
        requisicao_id: requisicao_id || null,
        resolvido: false
      }])
      .select()
      .single();

    if (insertError) throw insertError;
    return inserted as ItemReposicao;
  } catch (e: any) {
    if (e?.code === '42501') {
      console.error("ERRO GRAVE (42501): Permissão negada (RLS) ao INSERIR em reposicao_itens. Verifique as Policies do Supabase.", e);
    } else if (e?.code === '23514') {
      console.error("ERRO GRAVE (23514): Check constraint violation. O valor de tipo_origem ou quantidade foi rejeitado pelo banco.", e);
    } else {
      console.error("ERRO desconhecido ao adicionar item de reposição:", e.message, e);
    }
    // Propagar o erro para que a interface saiba que falhou e mostre o toast
    throw e;
  }
}

/**
 * Remove de vez uma entrada manual da lista de reposição.
 *
 * Diferente de "resolver": resolver significa que o material chegou e fica
 * registrado no histórico de baixas. Isto aqui é para quando a linha foi
 * incluída por engano e não deve deixar rastro de uma baixa que nunca houve.
 * Só vale para itens MANUAIS — ruptura é consequência de uma requisição real
 * e precisa ser tratada dentro dela.
 */
export async function excluirItemReposicaoManual(id: string): Promise<boolean> {
  const { error } = await supabase
    .from("reposicao_itens")
    .delete()
    .eq("id", id)
    .eq("tipo_origem", "MANUAL");

  if (error) {
    console.error("Erro ao excluir item manual da reposição:", error);
    throw error;
  }
  return true;
}

/** Corrige a quantidade de uma entrada manual (erro de digitação). */
export async function editarQuantidadeManual(id: string, novaQuantidade: number): Promise<boolean> {
  if (novaQuantidade <= 0) throw new Error("A quantidade precisa ser maior que zero.");

  const { error } = await supabase
    .from("reposicao_itens")
    .update({ quantidade: novaQuantidade })
    .eq("id", id)
    .eq("tipo_origem", "MANUAL");

  if (error) {
    console.error("Erro ao editar quantidade manual:", error);
    throw error;
  }
  return true;
}

export async function marcarItemComoResolvido(id: string, resolvidaPor?: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("reposicao_itens")
      .update({
        // resolvido_por é FK para usuarios(id): UUID ou null, nunca texto.
        resolvido: true,
        resolvido_por: resolvidaPor || null,
        resolvido_em: new Date().toISOString()
      })
      .eq("id", id);

    if (error) throw error;
    return true;
  } catch (e: any) {
    console.error("Erro ao resolver item:", e);
    throw e;
  }
}

export async function subtrairQuantidadeItemReposicao(id: string, quantidadeParaSubtrair: number, resolvidaPor?: string): Promise<boolean> {
  try {
    const { data: item, error: selectError } = await supabase
      .from("reposicao_itens")
      .select("quantidade")
      .eq("id", id)
      .single();
      
    if (selectError) throw selectError;

    if (item.quantidade <= quantidadeParaSubtrair) {
      // Resolve completely
      return await marcarItemComoResolvido(id, resolvidaPor);
    } else {
      // Subtract quantity
      const { error: updateError } = await supabase
        .from("reposicao_itens")
        .update({ quantidade: item.quantidade - quantidadeParaSubtrair })
        .eq("id", id);
      if (updateError) throw updateError;
      return true;
    }
  } catch (e: any) {
    console.error("Erro ao subtrair quantidade do item de reposição:", e);
    throw e;
  }
}

export async function atualizarQuantidadeReposicao(
  requisicao_id: string,
  item_id: string,
  novaQuantidade: number,
  resolvidaPor?: string,
  unidade?: string,
): Promise<boolean> {
  try {
    let consulta = supabase
      .from("reposicao_itens")
      .select("id, quantidade, resolvido")
      .eq("requisicao_id", requisicao_id)
      .eq("item_id", item_id)
      .eq("resolvido", false);

    // O mesmo material pode faltar em duas unidades (4 UN + 1 CX). Sem filtrar
    // pela unidade, a linha de UN sobrescrevia a quantidade da de CX. Linhas
    // antigas, sem unidade gravada, continuam sendo encontradas.
    if (unidade) {
      consulta = consulta.or(`unidade.eq.${unidade},unidade.is.null`);
    }

    const { data: itens, error: selectError } = await consulta;

    if (selectError) throw selectError;
    if (!itens || itens.length === 0) return false;

    for (const item of itens) {
      if (novaQuantidade <= 0) {
        await marcarItemComoResolvido(item.id, resolvidaPor);
      } else {
        await supabase
          .from("reposicao_itens")
          .update({ quantidade: novaQuantidade })
          .eq("id", item.id);
      }
    }
    return true;
  } catch (e: any) {
    console.error("Erro ao atualizar quantidade na reposicao:", e);
    return false;
  }
}

export async function subtrairPorRequisicaoEItem(requisicao_id: string, item_id: string, quantidadeParaSubtrair: number, resolvidaPor?: string): Promise<boolean> {
  try {
    const { data: itens, error: selectError } = await supabase
      .from("reposicao_itens")
      .select("id, quantidade")
      .eq("requisicao_id", requisicao_id)
      .eq("item_id", item_id)
      .eq("resolvido", false);

    if (selectError) throw selectError;
    if (!itens || itens.length === 0) return false;

    let qt = quantidadeParaSubtrair;
    for (const item of itens) {
      if (qt <= 0) break;
      if (item.quantidade <= qt) {
        await marcarItemComoResolvido(item.id, resolvidaPor);
        qt -= item.quantidade;
      } else {
        await supabase
          .from("reposicao_itens")
          .update({ quantidade: item.quantidade - qt })
          .eq("id", item.id);
        qt = 0;
      }
    }
    return true;
  } catch (e: any) {
    console.error("Erro ao subtrair por requisicao e item:", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
//  ESTADO DOS ITENS, UM OU VÁRIOS DE UMA VEZ
//  Sempre pelo material (item_id): o mesmo material em duas linhas (manual e
//  ruptura) é um item só na tela. Falha vira erro de verdade: antes o erro era
//  engolido e a tela dizia "sucesso" mesmo sem ter gravado.
// ---------------------------------------------------------------------------

const SEM_AJUSTE_07 = "Falta rodar o AJUSTE_07 no Supabase para usar a cotação.";

/** A API recusa endereços enormes: acima disto, vai em partes. */
const TAMANHO_PARTE = 100;

const emPartes = <T,>(lista: T[]): T[][] => {
  const partes: T[][] = [];
  for (let i = 0; i < lista.length; i += TAMANHO_PARTE) partes.push(lista.slice(i, i + TAMANHO_PARTE));
  return partes;
};

const atualizarItensAbertos = async (itemIds: string[], campos: Record<string, unknown>) => {
  for (const parte of emPartes(itemIds)) {
    const { error } = await supabase
      .from("reposicao_itens")
      .update(campos)
      .in("item_id", parte)
      .eq("resolvido", false);
    if (error) {
      // Coluna que a API não conhece: o app subiu antes do SQL.
      if (error.code === "PGRST204" || error.code === "42703") throw new Error(SEM_AJUSTE_07);
      throw new Error(error.message);
    }
  }
};

/** Muda o estado. Sai da cotação: quem definiu o estado já decidiu o que fazer. */
export async function definirEstadoDosItens(itemIds: string[], modalidade: ModalidadeReposicao, prazo?: string) {
  await atualizarItensAbertos(itemIds, {
    ...camposDoEstado(modalidade, prazo),
    cotacao_lote: null,
    cotacao_em: null,
  });
}

/** Põe na cotação, num subgrupo novo (uma cópia para a planilha). */
export async function moverParaCotacao(itemIds: string[]): Promise<string> {
  const lote = crypto.randomUUID();
  await atualizarItensAbertos(itemIds, { cotacao_lote: lote, cotacao_em: new Date().toISOString() });
  return lote;
}

/** Volta ao estado de antes da cotação (urgência e prazo nunca foram mexidos). */
export async function tirarDaCotacao(itemIds: string[]) {
  await atualizarItensAbertos(itemIds, { cotacao_lote: null, cotacao_em: null });
}

/** O "Desfazer": devolve cada linha ao estado fotografado antes da ação. */
export async function restaurarEstado(foto: FotoDeEstado[]) {
  // Linhas com o mesmo estado vão juntas: bem menos idas ao servidor.
  const porEstado = new Map<string, { campos: Omit<FotoDeEstado, "id">; ids: string[] }>();
  for (const { id, ...campos } of foto) {
    const chave = JSON.stringify(campos);
    if (!porEstado.has(chave)) porEstado.set(chave, { campos, ids: [] });
    porEstado.get(chave)!.ids.push(id);
  }
  for (const { campos, ids } of porEstado.values()) {
    for (const parte of emPartes(ids)) {
      const { error } = await supabase.from("reposicao_itens").update(campos).in("id", parte);
      if (error) throw new Error(error.message);
    }
  }
}

export async function baixarQuantidadeReposicaoEmMassa(
  atualizacoes: { id: string; subtracao: number; itemOriginal: ItemReposicao }[],
  resolvidaPor?: string
): Promise<boolean> {
  try {
    const promises = atualizacoes.map(({ id, subtracao, itemOriginal }) => {
      let novaQuantidade = itemOriginal.quantidade - subtracao;
      const resolvido = novaQuantidade <= 0;
      
      if (resolvido) {
        return supabase
          .from("reposicao_itens")
          .update({
            resolvido: true,
            resolvido_por: resolvidaPor || null,
            resolvido_em: new Date().toISOString()
          })
          .eq("id", id);
      } else {
        // Chegou só parte: a linha continua pendente com o que falta, e a parte
        // que chegou vira um registro já baixado. Antes a baixa parcial só
        // diminuía o número e não aparecia no Histórico de Baixas.
        return supabase
          .from("reposicao_itens")
          .update({ quantidade: novaQuantidade })
          .eq("id", id)
          .then((r) =>
            r.error
              ? r
              : supabase.from("reposicao_itens").insert([{
                  item_id: itemOriginal.item_id,
                  tipo_origem: itemOriginal.tipo_origem,
                  requisicao_id: itemOriginal.requisicao_id || null,
                  unidade: itemOriginal.unidade ?? null,
                  quantidade: subtracao,
                  resolvido: true,
                  resolvido_por: resolvidaPor || null,
                  resolvido_em: new Date().toISOString(),
                }]),
          );
      }
    });

    const results = await Promise.all(promises);
    
    // Check for errors
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.error("Errors in bulk update:", errors);
      throw new Error(errors[0].error?.message || "Erro na atualização em massa");
    }

    return true;
  } catch (e: any) {
    console.error("Erro ao realizar baixa em massa:", e);
    throw e;
  }
}
