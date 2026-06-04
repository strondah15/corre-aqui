import { database } from '@/lib/firebase'
import { ref, serverTimestamp, update } from 'firebase/database'

export const TIPOS_CONTA = {
  cliente: {
    id: 'cliente',
    titulo: 'Cliente',
    subtitulo: 'Quero pedir ajuda e contratar alguém perto.',
  },
  corre: {
    id: 'corre',
    titulo: 'Corre',
    subtitulo: 'Quero aparecer disponível e aceitar serviços rápidos.',
  },
  profissional: {
    id: 'profissional',
    titulo: 'Profissional',
    subtitulo: 'Quero oferecer serviços com perfil mais completo.',
  },
}

export function perfilMinimoCompleto(userData = {}) {
  const profile = userData.profile || {}
  const nome = String(profile.nome || userData.nome || '').trim()
  const cidade = String(profile.cidade || userData.cidade || '').trim()

  return Boolean(
    (profile.cadastroCompleto || profile.onboardingCompleto || userData.cadastroCompleto || userData.onboardingCompleto) &&
      nome.length >= 2 &&
      cidade.length >= 2
  )
}

export function perfilInicialFromAuth(userData = {}, authUser = null) {
  const profile = userData.profile || {}
  const tipoSalvo =
    profile.tipoContaInicial ||
    userData.tipoContaInicial ||
    (userData.isProfissional || profile.isProfissional ? 'profissional' : userData.isCorre || profile.isCorre ? 'corre' : 'cliente')

  return {
    nome: profile.nome || userData.nome || authUser?.displayName || '',
    cidade: profile.cidade || userData.cidade || '',
    avatarEmoji: profile.avatarEmoji || userData.avatarEmoji || '',
    fotoURL: profile.fotoURL || userData.fotoURL || profile.photoURL || userData.photoURL || authUser?.photoURL || '',
    whatsapp: profile.whatsapp || userData.profWhats || userData.whatsapp || '',
    bio: profile.bio || userData.bio || '',
    tipoConta: TIPOS_CONTA[tipoSalvo] ? tipoSalvo : 'cliente',
    notificacoes: profile.notificacoes ?? userData.notificacoes ?? true,
  }
}

export function syncPerfilLocal({ uid, nome, tipoConta, visivel = true }) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem('meuId', uid)
    window.localStorage.setItem('meuNome', nome)
    window.localStorage.setItem('cadastroCompleto', 'true')
    window.localStorage.setItem(`cadastroCompleto:${uid}`, 'true')
    window.localStorage.setItem('visivelNoMapa', String(visivel))
    window.localStorage.setItem('notifsAtivas', 'true')
    window.localStorage.setItem('modoApp', tipoConta === 'cliente' ? 'cliente' : 'corre')
  } catch {}
}

export async function salvarCadastroPerfil({ uid, authUser, form }) {
  if (!uid) throw new Error('Usuario sem ID.')

  const nome = String(form?.nome || authUser?.displayName || '').trim()
  const cidade = String(form?.cidade || '').trim()
  const tipoConta = TIPOS_CONTA[form?.tipoConta] ? form.tipoConta : 'cliente'
  const fotoURL = String(form?.fotoURL || authUser?.photoURL || '').trim()
  const avatarEmoji = String(form?.avatarEmoji || '').trim()
  const whatsapp = String(form?.whatsapp || '').replace(/\D/g, '')
  const bio = String(form?.bio || '').trim()
  const email = authUser?.email || ''
  const isCorre = tipoConta === 'corre' || tipoConta === 'profissional'
  const isProfissional = tipoConta === 'profissional'
  const visivel = isCorre || isProfissional

  if (nome.length < 2) throw new Error('Digite seu nome.')
  if (cidade.length < 2) throw new Error('Digite sua cidade.')

  const corre = {
    ativo: isCorre,
    titulo: 'Corre rápido',
    bio: bio || '',
    transporte: '',
    regiao: cidade,
    disponibilidade: isCorre ? 'Disponível para serviços próximos.' : '',
    experiencia: '',
    fotoURL: fotoURL || null,
    photoURL: fotoURL || null,
  }

  const profissional = {
    ativo: isProfissional,
    titulo: isProfissional ? 'Profissional local' : '',
    descricao: isProfissional ? bio : '',
    preco: '',
    whatsapp,
    regiao: cidade,
    experiencia: '',
    statusProfissional: 'disponivel',
    ocupadoAte: '',
    agendaAberta: true,
    fotoURL: fotoURL || null,
    photoURL: fotoURL || null,
  }

  const profilePayload = {
    nome,
    email,
    cidade,
    fotoURL: fotoURL || null,
    photoURL: fotoURL || null,
    avatar: fotoURL || avatarEmoji || '',
    avatarEmoji,
    whatsapp,
    bio,
    visivel,
    notificacoes: true,
    isCorre,
    isProfissional,
    tipoContaInicial: tipoConta,
    cadastroCompleto: true,
    onboardingCompleto: true,
    plano: 'Free',
    correTitulo: corre.titulo,
    correBio: corre.bio,
    correRegiao: cidade,
    correDisponibilidade: corre.disponibilidade,
    titulo: profissional.titulo,
    descricao: profissional.descricao,
    profRegiao: cidade,
    statusProfissional: profissional.statusProfissional,
    agendaAberta: true,
    corre,
    profissional,
    atualizadoEm: serverTimestamp(),
  }

  await update(ref(database, `users/${uid}/profile`), profilePayload)

  await update(ref(database, `users/${uid}`), {
    nome,
    email,
    cidade,
    fotoURL: fotoURL || null,
    photoURL: fotoURL || null,
    avatar: fotoURL || avatarEmoji || '',
    avatarEmoji,
    bio,
    whatsapp,
    anonimo: !!authUser?.isAnonymous,
    isCorre,
    isProfissional,
    visivel,
    tipoContaInicial: tipoConta,
    cadastroCompleto: true,
    onboardingCompleto: true,
    perfilCompleto: true,
    plano: 'Free',
    corre,
    profissional: isProfissional ? profissional : null,
    assinatura: {
      plano: 'Free',
      origem: 'cadastro',
      atualizadoEm: serverTimestamp(),
    },
    atualizadoEm: serverTimestamp(),
  })

  console.warn('[PRESENCE] caminho legado detectado', {
    path: `usuariosOnline/${uid}`,
    origem: 'perfilCadastro',
  })
  await update(ref(database, `usuariosOnline/${uid}`), {
    nome,
    cidade,
    fotoURL: fotoURL || null,
    photoURL: fotoURL || null,
    avatar: fotoURL || avatarEmoji || '',
    avatarEmoji,
    isCorre,
    isProfissional,
    visivel,
    plano: 'Free',
    statusProfissional: profissional.statusProfissional,
    agendaAberta: true,
    atualizadoEm: serverTimestamp(),
  })

  syncPerfilLocal({ uid, nome, tipoConta, visivel })

  return {
    ...profilePayload,
    uid,
  }
}
