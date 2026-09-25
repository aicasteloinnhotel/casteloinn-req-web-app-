-- ============================================================================
--  RELATÓRIO — Entregues que ainda não foram lançadas no TOTVS
-- ============================================================================
--
--  Só LÊ. A mesma lista do filtro "A lançar" da tela de Requisições, mas com
--  quantos dias cada uma está esperando — as mais antigas primeiro.
--  Bom para o fechamento do mês: o que aparecer aqui ainda não baixou estoque.
--
--  RUPTURA_TOTAL não entra: nada saiu do almoxarifado (tudo foi para a
--  complementar, que aparece aqui quando for entregue).
-- ============================================================================

SELECT r.codigo_requisicao                                                       AS "Nº",
       to_char(r.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')      AS data,
       r.departamento                                                            AS destino,
       coalesce(u.nome, '—')                                                     AS solicitante,
       r.status,
       (SELECT count(*) FROM public.requisicao_itens ri WHERE ri.requisicao_id = r.id) AS itens,
       ((now() AT TIME ZONE 'America/Sao_Paulo')::date
         - (r.created_at AT TIME ZONE 'America/Sao_Paulo')::date)                AS dias_sem_lancar
  FROM public.requisicoes r
  LEFT JOIN public.usuarios u ON u.id = r.usuario_id
 WHERE r.status IN ('FINALIZADA', 'RUPTURA_PARCIAL')
   AND NOT r.lancado
 ORDER BY r.created_at;
