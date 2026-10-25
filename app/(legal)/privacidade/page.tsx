import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DataTable, LegalPage, List, Placeholder, Strong, type LegalSection } from "@/components/legal/legal-page";
import { SETTINGS_URL, TERMS_URL } from "@/lib/routes";

export const metadata: Metadata = {
  title: "Política de privacidade — Iron AI",
  description: "Quais dados o Iron AI coleta, como usa, com quem compartilha e como você pode excluí-los.",
};

const sections: LegalSection[] = [
  {
    id: "controlador",
    title: "Quem somos",
    content: (
      <>
        <p>
          O Iron AI é um assistente de treino que funciona no Telegram, com um painel web para rotina, histórico e gráficos. O
          controlador dos seus dados pessoais, nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/2018 — LGPD), é{" "}
          <Placeholder>NOME OU RAZÃO SOCIAL DO RESPONSÁVEL</Placeholder>, <Placeholder>CPF/CNPJ</Placeholder>, com endereço em{" "}
          <Placeholder>ENDEREÇO</Placeholder>.
        </p>
        <p>
          Encarregado pelo tratamento de dados (DPO): <Placeholder>NOME DO ENCARREGADO</Placeholder> —{" "}
          <Placeholder>E-MAIL DE PRIVACIDADE</Placeholder>.
        </p>
      </>
    ),
  },
  {
    id: "dados-coletados",
    title: "Quais dados coletamos",
    content: (
      <>
        <p>Coletamos apenas o necessário para o serviço funcionar:</p>
        <DataTable
          head={["Categoria", "O que é", "Origem"]}
          rows={[
            [
              <Strong key="c">Conta</Strong>,
              "E-mail, nome e demais dados que você informa no cadastro e login (incluindo, se usar, o login por um provedor externo). Esses dados ficam com o nosso provedor de autenticação; no nosso banco guardamos apenas um identificador da conta.",
              "Você, no cadastro",
            ],
            [
              <Strong key="p">Preferências</Strong>,
              "Fuso horário, horário do lembrete, dias de treino e incremento de carga.",
              "Você, em Configurações",
            ],
            [
              <Strong key="t">Telegram</Strong>,
              "ID do chat, seu @usuário (se houver) e o estado da conversa (por exemplo, uma confirmação pendente ou o rascunho de uma rotina).",
              "Telegram, ao vincular a conta",
            ],
            [
              <Strong key="tr">Treino</Strong>,
              "Rotina (treinos A/B/C, exercícios e séries planejadas), sessões, séries registradas (exercício, carga e repetições), correções, metas calculadas e exercícios personalizados que você criar.",
              "Você, pelo chat ou pelo painel",
            ],
            [
              <Strong key="m">Mensagens</Strong>,
              "O texto das mensagens que você envia ao bot (e os comandos dos botões) e a interpretação gerada a partir dele.",
              "Você, pelo Telegram",
            ],
            [
              <Strong key="o">Uso e operação</Strong>,
              "Contador diário de mensagens, registro de lembretes enviados, registros técnicos de erros e desempenho e, se você enviar, o conteúdo do formulário de feedback.",
              "Gerados pelo serviço / você",
            ],
          ]}
        />
        <p>
          Não pedimos e não precisamos de dados como peso corporal, medidas, condições de saúde, localização, contatos ou
          documentos. Mensagens que não são texto (fotos, áudios, figurinhas) não são lidas pelo bot. Por favor, não envie
          informações sensíveis no chat.
        </p>
      </>
    ),
  },
  {
    id: "finalidades",
    title: "Como usamos seus dados e bases legais",
    content: (
      <>
        <List>
          <li>
            <Strong>Prestar o serviço</Strong> — registrar séries, calcular a progressão (8 a 12 repetições), montar o próximo
            treino, gerar resumos, relatórios e gráficos e enviar lembretes nos dias e horário que você escolheu. Base legal:
            execução de contrato (art. 7º, V, da LGPD).
          </li>
          <li>
            <Strong>Vincular o Telegram à sua conta</Strong> — por meio de um link de uso único que expira em 15 minutos. Base
            legal: execução de contrato.
          </li>
          <li>
            <Strong>Manter o serviço estável e seguro</Strong> — limite diário de mensagens, teto de gasto com o serviço de IA,
            diagnóstico de erros e auditoria de ações importantes (como salvar a rotina, alterar lembretes, desconectar o
            Telegram ou excluir a conta). Base legal: legítimo interesse (art. 7º, IX).
          </li>
          <li>
            <Strong>Melhorar o produto</Strong> — a partir do feedback que você escolher enviar. Base legal: legítimo interesse.
          </li>
        </List>
        <p>
          Não vendemos seus dados, não exibimos anúncios e não usamos seus dados para criar perfis de marketing.
        </p>
      </>
    ),
  },
  {
    id: "ia",
    title: "Como usamos IA nos seus dados",
    content: (
      <>
        <p>
          Quando você manda uma mensagem de texto ao bot, ela é enviada à <Strong>OpenAI</Strong> para ser{" "}
          <Strong>interpretada</Strong> — por exemplo, transformar “supino 3x10 com 20kg” em exercício, séries, repetições e
          carga. Junto com a mensagem enviamos um contexto mínimo: os nomes dos exercícios da sua rotina, as metas do treino do
          dia e suas últimas séries registradas.
        </p>
        <List>
          <li>A IA apenas interpreta o texto. Metas, progressão, recordes e respostas são calculados por regras fixas do nosso código.</li>
          <li>
            As chamadas são feitas com a opção de não armazenamento da resposta (<code>store: false</code>) e não enviamos seu
            nome, e-mail ou @usuário do Telegram.
          </li>
          <li>Comandos (como /treino, /semana, /terminei) e toques em botões não passam pela IA.</li>
          <li>Mensagens de quem ainda não vinculou uma conta não são enviadas à IA.</li>
          <li>Quando a interpretação tem baixa confiança, o bot pede confirmação antes de gravar qualquer coisa.</li>
        </List>
        <p>
          O tratamento pela OpenAI segue as políticas dela para uso via API. Não há decisões automatizadas que produzam efeitos
          jurídicos ou afetem significativamente seus interesses.
        </p>
      </>
    ),
  },
  {
    id: "compartilhamento",
    title: "Com quem compartilhamos",
    content: (
      <>
        <p>Compartilhamos dados apenas com prestadores que operam o serviço em nosso nome:</p>
        <DataTable
          head={["Prestador", "Para quê", "Dados envolvidos"]}
          rows={[
            [<Strong key="1">Clerk</Strong>, "Cadastro, login e sessão", "Dados da conta e cookies de sessão"],
            [<Strong key="2">Neon</Strong>, "Banco de dados", "Preferências, vínculo do Telegram, treino e mensagens"],
            [<Strong key="3">Trigger.dev</Strong>, "Processamento das mensagens e tarefas agendadas", "Texto da mensagem, ID do chat e @usuário durante o processamento"],
            [<Strong key="4">OpenAI</Strong>, "Interpretação do texto das mensagens", "Texto da mensagem e o contexto de treino descrito acima"],
            [<Strong key="5">Telegram</Strong>, "Canal de conversa com o bot", "Mensagens trocadas com o bot"],
            [
              <Strong key="6">Sentry</Strong>,
              "Monitoramento de erros e desempenho; formulário de feedback",
              "Dados técnicos (rota, erro, tempos) e um identificador interno de usuário; o texto que você enviar no feedback e, se você anexar, uma captura de tela",
            ],
            [<Strong key="7">Vercel</Strong>, "Hospedagem do site", "Dados técnicos de acesso (como endereço IP)"],
          ]}
        />
        <p>
          O Telegram é um serviço independente: o uso dele também é regido pelos termos e pela política de privacidade do
          próprio Telegram.
        </p>
        <p>
          Podemos ainda divulgar dados quando exigido por lei, ordem judicial ou autoridade competente.
        </p>
      </>
    ),
  },
  {
    id: "transferencia",
    title: "Transferência internacional",
    content: (
      <p>
        Vários desses prestadores mantêm servidores fora do Brasil (principalmente nos Estados Unidos). Nesses casos, a
        transferência ocorre para a execução do contrato com você e com base nas salvaguardas oferecidas por esses prestadores,
        conforme o art. 33 da LGPD.
      </p>
    ),
  },
  {
    id: "monitoramento",
    title: "Cookies e monitoramento",
    content: (
      <>
        <p>
          Usamos apenas os cookies necessários para manter você conectado, definidos pelo nosso provedor de autenticação (Clerk).
          Não usamos cookies de publicidade nem ferramentas de analytics de marketing.
        </p>
        <p>
          Para encontrar e corrigir erros, usamos o Sentry com coleta mínima: ele está configurado para não registrar o texto
          das suas mensagens, corpos de requisição, cabeçalhos, cookies, consultas ao banco nem dados de identificação como
          nome, e-mail ou IP. Apenas uma amostra das requisições (cerca de 10% em produção) tem seu desempenho registrado.
        </p>
      </>
    ),
  },
  {
    id: "retencao",
    title: "Por quanto tempo guardamos",
    content: (
      <DataTable
        head={["Dado", "Prazo"]}
        rows={[
          ["Texto das mensagens enviadas ao bot e sua interpretação", "Apagados automaticamente após 30 dias"],
          ["Contador diário de mensagens e registro de lembretes", "Apagados após 90 dias"],
          ["Links de vinculação do Telegram", "Válidos por 15 minutos; apagados após o uso ou até 1 dia depois de expirar. Só guardamos um hash, nunca o link"],
          ["Conta, preferências, rotina, histórico de treino e metas", "Enquanto sua conta existir"],
          ["Vínculo do Telegram", "Até você desconectar ou excluir a conta"],
          [
            "Registros técnicos e feedback no Sentry",
            <>
              Conforme o período de retenção configurado no Sentry: <Placeholder>PRAZO DE RETENÇÃO DO SENTRY</Placeholder>
            </>,
          ],
        ]}
      />
    ),
  },
  {
    id: "exclusao",
    title: "Seus direitos e a exclusão de dados",
    content: (
      <>
        <p>Você pode, a qualquer momento:</p>
        <List>
          <li>
            <Strong>Ver e corrigir seus dados</Strong> — rotina, histórico, metas e preferências ficam no painel web; séries podem
            ser corrigidas ou apagadas pelo chat (“errei, foi 25kg”, “apaga a última”).
          </li>
          <li>
            <Strong>Desconectar o Telegram</Strong> — em{" "}
            <Link href={SETTINGS_URL} className="font-medium text-[#111] underline underline-offset-2">
              Configurações
            </Link>
            . Isso apaga o ID do chat, o @usuário e o estado da conversa.
          </li>
          <li>
            <Strong>Excluir sua conta</Strong> — em Configurações, “Excluir conta”. A exclusão é definitiva e imediata: apagamos
            sua rotina, histórico, metas, exercícios personalizados, mensagens, contadores e o vínculo com o Telegram, e
            removemos seu login no provedor de autenticação. Não é possível desfazer.
          </li>
        </List>
        <Callout>
          Registros técnicos já enviados ao Sentry (que não contêm o texto das suas mensagens) seguem o prazo de retenção do
          Sentry e não são apagados pela exclusão da conta.
        </Callout>
        <p>
          Você também pode exercer os demais direitos do art. 18 da LGPD — confirmação e acesso, portabilidade, informação sobre
          compartilhamento, oposição e revisão — escrevendo para <Placeholder>E-MAIL DE PRIVACIDADE</Placeholder>. Responderemos
          em até <Placeholder>PRAZO DE RESPOSTA, EX.: 15 DIAS</Placeholder>. Você também pode reclamar à Autoridade Nacional de
          Proteção de Dados (ANPD).
        </p>
      </>
    ),
  },
  {
    id: "seguranca",
    title: "Segurança",
    content: (
      <>
        <p>Adotamos medidas técnicas para proteger seus dados, entre elas:</p>
        <List>
          <li>Login e senhas gerenciados por um provedor especializado em autenticação; não armazenamos senhas.</li>
          <li>O webhook do Telegram só aceita requisições com um segredo compartilhado, e o do provedor de autenticação, com assinatura verificada.</li>
          <li>Links de vinculação do Telegram são de uso único, expiram em 15 minutos e são guardados apenas como hash.</li>
          <li>Cada página e ação do painel confere quem é o usuário conectado antes de ler ou alterar dados.</li>
          <li>Comunicação com o site e com os prestadores por conexões criptografadas (HTTPS).</li>
        </List>
        <p>Nenhum sistema é totalmente seguro. Se ocorrer um incidente relevante, comunicaremos você e a ANPD conforme a lei.</p>
      </>
    ),
  },
  {
    id: "idade",
    title: "Idade mínima",
    content: (
      <p>
        O Iron AI não é destinado a menores de <Placeholder>18</Placeholder> anos, e não coletamos intencionalmente dados de
        crianças ou adolescentes. Se você souber de uma conta nessa situação, entre em contato para que ela seja excluída.
      </p>
    ),
  },
  {
    id: "alteracoes",
    title: "Alterações desta política",
    content: (
      <p>
        Podemos atualizar esta política quando o serviço mudar. A data no topo indica a versão vigente; mudanças relevantes
        serão avisadas pelo site ou pelo bot antes de entrarem em vigor. Veja também os{" "}
        <Link href={TERMS_URL} className="font-medium text-[#111] underline underline-offset-2">
          Termos de serviço
        </Link>
        .
      </p>
    ),
  },
  {
    id: "contato",
    title: "Contato",
    content: (
      <p>
        Dúvidas sobre privacidade: <Placeholder>E-MAIL DE PRIVACIDADE</Placeholder>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Política de privacidade"
      updatedAt="25 de outubro de 2026"
      intro={
        <p>
          Esta política explica, de forma direta, quais dados o Iron AI trata quando você usa o site e o bot no Telegram, para
          quê, com quem eles são compartilhados e como você pode excluí-los.
        </p>
      }
      sections={sections}
    />
  );
}
