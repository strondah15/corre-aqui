"use client";

const anunciosFuturos = [
  "📍 Destaque no mapa",
  "✨ Empresas patrocinadas",
  "🔥 Serviços relacionados",
  "🏆 Parceiros locais",
  "📊 Visibilidade regional",
];

export default function AnunciosEmBreve() {
  return (
    <section className="relative overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_54px_rgba(0,0,0,0.26)] backdrop-blur-xl md:p-5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(99,102,241,0.14),transparent_38%)]" />

      <div className="relative space-y-4">
        <div>
          <h3 className="text-xl font-black tracking-tight text-white">
            📢 Anúncios locais em breve
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Estamos preparando formas inteligentes para empresas e negócios locais aparecerem no Corre Aqui sem atrapalhar a experiência dos usuários.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {anunciosFuturos.map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/10 bg-[#07111f]/55 px-3.5 py-3 text-sm font-bold text-slate-100"
            >
              {item}
            </div>
          ))}
        </div>

        <div className="rounded-[20px] border border-emerald-300/20 bg-emerald-400/10 p-3 text-sm font-semibold leading-relaxed text-emerald-50/90">
          💚 O foco atual do Corre Aqui é ajudar pessoas a conseguir serviços e oportunidades locais.
        </div>
      </div>
    </section>
  );
}
