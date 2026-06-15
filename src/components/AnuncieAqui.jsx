"use client";

import { useState } from "react";

const WHATSAPP_ANUNCIO_URL =
  process.env.NEXT_PUBLIC_WHATSAPP_ANUNCIO_URL?.trim() || "";

const opcoesAnuncio = [
  {
    titulo: "📍 Anúncio no mapa",
    texto: "Em breve, negócios poderão aparecer como pontos patrocinados próximos dos usuários.",
  },
  {
    titulo: "✨ Destaque nas buscas",
    texto: "Empresas poderão aparecer com mais visibilidade quando alguém procurar serviços relacionados.",
  },
  {
    titulo: "🔥 Pedido relacionado",
    texto: "Quando um cliente criar um pedido, negócios relacionados poderão aparecer como sugestão.",
  },
  {
    titulo: "🏆 Patrocínio local",
    texto: "Marcas locais poderão aparecer em áreas estratégicas do app com selo de parceiro.",
  },
  {
    titulo: "📊 Relatórios simples",
    texto: "Futuramente, empresas poderão acompanhar cliques, visualizações e interesse gerado.",
  },
];

export default function AnuncieAqui({ open, onClose }) {
  const [mostrarOpcoes, setMostrarOpcoes] = useState(false);
  const anuncioWhatsappAtivo = Boolean(WHATSAPP_ANUNCIO_URL);

  if (!open) return null;

  const abrirWhatsApp = () => {
    if (!anuncioWhatsappAtivo) return;
    window.open(WHATSAPP_ANUNCIO_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/75 px-4 py-6 text-white backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-[30px] border border-white/10 bg-[#07111f]/95 shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 bg-white/[0.035] px-5 py-4">
          <div className="min-w-0">
            <div className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-cyan-100">
              Em breve
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight md:text-3xl">
              📢 Anúncios locais em breve
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-xl font-black text-white/80 transition hover:bg-white/[0.1]"
            aria-label="Fechar anúncios em breve"
          >
            x
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <p className="text-sm leading-relaxed text-slate-300 md:text-base">
            Estamos preparando formas inteligentes para empresas e negócios locais aparecerem no Corre Aqui sem atrapalhar a experiência dos usuários.
          </p>

          <div className="rounded-[24px] border border-blue-300/15 bg-blue-400/10 p-4 text-sm font-semibold leading-relaxed text-blue-50">
            O Corre Aqui conecta clientes, profissionais e oportunidades locais. A área de anúncios ainda não está ativa, mas empresas interessadas já podem entrar na lista de pré-cadastro.
          </div>

          <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/10 p-4">
            <div className="text-base font-black text-emerald-100">
              💚 Sem taxa para quem trabalha
            </div>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-emerald-50/90">
              O foco atual é ajudar pessoas a conseguir serviços e oportunidades locais. Anúncios virão depois, sem mexer nos 100% combinados entre cliente e trabalhador.
            </p>
          </div>

          {mostrarOpcoes && (
            <div className="grid gap-3 sm:grid-cols-2">
              {opcoesAnuncio.map((opcao) => (
                <div
                  key={opcao.titulo}
                  className="rounded-[22px] border border-white/10 bg-white/[0.055] p-4 shadow-[0_12px_34px_rgba(0,0,0,0.22)]"
                >
                  <div className="text-sm font-black text-white">
                    {opcao.titulo}
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    {opcao.texto}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-2 border-t border-white/10 bg-[#081320]/95 p-4 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={abrirWhatsApp}
            disabled={!anuncioWhatsappAtivo}
            className={`rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-3 text-sm font-black text-white shadow-[0_16px_44px_rgba(37,99,235,0.34)] transition active:scale-[0.98] ${
              anuncioWhatsappAtivo ? "" : "cursor-not-allowed opacity-60"
            }`}
          >
            {anuncioWhatsappAtivo ? "Entrar no pre-cadastro" : "Pre-cadastro em breve"}
          </button>
          <button
            type="button"
            onClick={() => setMostrarOpcoes((v) => !v)}
            className="rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-white transition hover:bg-white/[0.1] active:scale-[0.98]"
          >
            {mostrarOpcoes ? "Ocultar opções" : "Ver opções futuras"}
          </button>
        </div>
      </div>
    </div>
  );
}
