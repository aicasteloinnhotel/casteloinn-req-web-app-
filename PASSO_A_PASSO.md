# Passo a passo do lançamento

## ★ Atualizar para uma versão nova (o app já está em uso)

Os dados ficam no Supabase. Trocar os arquivos do app **não** mexe neles.

1. **Banco, se a versão trouxer um `AJUSTE_NN`.** Rode no SQL Editor *antes*
   do passo 2. Os ajustes só acrescentam e não apagam nada. Na 1.1 é o
   `AJUSTE_04_UNIDADES_E_PAUSA_INVENTARIO.sql`. **Nunca** rode o
   `BANCO_DEFINITIVO.sql` nem o `ZERAR_MOVIMENTACAO.sql` num banco em uso.
2. **GitHub, no mesmo repositório.** *Add file → Upload files* → arraste os
   arquivos → *Commit changes*. Arquivo com o mesmo nome é substituído. **O
   site do GitHub aceita no máximo 100 arquivos por envio**, e o projeto tem
   mais. Por isso são dois envios: primeiro tudo menos a pasta `src`, depois a
   pasta `src`. A pasta de entrega de cada versão já vem dividida assim.
3. **Netlify.** Ele percebe cada commit e publica sozinho, **no mesmo link**,
   sem criar site nem deploy novo. Acompanhe em *Deploys* até aparecer
   **Published**. Para conferir, abra *Ajuda e Sobre → Sobre*, que deve
   mostrar a versão nova e a data de hoje.
4. **Celulares.** Ninguém reinstala nada. Quem abrir o app já pega a versão
   nova. Quem estava com ele aberto vê "Saiu uma versão nova do app →
   Atualizar" (a partir da 1.1).
5. **Deu problema?** Vá em Netlify → *Deploys*, clique na publicação anterior
   e depois em **Publish deploy**. Volta na hora. Os ajustes de banco só
   acrescentam, então a versão anterior continua funcionando com eles.

Versão 1.1: o roteiro completo, para leigos, está em
`Documentos\ATUALIZACAO_APP_v1.1\LEIA-ME - PASSO A PASSO.txt`.

---

Sequência na ordem em que você trabalha. Os passos 2 e 5 são os que não podem
ficar de fora: o login novo mora **dentro** do banco, e as assinaturas dependem
do Storage.

---

## 1. Finalizar o app

Feito aqui. Conferência final em 25/09/2026: os dois perfis testados de ponta a
ponta contra o banco real, `tsc` sem erros, e o ZIP extraído numa pasta vazia
instalou (`npm ci`) e gerou o build do zero — o mesmo que o Netlify faz.

---

## 2. Banco de dados

Tudo executado, e o `sql/manutencao/CONFERIR_SAUDE_DO_BANCO.sql` voltou com as
15 verificações em OK ✅

- [`BANCO_DEFINITIVO.sql`](BANCO_DEFINITIVO.sql) — schema, senhas com hash, login,
  `processar_ruptura`, RLS, índices, bucket `assinaturas` e Realtime ✅
- [`AJUSTE_01_PROTEGER_HISTORICO.sql`](AJUSTE_01_PROTEGER_HISTORICO.sql) ✅
- [`AJUSTE_02_LANCAMENTO_TERMO_UNIDADE.sql`](AJUSTE_02_LANCAMENTO_TERMO_UNIDADE.sql) ✅
- [`AJUSTE_03_UNIDADE_NA_RUPTURA_E_ADMIN.sql`](AJUSTE_03_UNIDADE_NA_RUPTURA_E_ADMIN.sql) ✅

Nenhum script novo para rodar nesta versão.

> **Não rode o `BANCO_DEFINITIVO.sql` de novo.** Ele recria tudo do zero:
> apaga usuários e volta a senha do Almoxarifado para `trocar123`. Ele já
> contém os três ajustes e só serve para um projeto Supabase novo.

### Antes de abrir para a equipe

Rode [`sql/manutencao/ZERAR_MOVIMENTACAO.sql`](sql/manutencao/ZERAR_MOVIMENTACAO.sql).
Ele apaga as requisições de teste, a reposição e o histórico, e volta o
contador para a **REQ #1** — mantendo usuários, senhas e catálogo.

O script tem trava: na primeira vez ele só avisa. Troque `v_confirmo BOOLEAN := false`
por `true` e rode de novo. Se quiser apagar também o catálogo de teste, troque
`v_apagar_catalogo` para `true` na mesma hora.

Depois, apague os PNGs de assinatura dos testes em *Storage → assinaturas*
(selecionar tudo → Delete). Isso só dá para fazer pelo painel.

> Todos os scripts — manutenção e relatórios — estão explicados em
> [`sql/README.md`](sql/README.md).

---

## 3. Subir para o GitHub

Use o ZIP limpo:

**`C:\Users\enc.almoxarifado\Documents\app-requisicao-PARA-GITHUB.zip`** (1,65 MB — 99 arquivos)

> ⚠️ **Não arraste a pasta inteira do projeto.** Agora existe `node_modules`
> (307 MB) e `dist` nela, e o upload pela web do GitHub ignora o `.gitignore`.
> O ZIP acima já tem só o que deve subir.

Extraia o ZIP e mande **o conteúdo** para o repositório — o `package.json` e o
`index.html` precisam ficar na raiz, não dentro de uma subpasta. Senão o Netlify
não acha o projeto.

> O `dist` fica **de fora de propósito**: ele é o resultado do build, e o Netlify
> gera o dele a cada deploy (passo 6). Mandar o seu junto publicaria as chaves do
> Supabase dentro do repositório, porque o Vite grava as variáveis de ambiente
> dentro dos arquivos do build.

---

## 4. Sincronizar com o Netlify

Como na primeira versão: o Netlify lê o repositório e roda o build sozinho.
A configuração de rotas do app já está no [`netlify.toml`](netlify.toml).

---

## 5. Configurar as chaves — antes do deploy

*Site settings → Environment variables*:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

> Sempre a chave **anon / public**. A `service_role` nunca vai para o app.

> As chaves entram no app **na hora do build**. Se o primeiro deploy rodou antes
> de você cadastrá-las, o login avisa "variáveis de ambiente não configuradas":
> vá em *Deploys → Trigger deploy → Deploy site* para gerar de novo.

---

## 6. Deploy

Acompanhe o **Deploy log**. Se aparecer `Build failed`, me mande o log.

> O build (`vite build`) **não** confere tipos do TypeScript — ele só empacota.
> Um deploy verde não garante que está tudo certo; quem garante é o teste do passo 8.

---

## 7. Instalar o web app

Abra o link do Netlify no celular. O próprio app mostra, já na tela de login,
um cartão **"Instale o app neste aparelho"** com o botão **Instalar** — não
precisa mexer no menu do navegador.

- **Android:** um toque em *Instalar* abre a janela oficial de instalação.
- **iPhone:** o cartão explica o caminho (Compartilhar → *Adicionar à Tela de
  Início*), que é o único que a Apple permite.
- "Agora não" esconde o cartão até a próxima vez que o site for aberto. Depois
  disso, o ícone de download no canto do cabeçalho continua disponível.

No primeiro acesso:

- Usuário: **Almoxarifado**
- Senha: **trocar123**

**Troque essa senha na hora**: Usuários → editar o próprio usuário → nova senha → Salvar.
(Campo de senha em branco ao editar mantém a senha atual.)

Depois: cadastre os usuários reais e importe o catálogo por CSV
(coluna A = nome do item, coluna B = unidade).

---

## 8. Roteiro de teste — faça com 2 aparelhos

> O fluxo abaixo já foi testado de ponta a ponta contra o seu banco real
> (login, separação, duas assinaturas, ruptura, complementar, reposição e PDF).
> Vale repetir com gente de verdade, em dois aparelhos, para validar o uso.

- [ ] Login com senha certa entra; com senha errada mostra "Usuário ou senha inválidos."
- [ ] Usuário desativado não consegue entrar
- [ ] Solicitante cria requisição → aparece **sozinha** na tela do almoxarifado, com o número certo no aviso
- [ ] Solicitante **não** abre `/admin/usuarios` digitando na barra de endereço
- [ ] Almoxarifado inicia separação → no outro aparelho aparece "Em Atendimento"
- [ ] O segundo aparelho **não** consegue entrar na mesma separação
- [ ] Separar tudo → assinar as duas assinaturas → finalizar → **sair e voltar na requisição**: as assinaturas continuam lá
- [ ] PDF sai com as duas assinaturas e o nome do conferente
- [ ] Separar com item faltando → gera complementar (AGUARDANDO) e o item entra na Lista de Reposição com a quantidade certa
- [ ] Dar baixa na reposição → o Histórico mostra o **nome** de quem deu baixa
- [ ] Finalizar a complementar quando o material chegar
- [ ] Marcar item como Urgente / Aguardando Chegada e conferir a contagem regressiva
- [ ] Filtrar requisições por data — escolher só o dia de hoje deve trazer as de hoje
- [ ] Dashboard: números batem e atualizam sozinhos
- [ ] Solicitante dentro da requisição dele → almoxarifado inicia a separação → aviso aparece no celular do solicitante
- [ ] Sem marcar "Li e concordo", o botão de avançar para a assinatura do almoxarifado fica travado
- [ ] Requisição entregue → botão **Lançar** → conferir os dados → **Marcar como lançada** → sai do filtro "A lançar"

---

## Se algo der errado no passo 7

O sintoma mais provável de passo esquecido:

| Sintoma | Causa |
|---|---|
| Ninguém consegue entrar | Script do passo 2 não foi executado |
| "variáveis de ambiente não configuradas" | Chaves do passo 5 faltando |
| "Erro ao salvar a imagem da assinatura" | Bucket `assinaturas` ausente (passo 2 resolve) |
| Telas não atualizam sozinhas | Realtime desligado (consulta 11.4) |
| Não aparece o cartão de instalar | App já instalado, ou o navegador ainda não liberou (use o ícone do cabeçalho mais tarde) |
| Esqueci a senha do Almoxarifado | Rode `sql/manutencao/REDEFINIR_SENHA.sql` |
| Algo parece estranho no banco | Rode `sql/manutencao/CONFERIR_SAUDE_DO_BANCO.sql` e me mande a tabela |
