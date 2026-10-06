-- ##################################################################################
-- ⛔  NÃO RODE ESTE SCRIPT NO BANCO QUE ESTÁ EM USO. ELE APAGA TUDO.
-- ⛔  Serve só para GUARDAR: montar um projeto Supabase NOVO, do zero.
-- ⛔  Para atualizar o banco em uso, rode apenas o AJUSTE que a versão pedir.
-- ##################################################################################

-- =================================================================================
--  BANCO DEFINITIVO — Sistema de Requisições / Almoxarifado  •  Castelo Inn
-- =================================================================================
--
--  ⚠️  ESTE SCRIPT APAGA TODOS OS DADOS ATUAIS.
--      Requisições, itens, usuários, históricos e assinaturas são destruídos
--      e as tabelas recriadas do zero. Rode apenas porque a implantação vai
--      começar com base limpa.
--
--  ⚠️  ORDEM: rode este script ANTES do deploy da nova versão do app.
--      O login passa a ser feito por uma função dentro do banco. A versão antiga
--      do app não loga depois deste script; a nova não loga antes dele.
--
--  Como usar: Supabase → SQL Editor → New query → cole tudo → RUN.
--  No fim aparece UMA tabela de conferência. Todas as linhas devem dizer "OK".
--
--  Ordem interna (importa): tudo que é essencial roda primeiro e o usuário de
--  acesso é criado antes das partes opcionais (Storage e Realtime), que são
--  tolerantes a falha. Assim, mesmo que o projeto tenha alguma restrição de
--  permissão, você nunca fica sem conseguir entrar no sistema.
-- =================================================================================


-- ---------------------------------------------------------------------------------
--  1. EXTENSÕES
-- ---------------------------------------------------------------------------------
-- pgcrypto fornece crypt() e gen_salt(), usados no hash das senhas.
-- Se já existir (no schema "extensions", padrão do Supabase), não faz nada.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ---------------------------------------------------------------------------------
--  2. LIMPEZA
-- ---------------------------------------------------------------------------------
-- Remove QUALQUER versão anterior destas funções, seja qual for a assinatura.
-- Apagar só a assinatura esperada deixaria uma versão antiga viva e a chamada
-- ficaria ambígua ("function is not unique"), quebrando a ruptura.
DO $limpeza$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS assinatura
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname IN ('processar_ruptura', 'login_usuario', 'hash_senha_usuario',
                             'garantir_almoxarifado_ativo', 'normalizar_unidades_item',
                             'barrar_requisicao_durante_bloqueio', 'definir_bloqueio_requisicoes')
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', r.assinatura);
    END LOOP;
END
$limpeza$;

DROP TABLE IF EXISTS public.bloqueio_requisicoes CASCADE;
DROP TABLE IF EXISTS public.historico        CASCADE;
DROP TABLE IF EXISTS public.reposicao_itens  CASCADE;
DROP TABLE IF EXISTS public.requisicao_itens CASCADE;
DROP TABLE IF EXISTS public.requisicoes      CASCADE;
DROP TABLE IF EXISTS public.itens            CASCADE;
DROP TABLE IF EXISTS public.usuarios         CASCADE;


-- ---------------------------------------------------------------------------------
--  3. TABELAS
-- ---------------------------------------------------------------------------------

-- 3.1 USUÁRIOS -------------------------------------------------------------------
-- A coluna "senha" guarda o HASH bcrypt, nunca o texto digitado. O app continua
-- enviando a senha em texto ao cadastrar; um trigger faz o hash antes de gravar.
CREATE TABLE public.usuarios (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome         TEXT NOT NULL,
    senha        TEXT NOT NULL,
    departamento TEXT NOT NULL,
    perfil       TEXT NOT NULL CHECK (perfil IN ('SOLICITANTE', 'ALMOXARIFADO')),
    ativo        BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Login é por nome: "Maria" e "maria" não podem coexistir.
CREATE UNIQUE INDEX usuarios_nome_unico ON public.usuarios (lower(trim(nome)));


-- 3.2 ITENS (CATÁLOGO) -----------------------------------------------------------
CREATE TABLE public.itens (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome       TEXT NOT NULL,
    -- Unidade principal. Sempre igual a unidades[1] (garantido por gatilho).
    unidade    TEXT NOT NULL DEFAULT 'UN',
    -- Unidades em que o material pode ser pedido (ex.: carne = UN e KG).
    unidades   TEXT[] NOT NULL DEFAULT '{}',
    ativo      BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Evita o mesmo material cadastrado duas vezes (inclusive na importação de CSV:
-- a linha repetida passa a ser contada como "ignorada" em vez de virar cópia).
-- Para permitir nomes repetidos, comente a linha abaixo.
CREATE UNIQUE INDEX itens_nome_unico ON public.itens (lower(trim(nome)));


-- 3.3 REQUISIÇÕES ----------------------------------------------------------------
CREATE TABLE public.requisicoes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo_requisicao       BIGSERIAL UNIQUE,
    requisicao_origem_id    UUID REFERENCES public.requisicoes(id) ON DELETE SET NULL,
    usuario_id              UUID REFERENCES public.usuarios(id)    ON DELETE SET NULL,
    departamento            TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'PENDENTE'
                              CHECK (status IN ('PENDENTE','SEPARANDO','AGUARDANDO',
                                                'FINALIZADA','CANCELADA',
                                                'RUPTURA_PARCIAL','RUPTURA_TOTAL')),
    observacao              TEXT,
    impresso                BOOLEAN NOT NULL DEFAULT false,
    exportado               BOOLEAN NOT NULL DEFAULT false,
    assinatura_solicitante  TEXT,
    assinatura_almoxarifado TEXT,
    -- Quem conferiu a entrega. Faltava no banco antigo: por isso as assinaturas
    -- não gravavam e o nome do conferente sumia do PDF.
    conferente_id           UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    -- Termo de recebimento aceito pelo solicitante antes de assinar. A versão
    -- fica gravada junto: se o texto mudar, as entregas antigas continuam
    -- dizendo qual texto foi aceito naquele dia.
    termo_aceito_em         TIMESTAMPTZ,
    termo_versao            TEXT,
    -- Lançamento no TOTVS. O fluxo da requisição só termina aqui, não em
    -- FINALIZADA: finalizada é entregue, lançada é dada baixa no sistema.
    lancado                 BOOLEAN NOT NULL DEFAULT false,
    lancado_em              TIMESTAMPTZ,
    lancado_por             UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    -- Trava de separação: locked_at define a validade (TTL de 30 min no app).
    locked_by               UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    locked_at               TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 3.4 ITENS DA REQUISIÇÃO --------------------------------------------------------
CREATE TABLE public.requisicao_itens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisicao_id       UUID NOT NULL REFERENCES public.requisicoes(id) ON DELETE CASCADE,
    -- RESTRICT, e não CASCADE, de propósito: apagar um material do catálogo NÃO
    -- pode apagar o registro dele em entregas passadas já assinadas. O banco
    -- recusa; o app, por sua vez, desativa e renomeia o item em vez de apagar.
    item_id             UUID NOT NULL REFERENCES public.itens(id)       ON DELETE RESTRICT,
    -- Zero é válido: item incluído pelo almoxarife durante a separação nasce
    -- com quantidade solicitada 0 e só tem quantidade separada.
    quantidade          NUMERIC NOT NULL CHECK (quantidade >= 0),
    quantidade_separada NUMERIC CHECK (quantidade_separada IS NULL OR quantidade_separada >= 0),
    -- Unidade escolhida no pedido (UN, CX, L...). NULL = usar a unidade
    -- cadastrada no catálogo do item.
    unidade             TEXT,
    -- Unidade em que o almoxarifado ENTREGOU (pedido 5 UN, entregue 6,2 KG).
    -- NULL = entregue na mesma unidade do pedido.
    unidade_separada    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 3.5 LISTA DE REPOSIÇÃO / COMPRAS -----------------------------------------------
CREATE TABLE public.reposicao_itens (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id           UUID NOT NULL REFERENCES public.itens(id) ON DELETE CASCADE,
    quantidade        NUMERIC NOT NULL CHECK (quantidade >= 0),
    tipo_origem       TEXT NOT NULL CHECK (tipo_origem IN ('MANUAL','RUPTURA')),
    requisicao_id     UUID REFERENCES public.requisicoes(id) ON DELETE CASCADE,
    resolvido         BOOLEAN NOT NULL DEFAULT false,
    -- FK para usuarios: aceita UUID ou NULL, nunca texto. Gravar "Sistema" ou
    -- "Automação" aqui era o que derrubava a finalização das complementares.
    resolvido_por     UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    resolvido_em      TIMESTAMPTZ,
    urgente           BOOLEAN NOT NULL DEFAULT false,
    prazo_target_date BIGINT,          -- epoch em milissegundos (vem do JavaScript)
    prazo_original    TEXT,
    -- Unidade em que o material faltou (vem da linha do pedido na ruptura).
    -- NULL = unidade cadastrada no catálogo do item.
    unidade           TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 3.6 HISTÓRICO / AUDITORIA ------------------------------------------------------
CREATE TABLE public.historico (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requisicao_id UUID NOT NULL REFERENCES public.requisicoes(id) ON DELETE CASCADE,
    acao          TEXT NOT NULL,
    usuario_id    UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    observacao    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- 3.7 PAUSA PARA INVENTÁRIO ------------------------------------------------------
-- Uma linha só (id = 1). Ligada, o banco recusa requisição nova (ver 5.3).
CREATE TABLE public.bloqueio_requisicoes (
    id           SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    ativo        BOOLEAN NOT NULL DEFAULT false,
    motivo       TEXT,
    alterado_por UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    alterado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.bloqueio_requisicoes (id, ativo) VALUES (1, false);


-- ---------------------------------------------------------------------------------
--  4. ÍNDICES
-- ---------------------------------------------------------------------------------
CREATE INDEX idx_requisicoes_created_at  ON public.requisicoes (created_at DESC);
CREATE INDEX idx_requisicoes_status      ON public.requisicoes (status);
CREATE INDEX idx_requisicoes_usuario_id  ON public.requisicoes (usuario_id);
CREATE INDEX idx_requisicoes_origem_id   ON public.requisicoes (requisicao_origem_id);
CREATE INDEX idx_requisicoes_lancado     ON public.requisicoes (lancado);

CREATE INDEX idx_req_itens_requisicao_id ON public.requisicao_itens (requisicao_id);
CREATE INDEX idx_req_itens_item_id       ON public.requisicao_itens (item_id);

CREATE INDEX idx_reposicao_pendentes     ON public.reposicao_itens (item_id) WHERE resolvido = false;
CREATE INDEX idx_reposicao_requisicao_id ON public.reposicao_itens (requisicao_id);

CREATE INDEX idx_historico_requisicao    ON public.historico (requisicao_id, created_at);

CREATE INDEX idx_itens_nome              ON public.itens (nome);


-- ---------------------------------------------------------------------------------
--  5. SENHAS COM HASH (bcrypt)
-- ---------------------------------------------------------------------------------
-- O app continua mandando a senha em texto ao criar/editar usuário. Este trigger
-- converte para hash antes de gravar, então a senha original nunca fica no banco.
CREATE OR REPLACE FUNCTION public.hash_senha_usuario()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn_hash$
BEGIN
    -- Editar usuário sem informar senha mantém a senha atual.
    IF NEW.senha IS NULL OR length(trim(NEW.senha)) = 0 THEN
        IF TG_OP = 'UPDATE' THEN
            NEW.senha := OLD.senha;
            RETURN NEW;
        END IF;
        RAISE EXCEPTION 'A senha é obrigatória.';
    END IF;

    -- Já é um hash bcrypt? Não aplicar hash duas vezes.
    IF NEW.senha LIKE '$2%' AND length(NEW.senha) = 60 THEN
        RETURN NEW;
    END IF;

    NEW.senha := crypt(NEW.senha, gen_salt('bf', 10));
    RETURN NEW;
END;
$fn_hash$;

CREATE TRIGGER trg_hash_senha
    BEFORE INSERT OR UPDATE OF senha ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.hash_senha_usuario();


-- 5.1 NUNCA FICAR SEM ALMOXARIFADO ATIVO
-- Recusa apagar, desativar ou rebaixar para SOLICITANTE o último usuário do
-- Almoxarifado que está ativo. Sem isto, um toque errado na tela de Usuários
-- deixava o sistema sem ninguém para administrá-lo.
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

CREATE TRIGGER trg_garantir_almoxarifado
    BEFORE UPDATE OF perfil, ativo OR DELETE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.garantir_almoxarifado_ativo();


-- 5.2 UNIDADES DO ITEM SEMPRE COERENTES
-- Maiúsculas, sem repetição, e a principal ("unidade") sempre na frente da lista.
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

CREATE TRIGGER trg_itens_unidades
    BEFORE INSERT OR UPDATE OF unidade, unidades ON public.itens
    FOR EACH ROW EXECUTE FUNCTION public.normalizar_unidades_item();


-- 5.3 PAUSA PARA INVENTÁRIO
-- Com a pausa ligada, recusa requisição NOVA (PENDENTE). A complementar da
-- ruptura nasce AGUARDANDO e continua sendo criada.
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

CREATE TRIGGER trg_bloqueio_requisicoes
    BEFORE INSERT ON public.requisicoes
    FOR EACH ROW EXECUTE FUNCTION public.barrar_requisicao_durante_bloqueio();


-- ---------------------------------------------------------------------------------
--  6. LOGIN
-- ---------------------------------------------------------------------------------
-- Antes o app baixava a linha inteira do usuário (incluindo a senha) e comparava
-- no navegador. Agora a comparação acontece dentro do banco e a senha nunca sai.
-- O nome é tratado sem diferenciar maiúsculas e ignorando espaços sobrando.
CREATE OR REPLACE FUNCTION public.login_usuario(p_nome TEXT, p_senha TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn_login$
DECLARE
    v_user public.usuarios%ROWTYPE;
BEGIN
    SELECT * INTO v_user
      FROM public.usuarios
     WHERE lower(trim(nome)) = lower(trim(coalesce(p_nome, '')))
     LIMIT 1;

    -- Mesma mensagem para usuário inexistente e senha errada: não entregar
    -- a quem tenta adivinhar a informação de que aquele nome existe.
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Usuário ou senha inválidos.' USING ERRCODE = '28000';
    END IF;

    IF v_user.senha IS NULL OR v_user.senha <> crypt(coalesce(p_senha, ''), v_user.senha) THEN
        RAISE EXCEPTION 'Usuário ou senha inválidos.' USING ERRCODE = '28000';
    END IF;

    IF NOT v_user.ativo THEN
        RAISE EXCEPTION 'Acesso bloqueado: usuário inativo.' USING ERRCODE = '28000';
    END IF;

    RETURN jsonb_build_object(
        'id',           v_user.id,
        'nome',         v_user.nome,
        'departamento', v_user.departamento,
        'perfil',       v_user.perfil,
        'ativo',        v_user.ativo,
        'created_at',   v_user.created_at
    );
END;
$fn_login$;


-- ---------------------------------------------------------------------------------
--  7. PROCESSAR RUPTURA
-- ---------------------------------------------------------------------------------
-- Chamada pela tela de Separação quando a conferência fecha com item em falta.
--
--   p_requisicao_origem_id : requisição que está sendo finalizada
--   p_novo_status          : 'RUPTURA_PARCIAL' ou 'RUPTURA_TOTAL'
--   p_itens                : [{ "item_id": "...", "quantidade": 3 }, ...]
--   retorno                : id da requisição complementar criada (ou NULL)
--
-- Tudo numa transação só: ou a origem fecha, a complementar nasce e a lista de
-- reposição é alimentada, ou nada disso acontece.
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


-- ---------------------------------------------------------------------------------
--  8. PERMISSÕES E RLS
-- ---------------------------------------------------------------------------------
-- O app acessa o Supabase com a chave "anon", que fica visível no JavaScript do
-- navegador. Por isso o ponto crítico é: a coluna de senha não pode ser legível
-- pela API de jeito nenhum. Resolvemos com permissão por COLUNA.

ALTER TABLE public.usuarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisicoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requisicao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reposicao_itens  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historico        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloqueio_requisicoes ENABLE ROW LEVEL SECURITY;

-- 8.1 usuarios: leitura só das colunas seguras — "senha" fica de fora.
REVOKE ALL ON public.usuarios FROM anon, authenticated;
GRANT SELECT (id, nome, departamento, perfil, ativo, created_at)
    ON public.usuarios TO anon, authenticated;
GRANT INSERT (nome, senha, departamento, perfil, ativo)
    ON public.usuarios TO anon, authenticated;
GRANT UPDATE (nome, senha, departamento, perfil, ativo)
    ON public.usuarios TO anon, authenticated;
GRANT DELETE ON public.usuarios TO anon, authenticated;

CREATE POLICY usuarios_select ON public.usuarios FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY usuarios_insert ON public.usuarios FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY usuarios_update ON public.usuarios FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY usuarios_delete ON public.usuarios FOR DELETE TO anon, authenticated USING (true);

-- 8.2 Demais tabelas: o app opera todas elas com a mesma chave.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itens            TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisicoes      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.requisicao_itens TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reposicao_itens  TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.historico        TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

CREATE POLICY itens_all            ON public.itens            FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY requisicoes_all      ON public.requisicoes      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY requisicao_itens_all ON public.requisicao_itens FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY reposicao_itens_all  ON public.reposicao_itens  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY historico_all        ON public.historico        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Pausa para inventário: a API só LÊ. Ligar/desligar é pela função
-- definir_bloqueio_requisicoes, que confere se quem pede é do Almoxarifado.
REVOKE ALL ON public.bloqueio_requisicoes FROM anon, authenticated;
GRANT SELECT ON public.bloqueio_requisicoes TO anon, authenticated;
CREATE POLICY bloqueio_select ON public.bloqueio_requisicoes FOR SELECT TO anon, authenticated USING (true);

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

-- 8.3 Funções chamáveis pelo app.
GRANT EXECUTE ON FUNCTION public.login_usuario(text, text)            TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.processar_ruptura(uuid, text, jsonb) TO anon, authenticated;

-- NOTA DE SEGURANÇA, com todas as letras:
-- Isto protege as SENHAS — ninguém as lê, nem com a chave anon em mãos.
-- NÃO protege contra alguém que extraia a chave anon do JavaScript e escreva
-- direto na API; essa pessoa conseguiria, por exemplo, criar um usuário.
-- Fechar isso exige migrar para o Supabase Auth (login com JWT por usuário),
-- que é uma mudança maior. Para uma rede interna de hotel o risco é aceitável;
-- se um dia o app for exposto na internet aberta, vale fazer essa migração.


-- ---------------------------------------------------------------------------------
--  9. USUÁRIO INICIAL
-- ---------------------------------------------------------------------------------
-- Criado ANTES das etapas opcionais abaixo, de propósito: mesmo que Storage ou
-- Realtime não possam ser configurados por permissão do projeto, você entra.
--
-- Login: Almoxarifado    Senha: trocar123
-- >>> TROQUE ESTA SENHA no primeiro acesso, em Usuários → editar. <<<
INSERT INTO public.usuarios (nome, senha, departamento, perfil, ativo)
VALUES ('Almoxarifado', 'trocar123', 'Almoxarifado', 'ALMOXARIFADO', true);


-- ---------------------------------------------------------------------------------
--  10. STORAGE — BUCKET DAS ASSINATURAS   (tolerante a falha)
-- ---------------------------------------------------------------------------------
-- As assinaturas desenhadas na tela viram PNG guardados no Storage. Sem este
-- bucket, a entrega trava em "Erro ao salvar a imagem da assinatura".
--
-- Em alguns projetos a tabela storage.objects não aceita criação de policy pelo
-- SQL Editor. Se for o caso, o script avisa e segue — e aí você cria o bucket
-- "assinaturas" na mão pelo painel (Storage → New bucket → marcar como Public).
DO $storage$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('assinaturas', 'assinaturas', true)
    ON CONFLICT (id) DO UPDATE SET public = true;

    BEGIN
        EXECUTE 'DROP POLICY IF EXISTS assinaturas_upload ON storage.objects';
        EXECUTE 'CREATE POLICY assinaturas_upload ON storage.objects
                    FOR INSERT TO anon, authenticated
                    WITH CHECK (bucket_id = ''assinaturas'')';

        EXECUTE 'DROP POLICY IF EXISTS assinaturas_leitura ON storage.objects';
        EXECUTE 'CREATE POLICY assinaturas_leitura ON storage.objects
                    FOR SELECT TO anon, authenticated
                    USING (bucket_id = ''assinaturas'')';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'AVISO: bucket criado, mas as policies do Storage não puderam ser aplicadas (%). Confira em Storage → assinaturas → Policies.', SQLERRM;
    END;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'AVISO: não foi possível configurar o Storage automaticamente (%). Crie o bucket "assinaturas" como Public pelo painel.', SQLERRM;
END
$storage$;


-- ---------------------------------------------------------------------------------
--  11. REALTIME   (tolerante a falha)
-- ---------------------------------------------------------------------------------
-- Sem isto, as telas não se atualizam sozinhas entre os aparelhos.
DO $realtime$
DECLARE
    t TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE NOTICE 'AVISO: publicação supabase_realtime não existe. Ligue o Realtime pelo painel (Database → Replication).';
        RETURN;
    END IF;

    FOREACH t IN ARRAY ARRAY['requisicoes','requisicao_itens','reposicao_itens','historico',
                             'bloqueio_requisicoes']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'AVISO: não foi possível ligar o Realtime automaticamente (%). Ligue pelo painel em Database → Replication.', SQLERRM;
END
$realtime$;


-- ---------------------------------------------------------------------------------
--  12. RECARREGA O CACHE DA API
-- ---------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';


-- =================================================================================
--  13. CONFERÊNCIA
-- =================================================================================
--  O Supabase mostra apenas o resultado da ÚLTIMA consulta, então está tudo
--  reunido numa tabela só. Todas as linhas devem dizer OK.
--  Se alguma disser FALHOU ou ATENCAO, me mande esta tabela inteira.
-- =================================================================================
SELECT ordem, verificacao, resultado, situacao
FROM (
    SELECT 1 AS ordem,
           'Tabelas criadas' AS verificacao,
           count(*)::text || ' de 7' AS resultado,
           CASE WHEN count(*) = 7 THEN 'OK' ELSE 'FALHOU' END AS situacao
      FROM pg_tables
     WHERE schemaname = 'public'
       AND tablename IN ('usuarios','itens','requisicoes','requisicao_itens','reposicao_itens','historico',
                         'bloqueio_requisicoes')

    UNION ALL
    SELECT 2, 'RLS ligado em todas',
           count(*)::text || ' de 7',
           CASE WHEN count(*) = 7 THEN 'OK' ELSE 'FALHOU' END
      FROM pg_tables
     WHERE schemaname = 'public' AND rowsecurity = true
       AND tablename IN ('usuarios','itens','requisicoes','requisicao_itens','reposicao_itens','historico',
                         'bloqueio_requisicoes')

    UNION ALL
    SELECT 3, 'Senha gravada com hash bcrypt',
           coalesce((SELECT left(senha, 4) || '... (' || length(senha) || ' caracteres)'
                       FROM public.usuarios LIMIT 1), 'sem usuário'),
           CASE WHEN EXISTS (SELECT 1 FROM public.usuarios
                              WHERE senha LIKE '$2%' AND length(senha) = 60)
                THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 4, 'Senha do usuário inicial confere',
           'Almoxarifado / trocar123',
           CASE WHEN EXISTS (SELECT 1 FROM public.usuarios
                              WHERE lower(trim(nome)) = 'almoxarifado'
                                AND senha = extensions.crypt('trocar123', senha))
                THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 5, 'Funções criadas (login, ruptura, admin, unidades, pausa)',
           count(*)::text || ' de 6',
           CASE WHEN count(*) = 6 THEN 'OK' ELSE 'FALHOU' END
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('login_usuario','processar_ruptura','garantir_almoxarifado_ativo',
                         'normalizar_unidades_item','barrar_requisicao_durante_bloqueio',
                         'definir_bloqueio_requisicoes')

    UNION ALL
    SELECT 6, 'Coluna senha protegida da API',
           CASE WHEN has_column_privilege('anon','public.usuarios','senha','SELECT')
                THEN 'anon CONSEGUE ler a senha' ELSE 'anon não lê a senha' END,
           CASE WHEN has_column_privilege('anon','public.usuarios','senha','SELECT')
                THEN 'FALHOU' ELSE 'OK' END

    UNION ALL
    SELECT 7, 'Colunas visíveis do usuário',
           CASE WHEN has_column_privilege('anon','public.usuarios','nome','SELECT')
                THEN 'anon lê nome/perfil (necessário)' ELSE 'anon não lê nada' END,
           CASE WHEN has_column_privilege('anon','public.usuarios','nome','SELECT')
                THEN 'OK' ELSE 'FALHOU' END

    UNION ALL
    SELECT 8, 'Realtime publicando',
           count(*)::text || ' de 5',
           CASE WHEN count(*) = 5 THEN 'OK' ELSE 'ATENCAO' END
      FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
       AND tablename IN ('requisicoes','requisicao_itens','reposicao_itens','historico',
                         'bloqueio_requisicoes')

    UNION ALL
    SELECT 9, 'Bucket assinaturas (público)',
           coalesce((SELECT CASE WHEN public THEN 'criado e público'
                                 ELSE 'criado, mas NÃO público' END
                       FROM storage.buckets WHERE id = 'assinaturas'), 'não existe'),
           CASE WHEN EXISTS (SELECT 1 FROM storage.buckets
                              WHERE id = 'assinaturas' AND public)
                THEN 'OK' ELSE 'ATENCAO' END
) AS conferencia
ORDER BY ordem;

-- =================================================================================
--  FIM
-- =================================================================================
