# Protocolo de trabalho da IA neste projeto

Regras permanentes. Aplicar automaticamente, sem o usuário precisar repetir.

## 1. Princípio geral

Compreender, planejar, implementar, testar e manter — não apenas executar o
pedido ao pé da letra quando uma análise prévia evita retrabalho.

Antes de mexer em algo importante: entender a implementação existente, mapear
dependências e impactos, preservar o que já funciona, respeitar decisões
anteriores, evitar alterações desnecessárias e **não inventar informação sobre o
projeto**.

Preferir sempre a solução mais simples, robusta e coerente com a arquitetura
atual.

## 2. Onde mora cada coisa

| Arquivo | Conteúdo |
|---|---|
| `AI_WORKFLOW.md` | estas regras |
| `PROJECT.md` | contexto permanente: objetivo, público, arquitetura, regras, limitações |
| `STATUS.md` | estado atual: concluído, em andamento, bloqueios, próximo passo |
| `DECISIONS.md` | decisões de arquitetura/produto que importam no futuro, com o motivo |
| `BACKLOG.md` | Agora / Próximo / Depois / Futuro |

**O código é a fonte de verdade da implementação. Estes arquivos são a fonte de
verdade do contexto.** Não duplicar a mesma informação em dois lugares.

## 3. Leitura de contexto

Ler seletivamente, não o projeto inteiro. Ordem: `AI_WORKFLOW` → `PROJECT` →
`STATUS` → `DECISIONS` (quando a tarefa depender de decisão anterior) →
`BACKLOG` (quando envolver planejamento) → o código diretamente relacionado.

Não reler histórico de conversa quando os arquivos já contêm a informação.

## 4. Planejamento proporcional

Tarefa pequena: executar direto. Tarefa complexa: analisar, identificar as
partes afetadas, avaliar riscos e só então implementar. Não transformar coisa
simples em processo burocrático.

## 5. Bugs

Entender o problema → achar a **causa real** → avaliar efeitos colaterais →
corrigir → validar → conferir se a correção quebrou outra coisa. Nada de
paliativo sem necessidade.

Quando uma tentativa falhar, registrar o que foi descoberto para não repetir a
mesma abordagem. Se o bug revelar algo estrutural, atualizar `STATUS.md` ou
`DECISIONS.md`.

## 6. Código existente

Não refatorar o que funciona só porque existe outro jeito. Antes de mudança
estrutural, pesar benefício real, complexidade adicionada, risco de regressão e
compatibilidade. Preferir evolução incremental. Não trocar biblioteca ou
arquitetura sem razão concreta.

## 7. Ideias que surgem no caminho

Não interromper a tarefa atual. Não implementar o que não foi pedido. Não virar
tarefa toda observação. O que for realmente útil vai para o `BACKLOG.md`;
oportunidade técnica importante é informada **depois** de concluir a tarefa.

## 8. Atualização automática

Sem esperar instrução. `STATUS.md` quando houver funcionalidade concluída,
mudança importante, novo bloqueio, bug relevante ou mudança do próximo passo.
`DECISIONS.md` em decisão estrutural. `BACKLOG.md` em tarefa ou ideia que mereça
ser preservada. Não atualizar por alteração irrelevante.

## 9. Continuidade entre sessões

O projeto tem que ser compreensível depois de uma pausa longa, usando só estes
arquivos — sem depender do histórico da conversa.

## 10. Isolamento

Todo contexto pertence exclusivamente a este projeto. Não misturar decisões,
ideias, requisitos ou arquitetura de outros projetos, nem buscar contexto
externo sem pedido explícito.

## 11. Segurança contra regressões

Depois de alteração relevante, conferir: funcionalidades relacionadas, tipos,
imports, banco, APIs, autenticação, estados, componentes dependentes, build e
erros de execução.

Neste projeto, concretamente:

```bash
node.exe node_modules/typescript/bin/tsc --noEmit
node.exe node_modules/vite/bin/vite.js build
```

`vite build` **não** confere tipos — os dois comandos são necessários. Tarefa não
é concluída porque o código mudou; é concluída quando o resultado está validado.

**SQL:** não há como rodar no banco do usuário daqui, então todo script `.sql`
passa pelo analisador oficial do PostgreSQL antes de ser entregue — o pacote
`plpgsql-parser` (libpg_query em WASM), instalado numa pasta temporária, fora
do projeto. Ele valida o SQL comum **e** o corpo das funções PL/pgSQL e dos
blocos `DO`. Antes de confiar no resultado, conferir que ele acusa um erro
plantado de propósito. Nomes de tabela e coluna ele não confere: isso é
revisão manual contra o `BANCO_DEFINITIVO.sql`.

## 12. Autonomia

Decidir sozinho o que for técnico e razoável. Perguntar só quando houver
alternativas significativamente diferentes, risco elevado, decisão permanente
sobre o produto, informação essencial ausente ou requisito genuinamente ambíguo.

## 13. Comunicação

Objetiva. Não narrar processo interno ("vou consultar o STATUS.md", "vou
atualizar o roadmap") — fazer em silêncio. Ao final: o que foi feito, problemas
encontrados, o que foi validado, pendências e próximo passo quando necessário.
