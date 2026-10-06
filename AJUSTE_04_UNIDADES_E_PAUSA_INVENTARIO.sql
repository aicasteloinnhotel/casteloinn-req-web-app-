-- ##################################################################################
-- ▶  RODE ESTE na atualização para a versão 1.1, ANTES de subir o app no GitHub.
-- ▶  Não apaga nada. Pode rodar com o sistema em uso.
-- ##################################################################################

-- =================================================================================
--  AJUSTE 04 — Unidades por item, unidade entregue e pausa para inventário
-- =================================================================================
--
--  ✅ NÃO apaga dados. Só ACRESCENTA colunas, uma tabela e regras.
--  ✅ Seguro com o sistema em uso: a versão do app que está nos celulares hoje
--     continua funcionando normalmente depois deste script.
--  ✅ Pode ser rodado mais de uma vez.
--
--  ⚠️ ORDEM: rode ESTE script primeiro e só depois publique a versão nova do
--     app no Netlify. A versão nova precisa das colunas criadas aqui.
--
--  Rode no Supabase → SQL Editor → New query → cole tudo → RUN.
--  No fim aparece UMA tabela de conferência. Todas as linhas devem dizer "OK".
--
-- ---------------------------------------------------------------------------------
--  O QUE MUDA
-- ---------------------------------------------------------------------------------
--  1. Cada material passa a ter a LISTA de unidades em que pode ser pedido
--     (ex.: carne = UN e KG). Os itens que já existem começam com a unidade
--     que têm hoje — nada some, só passa a dar para acrescentar outras.
--  2. A linha do pedido ganha a unidade ENTREGUE: pedido "5 UN de carne",
--     entregue "6,2 KG". O que fica registrado é o que o almoxarifado entregou.
--  3. Pausa para inventário: o almoxarifado suspende a criação de requisições
--     novas e libera depois. A regra fica no banco, então vale para qualquer
--     aparelho, inclusive os que estiverem com a versão antiga aberta.
--  4. Complementar entregue pela metade fecha com o que foi entregue e gera
--     outra complementar só com o que faltou (antes ficava AGUARDANDO para
--     sempre).
-- =================================================================================


-- ---------------------------------------------------------------------------------
--  1. UNIDADES POR ITEM
-- ---------------------------------------------------------------------------------
ALTER TABLE public.itens ADD COLUMN IF NOT EXISTS unidades TEXT[];

-- Mantém "unidade" (a principal) e "unidades" (a lista) sempre coerentes:
-- maiúsculas, sem repetição, e a principal sempre na frente da lista.
-- A versão antiga do app grava só "unidade" — ela entra na lista sozinha.
CREATE OR REPLACE FUNCTION public.normalizar_unidades_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $fn_unidades$
DECLARE
    v_lista     TEXT[] := '{}';
    v_u         TEXT;
    v_principal TEXT;
BEGIN
    FOREACH v_u IN ARRAY coalesce(NEW.unidades, '{}'::text[])
    LOOP
        v_u := upper(trim(coalesce(v_u, '')));
        IF v_u <> '' AND NOT (v_u = ANY (v_lista)) THEN
            v_lista := v_lista || v_u;
        END IF;
    END LOOP;

    v_principal := upper(trim(coalesce(NEW.unidade, '')));
    IF v_principal = '' THEN
        v_principal := coalesce(v_lista[1], 'UN');
    END IF;

    NEW.unidade  := v_principal;
    NEW.unidades := array_prepend(v_principal, array_remove(v_lista, v_principal));
    RETURN NEW;
END;
$fn_unidades$;

DROP TRIGGER IF EXISTS trg_itens_unidades ON public.itens;
CREATE TRIGGER trg_itens_unidades
    BEFORE INSERT OR UPDATE OF unidade, unidades ON public.itens
    FOR EACH ROW EXECUTE FUNCTION public.normalizar_unidades_item();

-- Itens que já existem: a lista começa com a unidade de hoje (o gatilho monta).
UPDATE public.itens
   SET unidades = '{}'
 WHERE unidades IS NULL OR cardinality(unidades) = 0;

ALTER TABLE public.itens ALTER COLUMN unidades SET DEFAULT '{}';
ALTER TABLE public.itens ALTER COLUMN unidades SET NOT NULL;


-- ---------------------------------------------------------------------------------
--  2. UNIDADE ENTREGUE NA LINHA DO PEDIDO
-- ---------------------------------------------------------------------------------
-- NULL = entregue na mesma unidade em que foi pedido (todas as linhas antigas).
ALTER TABLE public.requisicao_itens ADD COLUMN IF NOT EXISTS unidade_separada TEXT;


-- ---------------------------------------------------------------------------------
--  3. PAUSA PARA INVENTÁRIO
-- ---------------------------------------------------------------------------------
-- Uma linha só (id = 1): ligado ou desligado, o motivo e quem mexeu por último.
CREATE TABLE IF NOT EXISTS public.bloqueio_requisicoes (
    id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ativo        BOOLEAN NOT NULL DEFAULT false,
    motivo       TEXT,
    alterado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    alterado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.bloqueio_requisicoes (id, ativo)
VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.bloqueio_requisicoes ENABLE ROW LEVEL SECURITY;

-- A API só LÊ a pausa. Ligar e desligar passa pela função abaixo, que confere
-- se quem pede é do Almoxarifado — um solicitante não consegue mexer nem
-- chamando a API direto, por fora da tela.
REVOKE ALL ON public.bloqueio_requisicoes FROM anon, authenticated;
GRANT SELECT ON public.bloqueio_requisicoes TO anon, authenticated;

DROP POLICY IF EXISTS bloqueio_select ON public.bloqueio_requisicoes;
CREATE POLICY bloqueio_select ON public.bloqueio_requisicoes
    FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS bloqueio_update ON public.bloqueio_requisicoes;

CREATE OR REPLACE FUNCTION public.definir_bloqueio_requisicoes(
    p_usuario_id UUID,
    p_ativo      BOOLEAN,
    p_motivo     TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn_definir_bloqueio$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.usuarios
         WHERE id = p_usuario_id AND perfil = 'ALMOXARIFADO' AND ativo
    ) THEN
        RAISE EXCEPTION 'Só o Almoxarifado pode pausar ou liberar as requisições.'
            USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.bloqueio_requisicoes
       SET ativo        = p_ativo,
           motivo       = CASE WHEN p_ativo THEN nullif(trim(coalesce(p_motivo, '')), '') END,
           alterado_por = p_usuario_id,
           alterado_em  = now()
     WHERE id = 1;
END;
$fn_definir_bloqueio$;

GRANT EXECUTE ON FUNCTION public.definir_bloqueio_requisicoes(uuid, boolean, text) TO anon, authenticated;

-- Com a pausa ligada, o banco recusa requisição NOVA (status PENDENTE).
-- A complementar, criada pelo próprio sistema na ruptura, nasce AGUARDANDO e
-- continua sendo criada normalmente. Editar pedido que já existe também segue.
CREATE OR REPLACE FUNCTION public.barrar_requisicao_durante_bloqueio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn_bloqueio$
DECLARE
    v_motivo TEXT;
BEGIN
    IF NEW.status = 'PENDENTE' THEN
        SELECT coalesce(nullif(trim(motivo), ''), 'inventário em andamento')
          INTO v_motivo
          FROM public.bloqueio_requisicoes
         WHERE id = 1 AND ativo;

        IF FOUND THEN
            RAISE EXCEPTION 'Novas requisições estão suspensas no momento (%). Tente novamente mais tarde.', v_motivo
                USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$fn_bloqueio$;

DROP TRIGGER IF EXISTS trg_bloqueio_requisicoes ON public.requisicoes;
CREATE TRIGGER trg_bloqueio_requisicoes
    BEFORE INSERT ON public.requisicoes
    FOR EACH ROW EXECUTE FUNCTION public.barrar_requisicao_durante_bloqueio();

-- Realtime: ligar/desligar a pausa aparece na hora em todos os aparelhos.
DO $realtime$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (
           SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
              AND tablename = 'bloqueio_requisicoes')
    THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.bloqueio_requisicoes;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'AVISO: não foi possível ligar o Realtime da pausa (%). Ligue pelo painel em Database → Replication.', SQLERRM;
END
$realtime$;


-- ---------------------------------------------------------------------------------
--  4. COMPLEMENTAR DA COMPLEMENTAR
-- ---------------------------------------------------------------------------------
-- Antes, uma complementar entregue pela metade ficava AGUARDANDO para sempre:
-- cada nova tentativa regravava a mesma requisição (outro termo, outras
-- assinaturas) e ela nunca fechava nem podia ser lançada no TOTVS.
--
-- Agora ela fecha como qualquer requisição (RUPTURA_PARCIAL) com o que foi
-- entregue, e o que faltou vai para uma complementar NOVA. A falta que já
-- estava na lista de reposição MUDA para a nova — com a quantidade que ainda
-- falta, e mantendo urgência, "já pedido ao fornecedor" e a data em que entrou
-- na lista. Nada duplica e nada some.
--
-- Mesma assinatura de antes: a versão do app que está nos celulares continua
-- chamando a função do mesmo jeito, e para requisição comum nada muda.
CREATE OR REPLACE FUNCTION public.processar_ruptura(
    p_requisicao_origem_id UUID,
    p_novo_status          TEXT,
    p_itens                JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn_ruptura$
DECLARE
    v_origem  public.requisicoes%ROWTYPE;
    v_nova_id UUID;
    v_item    JSONB;
    v_item_id UUID;
    v_qtd     NUMERIC;
    v_unid    TEXT;
    v_rep_id  UUID;
    v_total   INT := 0;
BEGIN
    SELECT * INTO v_origem FROM public.requisicoes WHERE id = p_requisicao_origem_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Requisição de origem % não encontrada.', p_requisicao_origem_id;
    END IF;

    -- 1. Fecha a requisição de origem e solta a trava de separação.
    UPDATE public.requisicoes
       SET status    = p_novo_status,
           locked_by = NULL,
           locked_at = NULL
     WHERE id = p_requisicao_origem_id;

    -- 2. Cria a complementar (só se houver item em falta válido; senão é
    --    desfeita no passo 4).
    IF p_itens IS NOT NULL AND jsonb_array_length(p_itens) > 0 THEN
        INSERT INTO public.requisicoes
            (requisicao_origem_id, usuario_id, departamento, status, observacao)
        VALUES (
            p_requisicao_origem_id,
            v_origem.usuario_id,
            v_origem.departamento,
            'AGUARDANDO',
            'Complementar gerada automaticamente por ruptura da REQ #'
                || coalesce(v_origem.codigo_requisicao::text, '?')
        )
        RETURNING id INTO v_nova_id;

        -- 3. Cada falta: linha na complementar + lugar na lista de reposição,
        --    na unidade em que foi pedida.
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
        LOOP
            v_item_id := nullif(v_item->>'item_id', '')::uuid;
            v_qtd     := coalesce((v_item->>'quantidade')::numeric, 0);
            v_unid    := nullif(upper(trim(coalesce(v_item->>'unidade', ''))), '');

            CONTINUE WHEN v_item_id IS NULL OR v_qtd <= 0;

            INSERT INTO public.requisicao_itens (requisicao_id, item_id, quantidade, unidade)
            VALUES (v_nova_id, v_item_id, v_qtd, v_unid);

            -- A origem já era complementar e o material já estava na lista de
            -- reposição? Então a mesma linha passa para a nova complementar.
            SELECT id INTO v_rep_id
              FROM public.reposicao_itens
             WHERE requisicao_id = p_requisicao_origem_id
               AND item_id = v_item_id
               AND NOT resolvido
               AND (unidade IS NOT DISTINCT FROM v_unid OR unidade IS NULL OR v_unid IS NULL)
             ORDER BY (unidade IS NOT DISTINCT FROM v_unid) DESC, created_at
             LIMIT 1;

            IF v_rep_id IS NOT NULL THEN
                UPDATE public.reposicao_itens
                   SET requisicao_id = v_nova_id,
                       quantidade    = v_qtd,
                       unidade       = coalesce(v_unid, unidade)
                 WHERE id = v_rep_id;
            ELSE
                INSERT INTO public.reposicao_itens
                    (item_id, quantidade, tipo_origem, requisicao_id, resolvido, unidade)
                VALUES (v_item_id, v_qtd, 'RUPTURA', v_nova_id, false, v_unid);
            END IF;

            v_total := v_total + 1;
        END LOOP;

        -- 4. Nenhum item válido: desfaz a complementar vazia.
        IF v_total = 0 THEN
            DELETE FROM public.requisicoes WHERE id = v_nova_id;
            v_nova_id := NULL;
        END IF;
    END IF;

    -- 5. A origem fechou: o que ainda estava pendente dela na lista de
    --    reposição foi entregue agora (a tela já deu baixa com o nome de quem
    --    entregou). Sobra nenhuma linha presa a uma requisição encerrada.
    UPDATE public.reposicao_itens
       SET resolvido    = true,
           resolvido_em = coalesce(resolvido_em, now())
     WHERE requisicao_id = p_requisicao_origem_id
       AND NOT resolvido;

    IF v_nova_id IS NULL THEN
        RETURN NULL;
    END IF;

    -- 6. Registra nas duas pontas, para a auditoria fechar.
    INSERT INTO public.historico (requisicao_id, acao, observacao)
    VALUES (
        p_requisicao_origem_id,
        'RUPTURA_GEROU_COMPLEMENTAR',
        format('Gerada requisição complementar com %s item(ns) em falta.', v_total)
    );

    INSERT INTO public.historico (requisicao_id, acao, observacao)
    VALUES (
        v_nova_id,
        'CRIADA',
        format('Complementar criada automaticamente a partir da REQ #%s.',
               coalesce(v_origem.codigo_requisicao::text, '?'))
    );

    RETURN v_nova_id;
END;
$fn_ruptura$;

GRANT EXECUTE ON FUNCTION public.processar_ruptura(uuid, text, jsonb) TO anon, authenticated;


-- ---------------------------------------------------------------------------------
--  5. RECARREGA O CACHE DA API
-- ---------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';


-- =================================================================================
--  CONFERÊNCIA — todas as linhas devem dizer OK
-- =================================================================================
SELECT ordem, verificacao, resultado, situacao
FROM (
    SELECT 1 AS ordem,
           'Itens com lista de unidades'::text AS verificacao,
           (SELECT count(*) FROM public.itens WHERE cardinality(unidades) > 0)::text
             || ' de ' || (SELECT count(*) FROM public.itens)::text AS resultado,
           CASE WHEN NOT EXISTS (SELECT 1 FROM public.itens WHERE cardinality(unidades) = 0)
                THEN 'OK' ELSE 'FALHOU' END AS situacao

    UNION ALL
    SELECT 2, 'Unidade principal dentro da lista',
           (SELECT count(*) FROM public.itens WHERE unidades[1] IS DISTINCT FROM unidade)::text || ' fora',
           CASE WHEN NOT EXISTS (SELECT 1 FROM public.itens WHERE unidades[1] IS DISTINCT FROM unidade)
                THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 3, 'Coluna da unidade entregue',
           CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                              WHERE table_schema = 'public' AND table_name = 'requisicao_itens'
                                AND column_name = 'unidade_separada')
                THEN 'existe' ELSE 'não existe' END,
           CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns
                              WHERE table_schema = 'public' AND table_name = 'requisicao_itens'
                                AND column_name = 'unidade_separada')
                THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 4, 'Pausa para inventário',
           coalesce((SELECT CASE WHEN ativo THEN 'LIGADA' ELSE 'desligada' END
                       FROM public.bloqueio_requisicoes WHERE id = 1), 'tabela sem a linha'),
           CASE WHEN EXISTS (SELECT 1 FROM public.bloqueio_requisicoes WHERE id = 1)
                THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 9, 'Complementar da complementar',
           CASE WHEN coalesce(pg_get_functiondef(to_regprocedure('public.processar_ruptura(uuid,text,jsonb)')), '') LIKE '%v_rep_id%'
                THEN 'falta muda para a nova complementar' ELSE 'função antiga' END,
           CASE WHEN coalesce(pg_get_functiondef(to_regprocedure('public.processar_ruptura(uuid,text,jsonb)')), '') LIKE '%v_rep_id%'
                THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 8, 'Só o Almoxarifado mexe na pausa',
           CASE WHEN has_table_privilege('anon', 'public.bloqueio_requisicoes', 'UPDATE')
                THEN 'a API ainda altera direto' ELSE 'só pela função, com conferência do perfil' END,
           CASE WHEN NOT has_table_privilege('anon', 'public.bloqueio_requisicoes', 'UPDATE')
                 AND to_regprocedure('public.definir_bloqueio_requisicoes(uuid,boolean,text)') IS NOT NULL
                THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 5, 'Gatilhos novos (unidades e pausa)',
           count(*)::text || ' de 2',
           CASE WHEN count(*) = 2 THEN 'OK' ELSE 'FALHOU' END
      FROM pg_trigger
     WHERE tgname IN ('trg_itens_unidades', 'trg_bloqueio_requisicoes')
       AND NOT tgisinternal

    UNION ALL
    SELECT 6, 'Realtime da pausa',
           CASE WHEN EXISTS (SELECT 1 FROM pg_publication_tables
                              WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                                AND tablename = 'bloqueio_requisicoes')
                THEN 'ligado' ELSE 'desligado' END,
           CASE WHEN EXISTS (SELECT 1 FROM pg_publication_tables
                              WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                                AND tablename = 'bloqueio_requisicoes')
                THEN 'OK' ELSE 'ATENCAO' END

    UNION ALL
    SELECT 7, 'Dados preservados',
           (SELECT count(*) FROM public.requisicoes)::text || ' requisições, '
             || (SELECT count(*) FROM public.itens)::text || ' itens, '
             || (SELECT count(*) FROM public.usuarios)::text || ' usuários',
           'OK'
) AS conferencia
ORDER BY ordem;

-- =================================================================================
--  FIM
-- =================================================================================
