import { NextResponse } from 'next/server'

export async function POST(req) {
  try {
    const { mensagem } = await req.json()
    const texto = String(mensagem || '').trim().slice(0, 2000)

    if (!texto) {
      return NextResponse.json(
        { error: 'Mensagem vazia.' },
        { status: 400 }
      )
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'Assistente indisponível no momento.' },
        { status: 503 }
      )
    }

    const resposta = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'Você é um assistente objetivo dentro do aplicativo Corre Aqui.',
          },
          {
            role: 'user',
            content: texto,
          },
        ],
        temperature: 0.7,
      }),
    })

    const data = await resposta.json()

    if (!resposta.ok) {
      return NextResponse.json(
        { error: 'Falha ao consultar o assistente.' },
        { status: resposta.status }
      )
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Erro na rota /api/chatgpt:', error)
    return NextResponse.json(
      { error: 'Erro ao processar a mensagem.' },
      { status: 500 }
    )
  }
}
