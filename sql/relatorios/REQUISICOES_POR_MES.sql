-- ============================================================================
--  RELATÓRIO — Requisições por mês
-- ============================================================================
--
--  Só LÊ. Uma linha por mês, do mais recente para o mais antigo.
--
--  pedidos            requisições abertas pelos setores
--  complementares     geradas automaticamente quando faltou material
--  com_falta          entregues com ruptura parcial ou total
--  em_aberto          pendentes, em separação ou aguardando reposição
--  a_lancar           entregues que ainda não foram lançadas no TOTVS
--                     (ruptura total não conta: nada saiu do almoxarifado)
--  horas_ate_entrega  média, do pedido até a entrega (só pedidos, não complementares)
--
--  Datas no horário de Brasília.
-- ============================================================================

WITH req AS (
    SELECT r.id,
           r.status,
           r.lancado,
           r.requisicao_origem_id,
           r.created_at,
           date_trunc('month', r.created_at AT TIME ZONE 'America/Sao_Paulo') AS mes
      FROM public.requisicoes r
),
entrega AS (
    -- Momento da entrega = primeiro registro de finalização no histórico.
    SELECT h.requisicao_id, min(h.created_at) AS entregue_em
      FROM public.historico h
     WHERE h.acao IN ('STATUS_ALTERADO_FINALIZADA', 'RUPTURA_GEROU_COMPLEMENTAR',
                      'RUPTURA_PARCIAL', 'RUPTURA_TOTAL')
     GROUP BY h.requisicao_id
)
SELECT to_char(req.mes, 'MM/YYYY')                                                   AS mes,
       count(*)                                                                      AS total,
       count(*) FILTER (WHERE req.requisicao_origem_id IS NULL)                      AS pedidos,
       count(*) FILTER (WHERE req.requisicao_origem_id IS NOT NULL)                  AS complementares,
       count(*) FILTER (WHERE req.status = 'FINALIZADA')                             AS finalizadas,
       count(*) FILTER (WHERE req.status IN ('RUPTURA_PARCIAL','RUPTURA_TOTAL'))     AS com_falta,
       count(*) FILTER (WHERE req.status = 'CANCELADA')                              AS canceladas,
       count(*) FILTER (WHERE req.status IN ('PENDENTE','SEPARANDO','AGUARDANDO'))   AS em_aberto,
       count(*) FILTER (WHERE req.lancado)                                           AS lancadas_totvs,
       count(*) FILTER (WHERE req.status IN ('FINALIZADA','RUPTURA_PARCIAL')
                          AND NOT req.lancado)                                       AS a_lancar,
       round((avg(extract(epoch FROM (e.entregue_em - req.created_at)) / 3600)
                FILTER (WHERE req.requisicao_origem_id IS NULL))::numeric, 1)        AS horas_ate_entrega
  FROM req
  LEFT JOIN entrega e ON e.requisicao_id = req.id
 GROUP BY req.mes
 ORDER BY req.mes DESC;
