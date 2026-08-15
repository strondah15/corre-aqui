import Perfil from '@/components/Perfil'

export default async function Page({ searchParams }) {
  const params = await searchParams
  return (
    <Perfil
      initialTab={params?.tab || 'config'}
      initialProfSection={params?.section || ''}
    />
  )
}
