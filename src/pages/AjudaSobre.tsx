import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import {
  ArrowLeft,
  Bell,
  Building2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Download,
  ExternalLink,
  FilePlus2,
  HelpCircle,
  Info,
  KeyRound,
  ListChecks,
  MapPin,
  MessageCircle,
  Package,
  PackageCheck,
  PenLine,
  Phone,
  ShoppingCart,
  Smartphone,
  TriangleAlert,
  Users,
  Eye,
  PauseCircle,
  PackageMinus,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useInstallApp } from "@/hooks/useInstallApp";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { toast } from "@/lib/toast";
import { estadoDosAvisos, pedirPermissaoDeAvisos, type EstadoAviso } from "@/lib/notificacoes";
import { ABA, ABA_ATIVA, ABA_INATIVA, ABAS, SUBTITULO, TITULO } from "@/lib/estilos";
import {
  APP,
  DATA_DA_PUBLICACAO,
  HOTEL,
  SUPORTE,
  linkLigar,
  linkMapa,
  linkWhatsApp,
} from "@/lib/sobre";

type Aba = "ajuda" | "sobre";

/** Um tópico do guia rápido: fecha e abre com um toque, sem biblioteca. */
function Topico({
  icone,
  titulo,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white shadow-sm open:shadow-md">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 select-none [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 [&_svg]:h-5 [&_svg]:w-5">
          {icone}
        </span>
        <span className="min-w-0 flex-1 font-bold text-slate-800 leading-snug">{titulo}</span>
        <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3 text-sm leading-relaxed text-slate-700">
        {children}
      </div>
    </details>
  );
}

/** Lista numerada de passos. */
const Passos = ({ children }: { children: React.ReactNode }) => (
  <ol className="list-decimal space-y-1.5 pl-5 marker:font-bold marker:text-teal-700">{children}</ol>
);

/** Observação curta em destaque no fim de um tópico. */
const Dica = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
    {children}
  </p>
);

/** Linha rótulo / valor dos cartões da aba Sobre. */
const Linha = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
  <div className="grid grid-cols-1 gap-0.5 py-2.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
    <dt className="text-xs font-bold uppercase tracking-wide text-slate-500">{rotulo}</dt>
    <dd className="min-w-0 break-words text-sm font-medium text-slate-800">{children}</dd>
  </div>
);

const Cartao = ({
  icone,
  titulo,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  children: React.ReactNode;
}) => (
  <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
    <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-teal-900 [&_svg]:h-4 [&_svg]:w-4">
      {icone}
      {titulo}
    </h2>
    {children}
  </section>
);

/** Botões de contato com o almoxarifado: WhatsApp e ligação. */
function BotoesDeContato() {
  const { user } = useAuth();
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <a
        href={linkWhatsApp(user)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 sm:w-auto sm:flex-1"
      >
        <MessageCircle className="h-4 w-4" /> Chamar no WhatsApp
      </a>
      <a
        href={linkLigar()}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 sm:w-auto"
      >
        <Phone className="h-4 w-4" /> Ligar
      </a>
    </div>
  );
}

/** Pílulas do lançamento no TOTVS, iguais às da lista de requisições. */
const PilulaLancamento = ({ lancada }: { lancada: boolean }) =>
  lancada ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
      <ClipboardCheck className="h-3 w-3 shrink-0" /> LANÇADA
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
      <ClipboardList className="h-3 w-3 shrink-0" /> A LANÇAR
    </span>
  );

const ROTULO_AVISOS: Record<EstadoAviso, string> = {
  granted: "Ligados",
  default: "Ainda não ligados",
  denied: "Bloqueados no navegador",
  indisponivel: "Este navegador não tem avisos",
};

export default function AjudaSobre() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const aba: Aba = params.get("aba") === "sobre" ? "sobre" : "ajuda";
  const trocarAba = (nova: Aba) => setParams(nova === "sobre" ? { aba: "sobre" } : {}, { replace: true });

  const ehAlmoxarifado = user?.perfil === "ALMOXARIFADO";
  const { instalado, podeInstalar, precisaInstrucaoIOS, promptInstall } = useInstallApp();
  const [avisos, setAvisos] = useState<EstadoAviso>(() => estadoDosAvisos());

  const instalar = async () => {
    const resposta = await promptInstall();
    if (resposta === "aceito") toast.success("App instalado! Ele aparece na tela inicial do aparelho.");
  };

  const ligarAvisos = async () => {
    const resposta = await pedirPermissaoDeAvisos();
    setAvisos(resposta);
    if (resposta === "granted") toast.success("Avisos ligados neste aparelho.");
    if (resposta === "denied") toast.info("Avisos bloqueados. Dá para liberar nas configurações do site, no navegador.");
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      {!ehAlmoxarifado && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/")}
          className="h-9 rounded-lg px-3 font-bold text-teal-950 hover:bg-teal-50 hover:text-teal-900"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao Início
        </Button>
      )}

      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className={TITULO}>Ajuda e Sobre</h1>
          <p className={SUBTITULO}>Como usar o sistema, contato do almoxarifado e dados do app.</p>
        </div>
        <div className={`${ABAS} w-full shrink-0 sm:w-64`} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={aba === "ajuda"}
            onClick={() => trocarAba("ajuda")}
            className={`${ABA} ${aba === "ajuda" ? ABA_ATIVA : ABA_INATIVA}`}
          >
            <HelpCircle className="h-4 w-4 shrink-0" /> Ajuda
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === "sobre"}
            onClick={() => trocarAba("sobre")}
            className={`${ABA} ${aba === "sobre" ? ABA_ATIVA : ABA_INATIVA}`}
          >
            <Info className="h-4 w-4 shrink-0" /> Sobre
          </button>
        </div>
      </div>

      {aba === "ajuda" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Contato primeiro: é o que resolve qualquer dúvida que o guia não cobre. */}
          <section className="rounded-xl border border-teal-200 bg-teal-50 p-4 sm:p-5">
            <p className="text-base font-bold text-teal-950">Precisa de ajuda?</p>
            <p className="mb-3 text-sm text-teal-900">
              Fale com o <strong>{SUPORTE.setor}</strong> pelo {SUPORTE.telefone} — dúvidas,
              problemas no app, senha esquecida ou pedido urgente.
            </p>
            <BotoesDeContato />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-teal-900">Guia rápido</h2>

            <Topico icone={<FilePlus2 />} titulo="Como fazer um pedido">
              <Passos>
                <li>
                  {ehAlmoxarifado ? (
                    <>No menu, toque em <strong>Nova Requisição</strong>.</>
                  ) : (
                    <>Na tela inicial, toque em <strong>Nova Requisição</strong>.</>
                  )}
                </li>
                <li>
                  Tem algo importante (prazo, evento, cuidado com algum item)? Escreva na caixa
                  amarela de <strong>Observação</strong>, logo no começo. Ela aparece em destaque,
                  no topo, para quem separa.
                </li>
                <li>
                  Digite o nome do material — não precisa de acento — ou toque no ícone de lista
                  para ver todos.
                </li>
                <li>
                  Escolha a <strong>quantidade</strong> e a <strong>unidade</strong> (obrigatória).
                  Só aparecem as unidades cadastradas para aquele material — por exemplo, carne em
                  UN ou KG.
                </li>
                <li>Toque em <strong>Adicionar ao Pedido</strong>. Repita para cada material.</li>
                <li>
                  Confira a lista (dá para mudar a quantidade ali mesmo) e toque em{" "}
                  <strong>Enviar Requisição</strong>.
                </li>
              </Passos>
              <p>
                Esqueceu de avisar algo? Abra a requisição e toque em <strong>Editar</strong> na
                caixa de observação (ou <strong>Adicionar observação</strong>), enquanto ela ainda
                está pendente. O almoxarifado pode editar a qualquer momento.
              </p>
              <Dica>
                Se sair da tela no meio do pedido, os itens ficam guardados neste aparelho até você
                voltar e enviar. Se aparecer “Novas requisições suspensas”, o almoxarifado está em
                inventário: espere liberar.
              </Dica>
            </Topico>

            <Topico icone={<Eye />} titulo="Como acompanhar o pedido">
              <Passos>
                <li>
                  Toque em <strong>{ehAlmoxarifado ? "Requisições" : "Minhas Requisições"}</strong>.
                  A lista se atualiza sozinha, sem precisar recarregar.
                </li>
                <li>
                  Toque num pedido para ver os itens, o que foi separado e o histórico com cada
                  passo.
                </li>
              </Passos>
              <p>O significado de cada cor está em “O que significa cada status”, mais abaixo.</p>
            </Topico>

            <Topico icone={<PenLine />} titulo="Como corrigir ou cancelar um pedido">
              <p>
                Enquanto o pedido estiver <StatusBadge status="PENDENTE" />, abra-o e toque em{" "}
                <strong>Editar Requisição</strong> ou <strong>Cancelar</strong>.
              </p>
              <p>
                Depois que a separação começa, só o almoxarifado consegue alterar. Fale com ele pelo
                WhatsApp.
              </p>
            </Topico>

            <Topico icone={<PackageCheck />} titulo="Na hora de receber o material">
              <Passos>
                <li>Confira item por item com o almoxarifado: quantidade, validade e embalagem.</li>
                <li>
                  Leia o termo de recebimento, marque <strong>Li e concordo</strong> e assine na
                  tela.
                </li>
              </Passos>
              <Dica>
                Achou alguma diferença? Avise <strong>antes</strong> de assinar. Se faltou material,
                ele vai numa requisição complementar e chega depois.
              </Dica>
            </Topico>

            <Topico icone={<Bell />} titulo="Receber avisos no celular">
              <p>
                {ehAlmoxarifado
                  ? "O aparelho avisa quando chega uma requisição nova."
                  : "O aparelho avisa quando o almoxarifado começa a separar o seu pedido."}{" "}
                O aviso chega com o app aberto ou minimizado.
              </p>
              <p>
                Neste aparelho: <strong>{ROTULO_AVISOS[avisos]}</strong>.
              </p>
              {avisos === "default" && (
                <Button onClick={ligarAvisos} className="h-10 bg-teal-600 font-bold text-white hover:bg-teal-700">
                  <Bell className="mr-2 h-4 w-4" /> Ligar avisos
                </Button>
              )}
              {avisos === "denied" && (
                <Dica>
                  Para liberar: toque no cadeado ao lado do endereço do site → Permissões →
                  Notificações → Permitir.
                </Dica>
              )}
            </Topico>

            <Topico icone={<Smartphone />} titulo="Instalar o app no celular">
              {instalado ? (
                <p className="font-semibold text-emerald-700">O app já está instalado neste aparelho. ✓</p>
              ) : podeInstalar ? (
                <>
                  <p>Um toque instala o app na tela inicial, como qualquer outro aplicativo.</p>
                  <Button onClick={instalar} className="h-10 bg-teal-600 font-bold text-white hover:bg-teal-700">
                    <Download className="mr-2 h-4 w-4" /> Instalar agora
                  </Button>
                </>
              ) : precisaInstrucaoIOS ? (
                <Passos>
                  <li>No Safari, toque em <strong>Compartilhar</strong> (o quadrado com a seta para cima).</li>
                  <li>Role e toque em <strong>Adicionar à Tela de Início</strong>.</li>
                  <li>Confirme em <strong>Adicionar</strong>.</li>
                </Passos>
              ) : (
                <Passos>
                  <li>Abra o menu do navegador (os três pontinhos ⋮).</li>
                  <li>Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.</li>
                </Passos>
              )}
            </Topico>

            <Topico icone={<KeyRound />} titulo="Esqueci minha senha">
              <p>
                Por segurança, a senha não pode ser vista nem recuperada pelo app. O almoxarifado
                cria uma nova para você.
              </p>
            </Topico>

            {ehAlmoxarifado && (
              <>
                <h3 className="pt-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Só para o almoxarifado
                </h3>

                <Topico icone={<ListChecks />} titulo="Separar e entregar">
                  <Passos>
                    <li>
                      Abra a requisição e toque em <strong>Iniciar Separação</strong>. O solicitante
                      é avisado.
                    </li>
                    <li>
                      Toque em cada item para marcar como separado. O lápis ajusta a quantidade e a{" "}
                      <strong>unidade entregue</strong> (pedido 5 UN de carne, entregue 6,2 KG);{" "}
                      <strong>Em falta</strong> zera o item. O que fica registrado é o entregue.
                    </li>
                    <li><strong>+ Item</strong> inclui um material que não estava no pedido.</li>
                    <li>
                      <strong>Finalizar Requisição</strong> → confira os itens com o solicitante →
                      termo e assinatura dele → assinatura do almoxarifado.
                    </li>
                    <li>
                      Pronto: aparece “finalizada com sucesso”. Lançar no TOTVS e imprimir ficam para
                      depois, quando der tempo (veja abaixo).
                    </li>
                  </Passos>
                  <Dica>
                    Só um operador separa cada pedido por vez. Para desistir, use{" "}
                    <strong>Cancelar</strong>: o pedido volta para PENDENTE. Se sair sem cancelar, a
                    separação fica presa com você por até 30 minutos.
                  </Dica>
                </Topico>

                <Topico icone={<TriangleAlert />} titulo="Quando falta material">
                  <p>
                    Se você separa menos do que foi pedido, a requisição é finalizada com{" "}
                    <strong>ruptura</strong> e o sistema cria sozinho uma{" "}
                    <strong>requisição complementar</strong> (AGUARDANDO) com o que faltou. O mesmo
                    material entra na <strong>Lista de Reposição</strong>.
                  </p>
                  <p>
                    Quando chegar, abra a complementar — ou toque em <strong>Resolver</strong> na
                    Lista de Reposição — e separe normalmente.
                  </p>
                  <p>
                    Chegou só parte? Separe o que tem e finalize: a complementar fecha com o que
                    foi entregue (e pode ser lançada no TOTVS), e o sistema cria outra só com o que
                    ainda falta. Urgência e “já pedido” passam junto para a nova.
                  </p>
                </Topico>

                <Topico icone={<ClipboardList />} titulo="Lançar no TOTVS">
                  <Passos>
                    <li>
                      Na requisição entregue, toque em <strong>Lançar</strong>. Os dados aparecem
                      na ordem da Requisição Manual do TOTVS: Destino, Nº, Data, Descrição, Unid. e
                      Qtde.
                    </li>
                    <li><strong>Copiar lista</strong> copia os itens para colar onde precisar.</li>
                    <li>Depois de lançar lá, toque em <strong>Marcar como lançada</strong>.</li>
                    <li>
                      Só então o app libera o <strong>Imprimir</strong>. O comprovante sai com o nome
                      de quem lançou e de quem imprimiu.
                    </li>
                  </Passos>
                  <p>
                    O filtro <strong>A lançar</strong>, na lista de Requisições, mostra o que ainda
                    falta. Marcou por engano? Abra de novo e toque em{" "}
                    <strong>Desfazer lançamento</strong>.
                  </p>
                </Topico>

                <Topico icone={<PackageMinus />} titulo="Devolução (mandou a mais)">
                  <p>
                    Entregou a mais e buscou de volta no setor? Abra a requisição entregue e toque em{" "}
                    <strong>Registrar devolução</strong>: escolha o item, quanto voltou e o motivo.
                  </p>
                  <p>
                    O entregue (o que foi assinado) continua registrado, e o que voltou aparece
                    embaixo do item. O lançamento no TOTVS, o comprovante e os relatórios passam a
                    usar o que ficou no setor (entregue 5 KG, voltou 1,2 KG → saída de 3,8 KG).
                  </p>
                  <p>
                    Só antes de lançar no TOTVS. Já lançou? Toque em{" "}
                    <strong>Desfazer lançamento</strong>, registre a devolução e lance de novo.
                    Registrou errado? Toque em <strong>Desfazer</strong> ao lado da devolução. Mandou
                    a menos? Faça outra requisição com o que faltou.
                  </p>
                </Topico>

                <Topico icone={<ShoppingCart />} titulo="Lista de Reposição (compras)">
                  <p>
                    Reúne o que precisa ser comprado: as faltas das requisições e o que você incluir
                    em <strong>Adicionar item</strong>.
                  </p>
                  <p>
                    Em <strong>Definir Status</strong>, marque como urgente (com prazo) ou como já
                    pedido ao fornecedor. <strong>Resolver</strong> dá baixa, inclusive de parte da
                    quantidade. O ícone de relógio mostra o histórico de baixas, e a impressora gera
                    a lista para cotação.
                  </p>
                </Topico>

                <Topico icone={<Package />} titulo="Cadastro de itens">
                  <p>
                    Em <strong>Controle de Itens</strong>, cadastre em <strong>Novo item</strong> e
                    marque <strong>todas as unidades</strong> em que o material pode ser pedido (carne:
                    UN e KG). Só essas aparecem para quem pede.
                  </p>
                  <p>
                    Muitos de uma vez: <strong>Importar CSV</strong> com coluna A = nome e coluna B =
                    unidades separadas por barra (ex.: <code>UN/KG</code>). Item que já existe ganha as
                    unidades novas; nenhuma é removida.
                  </p>
                  <p>
                    Material que já saiu em alguma requisição não é apagado: é arquivado e continua
                    aparecendo no histórico.
                  </p>
                </Topico>

                <Topico icone={<PauseCircle />} titulo="Pausar requisições (inventário)">
                  <p>
                    No Início, toque em <strong>Pausar requisições</strong> e confirme. Enquanto
                    estiver pausado, ninguém cria requisição nova — os pedidos que já existem
                    continuam: dá para separar, entregar e lançar.
                  </p>
                  <p>
                    Todos veem uma faixa amarela no topo. Para voltar ao normal, toque em{" "}
                    <strong>Liberar requisições</strong> nessa faixa.
                  </p>
                </Topico>

                <Topico icone={<Users />} titulo="Cadastro de usuários">
                  <p>
                    Em <strong>Usuários → Novo usuário</strong>. O nome é o login, e a senha precisa
                    de pelo menos 4 caracteres. Para trocar a senha de alguém, edite o usuário e
                    digite a nova.
                  </p>
                  <p>
                    Prefira <strong>Desativar</strong> a excluir: a pessoa perde o acesso, mas o nome
                    continua nos pedidos antigos. O sistema nunca fica sem um usuário do
                    Almoxarifado ativo.
                  </p>
                </Topico>
              </>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-teal-900">O que significa cada status</h2>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
              {[
                { status: "PENDENTE", texto: "Pedido enviado, esperando o almoxarifado começar. Ainda dá para editar ou cancelar." },
                { status: "SEPARANDO", texto: "O almoxarifado está separando o material." },
                { status: "FINALIZADA", texto: "Material entregue e assinado." },
                { status: "RUPTURA_PARCIAL", texto: "Entregue, mas faltou parte. O que faltou vai numa requisição complementar." },
                { status: "RUPTURA_TOTAL", texto: "Nenhum item estava disponível. Tudo vai na requisição complementar." },
                { status: "AGUARDANDO", texto: "Requisição complementar: esperando o material chegar para ser entregue." },
                { status: "CANCELADA", texto: "Pedido cancelado. Se ainda precisar, faça um novo." },
              ].map(({ status, texto }) => (
                <div key={status} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex shrink-0 flex-wrap gap-1 sm:w-56">
                    <StatusBadge status={status} />
                  </div>
                  <p className="text-sm text-slate-700">{texto}</p>
                </div>
              ))}
              {ehAlmoxarifado && (
                <>
                  <div className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="shrink-0 sm:w-56"><PilulaLancamento lancada={false} /></div>
                    <p className="text-sm text-slate-700">Entregue, falta dar baixa no TOTVS.</p>
                  </div>
                  <div className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:gap-4">
                    <div className="shrink-0 sm:w-56"><PilulaLancamento lancada /></div>
                    <p className="text-sm text-slate-700">Já baixada no TOTVS.</p>
                  </div>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {aba === "sobre" && (
        <div className="space-y-4 animate-in fade-in duration-200">
          <section className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <img src="/icon-192x192.png" alt="" className="h-16 w-16 object-contain" />
            <div>
              <p className="text-xl font-bold text-teal-900">{APP.nome}</p>
              <p className="text-sm font-medium text-slate-600">{HOTEL.nome} · Almoxarifado</p>
            </div>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">
              Versão {APP.versao} · publicada em {format(DATA_DA_PUBLICACAO, "dd/MM/yyyy")}
            </span>
            <p className="max-w-xl text-sm leading-relaxed text-slate-600">{APP.descricao}</p>
          </section>

          <Cartao icone={<Info />} titulo="O aplicativo">
            <dl className="divide-y divide-slate-100">
              <Linha rotulo="Versão">
                {APP.versao} <span className="text-slate-500">(publicada em {format(DATA_DA_PUBLICACAO, "dd/MM/yyyy 'às' HH:mm")})</span>
              </Linha>
              <Linha rotulo="Desenvolvido por">{APP.desenvolvedor}</Linha>
              <Linha rotulo="Uso">Interno e exclusivo dos colaboradores do {HOTEL.nome}.</Linha>
            </dl>
          </Cartao>

          <Cartao icone={<Building2 />} titulo="O hotel">
            <dl className="divide-y divide-slate-100">
              <Linha rotulo="Nome">{HOTEL.nome}</Linha>
              <Linha rotulo="CNPJ"><span className="tabular-nums">{HOTEL.cnpj}</span></Linha>
              <Linha rotulo="Data de abertura"><span className="tabular-nums">{HOTEL.abertura}</span></Linha>
              <Linha rotulo="Endereço">
                {HOTEL.enderecoLinha1}
                <br />
                {HOTEL.enderecoLinha2}
                <a
                  href={linkMapa()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex w-fit items-center gap-1 text-xs font-bold text-teal-700 underline underline-offset-2 hover:text-teal-900"
                >
                  <MapPin className="h-3.5 w-3.5" /> Ver no mapa <ExternalLink className="h-3 w-3" />
                </a>
              </Linha>
            </dl>
          </Cartao>

          <Cartao icone={<MessageCircle />} titulo="Suporte">
            <dl className="mb-3 divide-y divide-slate-100">
              <Linha rotulo="Setor">{SUPORTE.setor}</Linha>
              <Linha rotulo="WhatsApp e telefone"><span className="tabular-nums">{SUPORTE.telefone}</span></Linha>
            </dl>
            <BotoesDeContato />
          </Cartao>

          {/* O que o suporte pergunta primeiro: quem é, e em que aparelho. */}
          <Cartao icone={<Smartphone />} titulo="Neste aparelho">
            <dl className="divide-y divide-slate-100">
              <Linha rotulo="Conectado como">
                {user?.nome}
                <span className="text-slate-500"> · {user?.departamento}</span>
              </Linha>
              <Linha rotulo="Perfil">{ehAlmoxarifado ? "Almoxarifado" : "Solicitante"}</Linha>
              <Linha rotulo="App instalado">{instalado ? "Sim" : "Não (aberto pelo navegador)"}</Linha>
              <Linha rotulo="Avisos">{ROTULO_AVISOS[avisos]}</Linha>
            </dl>
          </Cartao>

          <p className="pt-2 text-center text-xs text-slate-500">
            {APP.nome} {APP.versao} · {HOTEL.nome}
          </p>
        </div>
      )}
    </div>
  );
}
