# Decisões

Só o que importa no futuro: a decisão e o motivo. Mais recente no topo.

---

## Complementar entregue pela metade gera outra complementar

Antes ficava AGUARDANDO para sempre: cada nova tentativa regravava a mesma
requisição (a REQ #46 chegou a 5 tentativas, cada uma com termo e assinaturas)
e ela nunca podia ser lançada no TOTVS. Agora complementar e requisição comum
seguem a mesma regra: fecha com o que foi entregue (RUPTURA_PARCIAL) e o que
faltou vai para uma complementar nova.

`processar_ruptura` (mesma assinatura) **move** a linha da lista de reposição
da complementar antiga para a nova, com a quantidade que ainda falta —
preservando urgência, "já pedido" e a data de entrada — em vez de criar outra
linha; o que sobrar pendente na antiga é baixado. Complementar sem nada
entregue não pode ser finalizada (geraria uma cópia de si mesma): a tela pede
para cancelar a separação.

---

## Unidades por item e unidade entregue (versão 1.1)

Substitui "UN pré-selecionado" (mais abaixo). Pedido da operação: com UN já
marcado, "5 de carne" virava 5 UN quando a intenção era KG.

- Cada item tem `unidades` (lista); `unidade` é a principal e sempre a
  primeira da lista — um gatilho no banco garante, inclusive para gravações da
  versão antiga do app.
- No pedido a unidade é obrigatória e só aparecem as do item. Item com uma
  unidade só já vem escolhido: não há o que escolher.
- Na separação o almoxarifado pode entregar em outra unidade
  (`requisicao_itens.unidade_separada`). Em unidade diferente não há conta
  possível (5 UN × 6,2 KG): qualquer quantidade > 0 atende a linha; zero é falta
  do pedido inteiro, na unidade pedida. O registrado — PDF, TOTVS, Curva ABC,
  relatório de consumo — é sempre o entregue.

## Pausa para inventário fica no banco

Tabela `bloqueio_requisicoes` (uma linha) + gatilho que recusa requisição
PENDENTE com a pausa ligada. Só o Almoxarifado pausa e libera: a API só lê a
tabela, e a alteração passa pela função `definir_bloqueio_requisicoes`, que
confere o perfil do usuário. No banco, e não só na tela, porque aparelhos com a
versão antiga aberta também precisam respeitar. A complementar (AGUARDANDO)
continua sendo criada; editar pedido existente também.

## Imprimir só depois de lançar no TOTVS

Pedido da operação. Requisição entregue e não lançada mostra "Imprimir"
apagado; tocar nele abre o lançamento. Ao finalizar a separação aparece só
"finalizada com sucesso": o lançamento é feito depois, quando der tempo — nunca
na hora da entrega. Ao marcar como lançada, o app oferece a impressão. O
comprovante traz quem lançou e quem imprimiu. Ruptura total e complementar
ainda aguardando não têm o que lançar e imprimem como antes.

## Atualização sem reinstalar

O app instalado busca o `index.html` publicado a cada abertura (o service
worker não guarda cópia). Para quem deixa o app aberto por dias,
`src/lib/atualizacao.ts` confere ao voltar para a tela e oferece "Atualizar".
Nunca recarrega sozinho, para não interromper uma separação.

---

## Ajuda e Sobre numa tela só, com duas abas

Uma entrada no menu em vez de duas: o menu não cresce e ninguém precisa
adivinhar onde está cada coisa. A aba **Ajuda** abre primeiro porque é o que se
procura no dia a dia; o contato do almoxarifado fica no topo dela. O guia muda
com o perfil (o solicitante não vê separação, TOTVS nem cadastros).

Dados institucionais (versão, desenvolvedor, hotel, telefone) ficam só em
`src/lib/sobre.ts`. A data da versão é gravada sozinha a cada build
(`__DATA_DA_PUBLICACAO__` no `vite.config.ts`), para o suporte saber que versão
cada aparelho está rodando.

---

## Ruptura total não se lança no TOTVS

`precisaLancar()` (`src/lib/utils.ts`) é a regra única: lança-se FINALIZADA e
RUPTURA_PARCIAL. RUPTURA_TOTAL quer dizer que nada saiu do almoxarifado — tudo
foi para a complementar, que é lançada quando for entregue. Antes ela ficava
"A LANÇAR" para sempre, e a única forma de tirá-la do filtro era marcar como
lançado algo que nunca foi. A mesma regra vale nos relatórios SQL e no
check-up. No modal de lançamento, linhas com entrega zero ficam de fora.

A pílula LANÇADA / A LANÇAR aparece só para o almoxarifado: para o solicitante
parecia uma pendência dele.

---

## Alarmes em tempo real montados no layout

`useAvisosEmTempoReal`, chamado uma vez no `AppLayout`, cuida do alarme de
requisição nova (almoxarifado) e do aviso de separação iniciada (solicitante).
Antes eles viviam no hook da lista e só tocavam com a pessoa parada no Início ou
na lista de requisições — dentro de uma requisição, no catálogo ou no meio de
outra separação, ninguém era avisado. `useRequisicoesSync` agora só recarrega a
lista.

---

## Tela de erro e recarga automática após publicar

`ErroInesperado` envolve o app inteiro: um erro inesperado numa tela mostra
"Algo deu errado · Recarregar" em vez de deixar tudo em branco (no app
instalado nem existe botão de recarregar). E `main.tsx` escuta
`vite:preloadError`: depois de cada deploy os arquivos das telas mudam de nome, e
quem estava com o app aberto pedia um arquivo que não existe mais. O app
recarrega uma vez, já na versão nova; se falhar de novo em menos de 10 s, para na
tela de erro em vez de recarregar em círculo.

---

## Busca ignora acento, maiúsculas e ordem das palavras

`contemTexto()` é a busca de todas as telas. "agua sanitaria" encontra "Água
Sanitária" e "latex luva" encontra "Luva Látex". No celular quase ninguém
digita acento, e a busca antiga não achava nada.

---

## Service worker só cuida da abertura das páginas

O `sw.js` ignora tudo que não for navegação do próprio app. Antes ele
interceptava todas as requisições, inclusive as do Supabase, e respondia um
"503 Offline" inventado quando a rede falhava — o app via um erro de servidor
que não existiu. Agora a API passa direto, e sem internet aparece uma página
"Sem conexão" legível em vez da tela de erro do navegador.

---

## Convite de instalação capturado antes do React

`beforeinstallprompt` é escutado em `main.tsx`, antes de montar qualquer tela
(`src/lib/instalacao.ts`). O navegador dispara esse evento logo no
carregamento, normalmente ainda no login; quando o app só escutava dentro do
layout pós-login, o evento se perdia. O cartão aparece no login e no topo do
app; "Agora não" vale até a próxima abertura do site. No iPhone não existe o
evento, então o cartão explica o caminho pelo Compartilhar.

---

## Nunca menos de um Almoxarifado ativo — garantido no banco

Trigger `trg_garantir_almoxarifado` recusa apagar, desativar ou rebaixar o
último usuário ALMOXARIFADO ativo. A tela também trava os botões, mas a regra
fica no banco porque qualquer um com a chave `anon` escreve direto na API.

---

## Uma pílula de status e uma barra de filtros para o app inteiro

`StatusBadge` é a única forma de mostrar status de requisição. As barras de
filtro seguem `src/lib/estilos.ts` (44px, uma linha no computador, duas no
celular), tirado da tela de Requisições, que era a referência aprovada.
Existiam quatro versões da pílula e cada tela montava a barra do seu jeito.

---

## Saída de material conta por unidade

`src/lib/saidas.ts` é a única conta de saída (Curva ABC, ranking, Dashboard).
Unidades diferentes do mesmo material são linhas separadas: somar 3 UN com
2 CX dava um número sem significado. Não há conversão entre unidades porque o
app não tem os fatores (quantas UN tem uma CX de cada material).

---

## Unidade por linha da requisição, com UN pré-selecionado

`requisicao_itens.unidade` guarda a unidade escolhida no pedido. Quando é NULL
(linhas antigas), vale a unidade cadastrada no catálogo do item.

O seletor abre sempre em **UN**, não na unidade do catálogo: o pedido é feito na
unidade em que a pessoa pensa ("5 UN de detergente" = 5 frascos), enquanto o
catálogo guarda a unidade de compra ("L"). Quando as duas divergem, a tela avisa
em uma linha discreta, sem impedir nada.

A lista de unidades vem do que já existe no catálogo. Não há lista fixa
inventada no código — isso evita criar códigos que não existem no TOTVS.

---

## LANÇADO como estado separado de FINALIZADA

Finalizada = material entregue e assinado. Lançada = baixada no TOTVS. Eram a
mesma coisa no app e não são a mesma coisa na operação: o almoxarifado precisava
de uma forma de saber o que ainda falta digitar no TOTVS.

Implementado como colunas próprias (`lancado`, `lancado_em`, `lancado_por`), não
como um novo valor de `status`, porque as duas informações são independentes:
uma requisição com ruptura parcial também precisa ser lançada.

O modal de lançamento espelha os campos da tela "Requisição Manual" do TOTVS
(Destino/Almoxarifado, Nº da Requisição, Data, e as colunas Descrição do Item /
Unid. / Qtde.), com os mesmos rótulos, para que a digitação seja uma
transcrição direta e não uma tradução mental.

---

## Termo de recebimento preso à assinatura do solicitante

O aceite fica no mesmo passo da assinatura de quem recebe, não em uma etapa
separada: é a assinatura que dá valor ao aceite, e um passo a mais no celular é
um passo que se pula no corre-corre da entrega.

`termo_versao` é gravado junto com `termo_aceito_em`. Se o texto mudar um dia,
as entregas antigas continuam dizendo qual texto foi aceito naquele momento — é
isso que torna o registro defensável.

---

## Assinaturas chamadas de SOLICITANTE e ALMOXARIFADO

"Recebedor" e "Conferente" confundiam quem assinava onde, inclusive para quem
usa o app todo dia. Os nomes novos são os mesmos das colunas do banco
(`assinatura_solicitante`, `assinatura_almoxarifado`), então tela, PDF e banco
falam a mesma língua.

---

## Puxar-para-recarregar desligado no app inteiro

`overscroll-behavior-y: contain` em `html` e `body`. No meio de uma requisição,
o gesto recarregava a página e o pedido parecia sumir. O rascunho em
`localStorage` continua existindo como rede de segurança, mas a causa foi
cortada na raiz.

---

## Rascunho do pedido por usuário, e só depois de lido

A chave é `nova_req_draft_<id do usuário>`: em tablet compartilhado, uma chave
global fazia o pedido de uma camareira aparecer para a próxima que logasse.

O efeito que grava o rascunho só roda depois que a leitura inicial aconteceu
(`rascunhoLido`). Sem essa trava, ele rodava primeiro com a lista vazia e
apagava o rascunho que deveria restaurar.

---

## RESTRICT em requisicao_itens.item_id

Estava CASCADE: apagar um material do catálogo apagava a linha dele em entregas
passadas já assinadas — provado em teste (1 registro → 0). Agora o banco recusa
(erro 23503) e o app desativa e renomeia o item em vez de excluir.

---

## Login por função no banco, não por consulta

O app baixava a linha inteira do usuário, com a senha em texto puro, e comparava
no navegador. Qualquer pessoa com a chave `anon` — que é pública no JavaScript —
lia todas as senhas. Agora a conferência acontece dentro do Postgres
(`login_usuario`, bcrypt) e a coluna `senha` não é legível pela API.

---

## Chave anon exposta: risco aceito

Quem extrair a chave `anon` do bundle consegue escrever direto na API. Fechar
isso exige migrar para Supabase Auth com JWT por usuário — trabalho grande, sem
benefício imediato para um sistema interno de hotel. Risco documentado e aceito.
