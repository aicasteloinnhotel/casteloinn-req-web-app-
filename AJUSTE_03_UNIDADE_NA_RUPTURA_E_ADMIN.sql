-- ##################################################################################
-- ✅  JÁ APLICADO no banco em produção (setembro de 2026). NÃO precisa rodar de novo.
-- ✅  Fica guardado como histórico. Se rodar por engano, não estraga nada.
-- ##################################################################################

-- ============================================================================
--  AJUSTE 03 — Unidade na ruptura e proteção do último Almoxarifado
-- ============================================================================
--
--  NÃO É DESTRUTIVO. Nenhum dado existente é apagado.
--  Pode ser executado mais de uma vez sem problema.
--
--  Rode no  Supabase → SQL Editor → New query → Run,  ANTES de publicar a
--  versão nova do app.
--
--  O que corrige:
--
--   1. UNIDADE PERDIDA NA RUPTURA
--      Desde o ajuste 02 cada linha do pedido tem a sua unidade (10 UN, 2 CX).
--      Mas quando faltava material, a função processar_ruptura criava a
--      requisição complementar e a entrada da lista de reposição SEM a unidade,
--      e as duas caíam na unidade do catálogo: um pedido de "10 UN" de
--      detergente virava "10 L" na complementar e na lista de compras.
--
--   2. SISTEMA SEM ADMINISTRADOR
--      Era possível apagar, desativar ou rebaixar o último usuário do
--      Almoxarifado — inclusive o próprio usuário logado. Aí ninguém mais
--      conseguia cadastrar gente nem administrar o sistema. O banco agora recusa.
-- ============================================================================


-- 1. UNIDADE NA LISTA DE REPOSIÇÃO ---------------------------------------------
-- NULL nas linhas antigas: o app usa a unidade do catálogo, como antes.
ALTER TABLE public.reposicao_itens
    ADD COLUMN IF NOT EXISTS unidade TEXT;


-- 2. processar_ruptura LEVANDO A UNIDADE ---------------------------------------
-- Mesma assinatura de antes (uuid, text, jsonb): as permissões continuam valendo.
-- Cada item de p_itens agora pode trazer "unidade": { item_id, quantidade, unidade }.
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

    -- 2. Sem itens em falta não há complementar a criar.
    IF p_itens IS NULL OR jsonb_array_length(p_itens) = 0 THEN
        RETURN NULL;
    END IF;

    -- 3. Cria a requisição complementar, que nasce AGUARDANDO reposição.
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

    -- 4. Itens faltantes na complementar + entrada na lista de reposição,
    --    os dois com a unidade em que o material foi pedido.
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens)
    LOOP
        v_item_id := nullif(v_item->>'item_id', '')::uuid;
        v_qtd     := coalesce((v_item->>'quantidade')::numeric, 0);
        v_unid    := nullif(upper(trim(coalesce(v_item->>'unidade', ''))), '');

        CONTINUE WHEN v_item_id IS NULL OR v_qtd <= 0;

        INSERT INTO public.requisicao_itens (requisicao_id, item_id, quantidade, unidade)
        VALUES (v_nova_id, v_item_id, v_qtd, v_unid);

        INSERT INTO public.reposicao_itens
            (item_id, quantidade, tipo_origem, requisicao_id, resolvido, unidade)
        VALUES (v_item_id, v_qtd, 'RUPTURA', v_nova_id, false, v_unid);

        v_total := v_total + 1;
    END LOOP;

    -- 5. Nenhum item válido: desfaz a complementar vazia.
    IF v_total = 0 THEN
        DELETE FROM public.requisicoes WHERE id = v_nova_id;
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


-- 3. NUNCA FICAR SEM ALMOXARIFADO ATIVO ------------------------------------------
-- Recusa apagar, desativar ou rebaixar para SOLICITANTE o último usuário do
-- Almoxarifado que está ativo. Vale para qualquer caminho: tela do app, API
-- direta ou SQL.
CREATE OR REPLACE FUNCTION public.garantir_almoxarifado_ativo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn_admin$
DECLARE
    v_deixa_de_ser BOOLEAN := false;
BEGIN
    IF OLD.perfil = 'ALMOXARIFADO' AND OLD.ativo THEN
        -- IFs separados de propósito: em DELETE o NEW não existe.
        IF TG_OP = 'DELETE' THEN
            v_deixa_de_ser := true;
        ELSE
            v_deixa_de_ser := (NEW.perfil <> 'ALMOXARIFADO' OR NOT NEW.ativo);
        END IF;

        IF v_deixa_de_ser AND NOT EXISTS (
            SELECT 1 FROM public.usuarios
             WHERE id <> OLD.id
               AND perfil = 'ALMOXARIFADO'
               AND ativo
        ) THEN
            RAISE EXCEPTION 'O sistema precisa de pelo menos um usuário do Almoxarifado ativo.'
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$fn_admin$;

DROP TRIGGER IF EXISTS trg_garantir_almoxarifado ON public.usuarios;
CREATE TRIGGER trg_garantir_almoxarifado
    BEFORE UPDATE OF perfil, ativo OR DELETE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.garantir_almoxarifado_ativo();


-- 4. RECARREGAR O CACHE DA API ---------------------------------------------------
NOTIFY pgrst, 'reload schema';


-- ============================================================================
--  CONFERÊNCIA — deve retornar 4 linhas, todas com OK
-- ============================================================================
SELECT ordem, verificacao, situacao
FROM (
    SELECT 1 AS ordem,
           'reposicao_itens.unidade criada' AS verificacao,
           CASE WHEN EXISTS (
               SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'reposicao_itens'
                  AND column_name = 'unidade'
           ) THEN 'OK' ELSE 'FALHOU' END AS situacao

    UNION ALL
    SELECT 2, 'processar_ruptura grava a unidade',
           CASE WHEN pg_get_functiondef('public.processar_ruptura(uuid,text,jsonb)'::regprocedure)
                     LIKE '%v_unid%'
                THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 3, 'Proteção do último Almoxarifado ligada',
           CASE WHEN EXISTS (
               SELECT 1 FROM pg_trigger
                WHERE tgname = 'trg_garantir_almoxarifado' AND NOT tgisinternal
           ) THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 4, 'Existe Almoxarifado ativo',
           CASE WHEN EXISTS (
               SELECT 1 FROM public.usuarios WHERE perfil = 'ALMOXARIFADO' AND ativo
           ) THEN 'OK' ELSE 'FALHOU' END
) AS conferencia
ORDER BY ordem;
