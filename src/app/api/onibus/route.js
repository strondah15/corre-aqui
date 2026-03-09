export async function GET() {
  try {
    const response = await fetch('https://data.rio/api/views/uc7t-fk8r/rows.json', {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    })

    const data = await response.json()

    return Response.json(data)
  } catch (error) {
    console.error('Erro no servidor API /onibus:', error)
    return new Response(JSON.stringify({ error: 'Erro ao buscar ônibus' }), { status: 500 })
  }
}
