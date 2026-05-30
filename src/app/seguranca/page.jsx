import LegalPage, { LegalSection } from '@/components/LegalPage'

export const metadata = {
  title: 'Segurança e denúncia | Corre Aqui',
  description: 'Regras básicas de segurança, denúncia e moderação do Corre Aqui.',
}

export default function SegurancaPage() {
  return (
    <LegalPage
      title="Segurança e denúncia"
      subtitle="Orientações para combinar serviços com mais confiança e acompanhar problemas dentro do app."
    >
      <LegalSection title="1. Antes de aceitar ou contratar">
        <p>
          Confira nome, foto, cidade/regiao, historico, avaliacoes, selo de verificado quando existir, descricao do perfil e detalhes do pedido. Combine o servico com clareza antes de iniciar.
        </p>
        <p>
          Desconfie de pressa excessiva, pedido para sair do app sem motivo, valores fora do normal, links suspeitos ou solicitacao de dados sensiveis.
        </p>
      </LegalSection>

      <LegalSection title="2. Durante o servico">
        <p>
          Use o chat para registrar horario, endereco, valor, escopo, alteracoes e conclusao. Evite enviar documentos, senhas, dados bancarios completos ou codigos de verificacao.
        </p>
        <p>
          Para encontros presenciais, prefira locais seguros, avise alguem de confianca quando necessario e encerre a interacao se houver risco, ameaca ou comportamento abusivo.
        </p>
      </LegalSection>

      <LegalSection title="3. Problema com servico">
        <p>
          Use o botao ou painel de problema com servico quando houver desacordo, atraso relevante, servico nao realizado, comportamento inadequado, cobranca combinada de forma confusa ou risco de seguranca.
        </p>
        <p>
          O registro ajuda a organizar evidencias, acompanhar status e acionar moderacao. Ele nao substitui medidas legais, boletim de ocorrencia, defesa do consumidor ou atendimento de emergencia.
        </p>
      </LegalSection>

      <LegalSection title="4. Denuncias">
        <p>
          Denuncie fraude, golpe, ameaca, assedio, discriminacao, conteudo ilegal, perfil falso, spam, tentativa de roubo de conta, pedido perigoso ou qualquer conduta que coloque pessoas em risco.
        </p>
        <p>
          Inclua o maximo de contexto: pedido, conversa, usuario, horario, prints quando necessario e uma descricao objetiva do ocorrido.
        </p>
      </LegalSection>

      <LegalSection title="5. Como a moderacao pode agir">
        <p>
          A equipe podera analisar dados relacionados ao caso, pedir informacoes adicionais, marcar status, limitar recursos, remover conteudo, ocultar perfis, suspender contas ou encaminhar situacoes graves conforme necessidade.
        </p>
        <p>
          Denuncias falsas ou abusivas tambem podem gerar restricoes.
        </p>
      </LegalSection>

      <LegalSection title="6. Emergencias">
        <p>
          O Corre Aqui nao e canal de emergencia. Em risco imediato, procure autoridades ou servicos publicos competentes. No Brasil, os telefones mais conhecidos incluem 190 para Policia Militar, 192 para SAMU e 193 para Bombeiros.
        </p>
      </LegalSection>

      <LegalSection title="7. Regras de convivencia">
        <p>
          Trate outras pessoas com respeito. Nao use linguagem ofensiva, discriminatoria, sexualmente abusiva, ameaçadora ou enganosa. Nao publique servicos ilegais, perigosos ou que violem direitos de terceiros.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
