-- ============================================================================
--  MANUTENÇÃO — Redefinir a senha de um usuário
-- ============================================================================
--
--  Para quando alguém esquece a senha — inclusive o próprio Almoxarifado, que é
--  quem troca a senha dos outros pela tela do app.
--
--  A senha nunca pode ser "lida": o banco guarda só o hash. O caminho é sempre
--  gravar uma nova. O gatilho trg_hash_senha converte para hash sozinho.
--
--  Como usar: troque os três valores marcados com ← e rode.
-- ============================================================================

WITH parametros AS (
    SELECT 'Almoxarifado'::text        AS usuario,     -- ← nome de login do usuário
           'troque-esta-senha'::text   AS nova_senha,  -- ← senha nova (mínimo 4 caracteres)
           true                        AS reativar     -- ← true: se estiver desativado, reativa
),
alterado AS (
    UPDATE public.usuarios AS u
       SET senha = p.nova_senha,
           ativo = CASE WHEN p.reativar THEN true ELSE u.ativo END
      FROM parametros AS p
     WHERE lower(trim(u.nome)) = lower(trim(p.usuario))
       AND length(trim(p.nova_senha)) >= 4
    RETURNING u.nome,
              u.perfil,
              u.ativo,
              -- Confere na hora: a senha digitada bate com o hash gravado?
              (u.senha = extensions.crypt(p.nova_senha, u.senha)) AS senha_confere
)
SELECT CASE
         WHEN count(*) = 0          THEN 'NADA ALTERADO: usuário não encontrado ou senha com menos de 4 caracteres'
         WHEN bool_and(senha_confere) THEN 'OK: senha redefinida'
         ELSE                              'FALHOU: a senha não conferiu depois de gravada'
       END AS resultado,
       string_agg(nome || ' — ' || perfil || CASE WHEN ativo THEN ' — ativo' ELSE ' — INATIVO' END, '; ') AS usuario
  FROM alterado;
