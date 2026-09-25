# Status

Última atualização: **25/09/2026**. Conferência final antes da publicação.

## Situação geral

App funcional, testado de ponta a ponta contra o Supabase real nos dois perfis
e no build de produção. Pronto para publicar.

## Concluído (validado no navegador, contra o Supabase real)

- Fluxo completo: pedido → separação → conferência → termo → duas assinaturas → PDF
- Ruptura automática: complementar + lista de reposição vinculadas, com a unidade do pedido
- Lançamento no TOTVS: pílula, filtro e modal espelhando a Requisição Manual
- Unidade por linha do pedido (UN pré-selecionado)
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

1. Publicar no GitHub → Netlify → deploy
2. Rodar `sql/manutencao/ZERAR_MOVIMENTACAO.sql` e limpar o Storage pelo painel
