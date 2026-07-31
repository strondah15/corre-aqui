import LegalPage, { LegalSection } from '@/components/LegalPage'

export const metadata = {
  title: 'Termos de uso | Corre Aqui',
  description: 'Termos de uso iniciais do Corre Aqui.',
}

export default function TermosPage() {
  return (
    <LegalPage
      title="Termos de uso"
      subtitle="Regras basicas para usar o Corre Aqui com seguranca, respeito e clareza entre clientes, corres e profissionais."
    >
      <LegalSection title="1. O que e o Corre Aqui">
        <p>
          O Corre Aqui e uma plataforma que conecta pessoas que precisam de ajuda local com corres e profissionais disponiveis. O app facilita publicacao de pedidos, perfis, chat, agenda, mapa, avaliacoes e notificacoes.
        </p>
        <p>
          O Corre Aqui nao e empregador, agencia de mao de obra, transportadora, garantidor do servico ou parte direta no acordo entre usuarios. Cliente e prestador combinam escopo, valor, prazo, forma de pagamento e condicoes do servico entre si.
        </p>
      </LegalSection>

      <LegalSection title="2. Conta e cadastro">
        <p>
          Para usar recursos principais, o usuario deve entrar com uma conta e manter dados verdadeiros, atuais e suficientes para identificacao basica no app.
        </p>
        <p>
          O uso deve ser feito por maiores de 18 anos ou por pessoa com autorizacao/responsabilidade de responsavel legal. Cada usuario e responsavel por proteger seu acesso e pelas atividades feitas em sua conta.
        </p>
      </LegalSection>

      <LegalSection title="3. Pedidos, conversas e combinados">
        <p>
          O cliente deve descrever o pedido com clareza. O corre ou profissional deve aceitar apenas servicos que consiga realizar com seguranca e qualidade.
        </p>
        <p>
          Recomendamos manter conversas importantes dentro do chat do app, incluindo endereco, horario, valor combinado, alteracoes e conclusao. Isso ajuda em caso de duvida, problema ou denuncia.
        </p>
      </LegalSection>

      <LegalSection title="4. Pagamentos e taxas">
        <p>
          Nesta versao, o Corre Aqui nao processa pagamentos dentro do app. O valor e a forma de pagamento sao combinados diretamente entre cliente e prestador.
        </p>
        <p>
          O app pode oferecer recursos premium, anuncios, impulsionamentos ou planos no futuro. Quando isso acontecer, as condicoes deverao aparecer de forma clara antes da contratacao.
        </p>
      </LegalSection>

      <LegalSection title="5. Localizacao e mapa">
        <p>
          O app pode usar localizacao para mostrar pedidos, corres e profissionais proximos. A localizacao pode ser aproximada e depende das permissoes do dispositivo.
        </p>
        <p>
          O usuario deve usar o mapa como apoio, nao como garantia absoluta de presenca, identidade, rota, disponibilidade ou seguranca.
        </p>
      </LegalSection>

      <LegalSection title="6. Avaliacoes, reputacao e verificado">
        <p>
          Avaliacoes, historico de servicos e indicativos de perfil verificado sao sinais de confianca dentro do app. Eles nao representam garantia total de qualidade, idoneidade, cumprimento do servico ou ausencia de risco.
        </p>
      </LegalSection>

      <LegalSection title="7. Condutas proibidas">
        <p>
          E proibido usar o Corre Aqui para fraude, golpe, ameaca, assedio, discriminacao, servicos ilegais, conteudo abusivo, dados falsos, spam, tentativa de burlar seguranca, combinados enganosos ou qualquer uso que coloque pessoas em risco.
        </p>
      </LegalSection>

      <LegalSection title="8. Problemas, denuncia e moderacao">
        <p>
          O app pode receber denuncias e registros de problema com servico. A equipe podera analisar conteudos, pedidos, mensagens relacionadas, historico, perfis e evidencias enviadas para proteger usuarios e melhorar a plataforma.
        </p>
        <p>
          Medidas possiveis incluem aviso, limitacao de recursos, ocultacao de perfil, remocao de conteudo, suspensao de conta ou encaminhamento a autoridades quando necessario.
        </p>
      </LegalSection>

      <LegalSection title="9. Disponibilidade do app">
        <p>
          O Corre Aqui ainda esta em evolucao. Podem existir falhas, indisponibilidade, mudancas de recursos, ajustes de regras e perda de funcionalidades durante testes.
        </p>
      </LegalSection>

      <LegalSection title="10. Mudancas nestes termos">
        <p>
          Estes termos podem ser atualizados conforme o produto evoluir. Mudancas relevantes deverao ser comunicadas no app ou por canal adequado.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
