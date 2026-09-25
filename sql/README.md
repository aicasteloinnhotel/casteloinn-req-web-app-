# Scripts SQL — qual usar, quando

Todos rodam no **Supabase → SQL Editor → New query → colar → Run**.
O editor mostra só o resultado da última consulta, por isso cada script termina
com **uma** tabela de conferência.

## Montar o banco

Ficam na raiz do projeto.

| Script | Quando | Apaga dados? |
|---|---|---|
| [`BANCO_DEFINITIVO.sql`](../BANCO_DEFINITIVO.sql) | Projeto Supabase **novo**, ou recomeçar a estrutura inteira do zero | **SIM, tudo** — inclusive usuários. A senha do Almoxarifado volta a ser `trocar123` |
| [`AJUSTE_01_PROTEGER_HISTORICO.sql`](../AJUSTE_01_PROTEGER_HISTORICO.sql) | Banco que já existia antes desse ajuste | Não |
| [`AJUSTE_02_LANCAMENTO_TERMO_UNIDADE.sql`](../AJUSTE_02_LANCAMENTO_TERMO_UNIDADE.sql) | Idem | Não |
| [`AJUSTE_03_UNIDADE_NA_RUPTURA_E_ADMIN.sql`](../AJUSTE_03_UNIDADE_NA_RUPTURA_E_ADMIN.sql) | Idem | Não |

**O `BANCO_DEFINITIVO.sql` já contém todos os ajustes.** Os ajustes existem
só para atualizar um banco que já está em uso sem perder o que está nele.
Quem roda o definitivo **não** precisa rodar ajuste nenhum depois.

Regra para o futuro: toda mudança de estrutura vira um `AJUSTE_NN_...sql` novo
(para o banco em uso) **e** é incorporada ao `BANCO_DEFINITIVO.sql` (para um
banco novo).

## Manutenção — `sql/manutencao/`

| Script | Para quê | Altera? |
|---|---|---|
| [`CONFERIR_SAUDE_DO_BANCO.sql`](manutencao/CONFERIR_SAUDE_DO_BANCO.sql) | Check-up: estrutura completa, segurança, e o que está parado (separação abandonada, pedido esquecido, entrega sem lançar). Rode quando algo parecer estranho, ou uma vez por semana | Não, só lê |
| [`ZERAR_MOVIMENTACAO.sql`](manutencao/ZERAR_MOVIMENTACAO.sql) | Apagar requisições, reposição e histórico e voltar o contador para #1. **Mantém** usuários, senhas e catálogo. Tem trava: só apaga depois de trocar `false` por `true` | **Sim** |
| [`REDEFINIR_SENHA.sql`](manutencao/REDEFINIR_SENHA.sql) | Alguém esqueceu a senha — inclusive o Almoxarifado | Sim, só a senha |

## Relatórios — `sql/relatorios/`

Só leem. Os que têm período usam o **mês atual**; para outro, troque as datas
no bloco `parametros` do começo do script.

| Script | Mostra |
|---|---|
| [`REQUISICOES_POR_MES.sql`](relatorios/REQUISICOES_POR_MES.sql) | Por mês: total, com falta, canceladas, em aberto, lançadas, a lançar e tempo médio até a entrega |
| [`CONSUMO_POR_MATERIAL.sql`](relatorios/CONSUMO_POR_MATERIAL.sql) | Quanto saiu de cada material no período, por unidade |
| [`POR_DEPARTAMENTO.sql`](relatorios/POR_DEPARTAMENTO.sql) | Por setor: quantas requisições, entregues, com falta, canceladas |
| [`PENDENTES_DE_LANCAMENTO.sql`](relatorios/PENDENTES_DE_LANCAMENTO.sql) | Entregues e ainda não lançadas no TOTVS, com dias de espera — para o fechamento do mês |

Horários sempre no fuso de Brasília.
