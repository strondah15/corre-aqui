"use client";

import { motion } from "framer-motion";
import { calcularPatente, progressoNivel } from "./Patente";

const PATENTES_CORRE = [
  {
    nivel: 1,
    nome: "Iniciante",
    cor: "from-slate-500 to-slate-700",
    beneficios: ["Aceitar serviços", "Perfil básico", "XP inicial"],
  },
  {
    nivel: 2,
    nome: "Corredor",
    cor: "from-cyan-400 to-blue-500",
    beneficios: ["Selo azul", "Destaque leve", "Mais visibilidade"],
  },
  {
    nivel: 3,
    nome: "Resolvedor",
    cor: "from-emerald-400 to-green-500",
    beneficios: ["Confiável", "Prioridade média", "Perfil destacado"],
  },
  {
    nivel: 4,
    nome: "Brabo",
    cor: "from-purple-400 to-fuchsia-500",
    beneficios: ["Glow premium", "Badge animado", "Mais prioridade"],
  },
  {
    nivel: 5,
    nome: "Lendário",
    cor: "from-yellow-300 to-orange-500",
    beneficios: ["Prioridade máxima", "Selo raro", "Perfil cinematográfico"],
  },
];

const PATENTES_PRO = [
  {
    nivel: 1,
    nome: "Profissional",
    cor: "from-slate-500 to-slate-700",
    beneficios: ["Perfil profissional", "Serviços básicos"],
  },
  {
    nivel: 2,
    nome: "Especialista",
    cor: "from-sky-400 to-cyan-500",
    beneficios: ["Mais confiança", "Selo azul"],
  },
  {
    nivel: 3,
    nome: "Mestre",
    cor: "from-indigo-400 to-violet-500",
    beneficios: ["Perfil premium", "Mais destaque"],
  },
  {
    nivel: 4,
    nome: "Referência",
    cor: "from-amber-300 to-yellow-500",
    beneficios: ["Aparece melhor nas buscas", "Selo dourado"],
  },
  {
    nivel: 5,
    nome: "Imparável",
    cor: "from-pink-400 to-rose-500",
    beneficios: ["Destaque máximo", "Animações exclusivas"],
  },
];

function CardPatente({ patente, ativa, tipo }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={[
        "rounded-[28px] border p-5 transition-all",
        ativa
          ? "border-cyan-300/30 bg-white/[0.06] shadow-[0_0_45px_rgba(34,211,238,0.14)]"
          : "border-white/10 bg-white/[0.03]",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] font-black text-slate-400">
            Nível {patente.nivel}
          </div>

          <h3 className="mt-1 text-xl font-black text-white">{patente.nome}</h3>
        </div>

        <div
          className={[
            "grid h-14 w-14 place-items-center rounded-2xl text-2xl font-black text-white",
            `bg-gradient-to-br ${patente.cor}`,
          ].join(" ")}
        >
          {tipo === "corre" ? "⚡" : "💎"}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {patente.beneficios.map((b) => (
          <div
            key={b}
            className="flex items-center gap-2 text-sm text-slate-200"
          >
            <span className="text-emerald-300">✓</span>
            <span>{b}</span>
          </div>
        ))}
      </div>

      {ativa && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-4 rounded-2xl bg-cyan-400/15 px-4 py-3 text-sm font-bold text-cyan-200"
        >
          🚀 Patente atual ativa
        </motion.div>
      )}
    </motion.div>
  );
}

export default function PainelPatentes() {
  const xpCorre = 3000;
  const nivelCorreAtual = calcularPatente(xpCorre);
  const xpPro = 420;
  const nivelProAtual = calcularPatente(xpPro);

  return (
    <div className="mt-5 space-y-6">
      <div className="rounded-[34px] border border-cyan-400/10 bg-[#071120]/92 p-6 shadow-[0_25px_80px_rgba(0,0,0,.34)] backdrop-blur-2xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-3xl font-black text-white">
              🏆 Minhas Patentes
            </h2>

            <p className="mt-2 text-slate-300">
              Evolua fazendo serviços e desbloqueie benefícios premium.
            </p>
          </div>

          <motion.div
            animate={{
              boxShadow: [
                "0 0 0 rgba(34,211,238,0)",
                "0 0 35px rgba(34,211,238,0.22)",
                "0 0 0 rgba(34,211,238,0)",
              ],
            }}
            transition={{
              duration: 2.2,
              repeat: Infinity,
            }}
            className="rounded-3xl border border-cyan-300/20 bg-cyan-400/10 px-5 py-4"
          >
            <div className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300">
              Patente atual
            </div>

            <div className="mt-1 text-2xl font-black text-white">
              ⚡ Resolvedor
            </div>
          </motion.div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="rounded-[30px] border border-cyan-400/10 bg-[#071120]/85 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-cyan-300">
                  Progressão Corre
                </div>

                <div className="mt-1 text-xl font-black text-white">
                  Resolvedor → Brabo
                </div>
              </div>

              <div className="text-cyan-200 font-black">
                {Math.round(progressoNivel(xpCorre))}%
              </div>
            </div>

            <div className="mt-4 h-4 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(progressoNivel(xpCorre))}%` }}
                transition={{ duration: 1.2 }}
                className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
              />
            </div>
          </div>

          {PATENTES_CORRE.map((patente) => (
            <CardPatente
              key={patente.nome}
              patente={patente}
              ativa={patente.nivel === nivelCorreAtual}
              tipo="corre"
            />
          ))}
        </div>

        <div className="space-y-4">
          <div className="rounded-[30px] border border-yellow-400/10 bg-[#071120]/85 p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-black uppercase tracking-[0.22em] text-yellow-300">
                  Progressão Profissional
                </div>

                <div className="mt-1 text-xl font-black text-white">
                  Especialista → Mestre
                </div>
              </div>

              <div className="text-yellow-200 font-black">
                {Math.round(progressoNivel(xpPro))}%
              </div>
            </div>

            <div className="mt-4 h-4 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(progressoNivel(xpPro))}%` }}
                transition={{ duration: 1.2 }}
                className="h-full rounded-full bg-gradient-to-r from-yellow-300 to-orange-500"
              />
            </div>
          </div>

          {PATENTES_PRO.map((patente) => (
            <CardPatente
              key={patente.nome}
              patente={patente}
              ativa={patente.nivel === nivelProAtual}
              tipo="pro"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
