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
    <div className="space-y-3 md:space-y-4">
      <section className="relative overflow-hidden rounded-[20px] border border-white/10 bg-[#07111f]/88 p-3 text-white shadow-[0_20px_60px_rgba(0,0,0,0.36)] backdrop-blur-2xl md:rounded-[28px] md:p-6 md:shadow-[0_24px_80px_rgba(0,0,0,0.42)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_10%,rgba(59,130,246,0.22),transparent_34%),radial-gradient(circle_at_88%_12%,rgba(168,85,247,0.18),transparent_32%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_45%)]" />

        <div className="relative space-y-3 md:space-y-4">
          <div>
            <div className="inline-flex rounded-full border border-blue-300/20 bg-blue-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-blue-100 md:px-3 md:text-[11px] md:tracking-[0.16em]">
              Premium
            </div>
            <h2 className="mt-2 text-xl font-black tracking-tight text-white md:mt-3 md:text-3xl">
              ✨ Recursos premium em breve
            </h2>
            <p className="mt-1.5 max-w-2xl text-xs leading-snug text-slate-300 md:mt-2 md:text-base md:leading-relaxed">
              Estamos preparando ferramentas para dar mais visibilidade para profissionais e negócios no Corre Aqui.
            </p>
          </div>

          <div className="rounded-[18px] border border-emerald-300/20 bg-emerald-400/10 p-3 shadow-[0_16px_40px_rgba(16,185,129,0.12)] md:rounded-[24px] md:p-4">
            <div className="text-sm font-black text-emerald-100 md:text-base">
              💚 Sem taxa do app
            </div>
            <div className="mt-1 text-xs font-semibold leading-snug text-emerald-50/90 md:text-sm md:leading-relaxed">
              100% do valor combinado fica com quem faz o serviço.
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 md:gap-2.5">
            {recursosFuturos.map((recurso) => (
              <div
                key={recurso}
                className="rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-xs font-bold text-slate-100 shadow-[0_10px_28px_rgba(0,0,0,0.20)] md:rounded-[18px] md:px-3.5 md:py-3 md:text-sm"
              >
                {recurso}
              </div>
            ))}
          </div>

          <div className="rounded-[16px] border border-white/10 bg-white/[0.04] p-3 text-[11px] leading-snug text-slate-400 md:rounded-[22px] md:p-4 md:text-xs md:leading-relaxed">
            A ideia é liberar recursos de crescimento sem cobrar comissão sobre o serviço combinado entre cliente e profissional.
          </div>
        </div>
      </section>

      <AnunciosEmBreve />
    </div>
  );
}
