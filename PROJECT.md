# Sistema de Requisições — Castelo Inn

Contexto permanente do projeto. O que muda de semana para semana fica no
[STATUS.md](STATUS.md); o porquê das escolhas, no [DECISIONS.md](DECISIONS.md).

## Objetivo

Substituir o pedido de material em papel do almoxarifado do hotel. O solicitante
(governança, cozinha, manutenção…) abre a requisição no celular; o almoxarifado
separa, confere item a item, colhe as duas assinaturas na tela e gera o
comprovante em PDF. O que faltou vira lista de reposição e requisição
complementar automaticamente.

## Público

Dois perfis, e só dois:

| Perfil | Quem é | O que faz |
|---|---|---|
| `SOLICITANTE` | camareiras, cozinha, manutenção | cria e acompanha **as próprias** requisições |
| `ALMOXARIFADO` | almoxarife e diretoria | separa, entrega, administra itens/usuários, lança no TOTVS |

Uso majoritariamente em **celular**, às vezes em tablet compartilhado. O PC é
usado pelo almoxarifado e pela diretoria.

## Tecnologias

- React 19 + TypeScript + Vite 6
- Tailwind CSS v4 (+ shadcn — `src/index.css` importa `shadcn/tailwind.css`)
- React Router 7, com `React.lazy` nas telas pesadas
- Supabase: PostgREST, RLS, Realtime (`postgres_changes`), Storage
- jsPDF + jspdf-autotable (import dinâmico), react-signature-canvas
- PWA instalável (manifest + service worker simples)
- Hospedagem: GitHub → Netlify (build `npm run build`, publish `dist`)

## Arquitetura

```
src/
  contexts/AuthContext.tsx   login via RPC login_usuario; sessão em local/sessionStorage
  services/api.ts            TODAS as chamadas ao Supabase passam por aqui
  services/reposicao.ts      lista de reposição / compras
  hooks/useRequisicoesSync   lista + Realtime (só recarrega a lista)
  hooks/useAvisosEmTempoReal alarmes de pedido novo / separação iniciada, em qualquer tela
  pages/requisicoes/         Dashboard, Lista, Nova/Editar, Detalhe, Separação, Reposição
  pages/admin/               Itens, Usuários (só ALMOXARIFADO)
  pages/AjudaSobre.tsx       /ajuda — guia rápido por perfil, legenda de status, contato,
                             dados do app e do hotel (textos em lib/sobre.ts)
  components/                RequisicaoCard, StatusBadge, CampoBusca, ConviteInstalacao,
                             AtivarAvisos, QuantitySelector, RequireAlmoxarifado,
                             ErroInesperado (tela de erro do app inteiro), ui/
  lib/sobre.ts               versão, desenvolvedor, dados do hotel e telefone do suporte
  lib/                       utils (contemTexto, precisaLancar, unidades), estilos,
                             saidas (Curva ABC), instalacao (PWA), notificacoes,
                             termoEntrega, toast, sounds
```

## Banco

Scripts na raiz, na ordem:

1. `BANCO_DEFINITIVO.sql` — **destrutivo**, recria tudo do zero. Só para banco novo.
2. `AJUSTE_01_PROTEGER_HISTORICO.sql` — FK de `requisicao_itens.item_id` em RESTRICT.
3. `AJUSTE_02_LANCAMENTO_TERMO_UNIDADE.sql` — lançamento no TOTVS, termo, unidade por item.
4. `AJUSTE_03_UNIDADE_NA_RUPTURA_E_ADMIN.sql` — unidade na complementar e na
   reposição; trigger que impede ficar sem Almoxarifado ativo.

Os ajustes já estão incorporados no `BANCO_DEFINITIVO.sql`; eles existem para
bancos que já estavam rodando. Toda mudança de estrutura nova vira um
`AJUSTE_NN` **e** entra no `BANCO_DEFINITIVO.sql`.

Scripts de manutenção (zerar movimentação, redefinir senha, check-up) e
relatórios (por mês, por material, por setor, a lançar no TOTVS) ficam em
`sql/`, com o guia em [`sql/README.md`](sql/README.md). Todos passam pelo
analisador oficial do PostgreSQL (libpg_query) antes de serem entregues.

Tabelas: `usuarios`, `itens`, `requisicoes`, `requisicao_itens`,
`reposicao_itens`, `historico`. Bucket de Storage: `assinaturas`.

## Regras importantes

- **Senha nunca sai do banco.** O login é a função `login_usuario` (SECURITY
  DEFINER, bcrypt via pgcrypto). A coluna `senha` não tem GRANT de SELECT:
  pedi-la pela API devolve HTTP 401.
- **Solicitante só enxerga o que é dele.** Vale na lista, no detalhe e na
  edição — inclusive quando a URL é digitada na mão.
- **Apagar material não apaga histórico.** `requisicao_itens.item_id` é
  RESTRICT; o app desativa e renomeia o item em vez de excluir.
- **Uma separação por vez.** Trava atômica no Postgres (`locked_by`/`locked_at`,
  TTL de 30 min, renovada enquanto a tela está aberta).
- **Assinaturas gravam antes do resto.** Se a ruptura falhar depois, as
  assinaturas já estão no banco.
- **FINALIZADA ≠ LANÇADA.** Finalizada é entregue; lançada é baixada no TOTVS.
  O fluxo termina em lançada. Ruptura total não tem o que lançar.
- **Separação só de requisição em aberto.** PENDENTE, SEPARANDO ou AGUARDANDO;
  encerrada não reabre nem pela URL.

## Limitações conhecidas

- A chave `anon` fica visível no JavaScript publicado. Quem a extrair consegue
  escrever direto na API (criar usuário, por exemplo). Fechar isso exige migrar
  para Supabase Auth com JWT por usuário — decisão adiada conscientemente.
- `vite build` **não** confere tipos. Um deploy verde no Netlify não garante
  código são; quem garante é `npx tsc --noEmit`.
- Não há testes automatizados. A validação é manual, no navegador, contra o
  Supabase real.

## Ambiente de desenvolvimento

O PC do trabalho não tem Node no PATH. Existe um Node portátil em
`%LOCALAPPDATA%\nodejs-portable\node-v24.21.0-win-x64\node.exe`; use-o
diretamente (`node.exe node_modules/vite/bin/vite.js build`). O
`.claude/launch.json` já aponta para ele.

As chaves ficam em `.env.local`, que **nunca** vai para o repositório.
