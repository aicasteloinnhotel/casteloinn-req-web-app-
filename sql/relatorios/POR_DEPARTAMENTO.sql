-- ============================================================================
--  RELATÓRIO — Requisições por setor
-- ============================================================================
--
--  Só LÊ. Uma linha por setor, de quem mais pede para quem menos pede.
--  Complementares não entram: são a continuação de um pedido, não um pedido novo.
--
--  PERÍODO: por padrão, o mês atual. Para outro período, troque as duas
--  datas em "parametros", por exemplo:
--      SELECT date '2026-09-01' AS inicio, date '2026-09-30' AS fim
-- ============================================================================

WITH parametros AS (
    SELECT date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')::date                            AS inicio,
           (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') + interval '1 month - 1 day')::date AS fim
),
linhas_por_requisicao AS (
    SELECT requisicao_id, count(*) AS linhas
      FROM public.requisicao_itens
     GROUP BY requisicao_id
)
SELECT r.departamento                                                               AS setor,
       count(*)                                                                     AS requisicoes,
       count(*) FILTER (WHERE r.status IN ('FINALIZADA','RUPTURA_PARCIAL','RUPTURA_TOTAL')) AS entregues,
       count(*) FILTER (WHERE r.status IN ('RUPTURA_PARCIAL','RUPTURA_TOTAL'))       AS com_falta,
       count(*) FILTER (WHERE r.status = 'CANCELADA')                                AS canceladas,
       count(*) FILTER (WHERE r.status IN ('PENDENTE','SEPARANDO','AGUARDANDO'))     AS em_aberto,
       count(DISTINCT r.usuario_id)                                                 AS solicitantes,
       coalesce(sum(l.linhas), 0)                                                   AS linhas_de_material
  FROM public.requisicoes r
 CROSS JOIN parametros p
  LEFT JOIN linhas_por_requisicao l ON l.requisicao_id = r.id
 WHERE r.requisicao_origem_id IS NULL
   AND (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN p.inicio AND p.fim
 GROUP BY r.departamento
 ORDER BY requisicoes DESC, setor;
