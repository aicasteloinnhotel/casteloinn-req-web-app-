# Backlog

Ideia ≠ tarefa aprovada ≠ tarefa em execução. O que está em execução aparece no
[STATUS.md](STATUS.md).

## Agora

- Publicar no GitHub e dar deploy no Netlify
- Rodar `sql/manutencao/ZERAR_MOVIMENTACAO.sql` antes de abrir para a equipe
  (apaga #8, #9, #10 e volta o contador para #1; mantém usuários e catálogo)
- Apagar os PNGs de assinatura de teste no Storage → `assinaturas` (pelo painel:
  o `anon` não tem permissão de exclusão)
- Roteiro de teste com 2 aparelhos e gente de verdade (ver `PASSO_A_PASSO.md`)

## Depois — se um dia a operação pedir

### Web Push (aviso com o app fechado)

O aviso de separação iniciada já existe e funciona com o app aberto ou
minimizado. O que **não** existe é o aviso com o app fechado há horas: isso
exige chaves VAPID, handler `push` no `sw.js`, tabela de inscrições e uma Edge
Function no Supabase disparada por trigger. No iPhone só funciona com o app
instalado na tela de início (iOS 16.4+).

Decidido em 23/09/2026 **não fazer agora** — custo alto de infraestrutura para o
ganho atual.

### Chat solicitante ↔ almoxarifado

Ideia levantada e **descartada em 23/09/2026**. Fica registrada porque pode
voltar: botão flutuante, texto + foto, uma conversa por solicitante.
Complexidade média, cabe na stack (Realtime e Storage já provados), mas com a
chave `anon` compartilhada a privacidade entre conversas seria garantida pelo
app e não pelo banco.

## Depois

- **Contador "A lançar" no dashboard do almoxarifado.** O filtro já existe na
  lista; um número na tela inicial evitaria ter que ir procurar. Fica de fora por
  ora porque a diretoria já apontou excesso de cartões redundantes no dashboard —
  se entrar, tem que ser no lugar de algo, não somado.
- **Lançar várias requisições de uma vez.** Hoje é uma a uma. Só vale a pena se
  o volume diário justificar.
- **Aviso ao solicitante quando a complementar começa a ser separada.** Hoje o
  aviso depende da passagem por SEPARANDO, e a complementar vai direto de
  AGUARDANDO para entregue. Resolver exige um sinal próprio (não dá para reusar
  o status sem quebrar a lógica da complementar).
- **Data de entrega no modal de lançamento.** Hoje mostra a data do pedido, que é
  a que o TOTVS pede. Se a diretoria preferir a data da entrega, é trocar o campo.

## Futuro / Ideias

- Migrar para Supabase Auth com JWT por usuário, fechando o risco da chave `anon`
  (ver [DECISIONS.md](DECISIONS.md)). Trabalho grande; só se o sistema sair do
  uso interno.
- Categorias de material no catálogo — o tipo `Item` já teve um campo
  `categoria` fantasma, removido por não existir no banco nem em nenhuma tela.
- Relatório de consumo por departamento / período.
- Testes automatizados dos fluxos críticos (login, ruptura, assinatura).
