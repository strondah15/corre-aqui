import { CATEGORIES, getCategoryById, getCanonicalCategoryId } from '@/constants/categories'

const p = (id, name, categoryId, aliases = [], keywords = []) => ({
  id,
  name,
  categoryId,
  aliases,
  keywords,
})

export const PROFESSION_CATALOG = [
  p('ajudante_geral', 'Ajudante geral', 'servicos_gerais', ['bico', 'faz tudo', 'auxiliar'], ['servicos rapidos', 'apoio']),
  p('marido_de_aluguel', 'Marido de aluguel', 'servicos_gerais', ['faz tudo', 'pequenos reparos'], ['casa', 'manutencao']),
  p('carregador', 'Carregador', 'mudancas', ['ajudante de mudanca', 'carga e descarga'], ['moveis', 'frete']),
  p('montador_moveis', 'Montador de móveis', 'casa', ['montagem', 'montar guarda roupa', 'montador'], ['armario', 'mesa', 'rack']),
  p('eletricista', 'Eletricista', 'reparos', ['eletrica', 'instalacao eletrica'], ['tomada', 'chuveiro', 'disjuntor', 'luz']),
  p('encanador', 'Encanador', 'reparos', ['bombeiro hidraulico', 'hidraulica'], ['vazamento', 'torneira', 'cano']),
  p('pedreiro', 'Pedreiro', 'casa', ['obra', 'construcao'], ['parede', 'reboco', 'alvenaria']),
  p('pintor', 'Pintor residencial', 'casa', ['pintura', 'pintor de parede'], ['tinta', 'retoque', 'fachada']),
  p('gesseiro', 'Gesseiro', 'casa', ['drywall', 'gesso'], ['sanca', 'forro', 'parede']),
  p('serralheiro', 'Serralheiro', 'casa', ['soldador', 'serralheria'], ['portao', 'grade', 'ferro']),
  p('vidraceiro', 'Vidraceiro', 'casa', ['vidros', 'box'], ['janela', 'espelho', 'blindex']),
  p('chaveiro', 'Chaveiro', 'reparos', ['fechadura', 'copia de chave'], ['porta', 'cadeado']),
  p('jardineiro', 'Jardineiro', 'casa', ['jardinagem', 'poda'], ['grama', 'planta', 'quintal']),
  p('piscineiro', 'Piscineiro', 'casa', ['limpeza de piscina'], ['cloro', 'manutencao']),
  p('tecnico_ar_condicionado', 'Técnico de ar-condicionado', 'reparos', ['ar condicionado', 'split'], ['instalacao', 'limpeza', 'gas']),
  p('instalador_tv', 'Instalador de TV', 'tecnologia', ['instalar tv', 'suporte de tv'], ['painel', 'antena', 'smart tv']),
  p('tecnico_informatica', 'Técnico de informática', 'tecnologia', ['computador', 'manutencao pc'], ['notebook', 'windows', 'formatacao']),
  p('manutencao_computadores', 'Manutenção de computadores', 'tecnologia', ['manutencao pc', 'tecnico pc'], ['notebook', 'hardware', 'computador']),
  p('formatacao_computadores', 'Formatação de computador', 'tecnologia', ['formatacao pc', 'instalar windows'], ['windows', 'backup', 'software']),
  p('redes_computadores', 'Redes e Wi-Fi', 'tecnologia', ['redes', 'wifi', 'roteador'], ['internet', 'cabo', 'sinal']),
  p('instalacao_software', 'Instalação de software', 'tecnologia', ['instalar programa', 'configurar programa'], ['app', 'sistema', 'windows']),
  p('suporte_celular', 'Suporte para celular', 'tecnologia', ['tecnico celular', 'smartphone'], ['configuracao', 'backup', 'aplicativo']),
  p('instalador_internet', 'Instalador de internet', 'tecnologia', ['rede wifi', 'roteador'], ['cabo', 'fibra', 'sinal']),
  p('tecnico_impressora', 'Técnico de impressora', 'tecnologia', ['impressora', 'cartucho'], ['toner', 'rede', 'manutencao']),
  p('desenvolvedor_sites', 'Desenvolvedor de sites', 'tecnologia', ['web designer', 'site'], ['landing page', 'loja virtual']),
  p('desenvolvedor_apps', 'Desenvolvedor de aplicativos', 'tecnologia', ['dev app', 'app mobile'], ['android', 'ios', 'aplicativo']),
  p('programador', 'Programador', 'tecnologia', ['desenvolvedor', 'dev'], ['sistema', 'app', 'software']),
  p('designer_grafico', 'Designer gráfico', 'midia', ['design grafico', 'criativo'], ['logo', 'arte', 'banner']),
  p('computacao_grafica', 'Computação gráfica', 'midia', ['cg', 'cgi', 'design 3d'], ['3d', 'render', 'modelagem', 'animacao']),
  p('designer_3d', 'Designer 3D', 'midia', ['modelador 3d', '3d artist', 'computacao grafica'], ['render', 'maquete', 'blender']),
  p('modelagem_3d', 'Modelagem 3D', 'midia', ['modelador 3d', 'artista 3d'], ['blender', 'maya', '3ds max']),
  p('renderizacao_3d', 'Renderização', 'midia', ['render', 'renderizacao 3d'], ['maquete', 'produto', 'arquitetura']),
  p('animacao_2d', 'Animação 2D', 'midia', ['animador 2d'], ['motion', 'personagem', 'video']),
  p('animacao_3d', 'Animação 3D', 'midia', ['animador 3d'], ['motion', 'render', 'personagem']),
  p('motion_design', 'Motion design', 'midia', ['motion designer', 'motion graphics'], ['animacao', 'video', 'after effects']),
  p('ilustrador_digital', 'Ilustração digital', 'midia', ['ilustrador', 'arte digital'], ['desenho', 'personagem', 'concept art']),
  p('edicao_imagem', 'Edição de imagem', 'midia', ['tratamento de imagem', 'photoshop'], ['foto', 'recorte', 'montagem']),
  p('criacao_logotipo', 'Criação de logotipo', 'midia', ['logo', 'identidade visual'], ['marca', 'branding', 'design']),
  p('designer_ui_ux', 'Designer UI/UX', 'midia', ['ui ux', 'design de aplicativo'], ['interface', 'figma', 'prototipo']),
  p('editor_video', 'Editor de vídeo', 'midia', ['video maker', 'edicao de video'], ['reels', 'youtube', 'cortes']),
  p('pos_producao_video', 'Pós-produção de vídeo', 'midia', ['pos producao', 'colorizacao'], ['video', 'edicao', 'finalizacao']),
  p('fotografo', 'Fotógrafo', 'midia', ['fotografia', 'foto'], ['ensaio', 'evento', 'produto']),
  p('videomaker', 'Videomaker', 'midia', ['filmagem', 'video'], ['evento', 'clipe', 'social']),
  p('social_media', 'Social media', 'midia', ['gestor de redes', 'instagram'], ['posts', 'conteudo', 'marketing']),
  p('copywriter', 'Copywriter', 'midia', ['redator', 'texto persuasivo'], ['anuncio', 'conteudo', 'vendas']),
  p('trafego_pago', 'Gestor de tráfego pago', 'midia', ['trafego', 'ads'], ['facebook ads', 'google ads', 'campanha']),
  p('manicure', 'Manicure', 'beleza', ['unha', 'nail designer'], ['gel', 'alongamento', 'pedicure']),
  p('cabeleireiro', 'Cabeleireiro', 'beleza', ['cabelo', 'escova'], ['corte', 'coloracao', 'hidratação']),
  p('barbeiro', 'Barbeiro', 'beleza', ['barbearia', 'corte masculino'], ['barba', 'degrade']),
  p('maquiador', 'Maquiador(a)', 'beleza', ['maquiagem', 'make'], ['festa', 'noiva', 'social']),
  p('designer_sobrancelhas', 'Designer de sobrancelhas', 'beleza', ['sobrancelha', 'henna'], ['design', 'micropigmentacao']),
  p('depiladora', 'Depiladora', 'beleza', ['depilacao', 'cera'], ['estetica', 'laser']),
  p('esteticista', 'Esteticista', 'beleza', ['estetica', 'limpeza de pele'], ['massagem', 'pele', 'corporal']),
  p('massoterapeuta', 'Massoterapeuta', 'cuidados', ['massagem', 'terapeuta corporal'], ['relaxante', 'dor', 'bem estar']),
  p('cuidador_idosos', 'Cuidador de idosos', 'cuidados', ['cuidadora', 'idoso'], ['acompanhante', 'saude', 'plantao']),
  p('baba', 'Babá', 'cuidados', ['baba', 'cuidadora infantil'], ['crianca', 'bebê', 'infantil']),
  p('acompanhante_hospitalar', 'Acompanhante hospitalar', 'cuidados', ['hospital', 'acompanhante'], ['idoso', 'paciente']),
  p('enfermeiro', 'Enfermeiro(a)', 'cuidados', ['enfermagem', 'tecnico enfermagem'], ['curativo', 'saude', 'injeção']),
  p('personal_trainer', 'Personal trainer', 'cuidados', ['treinador', 'educador fisico'], ['academia', 'treino', 'fitness']),
  p('fisioterapeuta', 'Fisioterapeuta', 'cuidados', ['fisio', 'fisioterapia'], ['reabilitacao', 'dor', 'movimento']),
  p('professor_reforco', 'Professor de reforço', 'aulas', ['reforco escolar', 'aula particular'], ['matematica', 'portugues', 'escola']),
  p('professor_ingles', 'Professor de inglês', 'aulas', ['ingles', 'aula de ingles'], ['idioma', 'conversacao']),
  p('professor_musica', 'Professor de música', 'aulas', ['musica', 'violao'], ['instrumento', 'canto', 'teclado']),
  p('professor_informatica', 'Professor de informática', 'aulas', ['aula computador', 'informatica basica'], ['excel', 'internet', 'windows']),
  p('mentor_curriculo', 'Mentor de currículo', 'aulas', ['curriculo', 'linkedin'], ['emprego', 'entrevista']),
  p('motoboy', 'Motoboy', 'entregas', ['moto entrega', 'delivery'], ['documento', 'encomenda', 'rapido']),
  p('entregador', 'Entregador', 'entregas', ['delivery', 'entrega'], ['mercado', 'farmacia', 'encomenda']),
  p('comprador_pessoal', 'Comprador pessoal', 'compras', ['fazer compras', 'mercado'], ['farmacia', 'supermercado']),
  p('motorista_particular', 'Motorista particular', 'transporte', ['motorista', 'corrida'], ['carro', 'viagem', 'transfer']),
  p('freteiro', 'Freteiro', 'mudancas', ['frete', 'carreto'], ['mudanca', 'caminhonete', 'transporte']),
  p('guincho', 'Guincho', 'transporte', ['reboque', 'socorro veicular'], ['carro', 'moto', 'pane']),
  p('mecanico', 'Mecânico', 'transporte', ['mecanica', 'oficina'], ['carro', 'motor', 'revisao']),
  p('eletricista_automotivo', 'Eletricista automotivo', 'transporte', ['auto eletrica'], ['bateria', 'farol', 'alarme']),
  p('lavador_carros', 'Lavador de carros', 'transporte', ['lava jato', 'estetica automotiva'], ['higienizacao', 'polimento']),
  p('borracharia', 'Borracheiro', 'transporte', ['borracharia', 'pneu'], ['remendo', 'calibragem']),
  p('decorador_eventos', 'Decorador de eventos', 'eventos', ['decoracao', 'festa'], ['balões', 'mesa', 'aniversario']),
  p('garcom_eventos', 'Garçom para eventos', 'eventos', ['garcom', 'copeira'], ['festa', 'buffet', 'atendimento']),
  p('buffet', 'Buffet e salgados', 'eventos', ['salgadeiro', 'cozinheiro festa'], ['bolo', 'doces', 'comida']),
  p('dj', 'DJ', 'eventos', ['som', 'musica festa'], ['casamento', 'aniversario', 'evento']),
  p('animador_festas', 'Animador de festas', 'eventos', ['recreador', 'animacao'], ['crianca', 'brincadeiras']),
  p('seguranca_eventos', 'Segurança de eventos', 'eventos', ['seguranca', 'controle acesso'], ['porteiro', 'evento']),
  p('diarista', 'Diarista', 'limpeza', ['faxina', 'faxineira'], ['casa', 'limpeza pesada', 'apartamento']),
  p('passadeira', 'Passadeira', 'limpeza', ['passar roupa', 'lavanderia'], ['roupa', 'camisa']),
  p('limpeza_pos_obra', 'Limpeza pós-obra', 'limpeza', ['pos obra', 'limpeza pesada'], ['reforma', 'poeira']),
  p('higienizacao_estofados', 'Higienização de estofados', 'limpeza', ['lavagem sofa', 'estofado'], ['colchao', 'tapete', 'carpete']),
  p('cozinheiro', 'Cozinheiro(a)', 'servicos_gerais', ['comida caseira', 'chef'], ['marmita', 'almoco', 'jantar']),
  p('costureira', 'Costureira', 'servicos_gerais', ['costura', 'ajuste roupa'], ['barra', 'conserto', 'roupa']),
  p('sapateiro', 'Sapateiro', 'servicos_gerais', ['conserto sapato'], ['bolsa', 'couro']),
  p('pet_sitter', 'Pet sitter', 'pets', ['cuidador pet', 'baba pet'], ['cachorro', 'gato', 'visita']),
  p('dog_walker', 'Passeador de cães', 'pets', ['dog walker', 'passeio cachorro'], ['pet', 'caminhada']),
  p('banho_tosa', 'Banho e tosa', 'pets', ['tosador', 'banho pet'], ['cachorro', 'gato']),
  p('adesivador', 'Adesivador', 'midia', ['adesivo', 'plotagem'], ['fachada', 'vitrine', 'carro']),
  p('impressor_grafico', 'Impressor gráfico', 'midia', ['grafica', 'impressao'], ['cartao', 'panfleto', 'banner']),
  p('consultor_financeiro', 'Consultor financeiro', 'servicos_gerais', ['financas', 'organizacao financeira'], ['orcamento', 'planejamento']),
  p('assistente_virtual', 'Assistente virtual', 'tecnologia', ['secretaria remota', 'administrativo'], ['agenda', 'email', 'atendimento']),
  p('digitador', 'Digitador', 'tecnologia', ['digitacao', 'planilha'], ['excel', 'documento', 'dados']),
  p('tradutor', 'Tradutor', 'aulas', ['traducao', 'interprete'], ['ingles', 'espanhol', 'texto']),
  p('consultor_marketing', 'Consultor de marketing', 'midia', ['marketing digital', 'estrategia'], ['vendas', 'marca', 'conteudo']),
  p('cerimonialista', 'Cerimonialista', 'eventos', ['organizacao evento', 'assessoria festa'], ['casamento', 'agenda']),
  p('personal_organizer', 'Personal organizer', 'casa', ['organizacao', 'organizador'], ['closet', 'armario', 'casa']),
  p('instalador_camera', 'Instalador de câmeras', 'tecnologia', ['cftv', 'camera seguranca'], ['dvr', 'alarme', 'monitoramento']),
  p('tecnico_eletrodomesticos', 'Técnico de eletrodomésticos', 'reparos', ['conserto eletrodomestico'], ['geladeira', 'maquina lavar', 'fogao']),
  p('tecnico_maquina_lavar', 'Técnico de máquina de lavar', 'reparos', ['maquina de lavar', 'lavadora'], ['conserto', 'instalacao']),
  p('instalador_varal', 'Instalador de varal e cortina', 'casa', ['instalar cortina', 'varal'], ['persiana', 'trilho']),
  p('dedetizador', 'Dedetizador', 'casa', ['dedetizacao', 'controle pragas'], ['barata', 'formiga', 'rato']),
  p('telhadista', 'Telhadista', 'casa', ['telhado', 'calha'], ['goteira', 'reparo']),
  p('calheiro', 'Calheiro', 'casa', ['calha', 'rufos'], ['chuva', 'telhado']),
  p('porteiro_eventual', 'Porteiro eventual', 'servicos_gerais', ['portaria', 'controle acesso'], ['condominio', 'evento']),
  p('recepcionista_eventual', 'Recepcionista eventual', 'eventos', ['recepcao', 'atendimento'], ['evento', 'cadastro']),
  p('aula_danca', 'Professor de dança', 'aulas', ['danca', 'coreografia'], ['funk', 'samba', 'zumba']),
  p('aula_reforco_infantil', 'Reforço infantil', 'aulas', ['alfabetizacao', 'criancas'], ['escola', 'leitura']),
  p('montagem_computador', 'Montagem de computador', 'tecnologia', ['pc gamer', 'montar pc'], ['hardware', 'pecas']),
  p('modelagem_cad', 'Desenhista CAD', 'midia', ['cadista', 'autocad'], ['planta', 'projeto', 'desenho tecnico']),
  p('arquiteto_interiores', 'Projeto de interiores', 'casa', ['designer de interiores', 'arquitetura'], ['ambiente', 'decoracao']),
]

export const POPULAR_PROFESSION_CATEGORY_IDS = [
  'servicos_gerais',
  'reparos',
  'casa',
  'tecnologia',
  'midia',
  'beleza',
  'limpeza',
  'aulas',
  'entregas',
  'compras',
  'transporte',
  'mudancas',
  'cuidados',
  'eventos',
  'pets',
]

const PROFESSION_BY_ID = new Map(PROFESSION_CATALOG.map((profession) => [profession.id, profession]))

const CATEGORY_SUGGESTION_TERMS = {
  servicos_gerais: ['ajuda', 'bico', 'cozinha', 'costura', 'digitalizacao', 'organizar', 'suporte'],
  reparos: ['conserto', 'instalar', 'manutencao', 'eletrica', 'hidraulica', 'vazamento', 'tomada', 'chuveiro'],
  casa: ['casa', 'obra', 'pintura', 'montagem', 'movel', 'jardim', 'telhado', 'decoracao'],
  tecnologia: ['computador', 'celular', 'site', 'programa', 'internet', 'rede', 'camera', 'software'],
  midia: ['design', '3d', 'grafica', 'foto', 'video', 'social media', 'logo', 'arte', 'render'],
  beleza: ['unha', 'cabelo', 'barba', 'maquiagem', 'sobrancelha', 'estetica'],
  aulas: ['aula', 'professor', 'reforco', 'ingles', 'curso', 'ensino'],
  entregas: ['entrega', 'motoboy', 'delivery', 'encomenda'],
  compras: ['compras', 'mercado', 'farmacia'],
  transporte: ['carro', 'motorista', 'mecanico', 'pneu', 'guincho'],
  mudancas: ['mudanca', 'frete', 'carreto', 'carga'],
  eventos: ['festa', 'evento', 'dj', 'buffet', 'garcom', 'cerimonial'],
  cuidados: ['cuidador', 'idoso', 'baba', 'saude', 'fisio', 'massagem'],
  pets: ['pet', 'cachorro', 'gato', 'banho', 'tosa'],
}

export function sanitizeCustomProfession(value) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

export function normalizeProfessionSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function professionIndexText(profession = {}) {
  const category = getCategoryById(profession.categoryId)
  return normalizeProfessionSearchText([
    profession.id,
    profession.name,
    profession.categoryId,
    category?.label,
    ...(profession.aliases || []),
    ...(profession.keywords || []),
  ].join(' '))
}

const PROFESSION_INDEX = PROFESSION_CATALOG.map((profession) => ({
  profession,
  index: professionIndexText(profession),
  name: normalizeProfessionSearchText(profession.name),
  aliases: (profession.aliases || []).map(normalizeProfessionSearchText),
  keywords: (profession.keywords || []).map(normalizeProfessionSearchText),
}))

export function findProfessionById(id) {
  return PROFESSION_BY_ID.get(String(id || '').trim()) || null
}

export function searchProfessions(query, options = {}) {
  const term = normalizeProfessionSearchText(query)
  if (term.length < 2) return []

  const categoryId = options.categoryId ? getCanonicalCategoryId(options.categoryId) : ''
  const limit = Number(options.limit || 8)

  return PROFESSION_INDEX
    .filter(({ profession }) => !categoryId || profession.categoryId === categoryId)
    .map(({ profession, index, name, aliases, keywords }) => {
      let score = 0
      if (name === term) score = 120
      else if (name.startsWith(term)) score = 100
      else if (name.includes(term)) score = 86
      else if (aliases.some((alias) => alias === term || alias.startsWith(term))) score = 78
      else if (aliases.some((alias) => alias.includes(term))) score = 68
      else if (keywords.some((keyword) => keyword === term || keyword.startsWith(term))) score = 60
      else if (index.includes(term)) score = 46

      return { profession, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.profession.name.localeCompare(b.profession.name, 'pt-BR'))
    .slice(0, limit)
    .map((entry) => entry.profession)
}

export function suggestProfessionCategory(value) {
  const term = normalizeProfessionSearchText(value)
  if (term.length < 2) return null

  const bestProfession = searchProfessions(term, { limit: 1 })[0]
  if (bestProfession) {
    return {
      categoryId: bestProfession.categoryId,
      confidence: 0.92,
      category: getCategoryById(bestProfession.categoryId),
      profession: bestProfession,
    }
  }

  const matches = Object.entries(CATEGORY_SUGGESTION_TERMS).map(([categoryId, terms]) => {
    const score = terms.reduce((total, entry) => {
      const normalized = normalizeProfessionSearchText(entry)
      if (!normalized) return total
      if (term.includes(normalized) || normalized.includes(term)) return total + 2
      return total
    }, 0)

    return { categoryId, score }
  }).filter((entry) => entry.score > 0)

  if (!matches.length) return null

  const best = matches.sort((a, b) => b.score - a.score)[0]
  return {
    categoryId: best.categoryId,
    confidence: best.score >= 2 ? 0.72 : 0.5,
    category: getCategoryById(best.categoryId),
  }
}

function pickProfessionField(source = {}, mode = '') {
  const profile = source.profile || source.perfil || {}
  const profissional = source.profissional || profile.profissional || {}
  const corre = source.corre || profile.corre || {}
  const candidates = [
    source.professionName,
    source.profissaoNome,
    source.profissao,
    source.customProfession,
    profile.professionName,
    profile.profissaoNome,
    profile.profissao,
    profile.customProfession,
  ]

  if (mode === 'corre') {
    candidates.push(corre.professionName, corre.profissaoNome, source.correTitulo, profile.correTitulo, corre.titulo)
  } else if (mode === 'profissional') {
    candidates.push(profissional.professionName, profissional.profissaoNome, source.profTitulo, profile.profTitulo, profissional.titulo, profile.titulo)
  } else {
    candidates.push(
      profissional.professionName,
      profissional.profissaoNome,
      corre.professionName,
      corre.profissaoNome,
      source.profTitulo,
      source.correTitulo,
      profile.profTitulo,
      profile.correTitulo,
      profissional.titulo,
      corre.titulo,
      profile.titulo
    )
  }

  return candidates.map(sanitizeCustomProfession).find(Boolean) || ''
}

function pickProfessionId(source = {}, mode = '') {
  const profile = source.profile || source.perfil || {}
  const profissional = source.profissional || profile.profissional || {}
  const corre = source.corre || profile.corre || {}
  const candidates = [
    source.professionId,
    source.profissaoId,
    profile.professionId,
    profile.profissaoId,
  ]

  if (mode === 'corre') {
    candidates.push(corre.professionId, source.correProfessionId, profile.correProfessionId)
  } else if (mode === 'profissional') {
    candidates.push(profissional.professionId, source.professionId, profile.professionId)
  } else {
    candidates.push(profissional.professionId, corre.professionId, source.correProfessionId, profile.correProfessionId)
  }

  return candidates.map((value) => String(value || '').trim()).find(Boolean) || ''
}

export function getProfessionDisplayName(source = {}, options = {}) {
  const mode = options.mode || ''
  const byField = pickProfessionField(source, mode)
  if (byField) return byField

  const profession = findProfessionById(pickProfessionId(source, mode))
  if (profession) return profession.name

  return sanitizeCustomProfession(options.fallback || '')
}

export function getProfessionSearchText(source = {}) {
  const fields = [
    getProfessionDisplayName(source),
    pickProfessionField(source, 'corre'),
    pickProfessionField(source, 'profissional'),
  ]
  const professionIds = [
    pickProfessionId(source),
    pickProfessionId(source, 'corre'),
    pickProfessionId(source, 'profissional'),
  ]

  professionIds.forEach((id) => {
    const profession = findProfessionById(id)
    if (!profession) return
    fields.push(profession.name, profession.categoryId, ...(profession.aliases || []), ...(profession.keywords || []))
  })

  return normalizeProfessionSearchText(Array.from(new Set(fields.filter(Boolean))).join(' '))
}

export function getProfessionCatalogStats() {
  return {
    categories: new Set(PROFESSION_CATALOG.map((profession) => profession.categoryId)).size,
    professions: PROFESSION_CATALOG.length,
    publicCategories: CATEGORIES.length,
  }
}
