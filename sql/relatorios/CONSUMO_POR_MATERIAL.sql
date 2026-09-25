-- ============================================================================
--  RELATÓRIO — Consumo por material (o que de fato saiu do almoxarifado)
-- ============================================================================
--
--  Só LÊ. Útil para planejar compras e para conferir com o estoque do TOTVS.
--
--  Conta a quantidade ENTREGUE (separada), não a pedida — e só de requisições
--  entregues. O que faltou e foi entregue depois pela complementar entra quando
--  a complementar é finalizada, sem contar duas vezes.
--
--  Unidades diferentes do mesmo material saem em linhas separadas: 3 UN e
--  2 CX não são "5 de alguma coisa".
--
--  PERÍODO: por padrão, o mês atual. Para outro período, troque as duas
--  datas em "parametros", por exemplo:
--      SELECT date '2026-09-01' AS inicio, date '2026-09-30' AS fim
-- ============================================================================

WITH parametros AS (
    SELECT date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date                            AS inicio,
           (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 month - 1 day')::date AS fim
),
linhas AS (
    SELECT ri.item_id,
           r.id           AS requisicao_id,
           r.departamento,
           upper(coalesce(nullif(trim(ri.unidade), ''), nullif(trim(i.unidade), ''), 'UN')) AS unidade,
           coalesce(ri.quantidade_separada, 0) AS entregue
      FROM public.requisicao_itens ri
      JOIN public.requisicoes r ON r.id = ri.requisicao_id
      JOIN public.itens       i ON i.id = ri.item_id
     CROSS JOIN parametros p
     WHERE r.status IN ('FINALIZADA', 'RUPTURA_PARCIAL', 'RUPTURA_TOTAL')
       AND (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p.inicio AND p.fim
)
SELECT regexp_replace(i.nome, '^\[EXCLUIDO\]\s*', '')  AS material,
       l.unidade,
       sum(l.entregue)                                 AS quantidade_entregue,
       count(DISTINCT l.requisicao_id)                 AS requisicoes,
       count(DISTINCT l.departamento)                  AS setores
  FROM linhas l
  JOIN public.itens i ON i.id = l.item_id
 GROUP BY i.nome, l.unidade
 ORDER BY quantidade_entregue DESC, material;
