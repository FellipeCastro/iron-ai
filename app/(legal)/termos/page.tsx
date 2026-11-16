import type { Metadata } from "next";
import Link from "next/link";
import { Callout, LegalPage, List, Strong, type LegalSection } from "@/components/legal/legal-page";
import { ANNUAL_PRICE, MONTHLY_PRICE } from "@/components/landing/pricing";
import { PRIVACY_URL, SETTINGS_URL } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Termos de serviço",
  alternates: { canonical: "/termos" },
  description: "As regras de uso do Iron AI: conta, assinatura e cobrança, Telegram, limites, IA, conteúdo e responsabilidades.",
};

// The "60 mensagens" and "1.000 mensagens" below mirror the defaults of dailyMessageLimit / monthlyMessageLimit (lib/limits.ts); not imported because that module loads the database client.

const brl = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const linkClass = "font-medium text-[#111] underline underline-offset-2";

const sections: LegalSection[] = [
  {
    id: "aceite",
    title: "Aceitação dos termos",
    content: (
      <p>
        Estes Termos de serviço regem o uso do Iron AI — o site, o painel web e o bot no Telegram (o “Serviço”) — oferecido por{" "}
        Fellipe da Silva Castro (“nós”).
        Ao criar uma conta ou usar o Serviço, você concorda com estes termos e com a{" "}
        <Link href={PRIVACY_URL} className={linkClass}>
          Política de privacidade
        </Link>
        . Se não concordar, não use o Serviço.
      </p>
    ),
  },
  {
    id: "servico",
    title: "O que é o Iron AI",
    content: (
      <>
        <p>O Iron AI é um assistente para registrar e acompanhar treinos de musculação. Com ele você pode:</p>
        <List>
          <li>registrar séries em texto livre pelo Telegram, corrigi-las ou apagá-las;</li>
          <li>montar seus treinos (A, B, C…) com rodízio automático;</li>
          <li>receber metas calculadas por uma regra fixa de progressão de 6 a 12 repetições, com aumento de carga pelo incremento que você configurar;</li>
          <li>receber lembretes nos seus dias e horário de treino e resumos ao final de cada sessão;</li>
          <li>consultar histórico, recordes, relatórios e gráficos no painel web.</li>
        </List>
        <p>
          Podemos alterar, adicionar ou remover funcionalidades ao longo do tempo para melhorar o Serviço.
        </p>
      </>
    ),
  },
  {
    id: "elegibilidade",
    title: "Quem pode usar",
    content: (
      <p>
        Para usar o Serviço você precisa ter pelo menos 18 anos e capacidade para aceitar estes 
        termos. Para usar o bot, você também precisa de uma conta no Telegram.
      </p>
    ),
  },
  {
    id: "conta",
    title: "Sua conta e o vínculo com o Telegram",
    content: (
      <>
        <List>
          <li>A conta é criada no site. Informe dados verdadeiros e mantenha suas credenciais em sigilo; você é responsável pelo que acontece na sua conta.</li>
          <li>
            O Telegram é vinculado por um link pessoal, de uso único, que expira em 15 minutos. Não compartilhe esse link: quem o
            abrir primeiro conecta o próprio Telegram à sua conta.
          </li>
          <li>Cada conta tem um único chat do Telegram vinculado, e cada chat só pode estar vinculado a uma conta. Vincular de novo substitui o chat anterior.</li>
          <li>
            Você pode desconectar o Telegram a qualquer momento em{" "}
            <Link href={SETTINGS_URL} className={linkClass}>
              Configurações
            </Link>
            .
          </li>
        </List>
      </>
    ),
  },
  {
    id: "assinatura",
    title: "Assinatura e cobrança",
    content: (
      <>
        <p>
          O Iron AI é um serviço por assinatura. Para usar o painel e o bot é preciso ter uma assinatura ativa.
        </p>
        <List>
          <li>
            <Strong>Planos:</Strong> mensal, por {brl(MONTHLY_PRICE)} a cada mês, ou anual, por {brl(ANNUAL_PRICE)} a cada ano, cobrado à vista. Os dois
            incluem os mesmos recursos. Os valores estão em reais e podem incluir tributos, quando aplicáveis.
          </li>
          <li>
            <Strong>Primeira cobrança:</Strong> não há teste grátis. O valor do plano escolhido é cobrado no cartão assim que
            você conclui a assinatura.
          </li>
          <li>
            <Strong>Renovação automática:</Strong> a assinatura se renova ao fim de cada período (mês ou ano) e o cartão é
            cobrado até você cancelar.
          </li>
          <li>
            <Strong>Pagamento:</Strong> é processado pela Stripe. Não vemos nem guardamos o número do seu cartão. Se uma cobrança
            falhar, a assinatura fica com pagamento pendente e o acesso é mantido enquanto a Stripe tenta cobrar de novo; se
            as tentativas falharem, a assinatura é encerrada e o acesso é bloqueado.
          </li>
          <li>
            <Strong>Cancelamento:</Strong> você cancela quando quiser em{" "}
            <Link href={SETTINGS_URL} className={linkClass}>
              Configurações
            </Link>
            , em “Gerenciar assinatura”. O acesso continua até o fim do período já pago e não há nova cobrança.
            Você também pode trocar de plano ou atualizar o cartão por lá.
          </li>
          <li>
            <Strong>Reembolso:</Strong> se você contratou pela internet, pode se arrepender em até 7 dias corridos contados da
            cobrança, com devolução do valor (art. 49 do Código de Defesa do Consumidor). Escreva para{" "}
            fehcastru@gmail.com. Fora desse prazo, cobranças já feitas não são reembolsadas, salvo
            cobrança indevida ou quando a lei exigir.
          </li>
          <li>
            <Strong>Mudança de preço:</Strong> podemos reajustar os preços. O novo valor só vale para a próxima renovação, depois
            de avisarmos você com antecedência pelo site, pelo bot ou por e-mail. Se não concordar, cancele antes da renovação.
          </li>
          <li>
            <Strong>Fim da assinatura:</Strong> sem assinatura ativa, o painel, o bot e os lembretes ficam bloqueados. Seus dados
            continuam guardados e voltam a ficar disponíveis se você assinar de novo; você pode excluí-los a qualquer momento
            apagando a conta.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "limites",
    title: "Limites de uso",
    content: (
      <>
        <p>Para manter o Serviço estável para todos, existem limites mesmo com a assinatura ativa:</p>
        <List>
          <li>
            <Strong>Até 60 mensagens de texto por dia e 1.000 por mês</Strong> para o bot, contadas no seu fuso horário. Toques
            em botões não contam. Acima do limite, o bot deixa de registrar até o dia (ou mês) seguinte; o painel web continua funcionando.
          </li>
          <li>
            <Strong>Teto diário de uso da IA</Strong> para todo o Serviço. Se ele for atingido, o bot pode pausar temporariamente a
            leitura de mensagens. Nada é registrado nesse período, e você será avisado no chat.
          </li>
        </List>
      </>
    ),
  },
  {
    id: "uso-aceitavel",
    title: "Uso aceitável",
    content: (
      <>
        <p>Ao usar o Serviço, você concorda em não:</p>
        <List>
          <li>usar o bot para fins diferentes do registro e acompanhamento dos seus treinos;</li>
          <li>enviar conteúdo ilegal, ofensivo, ou dados pessoais de terceiros;</li>
          <li>tentar contornar os limites de uso, por exemplo com várias contas ou automações;</li>
          <li>sobrecarregar, atacar, testar vulnerabilidades ou acessar áreas e dados de outros usuários sem autorização;</li>
          <li>copiar, fazer engenharia reversa ou revender o Serviço, salvo quando a lei permitir.</li>
        </List>
      </>
    ),
  },
  {
    id: "conteudo",
    title: "Seu conteúdo",
    content: (
      <>
        <p>
          Os dados que você registra — treinos, séries, exercícios personalizados e mensagens — continuam sendo seus. Você nos
          concede uma permissão limitada, não exclusiva e gratuita para armazenar, processar e exibir esse conteúdo apenas para
          prestar o Serviço a você, inclusive enviando-o aos prestadores descritos na Política de privacidade (como o serviço de
          IA que interpreta suas mensagens).
        </p>
        <p>
          Essa permissão termina quando você apaga o conteúdo ou exclui sua conta, observados os prazos de retenção da Política
          de privacidade. Se você enviar feedback, poderemos usá-lo para melhorar o Serviço sem obrigação com você.
        </p>
      </>
    ),
  },
  {
    id: "ia",
    title: "Interpretação por IA",
    content: (
      <>
        <p>
          As mensagens de texto são interpretadas por um modelo de inteligência artificial de terceiros (OpenAI), que transforma o
          que você escreveu em exercício, séries, repetições e carga. As metas, a progressão, os recordes e as respostas do bot
          são calculados por regras fixas, não pela IA.
        </p>
        <List>
          <li>A interpretação pode errar — por exemplo, confundir um exercício ou um número. Confira o que foi registrado.</li>
          <li>Quando a confiança é baixa ou o exercício é ambíguo, o bot pede confirmação antes de gravar.</li>
          <li>Você pode corrigir ou apagar qualquer série pelo chat; as metas são recalculadas a partir do histórico.</li>
        </List>
      </>
    ),
  },
  {
    id: "saude",
    title: "Não é orientação profissional",
    content: (
      <Callout>
        O Iron AI é uma ferramenta de registro. As metas seguem uma regra matemática simples e{" "}
        <Strong>não consideram seu condicionamento, histórico de lesões ou condições de saúde</Strong>. Elas não substituem a
        orientação de um profissional de educação física ou de saúde. Respeite seus limites, use técnica e cargas adequadas e
        procure um profissional antes de iniciar ou intensificar treinos. Você é o único responsável pela forma como treina.
      </Callout>
    ),
  },
  {
    id: "terceiros",
    title: "Serviços de terceiros",
    content: (
      <p>
        O Serviço depende de serviços de terceiros, como Telegram (canal do bot), Clerk (login), Stripe (pagamentos), OpenAI (interpretação de
        mensagens) e provedores de hospedagem, banco de dados e monitoramento. O uso do Telegram está sujeito aos termos do
        próprio Telegram. Não controlamos esses serviços e não respondemos por indisponibilidades ou mudanças causadas por eles,
        embora trabalhemos para reduzir o impacto para você.
      </p>
    ),
  },
  {
    id: "propriedade",
    title: "Propriedade intelectual",
    content: (
      <p>
        O Iron AI, incluindo marca, logotipo, design, textos, código e o catálogo de exercícios, pertence a nós ou aos nossos
        licenciantes. Estes termos não transferem a você nenhum direito sobre eles, além da permissão pessoal, revogável e
        intransferível de usar o Serviço conforme estes termos.
      </p>
    ),
  },
  {
    id: "garantias",
    title: "Disponibilidade e garantias",
    content: (
      <p>
        Oferecemos o Serviço “no estado em que se encontra”. Fazemos o possível para mantê-lo funcionando e
        preciso, mas não garantimos que ele estará sempre disponível, livre de erros ou que as interpretações e metas serão
        sempre corretas. Isso não afasta os direitos que a legislação brasileira, incluindo o Código de Defesa do Consumidor, lhe
        assegura.
      </p>
    ),
  },
  {
    id: "responsabilidade",
    title: "Limitação de responsabilidade",
    content: (
      <p>
        Na máxima extensão permitida por lei, não respondemos por danos indiretos, lucros cessantes, perda de dados causada por
        terceiros ou por lesões decorrentes da prática de exercícios. Nada nestes termos limita a responsabilidade que não possa
        ser limitada por lei, incluindo a decorrente de dolo ou culpa grave.
      </p>
    ),
  },
  {
    id: "encerramento",
    title: "Suspensão e encerramento",
    content: (
      <>
        <p>
          <Strong>Por você:</Strong> você pode parar de usar o Serviço a qualquer momento e excluir sua conta em{" "}
          <Link href={SETTINGS_URL} className={linkClass}>
            Configurações
          </Link>
          . A exclusão é imediata e definitiva, cancela a assinatura na hora (sem novas cobranças e sem reembolso do período em
          curso, salvo o direito de arrependimento acima) e apaga seus dados conforme a{" "}
          <Link href={`${PRIVACY_URL}#exclusao`} className={linkClass}>
            Política de privacidade
          </Link>
          .
        </p>
        <p>
          <Strong>Por nós:</Strong> podemos suspender ou encerrar o acesso de quem violar estes termos ou colocar o Serviço ou
          outros usuários em risco, avisando quando possível. Também podemos descontinuar o Serviço, com aviso prévio razoável
          sempre que possível. Se encerrarmos a sua assinatura sem culpa sua, devolvemos o valor proporcional ao período já pago e não utilizado.
        </p>
      </>
    ),
  },
  {
    id: "alteracoes",
    title: "Alterações dos termos",
    content: (
      <p>
        Podemos atualizar estes termos. A data no topo indica a versão vigente. Mudanças relevantes serão avisadas pelo site ou
        pelo bot antes de entrarem em vigor; se continuar usando o Serviço depois disso, você aceita a nova versão. Se não
        concordar, pode excluir sua conta.
      </p>
    ),
  },
  {
    id: "lei",
    title: "Lei aplicável e foro",
    content: (
      <p>
        Estes termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o foro do domicílio do consumidor
        para resolver qualquer controvérsia, sem prejuízo de tentarmos antes uma solução amigável pelo contato abaixo.
      </p>
    ),
  },
  {
    id: "contato",
    title: "Contato",
    content: (
      <p>
        Dúvidas sobre estes termos: fehcastru@gmail.com.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Termos de serviço"
      updatedAt="28 de outubro de 2026"
      intro={
        <p>
          Leia com atenção. Estes termos explicam como o Iron AI funciona, o que você pode esperar dele e o que esperamos de
          quem usa.
        </p>
      }
      sections={sections}
    />
  );
}
