# Scripts SQL — o que RODAR e o que só GUARDAR

Todos rodam no **Supabase → SQL Editor → New query → colar → Run**. O editor
mostra só o resultado da última consulta, por isso cada script termina com
**uma** tabela de conferência.

A primeira linha de cada arquivo `.sql` também diz o que fazer com ele.

## ▶ Rodar agora (atualização para a versão 1.1)

| Script | Quando | Apaga dados? |
|---|---|---|
| [`AJUSTE_04_UNIDADES_E_PAUSA_INVENTARIO.sql`](../AJUSTE_04_UNIDADES_E_PAUSA_INVENTARIO.sql) | **Antes** de subir a versão 1.1 no GitHub. Deve voltar com 9 linhas OK | **Não**, só acrescenta |

## ✅ Já aplicados no banco em uso: só guardar

| Script | Situação |
|---|---|
| [`AJUSTE_01_PROTEGER_HISTORICO.sql`](../AJUSTE_01_PROTEGER_HISTORICO.sql) | Rodado em 09/2026. Rodar de novo não estraga nada, mas não precisa |
| [`AJUSTE_02_LANCAMENTO_TERMO_UNIDADE.sql`](../AJUSTE_02_LANCAMENTO_TERMO_UNIDADE.sql) | Idem |
| [`AJUSTE_03_UNIDADE_NA_RUPTURA_E_ADMIN.sql`](../AJUSTE_03_UNIDADE_NA_RUPTURA_E_ADMIN.sql) | Idem |

## ⛔ Só para começar um banco do zero: guardar e NUNCA rodar no banco em uso

| Script | Para quê |
|---|---|
| [`BANCO_DEFINITIVO.sql`](../BANCO_DEFINITIVO.sql) | Projeto Supabase **novo**, vazio. Ele **apaga tudo**, inclusive usuários, e a senha do Almoxarifado volta a ser `trocar123`. Já contém os ajustes 01 a 04: quem roda ele não roda ajuste nenhum depois |

## Manutenção: `sql/manutencao/`

| Script | Para quê | Altera? |
|---|---|---|
| [`CONFERIR_SAUDE_DO_BANCO.sql`](manutencao/CONFERIR_SAUDE_DO_BANCO.sql) | Check-up: estrutura, segurança e o que está parado. Rode depois de cada ajuste, ou quando algo parecer estranho | Não, só lê |
| [`REDEFINIR_SENHA.sql`](manutencao/REDEFINIR_SENHA.sql) | Alguém esqueceu a senha, inclusive o Almoxarifado | Sim, só a senha |
| [`ZERAR_MOVIMENTACAO.sql`](manutencao/ZERAR_MOVIMENTACAO.sql) | ⛔ **Apaga todas as requisições** e volta o contador para #1. Foi feito para a fase de testes. **Com o sistema em uso, não rode** | **Sim** |

## Relatórios: `sql/relatorios/`

Só leem, então podem ser rodados quando quiser. Os que têm período usam o
**mês atual**; para outro, troque as datas no bloco `parametros` do começo do
script.

| Script | Mostra |
|---|---|
| [`REQUISICOES_POR_MES.sql`](relatorios/REQUISICOES_POR_MES.sql) | Por mês: total, com falta, canceladas, em aberto, lançadas, a lançar e tempo médio até a entrega |
| [`CONSUMO_POR_MATERIAL.sql`](relatorios/CONSUMO_POR_MATERIAL.sql) | Quanto saiu de cada material no período, na unidade em que foi entregue |
| [`POR_DEPARTAMENTO.sql`](relatorios/POR_DEPARTAMENTO.sql) | Por setor: quantas requisições, entregues, com falta, canceladas |
| [`PENDENTES_DE_LANCAMENTO.sql`](relatorios/PENDENTES_DE_LANCAMENTO.sql) | Entregues e ainda não lançadas no TOTVS, com dias de espera, para o fechamento do mês |

Horários sempre no fuso de Brasília.

## Regra para o futuro

Toda mudança de estrutura vira um `AJUSTE_NN_...sql` novo, que só acrescenta,
para o banco em uso, **e** é incorporada ao `BANCO_DEFINITIVO.sql`, para um
banco novo.
