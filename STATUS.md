# Status

Última atualização: **06/10/2026**. Versão 1.1 pronta, aguardando publicação.

## Situação geral

**Versão 1.0 em produção** desde o fim de setembro, com dados reais (em
06/10: 495 itens, 53 requisições, 18 usuários). **Nunca escrever dados de teste
no banco de produção** — nem criar, nem apagar.

**Versão 1.1 pronta para publicar** (06/10/2026). Pacote em
`Documentos\ATUALIZACAO_APP_v1.1\` (SQL a rodar, os 2 envios do GitHub,
planilha de unidades e LEIA-ME).

Validação da 1.1:
- tsc, build e build do zero a partir dos 2 envios (npm ci)
- testes da lógica de unidades
- **SQL executado de verdade em PostgreSQL local (PGlite)**: banco novo pelo
  definitivo; migração de um banco igual ao da 1.0, com caso tipo #46, pelo
  AJUSTE_04, sem perder dado; repetível; a 1.0 continua funcionando depois;
  complementar em corrente; pausa e permissões da chave pública; check-up e
  relatórios (51 verificações OK)
- planilha de unidades testada no importador (UTF-8 e ANSI do Excel)

Ainda não exercitado: as TELAS gravando contra o banco real (regra de não
escrever dados de teste em produção). O primeiro uso real com atenção é a
REQ #46.

### O que entra na 1.1

- Pausa para inventário (suspende criação de requisições; faixa para todos)
- Imprimir só depois de lançar; PDF com quem lançou e quem imprimiu
- Rodapé da separação não tampa mais os últimos itens
- Unidades por item no cadastro (várias), unidade obrigatória no pedido, e
  unidade entregue diferente da pedida na separação (registra o entregue)
- CSV acrescenta unidades a itens existentes (`UN/KG`)
- Aviso de versão nova com botão "Atualizar" (sem reinstalar)
- Complementar entregue pela metade fecha e gera outra complementar só com o
  que faltou (a REQ #46 em produção está nesse caso: 5 tentativas, parada em
  AGUARDANDO — é o primeiro teste real depois de publicar)

## Concluído (validado no navegador, contra o Supabase real)

- Fluxo completo: pedido → separação → conferência → termo → duas assinaturas → PDF
- Ruptura automática: complementar + lista de reposição vinculadas, com a unidade do pedido
- Lançamento no TOTVS: pílula, filtro e modal espelhando a Requisição Manual
- Unidade por linha do pedido (na 1.1: obrigatória, só as do item)
- Avisos em qualquer tela: requisição nova (almoxarifado) e separação iniciada (solicitante)
- Segurança: senha com bcrypt dentro do banco, coluna `senha` bloqueada na API
- Trava de separação atômica, com TTL de 30 min
- Histórico protegido contra exclusão de material do catálogo (RESTRICT)
- Realtime nas telas de lista e detalhe
- PWA instalável, com convite próprio na tela de login e no app
- Tela **Ajuda e Sobre** (`/ajuda`): guia rápido por perfil, legenda dos status,
  WhatsApp e ligação para o almoxarifado, dados do app (versão 1.0, data da
  publicação automática) e do hotel. Acesso pelo menu (almoxarifado), pelo avatar
  e pela tela inicial (solicitante); o login tem o atalho "Esqueceu a senha?"

### Conferência final (25/09/2026)

**Roteiro executado.** Login (senha errada, maiúsculas e espaços, "manter
conectado"), bloqueio de telas e requisições alheias pela URL, cadastro de
usuário e de item (duplicado e senha curta), pedido com o mesmo material em duas
unidades e quantidade decimal, rascunho após recarregar, edição com histórico,
aviso de separação, trava contra segundo operador, separação com falta parcial,
falta total e item incluído na hora, termo, assinaturas, PDF, complementar pela
lista de reposição, urgência, baixa parcial, remoção, lançamento e desfazer,
cancelamento pelos dois perfis, desativação com sessão aberta, arquivar e excluir
item, 375 px sem nada fora da tela, build de produção e trigger do último
Almoxarifado testado direto na API.

**Bugs corrigidos**

| Bug | Efeito que tinha |
|---|---|
| Alarmes só na tela inicial e na lista | Quem estava em outra tela não era avisado de pedido novo nem de separação iniciada |
| Separação reaberta pela URL | Requisição já finalizada podia ser "finalizada" de novo, gerando outra complementar |
| Ruptura total contada como "a lançar" | Ficava pendente para sempre, sem ter o que lançar |
| Linha com entrega zero no modal do TOTVS | "PAPEL TOALHA 0" na lista e no "Copiar lista" |
| Histórico da edição com o mesmo material em 2 unidades | Comparava a linha de CX com a de UN e descrevia a mudança errada |
| Falha de rede no meio da edição | O pedido podia ficar sem nenhum item |
| Complementar com o mesmo material em 2 unidades | A quantidade de uma unidade sobrescrevia a da outra na reposição |
| Baixa parcial na reposição | Não aparecia no Histórico de Baixas |
| Nome do item arquivado | Aparecia com a data grudada ("Detergente (25/09/26 09:13)") no PDF e no TOTVS |
| Curva ABC | Linha "0 RL" ao lado de "4 UN" do mesmo material |
| PDF do comprovante | 2,2 MB por página por causa das assinaturas sem compressão (agora 14 KB) |
| Logo de 1 MB no login e no menu | Baixada no celular para aparecer com 64 px (agora 25 KB) |
| Busca | Não achava "Água Sanitária" digitando "agua sanitaria" |
| Planilha CSV do Excel | Acentos viravam "�" (Excel salva em ANSI) |
| Senha de 1 caractere aceita no cadastro | O script de redefinir exige 4 |
| Caixas de conferência pretas | O verde nunca aplicava (nome de atributo de outra biblioteca) |
| "Requisição não encontrada" | Sem botão de saída no app instalado |
| Erro inesperado ou publicação nova | Tela totalmente em branco |

**Publicação:** `netlify.toml` com Node 22 fixo e cache longo para `/assets`;
`.env.example` limpo; `package-lock.json` sincronizado e com os binários de Linux.

## Bloqueio atual

Nenhum.

## Problemas conhecidos

- `vite build` não confere tipos: rode `tsc --noEmit` antes de publicar.
- Chave `anon` visível no bundle (ver [DECISIONS.md](DECISIONS.md)).
- Sem testes automatizados; validação é manual no navegador.
- A notificação do sistema operacional em si não pôde ser exercitada no
  navegador embutido (ele bloqueia); o gatilho, o som e o aviso na tela, sim.
- Aviso de separação iniciada não toca na complementar: ela não passa por
  SEPARANDO (fica AGUARDANDO até ser entregue).

## Estado dos dados

Requisições de teste da diretoria (#8, #9, #10), item "teste" e uma linha manual
na reposição. Os dados da conferência final foram apagados; ficaram 4 PNGs de
assinatura no Storage (o `anon` não apaga). Usuário `Almoxarifado` ativo.
Próxima requisição: #15 até rodar o `ZERAR_MOVIMENTACAO.sql`.

## Scripts SQL de manutenção e relatórios

Pasta `sql/` (guia em `sql/README.md`). Os 11 scripts do projeto passam no
analisador oficial do PostgreSQL (libpg_query).

## Próximo passo

1. Rodar `AJUSTE_04_UNIDADES_E_PAUSA_INVENTARIO.sql` (só acrescenta; a 1.0 segue funcionando)
2. Substituir os arquivos no mesmo repositório do GitHub → o Netlify publica sozinho no mesmo link
3. Cadastrar as unidades extras dos itens (tela de itens ou CSV `UN/KG`)
4. **Não** rodar `ZERAR_MOVIMENTACAO.sql` nem `BANCO_DEFINITIVO.sql`: o banco tem dados reais
