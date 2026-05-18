"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ref, onValue, update, serverTimestamp } from "firebase/database";
import { database } from "@/lib/firebase";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import PainelPatentes from "./PainelPatentes";
import Patente, { calcularPatentePorServicos } from "./Patente";

const PlanosCorreAqui = dynamic(() => import("@/components/PlanosCorreAqui"), {
  ssr: false,
});

const initialProfile = {
  nome: "",
  cidade: "",
  fotoURL: "",
  avatarEmoji: "",
  bio: "",
  visivel: true,
  notificacoes: true,
  isCorre: true,
  correTitulo: "",
  correBio: "",
  correTransporte: "",
  correRegiao: "",
  correDisponibilidade: "",
  correExperiencia: "",
  isProfissional: false,
  titulo: "",
  descricao: "",
  whatsapp: "",
  preco: "",
  profRegiao: "",
  profExperiencia: "",
  plano: "Free",
  statusProfissional: "disponivel",
  ocupadoAte: "",
  agendaAberta: true,
  mapMostrarOnline: false,
  mapAoVivo: false,
  mapLimiteOnline: 30,
  animacoes: true,
};

const tabLabel = {
  perfil: "Perfil",
  corre: "Corre",
  profissional: "Profissional",
  config: "Ajustes",
  monetizacao: "Em breve",
  patentes: "Patentes",
};

const tabIcon = {
  perfil: "👤",
  corre: "⚡",
  profissional: "🧑‍🔧",
  config: "⚙️",
  monetizacao: "📢",
  patentes: "🏆",
};

const planoInfo = {
  EmBreve: {
    nome: "Em breve",
    icon: "✨",
    badge: "bg-emerald-500/15 border-emerald-400/20 text-emerald-300",
    descricao: "Recursos premium e anúncios locais serão liberados futuramente.",
  },
};

function PlanoResumo({ onOpenPlanos }) {
  const atual = planoInfo.EmBreve;

  return (
    <div className="mt-5 w-full rounded-[26px] bg-[#0c1a2e] border border-cyan-400/10 p-4 text-left shadow-[0_0_40px_rgba(34,211,238,0.08)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-black text-emerald-300">
            Crescimento justo
          </div>
          <div className="mt-1 text-sm font-extrabold text-white">
            💚 Sem taxa do app
          </div>
          <div className="mt-1 text-xs leading-relaxed text-slate-300">
            100% do valor combinado fica com quem faz o serviço. Recursos premium e anúncios locais chegam em breve.
          </div>
        </div>

        <span
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-black border ${atual.badge}`}
        >
          {atual.icon} {atual.nome}
        </span>
      </div>

      <button
        type="button"
        onClick={onOpenPlanos}
        className="mt-3 w-full rounded-2xl bg-white/10 hover:bg-white/15 border border-white/10 px-4 py-3 text-sm font-extrabold text-white active:scale-[0.98] transition"
      >
        Ver recursos em breve
      </button>
      
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      {children}
      {hint ? (
        <div className="mt-1 text-[11px] text-slate-500">{hint}</div>
      ) : null}
    </label>
  );
}

function inputClass(extra = "") {
  return [
    "w-full rounded-2xl bg-slate-900/70 border border-white/10",
    "px-4 py-3 text-slate-100 placeholder:text-slate-500",
    "outline-none focus:ring-2 focus:ring-blue-500/35 focus:border-blue-400/50",
    "transition",
    extra,
  ].join(" ");
}

export default function PerfilDrawer({ open, onClose, uid }) {
  const [tab, setTab] = useState("perfil");

  const [profile, setProfile] = useState(initialProfile);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [serviceStats, setServiceStats] = useState({
    total: 0,
    comoCorre: 0,
    comoCliente: 0,
    comoProfissional: 0,
    problemas: 0,
    notaMedia: null,
    avaliacoes: 0,
  });
  const [accountStats, setAccountStats] = useState({
    xp: 0,
    moedas: 0,
    servicosCorre: 0,
    servicosProf: 0,
    patenteCorre: 1,
    patenteProf: 0,
  });
  const settingsLoadedRef = useRef(false);

  const userBasePath = useMemo(() => (uid ? `users/${uid}` : ""), [uid]);

  useEffect(() => {
    settingsLoadedRef.current = false;
  }, [open, uid]);

  useEffect(() => {
    if (!open || !uid) return;

    const userRef = ref(database, userBasePath);
    return onValue(userRef, (snap) => {
      const data = snap.val() || {};
      const settings = data.settings || {};
      const settingsMapa = settings.mapa || {};
      const settingsUi = settings.ui || {};

      const servicosCorre = Number(data.servicosCorre ?? data["serviçosCorre"] ?? 0);
      const servicosProf = Number(data.servicosProf ?? data["serviçosProf"] ?? 0);
      const isProfissionalUser = !!(data.isProfissional || data.profile?.isProfissional || data.profissional?.ativo);

      setAccountStats({
        xp: Number(data.xp || 0),
        moedas: Number(data.moedas || 0),
        servicosCorre,
        servicosProf,
        patenteCorre: Number(data.patenteCorre || calcularPatentePorServicos(servicosCorre)),
        patenteProf: Number(data.patenteProf || (isProfissionalUser ? calcularPatentePorServicos(servicosProf) : 0)),
      });

      if (!settingsLoadedRef.current) {
        setProfile((prev) => ({
          ...prev,
          mapMostrarOnline: settingsMapa.mostrarOnline ?? prev.mapMostrarOnline,
          mapAoVivo: settingsMapa.aoVivo ?? prev.mapAoVivo,
          mapLimiteOnline: settingsMapa.limiteOnline ?? prev.mapLimiteOnline,
          animacoes: settingsUi.animacoes ?? prev.animacoes,
        }));
        settingsLoadedRef.current = true;
      }
    });
  }, [open, uid, userBasePath]);

  useEffect(() => {
    if (!open || !uid) return;

    const pRef = ref(database, `${userBasePath}/profile`);

    return onValue(pRef, (snap) => {
      if (snap.exists()) {
        setProfile((prev) => {
          const data = snap.val() || {};
          const corre = data.corre || {};
          const profissional = data.profissional || {};

          return {
            ...prev,
            ...data,
            isCorre: data.isCorre ?? corre.ativo ?? prev.isCorre,
            correTitulo: data.correTitulo || corre.titulo || "",
            correBio: data.correBio || corre.bio || "",
            correTransporte: data.correTransporte || corre.transporte || "",
            correRegiao: data.correRegiao || corre.regiao || "",
            correDisponibilidade:
              data.correDisponibilidade || corre.disponibilidade || "",
            correExperiencia: data.correExperiencia || corre.experiencia || "",
            isProfissional:
              data.isProfissional ?? profissional.ativo ?? prev.isProfissional,
            titulo: data.titulo || profissional.titulo || "",
            descricao: data.descricao || profissional.descricao || "",
            whatsapp: data.whatsapp || profissional.whatsapp || "",
            preco: data.preco || profissional.preco || "",
            profRegiao: data.profRegiao || profissional.regiao || "",
            profExperiencia:
              data.profExperiencia || profissional.experiencia || "",
            fotoURL:
              data.fotoURL ||
              data.photoURL ||
              data.avatar ||
              prev.fotoURL ||
              "",
            photoURL:
              data.photoURL ||
              data.fotoURL ||
              data.avatar ||
              prev.photoURL ||
              "",
            avatar:
              data.avatar || data.fotoURL || data.photoURL || prev.avatar || "",
            plano: data.plano || data.assinatura?.plano || prev.plano || "Free",
            statusProfissional: data.statusProfissional || data.profissional?.statusProfissional || prev.statusProfissional || "disponivel",
            ocupadoAte: data.ocupadoAte || data.profissional?.ocupadoAte || prev.ocupadoAte || "",
            agendaAberta: data.agendaAberta ?? data.profissional?.agendaAberta ?? prev.agendaAberta ?? true,
          };
        });
      }
    });
  }, [open, uid, userBasePath]);

  useEffect(() => {
    if (!open || !uid) return;

    const pedidosRef = ref(database, "pedidos");
    return onValue(pedidosRef, (snap) => {
      const data = snap.val() || {};
      const pedidos = Object.values(data);
      let total = 0;
      let comoCorre = 0;
      let comoCliente = 0;
      let comoProfissional = 0;
      let problemas = 0;
      let notaSoma = 0;
      let avaliacoes = 0;

      pedidos.forEach((p) => {
        const souCliente = p?.criador?.id === uid;
        const souCorre = p?.aceite?.id === uid;
        const concluido = String(p?.status || "").toLowerCase() === "concluido";
        const modoProfissional = String(p?.modoPedido || "").toLowerCase() === "profissional";

        if (concluido && (souCliente || souCorre)) total += 1;
        if (concluido && souCorre) comoCorre += 1;
        if (concluido && souCorre && modoProfissional) comoProfissional += 1;
        if (concluido && souCliente) comoCliente += 1;
        if ((souCliente || souCorre) && p?.problemaServico) problemas += 1;

        const nota = Number(p?.avaliacao?.nota);
        if (souCorre && Number.isFinite(nota) && nota > 0) {
          notaSoma += nota;
          avaliacoes += 1;
        }
      });

      setServiceStats({
        total,
        comoCorre,
        comoCliente,
        comoProfissional,
        problemas,
        notaMedia: avaliacoes ? notaSoma / avaliacoes : null,
        avaliacoes,
      });
    });
  }, [open, uid]);

  const salvar = async () => {
    if (!uid) return;

    setSalvando(true);
    setSalvo(false);

    try {
      const corre = {
        ativo: !!profile.isCorre,
        titulo: profile.correTitulo || "Corre rápido",
        bio: profile.correBio || "",
        transporte: profile.correTransporte || "",
        regiao: profile.correRegiao || profile.cidade || "",
        disponibilidade: profile.correDisponibilidade || "",
        experiencia: profile.correExperiencia || "",
      };

      const profissional = {
        ativo: !!profile.isProfissional,
        titulo: profile.titulo || "",
        descricao: profile.descricao || "",
        preco: profile.preco || "",
        whatsapp: profile.whatsapp || "",
        regiao: profile.profRegiao || profile.cidade || "",
        experiencia: profile.profExperiencia || "",
        statusProfissional: profile.statusProfissional || "disponivel",
        ocupadoAte: profile.ocupadoAte || "",
        agendaAberta: profile.agendaAberta !== false,
      };

      const mapSettings = {
        mostrarOnline: !!profile.mapMostrarOnline,
        aoVivo: !!profile.mapAoVivo,
        limiteOnline: Math.max(5, Math.min(120, Number(profile.mapLimiteOnline || 30))),
        atualizadoEm: serverTimestamp(),
      };

      const uiSettings = {
        animacoes: profile.animacoes !== false,
        atualizadoEm: serverTimestamp(),
      };

      const fotoPrincipal =
        profile.fotoURL || profile.photoURL || profile.avatar || "";

      await update(ref(database, `${userBasePath}/profile`), {
        ...profile,
        fotoURL: fotoPrincipal || null,
        photoURL: fotoPrincipal || null,
        avatar: fotoPrincipal || profile.avatarEmoji || "",
        corre: {
          ...corre,
          fotoURL: fotoPrincipal || null,
          photoURL: fotoPrincipal || null,
        },
        profissional: {
          ...profissional,
          fotoURL: fotoPrincipal || null,
          photoURL: fotoPrincipal || null,
        },
        atualizadoEm: serverTimestamp(),
      });

      await update(ref(database, `${userBasePath}/settings/mapa`), mapSettings);
      await update(ref(database, `${userBasePath}/settings/ui`), uiSettings);

      await update(ref(database, `${userBasePath}`), {
        nome: profile.nome,
        fotoURL: fotoPrincipal || null,
        photoURL: fotoPrincipal || null,
        avatar: fotoPrincipal || profile.avatarEmoji || "",
        avatarEmoji: profile.avatarEmoji || "",
        cidade: profile.cidade || "",
        bio: profile.bio || "",
        isCorre: !!profile.isCorre,
        corre: {
          ...corre,
          fotoURL: fotoPrincipal || null,
          photoURL: fotoPrincipal || null,
        },
        isProfissional: !!profile.isProfissional,
        profissional: profile.isProfissional
          ? {
              ...profissional,
              fotoURL: fotoPrincipal || null,
              photoURL: fotoPrincipal || null,
            }
          : null,
        plano: profile.plano || "Free",
        statusProfissional: profile.statusProfissional || "disponivel",
        ocupadoAte: profile.ocupadoAte || "",
        agendaAberta: profile.agendaAberta !== false,
        assinatura: {
          plano: profile.plano || "Free",
          origem: "perfil",
          atualizadoEm: serverTimestamp(),
        },
      });

      await update(ref(database, `usuariosOnline/${uid}`), {
        nome: profile.nome || "",
        fotoURL: fotoPrincipal || null,
        photoURL: fotoPrincipal || null,
        avatar: fotoPrincipal || profile.avatarEmoji || "",
        avatarEmoji: profile.avatarEmoji || "",
        cidade: profile.cidade || "",
        isCorre: !!profile.isCorre,
        isProfissional: !!profile.isProfissional,
        plano: profile.plano || "Free",
        statusProfissional: profile.statusProfissional || "disponivel",
        ocupadoAte: profile.ocupadoAte || "",
        agendaAberta: profile.agendaAberta !== false,
        atualizadoEm: serverTimestamp(),
      });

      setSalvo(true);
      setTimeout(() => setSalvo(false), 2200);
    } finally {
      setSalvando(false);
    }
  };

  if (!open) return null;
  if (!uid) return null;

  const fotoPrincipal = profile.fotoURL || profile.photoURL || profile.avatar || "";
  const perfilVerificadoOficial = !!(
    profile.verificado ||
    profile.verified ||
    profile.perfilVerificado ||
    profile.trust?.verificado
  );
  const perfilVerificadoBasico = !!(
    !perfilVerificadoOficial &&
    profile.nome &&
    profile.cidade &&
    (fotoPrincipal || profile.avatarEmoji) &&
    (serviceStats.total > 0 || profile.isCorre || profile.isProfissional)
  );
  const perfilVerificado = perfilVerificadoOficial || perfilVerificadoBasico;
  const nivelCorreAtual = Number(accountStats.patenteCorre || calcularPatentePorServicos(accountStats.servicosCorre));
  const nivelProfAtual = Number(accountStats.patenteProf || (profile.isProfissional ? calcularPatentePorServicos(accountStats.servicosProf) : 0));

  return (
    <div className="fixed inset-0 z-[100000] bg-[#020617]">
      <div
        className="absolute inset-0 bg-black/72 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.aside
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        className="
          fixed inset-0 h-screen w-screen
          bg-[#06101d] text-white
          border-0
          shadow-[0_30px_120px_rgba(0,0,0,0.65)]
          overflow-y-auto
        "
      >
        <div className="sticky top-0 z-10 bg-[#06101d]/95 backdrop-blur-xl border-b border-white/10">
          <div className="mx-auto w-full max-w-7xl px-4 md:px-8 py-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-extrabold text-white">
                Meu perfil
              </div>
              <div className="text-xs text-slate-400">
                Configure como você aparece no Corre Aqui.
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-12 h-12 rounded-3xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-white text-xl font-black active:scale-[0.96] transition shadow-lg"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="mx-auto w-full max-w-7xl p-4 md:p-6">
          {/* FOTO + HEADER */}
          <div className="rounded-[32px] bg-gradient-to-br from-[#0b1730] via-[#0a1428] to-[#050b16] border border-cyan-300/10 p-5 md:p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
            <div className="flex flex-col items-center text-center">
              <label className="cursor-pointer relative group">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = () => {
                      const fotoBase64 = reader.result || "";
                      setProfile((p) => ({
                        ...p,
                        fotoURL: fotoBase64,
                        photoURL: fotoBase64,
                        avatar: fotoBase64,
                      }));
                    };
                    reader.readAsDataURL(file);
                  }}
                />

                {profile.fotoURL ? (
                  <img
                    src={profile.fotoURL}
                    className="w-28 h-28 rounded-full object-cover border-4 border-cyan-300/80 ring-4 ring-cyan-400/15 shadow-[0_0_45px_rgba(34,211,238,0.28)]"
                    alt="Foto do perfil"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-full bg-white/10 flex items-center justify-center text-4xl border border-white/20 shadow-2xl">
                    {profile.avatarEmoji || "📷"}
                  </div>
                )}

                <div className="absolute inset-0 rounded-full bg-black/45 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-xs font-bold">
                  Trocar foto
                </div>
              </label>

              <div className="mt-4 text-2xl font-extrabold text-white">
                {profile.nome || "Seu nome"}
              </div>

              <div className="mt-1 text-sm text-slate-400">
                {profile.cidade || "Cidade não informada"}
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <span
                  className={`px-3 py-1.5 rounded-full text-xs font-black border ${
                    profile.visivel
                      ? "bg-emerald-500/15 border-emerald-400/20 text-emerald-300 shadow-[0_0_22px_rgba(16,185,129,0.12)]"
                      : "bg-slate-500/15 border-slate-400/20 text-slate-300"
                  }`}
                >
                  {profile.visivel ? "🟢 Visível" : "⚫ Oculto"}
                </span>

                {perfilVerificado ? (
                  <span className="px-3 py-1.5 rounded-full text-xs font-black bg-cyan-500/15 border border-cyan-300/25 text-cyan-200">
                    {perfilVerificadoOficial ? "✓ Perfil verificado" : "✓ Básico verificado"}
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-full text-xs font-black bg-slate-500/10 border border-slate-400/15 text-slate-300">
                    Verificação pendente
                  </span>
                )}

                <span className="px-3 py-1.5 rounded-full text-xs font-black bg-amber-500/10 border border-amber-300/20 text-amber-200">
                  ⚡ Corre rápido
                </span>

                {profile.isProfissional && (
                  <span className="px-3 py-1.5 rounded-full text-xs font-black bg-blue-500/15 border border-blue-400/20 text-blue-300">
                    🧑‍🔧 Profissional
                  </span>
                )}

                <Patente tipo="corre" nivel={nivelCorreAtual} size="sm" />
                {profile.isProfissional && nivelProfAtual > 0 ? (
                  <Patente tipo="prof" nivel={nivelProfAtual} size="sm" />
                ) : null}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 w-full">
                <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-3">
                  <div className="text-lg font-black text-white">{serviceStats.total}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Histórico
                  </div>
                </div>
                <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-3">
                  <div className="text-lg font-black text-white">
                    {serviceStats.notaMedia ? `★ ${serviceStats.notaMedia.toFixed(1)}` : "Sem nota"}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Nota
                  </div>
                </div>
                <div className="rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-3">
                  <div className="text-lg font-black text-white">{serviceStats.problemas}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 truncate">
                    Problemas
                  </div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-2 w-full text-left">
                <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-3 py-2">
                  <div className="text-sm font-black text-cyan-100">{serviceStats.comoCorre}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Como corre</div>
                </div>
                <div className="rounded-2xl bg-white/[0.04] border border-white/10 px-3 py-2">
                  <div className="text-sm font-black text-cyan-100">{serviceStats.comoCliente}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Como cliente</div>
                </div>
              </div>

              <PlanoResumo
                plano={profile.plano}
                onOpenPlanos={() => setTab("monetizacao")}
              />
            </div>
          </div>

          {/* MENU DO PERFIL */}
          <div className="mt-5 rounded-[30px] bg-slate-950/65 border border-white/10 p-2 shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {["perfil", "corre", "profissional", "config", "monetizacao", "patentes"].map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    type="button"
                    className={[
                      "group min-h-[72px] rounded-[24px] px-2 py-3 text-center border transition-all duration-200 active:scale-[0.96]",
                      "flex flex-col items-center justify-center gap-1",
                      tab === t
                        ? "bg-gradient-to-br from-blue-600 via-cyan-500 to-emerald-400 text-white border-cyan-200/40 shadow-[0_12px_45px_rgba(34,211,238,0.22)]"
                        : "bg-slate-800/80 hover:bg-slate-700/90 text-slate-200 border-white/10 hover:border-white/20",
                    ].join(" ")}
                  >
                    <span className="text-lg leading-none">{tabIcon[t]}</span>
                    <span className="text-[11px] sm:text-[12px] font-black leading-tight">
                      {tabLabel[t]}
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>

          {/* PERFIL */}
          {tab === "perfil" && (
            <div className="mt-5 rounded-[28px] bg-[#0b1628] border border-white/10 p-4 space-y-4">
              <Field label="Nome">
                <input
                  value={profile.nome}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, nome: e.target.value }))
                  }
                  placeholder="Seu nome"
                  className={inputClass()}
                />
              </Field>

              <Field label="Cidade">
                <input
                  value={profile.cidade}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, cidade: e.target.value }))
                  }
                  placeholder="Sua cidade"
                  className={inputClass()}
                />
              </Field>

              <Field
                label="Emoji do avatar"
                hint="Use quando ainda não tiver foto. Ex: 🙂, 🧑‍🔧, 🚗"
              >
                <input
                  value={profile.avatarEmoji}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, avatarEmoji: e.target.value }))
                  }
                  placeholder="🙂"
                  className={inputClass()}
                />
              </Field>

              <Field label="Bio">
                <textarea
                  value={profile.bio}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, bio: e.target.value }))
                  }
                  placeholder="Fale um pouco sobre você"
                  className={inputClass("min-h-28 resize-y")}
                />
              </Field>
            </div>
          )}

          {/* CONFIG */}
          {tab === "config" && (
            <div className="mt-5 space-y-4">
              <div className="rounded-[30px] bg-gradient-to-br from-[#0b1628] via-[#081426] to-[#050b16] border border-cyan-300/10 p-5 shadow-[0_20px_70px_rgba(0,0,0,0.24)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/[0.06] text-xl shadow-lg">
                      ⚙️
                    </div>
                    <div>
                      <div className="text-lg font-black text-white">Configurações</div>
                      <div className="text-sm text-slate-400">
                        Ajuste presença, mapa e experiência visual.
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-cyan-300/15 bg-cyan-400/10 px-4 py-3 text-sm font-black text-cyan-100">
                    Mapa limpo por padrão
                  </div>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <section className="rounded-[28px] border border-white/10 bg-[#0b1628] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-300">Presença</div>

                  <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4">
                    <div>
                      <div className="text-sm font-extrabold text-white">Visível no mapa</div>
                      <div className="text-xs text-slate-400">Permite aparecer como disponível para clientes próximos.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={profile.visivel}
                      onChange={(e) => setProfile((p) => ({ ...p, visivel: e.target.checked }))}
                      className="h-5 w-5 accent-emerald-500"
                    />
                  </label>

                  <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4">
                    <div>
                      <div className="text-sm font-extrabold text-white">Notificações</div>
                      <div className="text-xs text-slate-400">Pedidos, chat, aceite, conclusão e avaliações.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={profile.notificacoes}
                      onChange={(e) => setProfile((p) => ({ ...p, notificacoes: e.target.checked }))}
                      className="h-5 w-5 accent-blue-600"
                    />
                  </label>
                </section>

                <section className="rounded-[28px] border border-white/10 bg-[#0b1628] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-cyan-300">Mapa ao vivo</div>

                  <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4">
                    <div>
                      <div className="text-sm font-extrabold text-white">Mostrar pessoas online</div>
                      <div className="text-xs text-slate-400">Mantido desligado para o mapa ficar mais limpo.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={profile.mapMostrarOnline}
                      onChange={(e) => setProfile((p) => ({ ...p, mapMostrarOnline: e.target.checked }))}
                      className="h-5 w-5 accent-cyan-500"
                    />
                  </label>

                  <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4">
                    <div>
                      <div className="text-sm font-extrabold text-white">Atualização ao vivo</div>
                      <div className="text-xs text-slate-400">Atualiza marcadores automaticamente quando ativado.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={profile.mapAoVivo}
                      onChange={(e) => setProfile((p) => ({ ...p, mapAoVivo: e.target.checked }))}
                      className="h-5 w-5 accent-cyan-500"
                    />
                  </label>

                  <label className="mt-4 block rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-extrabold text-white">Limite de marcadores</div>
                        <div className="text-xs text-slate-400">Use pouco para manter o mapa leve.</div>
                      </div>
                      <div className="rounded-full bg-white/10 px-3 py-1 text-sm font-black text-white">
                        {profile.mapLimiteOnline}
                      </div>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="120"
                      step="5"
                      value={profile.mapLimiteOnline}
                      onChange={(e) => setProfile((p) => ({ ...p, mapLimiteOnline: Number(e.target.value) }))}
                      className="mt-4 w-full accent-cyan-400"
                    />
                  </label>
                </section>
              </div>

              <section className="rounded-[28px] border border-white/10 bg-[#0b1628] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.22)]">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-violet-300">Experiência</div>
                <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4">
                  <div>
                    <div className="text-sm font-extrabold text-white">Animações da interface</div>
                    <div className="text-xs text-slate-400">Mantém transições e feedbacks de XP/patente mais vivos.</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={profile.animacoes}
                    onChange={(e) => setProfile((p) => ({ ...p, animacoes: e.target.checked }))}
                    className="h-5 w-5 accent-violet-500"
                  />
                </label>
              </section>
            </div>
          )}

          {/* CORRE */}
          {tab === "corre" && (
            <div className="mt-5 rounded-[28px] bg-[#0b1628] border border-white/10 p-4 space-y-4">
              <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-900/70 border border-white/10 px-4 py-3">
                <div>
                  <div className="text-sm font-extrabold text-white">
                    Ativar currículo de Corre
                  </div>
                  <div className="text-xs text-slate-400">
                    Apareça para bicos rápidos e pedidos do bairro.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={profile.isCorre}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, isCorre: e.target.checked }))
                  }
                  className="w-5 h-5 accent-blue-600"
                />
              </label>

              {profile.isCorre && (
                <div className="space-y-4">
                  <Field label="Título do Corre">
                    <input
                      value={profile.correTitulo}
                      onChange={(e) =>
                        setProfile((p) => ({
                          ...p,
                          correTitulo: e.target.value,
                        }))
                      }
                      placeholder="Ex: Faço serviços rápidas, compras e pequenos corres"
                      className={inputClass()}
                    />
                  </Field>

                  <Field label="Resumo / currículo do Corre">
                    <textarea
                      value={profile.correBio}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, correBio: e.target.value }))
                      }
                      placeholder="Conte que tipo de corre você faz, como trabalha e sua experiência."
                      className={inputClass("min-h-28 resize-y")}
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Transporte">
                      <select
                        value={profile.correTransporte}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            correTransporte: e.target.value,
                          }))
                        }
                        className={inputClass()}
                      >
                        <option value="" className="text-black">
                          Selecione
                        </option>
                        <option value="A pé" className="text-black">
                          🚶 A pé
                        </option>
                        <option value="Bike" className="text-black">
                          🚲 Bike
                        </option>
                        <option value="Moto" className="text-black">
                          🏍️ Moto
                        </option>
                        <option value="Carro" className="text-black">
                          🚗 Carro
                        </option>
                        <option value="Van" className="text-black">
                          🚐 Van
                        </option>
                      </select>
                    </Field>

                    <Field label="Região que atende">
                      <input
                        value={profile.correRegiao}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            correRegiao: e.target.value,
                          }))
                        }
                        placeholder="Ex: Nova Iguaçu, Centro, bairros próximos"
                        className={inputClass()}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Disponibilidade">
                      <input
                        value={profile.correDisponibilidade}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            correDisponibilidade: e.target.value,
                          }))
                        }
                        placeholder="Ex: Noites, fins de semana, qualquer hora"
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="Experiência">
                      <input
                        value={profile.correExperiencia}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            correExperiencia: e.target.value,
                          }))
                        }
                        placeholder="Ex: 2 anos fazendo serviços e compras"
                        className={inputClass()}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PROFISSIONAL */}
          {tab === "profissional" && (
            <div className="mt-5 rounded-[28px] bg-[#0b1628] border border-white/10 p-4 space-y-4">
              <label className="flex items-center justify-between gap-4 rounded-2xl bg-slate-900/70 border border-white/10 px-4 py-3">
                <div>
                  <div className="text-sm font-extrabold text-white">
                    Modo profissional
                  </div>
                  <div className="text-xs text-slate-400">
                    Apareça na lista de profissionais para clientes.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={profile.isProfissional}
                  onChange={(e) =>
                    setProfile((p) => ({
                      ...p,
                      isProfissional: e.target.checked,
                    }))
                  }
                  className="w-5 h-5 accent-blue-600"
                />
              </label>

              {profile.isProfissional && (
                <div className="space-y-4">

                  <Field label="Título profissional">
                    <input
                      value={profile.titulo}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, titulo: e.target.value }))
                      }
                      placeholder="Ex: Eletricista, serviçodor, diarista..."
                      className={inputClass()}
                    />
                  </Field>

                  <Field label="Descrição do serviço">
                    <textarea
                      value={profile.descricao}
                      onChange={(e) =>
                        setProfile((p) => ({ ...p, descricao: e.target.value }))
                      }
                      placeholder="Conte o que você faz, região que atende e diferenciais."
                      className={inputClass("min-h-28 resize-y")}
                    />
                  </Field>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Preço base">
                      <input
                        value={profile.preco}
                        onChange={(e) =>
                          setProfile((p) => ({ ...p, preco: e.target.value }))
                        }
                        placeholder="Ex: 50"
                        inputMode="decimal"
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="WhatsApp">
                      <input
                        value={profile.whatsapp}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            whatsapp: e.target.value,
                          }))
                        }
                        placeholder="21999999999"
                        inputMode="tel"
                        className={inputClass()}
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Região profissional">
                      <input
                        value={profile.profRegiao}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            profRegiao: e.target.value,
                          }))
                        }
                        placeholder="Ex: Baixada, Centro, Zona Norte"
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="Experiência profissional">
                      <input
                        value={profile.profExperiencia}
                        onChange={(e) =>
                          setProfile((p) => ({
                            ...p,
                            profExperiencia: e.target.value,
                          }))
                        }
                        placeholder="Ex: 5 anos como eletricista"
                        className={inputClass()}
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* MONETIZAÇÃO */}
          {tab === "monetizacao" && (
            <div className="mt-5 space-y-4">
              <div className="rounded-[28px] bg-gradient-to-br from-emerald-500/10 via-[#0b1628] to-blue-500/10 border border-cyan-400/10 p-4 shadow-[0_0_35px_rgba(34,211,238,0.06)]">
                <div className="text-lg font-black text-white">
                  💚 Corre Aqui sem taxa
                </div>
                <div className="mt-1 text-sm leading-relaxed text-slate-300">
                  O trabalhador fica com 100% do valor do serviço. Recursos premium, anúncios locais e boosts serão preparados com calma, sem cobrança obrigatória agora.
                </div>

                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {[
                    "✨ Premium em breve",
                    "📢 Anúncios locais",
                    "🚀 Boosts futuros",
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-2xl border border-white/10 bg-slate-900/70 px-3 py-3 text-sm font-black text-white"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[28px] bg-[#0b1628] border border-white/10 p-4">
                <PlanosCorreAqui
                  planoAtual={profile.plano || "Free"}
                  onSelecionarPlano={(plano) =>
                    setProfile((p) => ({ ...p, plano }))
                  }
                />
              </div>
            </div>
          )}

          <button
            onClick={salvar}
            disabled={salvando}
            className="
              w-full mt-5 py-4 rounded-3xl
              bg-gradient-to-r from-blue-600 to-indigo-600
              hover:from-blue-500 hover:to-indigo-500
              text-white font-extrabold
              shadow-[0_18px_60px_rgba(37,99,235,0.28)]
              disabled:opacity-60 disabled:cursor-not-allowed
              active:scale-[0.98] transition
            "
            type="button"
          >
            {salvando ? "Salvando…" : salvo ? "Salvo ✅" : "Salvar"}
          </button>

          <div className="h-8" />

          {/* PATENTES */}
          {tab === "patentes" && (
            <div className="mt-5">
              <PainelPatentes
                accountStats={accountStats}
                serviceStats={serviceStats}
                isProfissional={profile.isProfissional}
              />
            </div>
          )}
        </div>

        
      </motion.aside>
    </div>
  );
}
