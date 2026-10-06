-- ##################################################################################
-- ✅  JÁ APLICADO no banco em produção (setembro de 2026). NÃO precisa rodar de novo.
-- ✅  Fica guardado como histórico. Se rodar por engano, não estraga nada.
-- ##################################################################################

-- ============================================================================
--  AJUSTE 02 — Lançamento no TOTVS, termo de recebimento e unidade por item
-- ============================================================================
--
--  NÃO É DESTRUTIVO. Nenhum dado existente é apagado ou alterado.
--  Só adiciona colunas novas. Pode ser executado mais de uma vez sem problema.
--
--  Rode no  Supabase → SQL Editor → New query → Run.
--
--  O que este script adiciona:
--
--   1. requisicoes.lancado / lancado_em / lancado_por
--         Marca se a requisição já foi lançada no TOTVS. O fluxo só termina
--         de verdade aqui, não em FINALIZADA.
--
--   2. requisicoes.termo_aceito_em / termo_versao
--         Registra que o solicitante leu e aceitou os termos de recebimento
--         antes de assinar. Vai para o PDF.
--
--   3. requisicao_itens.unidade
--         Unidade escolhida na hora do pedido (UN, CX, L, KG...). Quando fica
--         NULL, o app usa a unidade cadastrada no catálogo do item.
--
-- ============================================================================


-- 1. LANÇAMENTO NO TOTVS ------------------------------------------------------
ALTER TABLE public.requisicoes
    ADD COLUMN IF NOT EXISTS lancado     BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS lancado_em  TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS lancado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL;

-- O filtro "Lançadas / Não lançadas" da tela de Requisições usa esta coluna.
CREATE INDEX IF NOT EXISTS idx_requisicoes_lancado ON public.requisicoes(lancado);


-- 2. TERMO DE RECEBIMENTO -----------------------------------------------------
-- termo_aceito_em preenchido = o solicitante aceitou. A versão fica gravada
-- junto para que, se o texto do termo mudar um dia, as entregas antigas
-- continuem dizendo qual texto foi aceito naquele momento.
ALTER TABLE public.requisicoes
    ADD COLUMN IF NOT EXISTS termo_aceito_em TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS termo_versao    TEXT;


-- 3. UNIDADE POR ITEM DA REQUISIÇÃO -------------------------------------------
-- NULL de propósito nas linhas antigas: o app cai na unidade do catálogo,
-- exatamente como fazia antes deste ajuste.
ALTER TABLE public.requisicao_itens
    ADD COLUMN IF NOT EXISTS unidade TEXT;


-- 4. RECARREGAR O CACHE DA API ------------------------------------------------
-- Sem isto o PostgREST continua respondendo com o formato antigo por alguns
-- minutos e o app reclama que as colunas não existem.
NOTIFY pgrst, 'reload schema';


-- ============================================================================
--  CONFERÊNCIA — deve retornar 6 linhas, todas com OK
-- ============================================================================
SELECT
    t.tabela || '.' || t.coluna            AS "coluna",
    COALESCE(c.data_type, '— AUSENTE —')   AS "tipo",
    CASE WHEN c.column_name IS NULL THEN 'FALHOU' ELSE 'OK' END AS "situacao"
FROM (VALUES
        ('requisicoes',      'lancado'),
        ('requisicoes',      'lancado_em'),
        ('requisicoes',      'lancado_por'),
        ('requisicoes',      'termo_aceito_em'),
        ('requisicoes',      'termo_versao'),
        ('requisicao_itens', 'unidade')
     ) AS t(tabela, coluna)
LEFT JOIN information_schema.columns c
       ON c.table_schema = 'public'
      AND c.table_name   = t.tabela
      AND c.column_name  = t.coluna
ORDER BY t.tabela, t.coluna;
