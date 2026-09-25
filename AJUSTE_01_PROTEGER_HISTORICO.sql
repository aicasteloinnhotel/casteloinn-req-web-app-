-- =================================================================================
--  AJUSTE 01 — Proteger o histórico de entregas
-- =================================================================================
--
--  ✅ NÃO apaga dados. É seguro rodar com o sistema em uso.
--  ✅ Pode ser rodado mais de uma vez.
--
--  Rode no Supabase → SQL Editor → cole tudo → RUN.
--
-- ---------------------------------------------------------------------------------
--  O PROBLEMA (confirmado em teste no banco real)
-- ---------------------------------------------------------------------------------
--  A ligação entre requisicao_itens e itens estava como ON DELETE CASCADE.
--  Na prática: apagar um material do catálogo apagava, junto e em silêncio, o
--  registro dele em TODAS as requisições passadas — inclusive entregas já
--  conferidas e assinadas. O item simplesmente desaparecia do histórico, como
--  se nunca tivesse saído do estoque.
--
--  O aplicativo já tenta evitar isso: quando detecta que o item tem uso, ele
--  renomeia para "[EXCLUIDO] ..." e desativa, em vez de apagar. Mas isso é uma
--  regra que vive só no aplicativo. Bastava apagar pelo painel do Supabase, ou
--  uma falha na verificação, para perder registro assinado.
--
--  A CORREÇÃO: o próprio banco passa a recusar a exclusão de um material que
--  já apareceu em qualquer requisição. O caminho normal do aplicativo continua
--  igual — ele só apaga item sem uso nenhum. Isto é a rede de proteção.
-- =================================================================================


-- 1. Troca CASCADE por RESTRICT em requisicao_itens.item_id
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname  = 'requisicao_itens_item_id_fkey'
           AND conrelid = 'public.requisicao_itens'::regclass
    ) THEN
        ALTER TABLE public.requisicao_itens
            DROP CONSTRAINT requisicao_itens_item_id_fkey;
    END IF;

    ALTER TABLE public.requisicao_itens
        ADD CONSTRAINT requisicao_itens_item_id_fkey
        FOREIGN KEY (item_id) REFERENCES public.itens(id) ON DELETE RESTRICT;
END $$;


-- 2. Recarrega o cache da API
NOTIFY pgrst, 'reload schema';


-- =================================================================================
--  CONFERÊNCIA — a linha deve mostrar regra = RESTRICT
-- =================================================================================
SELECT
    'requisicao_itens.item_id' AS ligacao,
    CASE c.confdeltype
        WHEN 'c' THEN 'CASCADE (desprotegido)'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'a' THEN 'NO ACTION'
        ELSE c.confdeltype::text
    END AS regra_ao_apagar_item,
    CASE WHEN c.confdeltype = 'r' THEN 'OK' ELSE 'FALHOU' END AS situacao
  FROM pg_constraint c
 WHERE c.conname  = 'requisicao_itens_item_id_fkey'
   AND c.conrelid = 'public.requisicao_itens'::regclass;

-- =================================================================================
--  FIM
-- =================================================================================
