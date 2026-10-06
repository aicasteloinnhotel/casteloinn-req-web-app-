-- ============================================================================
--  MANUTENÇÃO — Check-up do banco
-- ============================================================================
--
--  Só LÊ. Não altera nada, pode rodar quantas vezes quiser.
--
--  Mostra uma tabela única com:
--    ESTRUTURA — tudo que o app precisa existe e está configurado?
--    OPERAÇÃO  — tem algo parado que precisa de atenção?
--
--  Situação:  OK  |  FALHOU (o app pode não funcionar)  |
--             ATENCAO (funciona, mas olhe)  |  INFO (só informação)
-- ============================================================================

SELECT ordem, verificacao, resultado, situacao
FROM (

    -- ========================= ESTRUTURA =========================

    SELECT 1 AS ordem,
           'Tabelas do app'::text AS verificacao,
           count(*)::text || ' de 7' AS resultado,
           CASE WHEN count(*) = 7 THEN 'OK' ELSE 'FALHOU' END AS situacao
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename IN ('usuarios','itens','requisicoes','requisicao_itens','reposicao_itens','historico',
                         'bloqueio_requisicoes')

    UNION ALL
    SELECT 2, 'Colunas dos ajustes 02, 03 e 04',
           count(*)::text || ' de 9',
           CASE WHEN count(*) = 9 THEN 'OK' ELSE 'FALHOU' END
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (table_name::text, column_name::text) IN (
             ('requisicoes','lancado'), ('requisicoes','lancado_em'), ('requisicoes','lancado_por'),
             ('requisicoes','termo_aceito_em'), ('requisicoes','termo_versao'),
             ('requisicao_itens','unidade'), ('reposicao_itens','unidade'),
             ('itens','unidades'), ('requisicao_itens','unidade_separada'))

    UNION ALL
    SELECT 3, 'Funções do banco',
           count(*)::text || ' de 7',
           CASE WHEN count(*) = 7 THEN 'OK' ELSE 'FALHOU' END
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('login_usuario','processar_ruptura','hash_senha_usuario','garantir_almoxarifado_ativo',
                         'normalizar_unidades_item','barrar_requisicao_durante_bloqueio',
                         'definir_bloqueio_requisicoes')

    UNION ALL
    SELECT 4, 'Ruptura grava a unidade do pedido',
           CASE WHEN coalesce(pg_get_functiondef(to_regprocedure('public.processar_ruptura(uuid,text,jsonb)')), '') LIKE '%v_unid%'
                THEN 'sim' ELSE 'não (rode o AJUSTE_03)' END,
           CASE WHEN coalesce(pg_get_functiondef(to_regprocedure('public.processar_ruptura(uuid,text,jsonb)')), '') LIKE '%v_unid%'
                THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 5, 'Gatilhos (senha, admin, unidades, pausa)',
           count(*)::text || ' de 4',
           CASE WHEN count(*) = 4 THEN 'OK' ELSE 'FALHOU' END
      FROM pg_trigger
     WHERE tgname IN ('trg_hash_senha','trg_garantir_almoxarifado',
                      'trg_itens_unidades','trg_bloqueio_requisicoes')
       AND NOT tgisinternal

    UNION ALL
    SELECT 6, 'RLS ligado',
           count(*)::text || ' de 7',
           CASE WHEN count(*) = 7 THEN 'OK' ELSE 'FALHOU' END
      FROM pg_tables
     WHERE schemaname = 'public' AND rowsecurity
       AND tablename IN ('usuarios','itens','requisicoes','requisicao_itens','reposicao_itens','historico',
                         'bloqueio_requisicoes')

    UNION ALL
    SELECT 7, 'Coluna senha protegida da API',
           CASE WHEN has_column_privilege('anon','public.usuarios','senha','SELECT')
                THEN 'a chave pública CONSEGUE ler senhas' ELSE 'ninguém lê a senha pela API' END,
           CASE WHEN has_column_privilege('anon','public.usuarios','senha','SELECT')
                THEN 'FALHOU' ELSE 'OK' END

    UNION ALL
    SELECT 8, 'Todas as senhas com hash',
           count(*)::text || ' senha(s) sem hash',
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'FALHOU' END
      FROM public.usuarios
     WHERE NOT (senha LIKE '$2%' AND length(senha) = 60)

    UNION ALL
    SELECT 9, 'Apagar material não apaga entregas',
           coalesce((SELECT CASE c.confdeltype
                              WHEN 'r' THEN 'RESTRICT' WHEN 'c' THEN 'CASCADE'
                              WHEN 'a' THEN 'NO ACTION' WHEN 'n' THEN 'SET NULL'
                              ELSE c.confdeltype::text END
                       FROM pg_constraint c
                      WHERE c.conrelid  = 'public.requisicao_itens'::regclass
                        AND c.confrelid = 'public.itens'::regclass
                        AND c.contype   = 'f'
                      LIMIT 1), 'sem chave'),
           CASE WHEN EXISTS (SELECT 1 FROM pg_constraint c
                              WHERE c.conrelid  = 'public.requisicao_itens'::regclass
                                AND c.confrelid = 'public.itens'::regclass
                                AND c.contype   = 'f'
                                AND c.confdeltype = 'r')
                THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 10, 'Realtime (telas atualizam sozinhas)',
           count(*)::text || ' de 5 tabelas',
           CASE WHEN count(*) = 5 THEN 'OK' ELSE 'ATENCAO' END
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
       AND tablename IN ('requisicoes','requisicao_itens','reposicao_itens','historico',
                         'bloqueio_requisicoes')

    UNION ALL
    SELECT 11, 'Bucket de assinaturas',
           coalesce((SELECT CASE WHEN public THEN 'existe e é público' ELSE 'existe, mas NÃO é público' END
                       FROM storage.buckets WHERE id = 'assinaturas'), 'não existe'),
           CASE WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'assinaturas' AND public)
                THEN 'OK' ELSE 'FALHOU' END

    -- ========================= OPERAÇÃO =========================

    UNION ALL
    SELECT 12, 'Usuários do Almoxarifado ativos',
           count(*)::text,
           CASE WHEN count(*) >= 1 THEN 'OK' ELSE 'FALHOU' END
      FROM public.usuarios
     WHERE perfil = 'ALMOXARIFADO' AND ativo

    UNION ALL
    SELECT 13, 'Separações abandonadas (+30 min sem atividade)',
           count(*)::text || coalesce(' — REQ ' || string_agg('#' || codigo_requisicao, ', '), ''),
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'ATENCAO' END
      FROM public.requisicoes
     WHERE status = 'SEPARANDO'
       AND (locked_at IS NULL OR locked_at < now() - interval '30 minutes')

    UNION ALL
    SELECT 14, 'Pedidos pendentes há mais de 2 dias',
           count(*)::text,
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'ATENCAO' END
      FROM public.requisicoes
     WHERE status = 'PENDENTE'
       AND created_at < now() - interval '2 days'

    UNION ALL
    SELECT 15, 'Entregues e não lançadas no TOTVS há mais de 7 dias',
           count(*)::text,
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'ATENCAO' END
      FROM public.requisicoes
     WHERE status IN ('FINALIZADA','RUPTURA_PARCIAL')  -- ruptura total: nada a lançar
       AND NOT lancado
       AND created_at < now() - interval '7 days'

    UNION ALL
    SELECT 16, 'Novas requisições',
           coalesce((SELECT CASE WHEN ativo
                                 THEN 'SUSPENSAS desde ' || to_char(alterado_em AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')
                                 ELSE 'liberadas' END
                       FROM public.bloqueio_requisicoes WHERE id = 1), 'sem a pausa (rode o AJUSTE_04)'),
           CASE WHEN EXISTS (SELECT 1 FROM public.bloqueio_requisicoes WHERE id = 1 AND ativo)
                THEN 'ATENCAO' ELSE 'OK' END

    UNION ALL
    SELECT 17, 'Próxima requisição',
           'REQ #' || (CASE WHEN is_called THEN last_value + 1 ELSE last_value END)::text,
           'INFO'
      FROM public.requisicoes_codigo_requisicao_seq

) AS checkup
ORDER BY ordem;
