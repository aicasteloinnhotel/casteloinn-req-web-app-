# Sistema de Requisições de Almoxarifado — Castelo Inn

Aplicação web e PWA para controlar o fluxo de materiais entre os setores
operacionais do hotel (Governança, Recepção, Manutenção, A&B, Eventos,
Administrativo) e o Almoxarifado Central.

## O que o sistema faz

- **Solicitante** monta o pedido pelo celular e acompanha o status em tempo real.
- **Almoxarifado** separa item a item, ajusta quantidades, inclui itens esquecidos
  e fecha a entrega com o **aceite do termo de recebimento** e **duas assinaturas
  na tela** (solicitante e almoxarifado).
- Cada entrega depois é **lançada no TOTVS**: a tela mostra só o que precisa ser
  digitado lá, e o filtro "A lançar" mostra o que ainda falta baixar.
- Item em falta vira **ruptura**: o sistema fecha a requisição original, cria
  automaticamente uma **requisição complementar** e joga o que faltou na
  **Lista de Reposição** (o quadro de compras).
- A Lista de Reposição organiza tudo em Urgentes (com contagem regressiva),
  Aguardando Chegada (já pedido ao fornecedor) e Normais, e gera PDF para cotação.
- Dashboard com evolução mensal, ranking de saída de materiais e indicadores.

## Tecnologias

React 19 · TypeScript · Vite · Tailwind CSS v4 · React Router 7 ·
Supabase (PostgreSQL + Realtime + Storage) · jsPDF · react-signature-canvas · PWA

## Configuração

Duas variáveis de ambiente, definidas no painel do Netlify
(*Site settings → Environment variables*) e, para rodar localmente, em um
arquivo `.env.local` na raiz:

```
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=...
```

> A chave usada é sempre a **anon / public** — ela vai dentro do JavaScript
> entregue ao navegador. A chave `service_role` nunca deve ser usada aqui.

O bucket de Storage **`assinaturas`** precisa existir e ser público, senão as
assinaturas não aparecem no PDF.

## Banco de dados

Todo o schema está em [`BANCO_DEFINITIVO.sql`](BANCO_DEFINITIVO.sql): tabelas,
índices, permissões, RLS, hash de senha, a função de login e a função
`processar_ruptura` (que cria a requisição complementar). Scripts de manutenção
e relatórios ficam em [`sql/`](sql/README.md).

O passo a passo da instalação e o roteiro de teste estão em
[`PASSO_A_PASSO.md`](PASSO_A_PASSO.md).

## Rodando localmente

Precisa de Node.js instalado:

```bash
npm install
npm run dev
```

Outros comandos:

```bash
npm run build   # gera a pasta dist (é o que o Netlify roda)
npm run lint    # confere os tipos do TypeScript, sem gerar arquivos
```

> Atenção: `npm run build` **não** confere tipos — ele apenas remove os tipos e
> empacota. Use `npm run lint` para essa verificação.

## Publicação

O Netlify está ligado ao repositório do GitHub: cada push dispara
`npm install` + `npm run build` nos servidores dele e publica a pasta `dist`.
O redirecionamento de rotas do SPA está em [`netlify.toml`](netlify.toml).

## Perfis de acesso

| Perfil | Pode |
|---|---|
| `SOLICITANTE` | Criar e editar as próprias requisições pendentes, acompanhar status |
| `ALMOXARIFADO` | Tudo do solicitante, mais separação, lista de reposição, catálogo de itens e usuários |
