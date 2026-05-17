"use client";

import AnunciosEmBreve from "@/components/AnunciosEmBreve";

const recursosFuturos = [
  "🚀 Impulsionar pedido ou perfil",
  "📅 Agenda avançada",
  "🏆 Destaque por patente",
  "📍 Prioridade no mapa",
  "📊 Estatísticas do profissional",
  "🔔 Alertas de oportunidades",
];

export default function PlanosCorreAqui() {
  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-[#07111f]/88 p-4 text-white shadow-[0_24px_80px_rgba(0,0,0,0.42)] backdrop-blur-2xl md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(59,130,246,0.22),transparent_34%),radial-gradient(circle_at_88%_12%,rgba(168,85,247,0.18),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_45%)]" />

        <div className="relative space-y-4">
          <div>
            <div className="inline-flex rounded-full border border-blue-300/20 bg-blue-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-blue-100">
              Premium
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-white md:text-3xl">
              ✨ Recursos premium em breve
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300 md:text-base">
              Estamos preparando ferramentas para dar mais visibilidade para profissionais e negócios no Corre Aqui.
            </p>
          </div>

          <div className="rounded-[24px] border border-emerald-300/20 bg-emerald-400/10 p-4 shadow-[0_16px_40px_rgba(16,185,129,0.12)]">
            <div className="text-base font-black text-emerald-100">
              💚 Sem taxa do app
            </div>
            <div className="mt-1 text-sm font-semibold leading-relaxed text-emerald-50/90">
              100% do valor combinado fica com quem faz o serviço.
            </div>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {recursosFuturos.map((recurso) => (
              <div
                key={recurso}
                className="rounded-[18px] border border-white/10 bg-white/[0.055] px-3.5 py-3 text-sm font-bold text-slate-100 shadow-[0_10px_28px_rgba(0,0,0,0.20)]"
              >
                {recurso}
              </div>
            ))}
          </div>

          <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-4 text-xs leading-relaxed text-slate-400">
            A ideia é liberar recursos de crescimento sem cobrar comissão sobre o serviço combinado entre cliente e profissional.
          </div>
        </div>
      </section>

      <AnunciosEmBreve />
    </div>
  );
}
