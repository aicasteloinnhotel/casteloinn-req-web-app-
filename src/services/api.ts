import { supabase, hasSupabaseKeys } from "@/lib/supabase";
import { formatItemName } from "@/lib/utils";
import { Item, Usuario, Requisicao, RequisicaoItem, Historico, BloqueioRequisicoes } from "@/types";

// ====================================== //
// ============ ITENS SERVICE =========== //
// ====================================== //
export const getItens = async (): Promise<Item[]> => {
  if (!hasSupabaseKeys) return [];
  const { data, error } = await supabase
    .from("itens")
    .select("*")
    .order("nome");
  if (error) {

    throw error;
  }
  return data;
};

export const createItem = async (item: Omit<Item, "id" | "created_at">) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase.from("itens").insert([item]);
  if (error) throw error;
};

/** Insere vários itens numa única chamada (usado na importação de CSV). */
export const createItens = async (
  novos: Omit<Item, "id" | "created_at">[],
) => {
  if (!hasSupabaseKeys || novos.length === 0) return;
  const { error } = await supabase.from("itens").insert(novos);
  if (error) throw error;
};

export const updateItem = async (id: string, item: Partial<Item>) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase.from("itens").update(item).eq("id", id);
  if (error) throw error;
};

/** O item já apareceu em alguma requisição? Se sim, não pode ser excluído de vez. */
export const checkItemUsage = async (id: string): Promise<boolean> => {
  if (!hasSupabaseKeys) return false;
  const { count, error } = await supabase
    .from("requisicao_itens")
    .select("*", { count: 'exact', head: true })
    .eq("item_id", id);
  if (error) throw error;
  return (count || 0) > 0;
};

export const deleteItem = async (id: string) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase.from("itens").delete().eq("id", id);
  if (error) throw error;
};

// ====================================== //
// ========== USUARIOS SERVICE ========== //
// ====================================== //
export const getUsuarios = async (): Promise<Usuario[]> => {
  if (!hasSupabaseKeys) return [];
  const { data, error } = await supabase
    .from("usuarios")
    .select("id, nome, departamento, perfil, ativo, created_at")
    .order("nome");
  if (error) {

    throw error;
  }
  return data;
};

export const createUsuario = async (
  user: Omit<Usuario, "id" | "created_at">,
) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase.from("usuarios").insert([user]);
  if (error) throw error;
};

export const updateUsuario = async (id: string, user: Partial<Usuario>) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase.from("usuarios").update(user).eq("id", id);
  if (error) throw error;
};

export const deleteUsuario = async (id: string) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase.from("usuarios").delete().eq("id", id);
  if (error) throw error;
};

// ====================================== //
// ======== REQUISIÇÕES SERVICE ========= //
// ====================================== //
export const getRequisicoes = async (
  userId?: string,
): Promise<Requisicao[]> => {
  if (!hasSupabaseKeys) return [];

  let query = supabase
    .from("requisicoes")
    .select(
      `
    *,
    usuario:usuarios!requisicoes_usuario_id_fkey(nome),
    itens:requisicao_itens!requisicao_itens_requisicao_id_fkey(
      id,
      quantidade,
      quantidade_separada,
      unidade,
      unidade_separada,
      item:itens(*)
    )
  `,
    )
    .order("created_at", { ascending: false });

  if (userId) {
    query = query.eq("usuario_id", userId);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data || []) as Requisicao[];
};

export const getRequisicao = async (id: string): Promise<Requisicao | null> => {
  if (!hasSupabaseKeys) return null;
  const { data, error } = await supabase
    .from("requisicoes")
    .select(
      `
      *,
      usuario:usuarios!requisicoes_usuario_id_fkey(nome),
      itens:requisicao_itens!requisicao_itens_requisicao_id_fkey(
        id,
        requisicao_id,
        item_id,
        quantidade,
        quantidade_separada,
        unidade,
        unidade_separada,
        item:itens(*)
      )
    `,
    )
    .eq("id", id)
    .single();
  if (error) {
    throw error;
  }
  return data as Requisicao;
};

export const getRequisicaoComplementar = async (origemId: string): Promise<{ id: string; codigo_requisicao?: number } | null> => {
  if (!hasSupabaseKeys) return null;
  // Uma origem pode gerar mais de um complemento ao longo do tempo (ruptura em
  // cima de ruptura). `.single()` explodia nesse caso; pegamos o mais recente.
  const { data, error } = await supabase
    .from("requisicoes")
    .select("id, codigo_requisicao")
    .eq("requisicao_origem_id", origemId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data;
};

export const getRequisicaoOriginal = async (origemId: string): Promise<{ id: string; codigo_requisicao?: number } | null> => {
  if (!hasSupabaseKeys) return null;
  const { data, error } = await supabase
    .from("requisicoes")
    .select("id, codigo_requisicao")
    .eq("id", origemId)
    .maybeSingle();

  if (error || !data) return null;
  return data;
};

/**
 * Nome de um usuário pelo id. Nunca lança: é usado só para exibição
 * (ex.: nome do conferente), então uma falha vira "sem nome" e não quebra a tela.
 */
export const getUsuarioNome = async (id?: string | null): Promise<string | null> => {
  if (!hasSupabaseKeys || !id) return null;
  const { data, error } = await supabase
    .from("usuarios")
    .select("nome")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data.nome as string;
};

/** Uma linha enviada pela tela de pedido. `nome` só serve para o histórico. */
export type LinhaRequisicao = {
  item_id: string;
  quantidade: number;
  unidade?: string | null;
  nome?: string;
};

export const createRequisicao = async (
  req: Omit<Requisicao, "id" | "created_at" | "codigo_requisicao" | "itens">,
  itens: LinhaRequisicao[],
): Promise<{ id: string; codigo_requisicao?: number } | undefined> => {
  if (!hasSupabaseKeys) return;

  // 1. Criar a requisição
  const { data, error } = await supabase
    .from("requisicoes")
    .insert([req])
    .select("id, codigo_requisicao")
    .single();

  if (error) throw error;
  const requisicaoId = data.id;
  const codigoRequisicao = data.codigo_requisicao;

  try {
    // 2. Inserir os Itens
    if (itens && itens.length > 0) {
      const reqItens = itens.map((i) => ({
        requisicao_id: requisicaoId,
        item_id: i.item_id,
        quantidade: i.quantidade,
        unidade: i.unidade || null,
      }));

      const { error: errorItens } = await supabase
        .from("requisicao_itens")
        .insert(reqItens);

      if (errorItens) throw errorItens;
    }

    // 3. Adicionar Historico
    await addHistorico(
      requisicaoId,
      "CRIADA",
      req.usuario_id,
      "Requisição criada pelo usuário.",
    );

    return { id: requisicaoId, codigo_requisicao: codigoRequisicao };
  } catch (rollbackError) {
    // Reverter operação em caso de falha (blindagem transacional simulada)
    await supabase.from("requisicoes").delete().eq("id", requisicaoId);
    throw rollbackError;
  }
};

export const updateRequisicaoStatus = async (
  id: string,
  status: string,
  usuarioId: string,
) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase
    .from("requisicoes")
    .update({ status })
    .eq("id", id);
  if (error) throw error;

  await addHistorico(
    id,
    `STATUS_ALTERADO_${status}`,
    usuarioId,
    `Status alterado para ${status}`,
  );
  if (status === "FINALIZADA" || status === "CANCELADA") {
    // resolvido_por é uma FK para usuarios(id): precisa ser um UUID válido ou null.
    // Gravar um texto aqui derrubava toda a finalização das requisições complementares.
    const { error: repoError } = await supabase
      .from("reposicao_itens")
      .update({
        resolvido: true,
        resolvido_por: usuarioId || null,
        resolvido_em: new Date().toISOString(),
      })
      .eq("requisicao_id", id)
      .eq("resolvido", false);

    // O status principal já foi gravado. Uma falha na limpeza da lista de
    // reposição é registrada, mas não invalida a finalização.
    if (repoError) {
      console.error(
        "Falha ao baixar itens de reposição da requisição",
        id,
        repoError,
      );
    }
  }
};

export const updateRequisicaoInfo = async (
  id: string,
  updates: Partial<Requisicao>,
) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase
    .from("requisicoes")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
};

export const addHistorico = async (
  requisicao_id: string,
  acao: string,
  usuario_id: string,
  observacao?: string,
) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase
    .from("historico")
    .insert([{ requisicao_id, acao, usuario_id, observacao }]);

  if (!error) return;

  // 23503 = chave estrangeira violada. Acontece quando o usuário da sessão foi
  // apagado do cadastro enquanto o app continuava aberto no aparelho dele.
  // Perder a entrega inteira por causa da linha do histórico é pior do que
  // gravá-la sem autor — a coluna aceita nulo e a tela mostra "Sistema".
  if (error.code === "23503") {
    const { error: semAutor } = await supabase
      .from("historico")
      .insert([{ requisicao_id, acao, usuario_id: null, observacao }]);
    if (!semAutor) {
      console.warn(
        "Histórico gravado sem autor: o usuário da sessão não existe mais no cadastro.",
      );
      return;
    }
    throw semAutor;
  }

  throw error;
};

export const getHistorico = async (
  requisicao_id: string,
): Promise<Historico[]> => {
  if (!hasSupabaseKeys) return [];
  const { data, error } = await supabase
    .from("historico")
    .select(`
      *,
      usuario:usuarios!historico_usuario_id_fkey(nome)
    `)
    .eq("requisicao_id", requisicao_id)
    .order("created_at", { ascending: true });
  if (error) {

    throw error;
  }
  return data;
};

/**
 * Grava o que foi separado numa linha: quantidade e a unidade em que foi
 * entregue (pedido 5 UN, entregue 6,2 KG). Desmarcar a linha (null) limpa os dois.
 */
export const updateRequisicaoItem = async (
  id: string,
  quantidade_separada: number | null,
  unidade_separada?: string | null,
) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase
    .from("requisicao_itens")
    .update({
      quantidade_separada,
      unidade_separada: quantidade_separada === null ? null : (unidade_separada || null),
    })
    .eq("id", id);
  if (error) throw error;
};

export const addRequisicaoItem = async (item: Omit<RequisicaoItem, "id">) => {
  if (!hasSupabaseKeys) return null;
  const { data, error } = await supabase
    .from("requisicao_itens")
    .insert([item])
    .select()
    .single();
  if (error) throw error;
  return data as RequisicaoItem;
};

export const deleteRequisicaoItem = async (id: string) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase
    .from("requisicao_itens")
    .delete()
    .eq("id", id);
  if (error) throw error;
};


export const processarRuptura = async (
  requisicaoOrigemId: string,
  novoStatus: string,
  itensFaltantes: { item_id: string; quantidade: number; unidade?: string }[]
) => {
  if (!hasSupabaseKeys) return null;
  const { data, error } = await supabase.rpc('processar_ruptura', {
    p_requisicao_origem_id: requisicaoOrigemId,
    p_novo_status: novoStatus,
    p_itens: itensFaltantes
  });
  if (error) throw error;
  return data;
};


// ====================================== //
// ============ ASSINATURAS  ============ //
// ====================================== //

export const uploadAssinatura = async (base64: string, path: string): Promise<string> => {
  if (!hasSupabaseKeys) {
    throw new Error("Supabase não configurado. Falha ao enviar assinatura.");
  }

  try {
    const arr = base64.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    const blob = new Blob([u8arr], {type: mime});

    let { error } = await supabase.storage
      .from('assinaturas')
      .upload(path, blob, { contentType: mime, upsert: false });
      
    if (error) {
      console.error("Storage upload failed:", error);
      throw new Error("Falha ao enviar assinatura. Verifique a configuração do servidor.");
    }

    const { data: publicUrlData } = supabase.storage
      .from('assinaturas')
      .getPublicUrl(path);
      
    return publicUrlData.publicUrl;
  } catch (err: any) {
    console.error("Exception in uploadAssinatura:", err);
    throw new Error(err.message || "Falha ao enviar assinatura. Verifique a configuração do servidor.");
  }
};


/**
 * Tempo de vida da trava de separação. Se o conferente fecha o navegador ou
 * o celular dorme, a requisição não pode ficar presa para sempre.
 */
export const LOCK_TTL_MS = 30 * 60 * 1000; // 30 minutos

/** A trava só vale se foi renovada dentro da janela do TTL. */
export const isLockAtivo = (lockedAt?: string | null): boolean => {
  if (!lockedAt) return false;
  const ts = new Date(lockedAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts < LOCK_TTL_MS;
};

/**
 * Tenta tomar a trava de separação de forma atômica: a condição roda no
 * Postgres, então dois conferentes clicando ao mesmo tempo não passam os dois.
 * Retorna `{ ok: false, lockedBy }` quando outro operador já está com ela.
 */
export const lockRequisicao = async (
  id: string,
  userId: string,
): Promise<{ ok: boolean; lockedBy?: string | null }> => {
  if (!hasSupabaseKeys) return { ok: true };

  const limite = new Date(Date.now() - LOCK_TTL_MS).toISOString();

  const { data, error } = await supabase
    .from("requisicoes")
    .update({ locked_by: userId, locked_at: new Date().toISOString() })
    .eq("id", id)
    .or(
      `locked_by.is.null,locked_by.eq.${userId},locked_at.is.null,locked_at.lt."${limite}"`,
    )
    .select("id");

  if (error) {
    console.warn("Falha ao aplicar trava de separação:", error);
    // Sem a coluna/permissão a trava é apenas informativa: não bloqueia o trabalho.
    return { ok: true };
  }

  if (data && data.length > 0) return { ok: true };

  // Não conseguiu travar: descobre quem está com ela para avisar na tela.
  const { data: atual } = await supabase
    .from("requisicoes")
    .select("locked_by")
    .eq("id", id)
    .maybeSingle();

  return { ok: false, lockedBy: atual?.locked_by ?? null };
};

/** Renova a trava enquanto a tela de separação estiver aberta. */
export const renovarLockRequisicao = async (id: string, userId: string) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase
    .from("requisicoes")
    .update({ locked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("locked_by", userId);
  if (error) console.warn("Falha ao renovar trava de separação:", error);
};

export const unlockRequisicao = async (id: string) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase
    .from("requisicoes")
    .update({ locked_by: null, locked_at: null })
    .eq("id", id);
  if (error) {
    console.warn("Ignoring unlockRequisicao error (likely missing columns):", error);
  }
};

/**
 * Grava as assinaturas da entrega. Tenta incluir o conferente; se a coluna
 * `conferente_id` ainda não existir no banco, regrava só as assinaturas em vez
 * de perder tudo silenciosamente (era o que acontecia antes).
 * Retorna true se as assinaturas foram persistidas.
 */
export const salvarAssinaturas = async (
  id: string,
  assinaturas: {
    assinatura_solicitante?: string;
    assinatura_almoxarifado?: string;
    termo_aceito_em?: string;
    termo_versao?: string;
  },
  conferenteId?: string,
): Promise<boolean> => {
  if (!hasSupabaseKeys) return false;

  const { error } = await supabase
    .from("requisicoes")
    .update({ ...assinaturas, conferente_id: conferenteId })
    .eq("id", id);

  if (!error) return true;

  console.error(
    "Falha ao gravar assinaturas com conferente_id, tentando sem a coluna:",
    error,
  );

  const { error: fallbackError } = await supabase
    .from("requisicoes")
    .update(assinaturas)
    .eq("id", id);

  if (fallbackError) {
    console.error("Falha ao gravar assinaturas:", fallbackError);
    return false;
  }
  return true;
};

/**
 * Compara o pedido antes e depois da edição e descreve, item a item, o que
 * mudou. O histórico antes dizia só "Requisição editada pelo solicitante", o
 * que não servia de nada para o almoxarifado conferir.
 */
const descreverEdicaoDeItens = (
  antes: { item_id: string; quantidade: number; unidade?: string | null; nome: string }[],
  depois: LinhaRequisicao[],
): string => {
  const rotulo = (item_id: string, nome?: string) =>
    formatItemName(nome) || antes.find((a) => a.item_id === item_id)?.nome || "Item";
  const un = (unidade?: string | null) => (unidade || "").toUpperCase();

  // O mesmo material pode estar no pedido em duas unidades (10 UN + 2 CX).
  // Casar só pelo material comparava a linha de CX com a de UN e o histórico
  // saía errado. Primeiro casa material + unidade; entre as linhas que
  // sobrarem, casa só pelo material (aí foi troca de unidade).
  const antigasSemPar = [...antes];
  const pares: { antiga?: (typeof antes)[number]; nova: LinhaRequisicao }[] = [];
  const novasSemPar: LinhaRequisicao[] = [];

  for (const nova of depois) {
    const i = antigasSemPar.findIndex(
      (a) => a.item_id === nova.item_id && un(a.unidade) === un(nova.unidade),
    );
    if (i >= 0) pares.push({ antiga: antigasSemPar.splice(i, 1)[0], nova });
    else novasSemPar.push(nova);
  }
  for (const nova of novasSemPar) {
    const i = antigasSemPar.findIndex((a) => a.item_id === nova.item_id);
    pares.push({ antiga: i >= 0 ? antigasSemPar.splice(i, 1)[0] : undefined, nova });
  }

  const mudancas: string[] = [];

  for (const { antiga, nova } of pares) {
    const nome = rotulo(nova.item_id, nova.nome);
    if (!antiga) {
      mudancas.push(`+ Incluído: ${nome} — ${nova.quantidade} ${un(nova.unidade)}`.trim());
      continue;
    }
    if (antiga.quantidade !== nova.quantidade) {
      mudancas.push(
        `~ Quantidade: ${nome} — de ${antiga.quantidade} para ${nova.quantidade} ${un(nova.unidade)}`.trim(),
      );
    }
    if (un(nova.unidade) && un(antiga.unidade) && un(nova.unidade) !== un(antiga.unidade)) {
      mudancas.push(`~ Unidade: ${nome} — de ${un(antiga.unidade)} para ${un(nova.unidade)}`);
    }
  }

  for (const antiga of antigasSemPar) {
    mudancas.push(`- Removido: ${antiga.nome} — ${antiga.quantidade} ${un(antiga.unidade)}`.trim());
  }

  if (mudancas.length === 0) return "Requisição editada. Nenhuma alteração nos itens.";
  return `Requisição editada.\n${mudancas.join("\n")}`;
};

export const updateRequisicaoCompleta = async (
  id: string,
  req: Partial<Requisicao>,
  itens: LinhaRequisicao[],
  usuarioId: string
): Promise<void> => {
  if (!hasSupabaseKeys) return;

  const { data: currReq } = await supabase.from("requisicoes").select("status").eq("id", id).single();
  if (currReq?.status !== "PENDENTE") throw new Error("Apenas requisições PENDENTES podem ser editadas");

  // 1. Fotografar o pedido como ele está agora, ANTES de apagar as linhas:
  //    é esta foto que permite dizer no histórico o que mudou.
  const { data: itensAntes } = await supabase
    .from("requisicao_itens")
    .select("item_id, quantidade, unidade, item:itens(nome)")
    .eq("requisicao_id", id);

  const antes = (itensAntes || []).map((linha: any) => ({
    item_id: linha.item_id as string,
    quantidade: Number(linha.quantidade),
    unidade: (linha.unidade as string | null) ?? null,
    nome: formatItemName(linha.item?.nome) || "Item",
  }));

  // 2. Atualizar a requisição
  const { error: reqError } = await supabase
    .from("requisicoes")
    .update(req)
    .eq("id", id);
  if (reqError) throw reqError;

  // 3. Deletar itens antigos
  const { error: deleteError } = await supabase
    .from("requisicao_itens")
    .delete()
    .eq("requisicao_id", id);
  if (deleteError) throw deleteError;

  // 4. Inserir itens novos
  if (itens && itens.length > 0) {
    const reqItens = itens.map((i) => ({
      requisicao_id: id,
      item_id: i.item_id,
      quantidade: i.quantidade,
      unidade: i.unidade || null,
    }));
    const { error: itensError } = await supabase
      .from("requisicao_itens")
      .insert(reqItens);
    if (itensError) {
      // As linhas antigas já foram apagadas no passo 3. Sem devolvê-las, uma
      // falha de rede aqui deixava o pedido sem nenhum item.
      if (antes.length > 0) {
        await supabase.from("requisicao_itens").insert(
          antes.map((a) => ({
            requisicao_id: id,
            item_id: a.item_id,
            quantidade: a.quantidade,
            unidade: a.unidade,
          })),
        );
      }
      throw itensError;
    }
  }

  // 5. Registrar no histórico exatamente o que mudou
  await addHistorico(id, "EDITADA", usuarioId, descreverEdicaoDeItens(antes, itens));
};

// ====================================== //
// ======= PAUSA PARA INVENTÁRIO ======== //
// ====================================== //

/** Situação da pausa. Sem a tabela (AJUSTE_04 não rodou), conta como liberado. */
export const getBloqueioRequisicoes = async (): Promise<BloqueioRequisicoes> => {
  if (!hasSupabaseKeys) return { ativo: false };
  const { data, error } = await supabase
    .from("bloqueio_requisicoes")
    .select("ativo, motivo, alterado_por, alterado_em")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return { ativo: false };
  return data as BloqueioRequisicoes;
};

/**
 * Liga ou desliga a pausa. Vale na hora para todos os aparelhos.
 * Passa por uma função do banco que confere se quem pede é do Almoxarifado:
 * a tabela não aceita alteração direta pela API.
 */
export const definirBloqueioRequisicoes = async (
  ativo: boolean,
  usuarioId: string,
  motivo?: string,
) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase.rpc("definir_bloqueio_requisicoes", {
    p_usuario_id: usuarioId,
    p_ativo: ativo,
    p_motivo: motivo?.trim() || null,
  });
  if (error) {
    // PGRST202 = função não encontrada: o AJUSTE_04 ainda não rodou.
    if (error.code === "PGRST202") {
      throw new Error("A pausa ainda não existe no banco. Rode o script AJUSTE_04 no Supabase.");
    }
    throw error;
  }
};

// ====================================== //
// ======== LANÇAMENTO NO TOTVS ========= //
// ====================================== //

/**
 * Marca a requisição como lançada no TOTVS. É aqui que o fluxo termina:
 * FINALIZADA quer dizer entregue, LANÇADA quer dizer baixada no sistema.
 */
export const marcarRequisicaoLancada = async (id: string, usuarioId: string) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase
    .from("requisicoes")
    .update({
      lancado: true,
      lancado_em: new Date().toISOString(),
      lancado_por: usuarioId,
    })
    .eq("id", id);
  if (error) throw error;

  await addHistorico(id, "LANCADA_NO_TOTVS", usuarioId, "Requisição lançada no TOTVS.");
};

/** Desfaz o lançamento, para o caso de ter sido marcado por engano. */
export const desfazerLancamento = async (id: string, usuarioId: string) => {
  if (!hasSupabaseKeys) return;
  const { error } = await supabase
    .from("requisicoes")
    .update({ lancado: false, lancado_em: null, lancado_por: null })
    .eq("id", id);
  if (error) throw error;

  await addHistorico(id, "LANCAMENTO_DESFEITO", usuarioId, "Marcação de lançado no TOTVS desfeita.");
};
