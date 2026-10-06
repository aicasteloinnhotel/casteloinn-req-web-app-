-- ############################################################################
-- ⛔  O SISTEMA ESTÁ EM USO COM DADOS REAIS. NÃO RODE ESTE SCRIPT.
-- ⛔  Ele apaga TODAS as requisições. Foi feito para a fase de testes.
-- ############################################################################

-- ============================================================================
--  MANUTENÇÃO — Zerar a movimentação (começar do zero)
-- ============================================================================
--
--  APAGA:   todas as requisições, os itens delas, a lista de reposição e o
--           histórico. O contador volta para a REQ #1.
--  MANTÉM:  usuários (com as senhas atuais), catálogo de materiais e toda a
--           estrutura do banco.
--
--  Quando usar: no fim da fase de testes, antes de abrir para a equipe.
--
--  É IRREVERSÍVEL. Na dúvida, faça antes um backup pelo painel do Supabase
--  (Database → Backups).
--
--  TRAVA DE SEGURANÇA: nada é apagado enquanto a linha
--      v_confirmo BOOLEAN := false;
--  não for trocada para  true.  Rodar sem trocar só mostra um aviso.
--
--  As assinaturas (imagens) ficam no Storage e não são apagadas por aqui.
--  Para limpá-las: Storage → assinaturas → selecionar tudo → Delete.
--
--  Depois de rodar, peça para quem está com o app aberto recarregar a tela.
-- ============================================================================

DO $zerar$
DECLARE
    v_confirmo        BOOLEAN := false;  -- ← troque para true para confirmar
    v_apagar_catalogo BOOLEAN := false;  -- ← true apaga TAMBÉM o catálogo de materiais
BEGIN
    IF NOT v_confirmo THEN
        RAISE EXCEPTION 'Nada foi apagado. Para confirmar, troque v_confirmo para true e rode de novo.';
    END IF;

    -- Uma instrução só, instantânea. RESTART IDENTITY volta o contador para #1.
    TRUNCATE public.historico,
             public.reposicao_itens,
             public.requisicao_itens,
             public.requisicoes
    RESTART IDENTITY;

    IF v_apagar_catalogo THEN
        -- CASCADE porque as tabelas acima apontam para o catálogo (já estão vazias).
        TRUNCATE public.itens CASCADE;
    END IF;
END
$zerar$;


-- Conferência: como o banco ficou.
SELECT ordem, tabela, registros
FROM (
    SELECT 1 AS ordem, 'requisicoes'      AS tabela, count(*)::text AS registros FROM public.requisicoes
    UNION ALL SELECT 2, 'requisicao_itens', count(*)::text FROM public.requisicao_itens
    UNION ALL SELECT 3, 'reposicao_itens',  count(*)::text FROM public.reposicao_itens
    UNION ALL SELECT 4, 'historico',        count(*)::text FROM public.historico
    UNION ALL SELECT 5, 'itens (catálogo)', count(*)::text FROM public.itens
    UNION ALL SELECT 6, 'usuarios',         count(*)::text FROM public.usuarios
    UNION ALL
    SELECT 7, 'próxima requisição',
           'REQ #' || (CASE WHEN is_called THEN last_value + 1 ELSE last_value END)::text
      FROM public.requisicoes_codigo_requisicao_seq
) AS conferencia
ORDER BY ordem;
