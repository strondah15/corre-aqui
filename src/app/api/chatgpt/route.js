import { NextResponse } from 'next/server'

export async function POST(req) {
  try {
    const { mensagem } = await req.json()

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
            content: 'Você é um assistente inteligente dentro do aplicativo Corre Aqui.',
          },
          {
            role: 'user',
            content: mensagem,
          },
        ],
        temperature: 0.7,
      }),
    })

    const data = await resposta.json()

    return NextResponse.json(data)
  } catch (error) {
    console.error('Erro na rota /api/chatgpt:', error)
    return NextResponse.json(
      { error: 'Erro ao processar a mensagem.' },
      { status: 500 }
    )
  }
}