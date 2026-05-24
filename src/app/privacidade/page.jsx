import LegalPage, { LegalSection } from '@/components/LegalPage'

export const metadata = {
  title: 'Privacidade | Corre Aqui',
  description: 'Aviso de privacidade inicial do Corre Aqui.',
}

export default function PrivacidadePage() {
  return (
    <LegalPage
      title="Privacidade"
      subtitle="Como o Corre Aqui trata dados pessoais para operar login, pedidos, mapa, chat, notificacoes, seguranca e historico."
    >
      <LegalSection title="1. Dados que podemos coletar">
        <p>
          Podemos coletar dados de conta, como nome, e-mail, foto, identificador de usuario, cidade, telefone/WhatsApp quando informado e tipo de perfil escolhido.
        </p>
        <p>
          Tambem podemos tratar dados de uso do app: pedidos criados ou aceitos, status do servico, mensagens de chat, anexos, agenda, avaliacoes, denuncias, problemas registrados, notificacoes, patentes, preferencias e dados tecnicos basicos.
        </p>
        <p>
          Quando autorizado, podemos usar localizacao para mapa ao vivo, pedidos proximos, profissionais/corres disponiveis e melhoria da experiencia local.
        </p>
      </LegalSection>

      <LegalSection title="2. Por que usamos esses dados">
        <p>
          Usamos dados para criar e manter a conta, conectar clientes e prestadores, exibir perfis, publicar pedidos, operar chat, agenda, mapa, notificacoes, avaliacoes, historico, seguranca, suporte e moderacao.
        </p>
        <p>
          Tambem podemos usar informacoes agregadas ou tecnicas para corrigir erros, melhorar performance, prevenir abuso e desenvolver novos recursos.
        </p>
      </LegalSection>

      <LegalSection title="3. Base legal e LGPD">
        <p>
          A LGPD protege direitos fundamentais de liberdade e privacidade no tratamento de dados pessoais. No Corre Aqui, o tratamento pode se apoiar em execucao de contrato/servico solicitado pelo usuario, consentimento em permissoes especificas, cumprimento de obrigacoes legais, exercicio regular de direitos e legitimo interesse para seguranca e melhoria do app.
        </p>
      </LegalSection>

      <LegalSection title="4. Compartilhamento">
        <p>
          Dados necessarios podem aparecer para outros usuarios envolvidos em um pedido, conversa, agenda ou perfil publico. Por exemplo: nome, foto, cidade/regiao, descricao, status, avaliacao e mensagens ligadas ao servico.
        </p>
        <p>
          O app usa servicos de terceiros como Firebase/Google para autenticacao, banco de dados, armazenamento e infraestrutura. Tambem poderemos compartilhar dados quando exigido por lei, autoridade competente, protecao de direitos ou investigacao de abuso.
        </p>
      </LegalSection>

      <LegalSection title="5. Retencao e exclusao">
        <p>
          Mantemos dados enquanto forem necessarios para funcionamento da conta, historico, seguranca, prevencao de fraude, cumprimento legal ou resolucao de disputas. O usuario podera solicitar correcao, exportacao ou exclusao conforme recursos disponiveis e limites legais.
        </p>
      </LegalSection>

      <LegalSection title="6. Seus direitos">
        <p>
          O titular pode solicitar confirmacao de tratamento, acesso, correcao, anonimização, bloqueio, eliminacao, portabilidade quando aplicavel, informacoes sobre compartilhamento e revisao de decisoes automatizadas quando existirem.
        </p>
        <p>
          Nesta fase de testes, use o painel de Seguranca/Denuncia do app para pedidos relacionados a privacidade. Antes do lancamento publico, substitua este canal por e-mail ou formulario oficial de atendimento ao titular.
        </p>
      </LegalSection>

      <LegalSection title="7. Seguranca">
        <p>
          Aplicamos autenticacao, regras de acesso no Firebase, restricoes de leitura/escrita, limites de anexos e medidas de reducao de abuso. Ainda assim, nenhum sistema e 100% imune a falhas.
        </p>
        <p>
          Evite enviar documentos sensiveis, senhas, dados bancarios completos ou informacoes desnecessarias pelo chat.
        </p>
      </LegalSection>

      <LegalSection title="8. Criancas e adolescentes">
        <p>
          O Corre Aqui nao foi desenhado para uso autonomo por criancas. Se identificarmos uso indevido por menor sem autorizacao adequada, poderemos limitar ou remover a conta.
        </p>
      </LegalSection>

      <LegalSection title="9. Fontes de referencia">
        <p>
          Esta versao foi inspirada em orientacoes publicas da ANPD sobre LGPD, direitos dos titulares e avisos de privacidade. Ela deve ser revisada juridicamente antes de producao.
        </p>
      </LegalSection>
    </LegalPage>
  )
}

