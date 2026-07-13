"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { ref, onValue, update, set, serverTimestamp } from '@/lib/firebaseDebug';
import { auth, database } from "@/lib/firebase";
import { uploadProfilePhotoToImgBB } from "@/lib/imgbbClient";
import {
  ativarPushNotifications,
  desativarPushNotifications,
  getPushCapabilities,
  testarPushNotification,
} from "@/lib/pushNotifications";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import PainelPatentes from "./PainelPatentes";
import Patente, { calcularPatentePorServicos } from "./Patente";
import { CATEGORIES, getCategoryById } from "@/constants/categories";
import { normalizeAtendimentoStatus, ATENDIMENTO_STATUS } from "@/lib/atendimento";

const PlanosCorreAqui = dynamic(() => import("@/components/PlanosCorreAqui"), {
  ssr: false,
});

const defaultPrivacy = {
  profileVisible: true,
  profileVisibilityExplicit: false,
  shareLocationDuringActiveJob: true,
  showOnlineStatus: true,
  allowPublicContact: false,
};

const defaultNotificationPreferences = {
  orders: true,
  messages: true,
  schedules: true,
  attendances: true,
  reviews: true,
};

function normalizeNotificationPreferences(value = {}, fallback = {}) {
  return {
    ...defaultNotificationPreferences,
    ...(fallback || {}),
    ...(value || {}),
  };
}

function getConfigSnapshot(profile = {}) {
  return {
    visivel: profile.visivel !== false,
    notificacoes: profile.notificacoes !== false,
    mapMostrarOnline: profile.mapMostrarOnline === true,
    mapAoVivo: profile.mapAoVivo === true,
    mapLimiteOnline: Math.max(5, Math.min(80, Number(profile.mapLimiteOnline || 30))),
    animacoes: profile.animacoes !== false,
    modoEconomico: profile.modoEconomico === true,
    aparencia: profile.aparencia || "sistema",
    notificationPreferences: normalizeNotificationPreferences(profile.notificationPreferences),
    privacy: normalizePrivacy(profile.privacy),
  };
}

function normalizePrivacy(value = {}, fallback = {}) {
  const profileVisibilityExplicit =
    value.profileVisibilityExplicit ?? value.profileVisibleExplicit ?? fallback.profileVisibilityExplicit ?? false;
  const profileVisible =
    value.profileVisible === false && profileVisibilityExplicit !== true
      ? true
      : value.profileVisible ?? fallback.profileVisible ?? true;

  return {
    profileVisible,
    profileVisibilityExplicit,
    shareLocationDuringActiveJob:
      value.shareLocationDuringActiveJob ?? fallback.shareLocationDuringActiveJob ?? true,
    showOnlineStatus: value.showOnlineStatus ?? fallback.showOnlineStatus ?? true,
    allowPublicContact: value.allowPublicContact ?? fallback.allowPublicContact ?? false,
  };
}

const initialProfile = {
  nome: "",
  cidade: "",
  bairro: "",
  telefone: "",
  email: "",
  dataNascimento: "",
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
  profPortfolio: [],
  plano: "Free",
  statusProfissional: "disponivel",
  ocupadoAte: "",
  agendaAberta: true,
  mapMostrarOnline: false,
  mapAoVivo: false,
  mapLimiteOnline: 30,
  animacoes: true,
  modoEconomico: false,
  aparencia: "sistema",
  notificationPreferences: defaultNotificationPreferences,
  privacy: defaultPrivacy,
};

const tabLabel = {
  corre: "Corre",
  profissional: "Corre/Pro",
  config: "Configurações",
  monetizacao: "Em breve",
  patentes: "Patentes",
};

const tabIcon = {
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

const trustItems = [
  { icon: "⭐", title: "Sistema de patentes", text: "Evolução por experiência e serviços concluídos." },
  { icon: "💬", title: "Histórico de conversas", text: "Combinações ficam registradas no chat do pedido." },
  { icon: "✅", title: "Avaliações dos serviços", text: "Reputação construída depois de cada conclusão." },
  { icon: "🟢", title: "Perfil verificado em breve", text: "Selo de confiança planejado, sem biometria nesta etapa." },
  { icon: "🛡️", title: "Mais segurança para clientes e profissionais", text: "Denúncias, problemas e moderação ajudam a proteger a comunidade." },
];

function PlanoResumo({ onOpenPlanos }) {
  const atual = planoInfo.EmBreve;

  return (
    <div className="w-full rounded-[24px] border border-white/70 bg-white/92 p-4 text-left text-slate-950 shadow-[0_18px_38px_rgba(15,23,42,0.10)] md:rounded-[28px] md:px-6 md:py-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] font-black text-blue-700">
            Crescimento justo
          </div>
          <div className="mt-1 text-sm font-extrabold text-blue-950">
            💚 Sem taxa do app
          </div>
          <div className="mt-1 max-w-xl text-xs font-semibold leading-relaxed text-slate-600 md:text-sm">
            100% do valor combinado fica com quem faz o serviço. Recursos premium e anúncios locais chegam em breve.
          </div>
        </div>

        <div className="flex flex-col gap-2 md:min-w-80 md:items-end">
          <span
            className={`w-fit shrink-0 rounded-full border px-3 py-1.5 text-xs font-black ${atual.badge}`}
          >
            {atual.icon} {atual.nome}
          </span>

          <button
            type="button"
            onClick={onOpenPlanos}
            className="h-11 rounded-2xl bg-blue-700 px-6 text-sm font-extrabold text-white shadow-[0_14px_32px_rgba(37,99,235,0.25)] transition hover:bg-blue-800 active:scale-[0.98] md:w-80"
          >
            Ver recursos em breve
          </button>
        </div>
      </div>
      
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-black uppercase tracking-wide text-slate-500 md:mb-1.5 md:text-xs">
        {label}
      </div>
      {children}
      {hint ? (
        <div className="mt-1 text-[11px] font-semibold text-slate-500">{hint}</div>
      ) : null}
    </label>
  );
}

const switchTone = {
  blue: {
    focus: "peer-focus-visible:ring-blue-100",
    onTrack: "border-blue-950/60 bg-blue-950 text-cyan-100",
    onKnob: "bg-blue-600 text-white",
  },
  cyan: {
    focus: "peer-focus-visible:ring-cyan-100",
    onTrack: "border-blue-950/60 bg-cyan-950 text-cyan-100",
    onKnob: "bg-cyan-500 text-white",
  },
  emerald: {
    focus: "peer-focus-visible:ring-emerald-100",
    onTrack: "border-blue-950/60 bg-emerald-950 text-emerald-100",
    onKnob: "bg-emerald-600 text-white",
  },
  violet: {
    focus: "peer-focus-visible:ring-violet-100",
    onTrack: "border-blue-950/60 bg-violet-950 text-violet-100",
    onKnob: "bg-violet-600 text-white",
  },
};

function ToggleSwitch({ checked, onChange, label, tone = "blue" }) {
  const visual = switchTone[tone] || switchTone.blue;

  return (
    <span className="relative inline-flex shrink-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className={[
          "pointer-events-none flex h-10 w-[92px] items-center rounded-full border-2 p-1 text-[11px] font-black shadow-[0_10px_22px_rgba(15,23,42,0.18),inset_0_1px_0_rgba(255,255,255,0.08)] transition peer-focus-visible:ring-4 peer-active:scale-[0.98]",
          checked ? visual.onTrack : "border-blue-950/55 bg-slate-900 text-rose-300",
          visual.focus,
        ].join(" ")}
      >
        <span
          className={[
            "grid h-8 w-8 place-items-center rounded-full shadow-[0_5px_12px_rgba(0,0,0,0.24)]",
            checked ? visual.onKnob : "bg-slate-800 text-white",
          ].join(" ")}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round">
            {checked ? (
              <>
                <path d="M15 6 9 12l6 6" />
                <path d="M9 12h10" />
              </>
            ) : (
              <>
                <path d="m9 6 6 6-6 6" />
                <path d="M5 12h10" />
              </>
            )}
          </svg>
        </span>
        <span className="ml-auto mr-2 tracking-wide">{checked ? "ON" : "OFF"}</span>
      </span>
    </span>
  );
}

function MiniSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        "relative h-7 w-12 shrink-0 rounded-full border p-0.5 transition active:scale-[0.96]",
        checked ? "border-blue-600 bg-blue-600" : "border-slate-200 bg-slate-200",
      ].join(" ")}
    >
      <span
        className={[
          "block h-6 w-6 rounded-full bg-white shadow-[0_3px_10px_rgba(15,23,42,0.22)] transition",
          checked ? "translate-x-5" : "translate-x-0",
        ].join(" ")}
      />
    </button>
  );
}

function ConfigIcon({ children, tone = "blue" }) {
  const tones = {
    blue: "bg-blue-600 text-white shadow-blue-200",
    violet: "bg-violet-600 text-white shadow-violet-200",
    emerald: "bg-emerald-500 text-white shadow-emerald-200",
    amber: "bg-amber-400 text-amber-950 shadow-amber-200",
    slate: "bg-slate-100 text-slate-700 shadow-slate-200",
    rose: "bg-rose-50 text-rose-600 shadow-rose-100",
  };

  return (
    <span className={["grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-sm font-black shadow-lg", tones[tone] || tones.blue].join(" ")}>
      {children}
    </span>
  );
}

function ConfigToggle({ checked, onChange, label, tone = "blue" }) {
  const colors = {
    blue: "bg-blue-600",
    violet: "bg-violet-600",
    emerald: "bg-emerald-500",
    amber: "bg-amber-400",
  };

  return (
    <label className="relative inline-flex h-9 w-[74px] shrink-0 cursor-pointer items-center" title={label}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} aria-label={label} className="peer sr-only" />
      <span className={["absolute inset-0 rounded-full border p-1 text-[10px] font-black transition", checked ? [colors[tone] || colors.blue, "border-transparent text-white"] : "border-slate-200 bg-slate-100 text-slate-400"].join(" ")}>
        <span className={["absolute top-1 h-7 w-7 rounded-full bg-white shadow-[0_3px_10px_rgba(15,23,42,0.20)] transition", checked ? "left-[42px]" : "left-1"].join(" ")} />
        <span className={["absolute top-0 flex h-9 w-full items-center", checked ? "justify-start pl-2" : "justify-end pr-2"].join(" ")}>{checked ? "ON" : "OFF"}</span>
      </span>
    </label>
  );
}

function ConfigRow({ icon, title, description, children, tone = "blue", danger = false, onClick }) {
  const content = (
    <>
      <ConfigIcon tone={danger ? "rose" : tone}>{icon}</ConfigIcon>
      <span className="min-w-0 flex-1">
        <span className={["block text-sm font-black", danger ? "text-rose-600" : "text-slate-900"].join(" ")}>{title}</span>
        <span className="mt-1 block text-xs font-semibold leading-relaxed text-slate-500">{description}</span>
      </span>
      {children}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="flex min-h-[72px] w-full items-center gap-3 border-b border-slate-100 px-3 py-3 text-left transition hover:bg-slate-50 active:bg-slate-100 md:gap-4 md:px-4">
        {content}
      </button>
    );
  }

  return <div className="flex min-h-[72px] items-center gap-3 border-b border-slate-100 px-3 py-3 last:border-b-0 md:gap-4 md:px-4">{content}</div>;
}

function ConfigSection({ id, title, description, icon, tone, open, onToggle, children }) {
  const sectionTone = {
    blue: "border-blue-100",
    violet: "border-violet-100",
    emerald: "border-emerald-100",
    amber: "border-amber-100",
  }[tone] || "border-slate-200";
  const iconTone = tone === "violet" ? "violet" : tone === "emerald" ? "emerald" : tone === "amber" ? "amber" : "blue";

  return (
    <section className={["overflow-hidden rounded-[24px] border bg-white shadow-[0_16px_38px_rgba(15,23,42,0.07)] md:rounded-[28px]", sectionTone].join(" ")}>
      <button
        type="button"
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="flex min-h-[82px] w-full items-center gap-3 px-4 py-4 text-left transition hover:bg-slate-50 md:px-5"
      >
        <ConfigIcon tone={iconTone}>{icon}</ConfigIcon>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-black text-blue-950 md:text-xl">{title}</span>
          <span className="mt-1 block text-xs font-semibold text-slate-500 md:text-sm">{description}</span>
        </span>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-xl font-black text-blue-700" aria-hidden="true">{open ? "-" : "+"}</span>
      </button>
      {open ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
          className="border-t border-slate-100 px-2 pb-2 md:px-3 md:pb-3"
        >
          {children}
        </motion.div>
      ) : null}
    </section>
  );
}

function ConfiguracoesOrganizadas({
  profile,
  privacy,
  sections,
  onToggleSection,
  onBack,
  onProfileChange,
  onMapLimitChange,
  onPrivacyChange,
  onNotificationChange,
  onOpenDados,
  onLogout,
  onTogglePush,
  onTestPush,
  pushAtivo,
  pushCanUse,
  pushSalvando,
  pushTestando,
  pushAviso,
  configAviso,
}) {
  const preferences = normalizeNotificationPreferences(profile.notificationPreferences);
  const friendlyPushAviso = /vapid|service worker|messaging|token|firebase/i.test(String(pushAviso || ""))
    ? "Nao foi possivel enviar a notificacao de teste."
    : pushAviso;
  const setMapLimit = (delta) => {
    const current = Number(profile.mapLimiteOnline || 30);
    const next = Math.max(5, Math.min(80, current + delta));
    onMapLimitChange(next);
  };
  const categoryItems = [
    ["orders", "Pedidos", "#f59e0b", "P"],
    ["messages", "Mensagens", "#7c3aed", "M"],
    ["schedules", "Agendamentos", "#2563eb", "A"],
    ["attendances", "Atendimentos", "#0891b2", "At"],
    ["reviews", "Avaliacoes", "#eab308", "*"],
  ];

  return (
    <div className="-mx-2.5 -mt-2.5 min-h-full overflow-x-hidden bg-[#f3f6fb] pb-8 md:-mx-6 md:-mt-6">
      <header className="sticky top-0 z-20 bg-[#071a3a] text-white shadow-[0_12px_30px_rgba(7,26,58,0.18)]">
        <div className="mx-auto flex w-full max-w-[1120px] items-center gap-3 px-4 py-4 md:px-6 md:py-5">
          <button type="button" onClick={onBack} className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#10284f] text-2xl font-black text-white transition hover:bg-[#173767] active:scale-[0.96]" aria-label="Voltar">&larr;</button>
          <div className="min-w-0">
            <h1 className="text-2xl font-black leading-tight md:text-3xl">Configura&ccedil;&otilde;es</h1>
            <p className="mt-1 text-sm font-semibold text-blue-100">Personalize sua experi&ecirc;ncia no Corre Aqui.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1120px] flex-col gap-4 px-3 py-5 md:gap-5 md:px-6 md:py-6">
        <ConfigSection id="presenca" title="Presen&ccedil;a e mapa" description="Controle sua visibilidade e como voc&ecirc; aparece no mapa." icon="M" tone="blue" open={sections.presenca} onToggle={onToggleSection}>
          <ConfigRow icon="P" title="Aparecer dispon&iacute;vel para clientes" description="Permita que outros vejam que voc&ecirc; est&aacute; dispon&iacute;vel." tone="blue">
            <ConfigToggle checked={profile.visivel !== false} onChange={(checked) => onProfileChange({ visivel: checked })} label="Aparecer disponivel para clientes" tone="blue" />
          </ConfigRow>
          <ConfigRow icon="O" title="Mostrar pessoas online no mapa" description="Veja outros profissionais online no mapa." tone="blue">
            <ConfigToggle checked={profile.mapMostrarOnline === true} onChange={(checked) => onProfileChange({ mapMostrarOnline: checked })} label="Mostrar pessoas online no mapa" tone="blue" />
          </ConfigRow>
          <ConfigRow icon="L" title="Compartilhar localiza&ccedil;&atilde;o durante atendimento" description="Cliente acompanha sua localiza&ccedil;&atilde;o em tempo real." tone="blue">
            <ConfigToggle checked={privacy.shareLocationDuringActiveJob} onChange={(checked) => onPrivacyChange("shareLocationDuringActiveJob", checked)} label="Compartilhar localizacao durante atendimento" tone="blue" />
          </ConfigRow>
          <ConfigRow icon="#" title="Quantidade de pessoas no mapa" description="Escolha quantas pessoas online aparecem no mapa." tone="blue">
            <div className="flex h-11 shrink-0 items-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <button type="button" onClick={() => setMapLimit(-5)} className="grid h-11 w-11 place-items-center text-xl font-black text-slate-500 hover:bg-slate-50" aria-label="Diminuir limite">-</button>
              <span className="min-w-[42px] text-center text-sm font-black text-blue-950">{Math.max(5, Math.min(80, Number(profile.mapLimiteOnline || 30)))}</span>
              <button type="button" onClick={() => setMapLimit(5)} className="grid h-11 w-11 place-items-center text-xl font-black text-blue-600 hover:bg-blue-50" aria-label="Aumentar limite">+</button>
            </div>
          </ConfigRow>
        </ConfigSection>

        <ConfigSection id="notificacoes" title="Notifica&ccedil;&otilde;es" description="Escolha o que voc&ecirc; deseja receber." icon="!" tone="violet" open={sections.notificacoes} onToggle={onToggleSection}>
          <ConfigRow icon="!" title="Receber notifica&ccedil;&otilde;es" description="Pedidos, mensagens, agendamentos e atendimentos importantes." tone="violet">
            <ConfigToggle checked={pushAtivo || profile.notificacoes !== false} onChange={onTogglePush} label="Receber notificacoes" tone="violet" />
          </ConfigRow>
          <div className="grid grid-cols-2 gap-2 px-2 py-3 sm:grid-cols-3 md:grid-cols-5 md:gap-3 md:px-3">
            {categoryItems.map(([key, label, color, symbol]) => (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={preferences[key]}
                onClick={() => onNotificationChange(key, !preferences[key])}
                className={["rounded-2xl border p-3 text-center transition active:scale-[0.98]", preferences[key] ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-slate-50 opacity-70"].join(" ")}
              >
                <span className="mx-auto grid h-10 w-10 place-items-center rounded-2xl text-sm font-black text-white" style={{ backgroundColor: color }}>{symbol}</span>
                <span className="mt-2 block text-[11px] font-black leading-tight text-slate-700">{label}</span>
                <span className="mt-1 block text-[10px] font-black uppercase tracking-wide text-violet-700">{preferences[key] ? "ON" : "OFF"}</span>
              </button>
            ))}
          </div>
          <ConfigRow icon="&gt;" title="Testar notifica&ccedil;&atilde;o" description="Envie uma notifica&ccedil;&atilde;o de teste para este dispositivo." tone="violet" onClick={pushCanUse ? onTestPush : undefined}>
            <span className="text-xl font-black text-violet-600">&rarr;</span>
          </ConfigRow>
          {!pushCanUse && !pushAviso ? null : friendlyPushAviso ? <div className="mx-3 mb-2 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-800">{friendlyPushAviso}</div> : null}
          {pushSalvando || pushTestando ? <div className="px-3 pb-2 text-xs font-bold text-slate-500">Aguarde um momento...</div> : null}
        </ConfigSection>

        <ConfigSection id="privacidade" title="Privacidade e conta" description="Gerencie seus dados e prefer&ecirc;ncias." icon="S" tone="emerald" open={sections.privacidade} onToggle={onToggleSection}>
          <ConfigRow icon="P" title="Perfil p&uacute;blico" description="Permita que outros vejam seu perfil." tone="emerald">
            <ConfigToggle checked={privacy.profileVisible} onChange={(checked) => onPrivacyChange("profileVisible", checked)} label="Perfil publico" tone="emerald" />
          </ConfigRow>
          <ConfigRow icon="C" title="Permitir contato p&uacute;blico" description="Outros usu&aacute;rios poder&atilde;o entrar em contato com voc&ecirc;." tone="emerald">
            <ConfigToggle checked={privacy.allowPublicContact} onChange={(checked) => onPrivacyChange("allowPublicContact", checked)} label="Permitir contato publico" tone="emerald" />
          </ConfigRow>
          <ConfigRow icon="D" title="Ver meus dados" description="Veja e gerencie suas informa&ccedil;&otilde;es." tone="emerald" onClick={onOpenDados}>
            <span className="text-xl font-black text-slate-500">&rarr;</span>
          </ConfigRow>
          <ConfigRow icon="S" title="Sair da conta" description="Encerre sua sess&atilde;o neste dispositivo." danger onClick={onLogout}>
            <span className="text-xl font-black text-rose-500">&rarr;</span>
          </ConfigRow>
        </ConfigSection>

        <ConfigSection id="experiencia" title="Experi&ecirc;ncia" description="Ajuste como o app funciona para voc&ecirc;." icon="*" tone="amber" open={sections.experiencia} onToggle={onToggleSection}>
          <ConfigRow icon="*" title="Anima&ccedil;&otilde;es da interface" description="Deixa o app mais din&acirc;mico e com transi&ccedil;&otilde;es suaves." tone="amber">
            <ConfigToggle checked={profile.animacoes !== false} onChange={(checked) => onProfileChange({ animacoes: checked })} label="Animacoes da interface" tone="violet" />
          </ConfigRow>
          <ConfigRow icon="E" title="Modo econ&ocirc;mico" description="Reduz anima&ccedil;&otilde;es e atualiza&ccedil;&otilde;es em segundo plano." tone="amber">
            <ConfigToggle checked={profile.modoEconomico === true} onChange={(checked) => onProfileChange({ modoEconomico: checked })} label="Modo economico" tone="amber" />
          </ConfigRow>
          <div className="flex flex-col gap-3 px-3 py-4 md:flex-row md:items-center md:justify-between md:px-4">
            <div className="flex items-center gap-3">
              <ConfigIcon tone="amber">A</ConfigIcon>
              <div>
                <div className="text-sm font-black text-slate-900">Apar&ecirc;ncia</div>
                <div className="mt-1 text-xs font-semibold text-slate-500">Escolha o tema do aplicativo.</div>
              </div>
            </div>
            <div className="grid w-full grid-cols-3 rounded-2xl border border-slate-200 bg-slate-50 p-1 md:w-auto">
              {[["sistema", "Sistema"], ["claro", "Claro"], ["escuro", "Escuro"]].map(([value, label]) => (
                <button key={value} type="button" onClick={() => onProfileChange({ aparencia: value })} className={["min-h-11 rounded-xl px-3 text-xs font-black transition", (profile.aparencia || "sistema") === value ? "bg-white text-blue-700 shadow-sm ring-1 ring-blue-200" : "text-slate-500 hover:text-slate-800"].join(" ")}>{label}</button>
              ))}
            </div>
          </div>
        </ConfigSection>

        <div className="flex items-center gap-3 rounded-[22px] border border-blue-100 bg-blue-50/70 px-4 py-3 text-blue-950 shadow-[0_10px_26px_rgba(37,99,235,0.05)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-sm font-black text-white">OK</span>
          <div>
            <div className="text-sm font-black">Suas altera&ccedil;&otilde;es s&atilde;o salvas automaticamente.</div>
            <div className="mt-0.5 text-xs font-semibold text-slate-500">Todas as configura&ccedil;&otilde;es s&atilde;o aplicadas em tempo real.</div>
          </div>
          {configAviso ? <span className="ml-auto shrink-0 text-xs font-black text-emerald-700">{configAviso}</span> : null}
        </div>
      </main>
    </div>
  );
}

function ServiceBriefcaseIcon({ className = "h-6 w-6" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M8 7V5.8C8 4.25 9.25 3 10.8 3h2.4C14.75 3 16 4.25 16 5.8V7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4.75 7h14.5A1.75 1.75 0 0 1 21 8.75v9A2.25 2.25 0 0 1 18.75 20H5.25A2.25 2.25 0 0 1 3 17.75v-9A1.75 1.75 0 0 1 4.75 7Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3.5 12.2h17" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M9.5 11.4h5v2.1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-2.1Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ServiceToolboxIllustration({ className = "h-28 w-40" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 220 150" className={className} fill="none">
      <defs>
        <linearGradient id="toolboxBox" x1="67" y1="70" x2="159" y2="132" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2D74FF" />
          <stop offset="1" stopColor="#1E49C8" />
        </linearGradient>
        <linearGradient id="toolboxLid" x1="61" y1="58" x2="169" y2="94" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4D8CFF" />
          <stop offset="1" stopColor="#2655D8" />
        </linearGradient>
        <linearGradient id="toolboxWrench" x1="133" y1="34" x2="169" y2="90" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFD84A" />
          <stop offset="1" stopColor="#F5A400" />
        </linearGradient>
        <filter id="toolboxShadow" x="28" y="92" width="161" height="45" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="10" />
        </filter>
      </defs>

      <ellipse cx="108" cy="116" rx="64" ry="17" fill="#DDEBFF" filter="url(#toolboxShadow)" opacity=".86" />
      <path d="M58 62h104l-17 29H73L58 62Z" fill="url(#toolboxLid)" />
      <path d="M74 85h73l14 35H61l13-35Z" fill="url(#toolboxBox)" />
      <path d="M61 87 34 73l28-12 14 23-15 3Z" fill="#3478F6" />
      <path d="m146 86 35-16-18-13-19 26 2 3Z" fill="#336CE9" />
      <path d="M83 89h10v7H83v-7ZM126 95h9v7h-9v-7Z" fill="#85B7FF" opacity=".55" />

      <path d="M74 54 58 20l28 7 7 24-19 3Z" fill="#EAF3FF" />
      <path d="M66 31h16M70 41h15M74 51h11" stroke="#2C6CF2" strokeWidth="4" strokeLinecap="round" />
      <path d="M49 33h8v8h-8v-8Z" fill="#CFE2FF" transform="rotate(-19 49 33)" />

      <path d="M111 74V39" stroke="#FFC627" strokeWidth="9" strokeLinecap="round" />
      <path d="M100 79V51" stroke="#FFD34D" strokeWidth="9" strokeLinecap="round" />
      <path d="M125 79V34" stroke="#BFCBDA" strokeWidth="11" strokeLinecap="round" />
      <path d="M119 36c0-10 8-18 18-18l-7 12 10 6 7-12c4 9 1 20-8 26l-17 35-14-7 17-42Z" fill="url(#toolboxWrench)" />
      <path d="M103 41h13v42h-13V41Z" fill="#132A60" opacity=".24" />

      <circle cx="165" cy="25" r="3" fill="#6BA1FF" opacity=".55" />
      <circle cx="151" cy="13" r="2.5" fill="#9BC1FF" opacity=".85" />
      <path d="M177 42h9M181.5 37.5v9" stroke="#D6E6FF" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ProfMenuIcon({ id }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  const icons = {
    perfilProfissional: (
      <>
        <path {...common} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path {...common} d="M4.5 20a7.5 7.5 0 0 1 15 0" />
        <path {...common} d="M16.5 5.5h3" />
        <path {...common} d="M18 4v3" />
      </>
    ),
    portfolio: (
      <>
        <path {...common} d="M8 7V5.5A2.5 2.5 0 0 1 10.5 3h3A2.5 2.5 0 0 1 16 5.5V7" />
        <path {...common} d="M4 7h16v12.5A1.5 1.5 0 0 1 18.5 21h-13A1.5 1.5 0 0 1 4 19.5V7Z" />
        <path {...common} d="M4 12h16" />
        <path {...common} d="M10 12v2h4v-2" />
      </>
    ),
    avaliacoes: <path {...common} d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2l-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />,
    patentes: (
      <>
        <path {...common} d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
        <path {...common} d="M8 6H5a3 3 0 0 0 3 3" />
        <path {...common} d="M16 6h3a3 3 0 0 1-3 3" />
        <path {...common} d="M12 11v5" />
        <path {...common} d="M9 20h6" />
        <path {...common} d="M10 16h4v4h-4z" />
      </>
    ),
    config: (
      <>
        <path {...common} d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
        <path {...common} d="M19.4 15a1.8 1.8 0 0 0 .36 1.98l.04.04a2.1 2.1 0 0 1-2.97 2.97l-.04-.04A1.8 1.8 0 0 0 14.8 19.6a1.8 1.8 0 0 0-1.3 1.73V21.4a2.1 2.1 0 0 1-4.2 0v-.06A1.8 1.8 0 0 0 8 19.6a1.8 1.8 0 0 0-1.98.36l-.04.04a2.1 2.1 0 0 1-2.97-2.97l.04-.04A1.8 1.8 0 0 0 3.4 15a1.8 1.8 0 0 0-1.73-1.3H1.6a2.1 2.1 0 0 1 0-4.2h.06A1.8 1.8 0 0 0 3.4 8a1.8 1.8 0 0 0-.36-1.98L3 5.98a2.1 2.1 0 0 1 2.97-2.97l.04.04A1.8 1.8 0 0 0 8 3.4a1.8 1.8 0 0 0 1.3-1.73V1.6a2.1 2.1 0 0 1 4.2 0v.06A1.8 1.8 0 0 0 14.8 3.4a1.8 1.8 0 0 0 1.98-.36l.04-.04a2.1 2.1 0 0 1 2.97 2.97l-.04.04A1.8 1.8 0 0 0 19.4 8a1.8 1.8 0 0 0 1.73 1.3h.06a2.1 2.1 0 0 1 0 4.2h-.06A1.8 1.8 0 0 0 19.4 15Z" />
      </>
    ),
    ajuda: (
      <>
        <path {...common} d="M21 12a9 9 0 1 1-4.2-7.62" />
        <path {...common} d="M9.4 9a3 3 0 1 1 4.8 2.4c-1 .7-1.4 1.2-1.4 2.2" />
        <path {...common} d="M12 17.7h.01" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 md:h-6 md:w-6" aria-hidden="true">
      {icons[id] || icons.perfilProfissional}
    </svg>
  );
}

function WorkModeIcon({ type }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };
  const icons = {
    corre: (
      <>
        <circle {...common} cx="7" cy="16" r="2.2" />
        <circle {...common} cx="17" cy="16" r="2.2" />
        <path {...common} d="M9 16h4l2-6h2" />
        <path {...common} d="M7 16l3.5-6H14l3 6" />
        <path {...common} d="M11 7h3" />
      </>
    ),
    profissional: (
      <>
        <path {...common} d="M8 8V6.5A2.5 2.5 0 0 1 10.5 4h3A2.5 2.5 0 0 1 16 6.5V8" />
        <path {...common} d="M4.5 8h15v10.5A1.5 1.5 0 0 1 18 20H6a1.5 1.5 0 0 1-1.5-1.5V8Z" />
        <path {...common} d="M4.5 13h15" />
        <path {...common} d="M10 13v2h4v-2" />
      </>
    ),
    ambos: (
      <>
        <circle {...common} cx="8" cy="9" r="3" />
        <circle {...common} cx="16" cy="15" r="3" />
        <path {...common} d="M10.2 11.2 13.8 13.8" />
        <path {...common} d="M5 18c.8-2 2.2-3 4-3" />
        <path {...common} d="M15 6c1.8 0 3.2 1 4 3" />
      </>
    ),
    check: <path {...common} d="M5 12.5 9.5 17 19 7" />,
  };

  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      {icons[type] || icons.profissional}
    </svg>
  );
}

function inputClass(extra = "") {
  return [
    "w-full rounded-xl md:rounded-2xl bg-white border border-slate-200",
    "px-3 py-2.5 md:px-4 md:py-3 text-sm md:text-base text-slate-950 placeholder:text-slate-400",
    "outline-none focus:ring-2 focus:ring-blue-500/35 focus:border-blue-400/50",
    "shadow-sm transition",
    extra,
  ].join(" ");
}

function createEmptyAddressDraft() {
  return {
    nomeLocal: "",
    cep: "",
    rua: "",
    numero: "",
    complemento: "",
    bairro: "",
    cidade: "",
    referencia: "",
    lat: null,
    lng: null,
  };
}

function normalizeAddresses(raw = {}) {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw)
    .map(([id, value]) => ({
      id,
      ...(value && typeof value === "object" ? value : {}),
    }))
    .sort((a, b) => Number(b.updatedAt || b.criadoEm || 0) - Number(a.updatedAt || a.criadoEm || 0));
}

function addressLine(address = {}) {
  const ruaNumero = [address.rua, address.numero].filter(Boolean).join(", ");
  return [ruaNumero, address.bairro, address.cidade].filter(Boolean).join(" · ") || "Endereco sem detalhes";
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatCpfInput(value) {
  const digits = onlyDigits(value).slice(0, 11);
  if (!digits) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function maskCpfSalvo(value) {
  const digits = onlyDigits(value);
  if (digits.length < 2) return "";
  return `***.***.***-${digits.slice(-2)}`;
}

const PHOTO_SOURCE_MAX_BYTES = 8 * 1024 * 1024;

function isFotoValor(v) {
  const s = String(v || "").trim();
  return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(s);
}

function pickFoto(...vals) {
  return vals.map((v) => String(v || "").trim()).find(isFotoValor) || "";
}

function formatMoneyBR(value) {
  const n = Number(value || 0);
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  });
}

function getValorPedido(pedido = {}) {
  const raw =
    pedido.valor ??
    pedido.valorCombinado ??
    pedido.valor_combinado ??
    pedido.preco ??
    pedido["preço"] ??
    pedido.orcamento ??
    pedido["orçamento"] ??
    pedido.budget ??
    0;

  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;

  const normalized = String(raw || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function getMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (typeof value === "object") {
    const seconds = value.seconds ?? value._seconds;
    if (Number.isFinite(Number(seconds))) return Number(seconds) * 1000;
  }
  return 0;
}

function formatDataCurta(value) {
  const ms = getMs(value);
  if (!ms) return "Data nao informada";
  return new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function normalizePortfolioFotos(data = {}) {
  const raw = [
    ...(Array.isArray(data.fotos) ? data.fotos : []),
    ...(Array.isArray(data.photos) ? data.photos : []),
    ...(Array.isArray(data.imagens) ? data.imagens : []),
    data.fotoURL,
    data.imageURL,
    data.imagemURL,
    data.photoURL,
  ];

  return Array.from(new Set(raw.map((foto) => String(foto || "").trim()).filter(isFotoValor))).slice(0, 5);
}

function createEmptyPortfolioDraft() {
  return {
    id: "",
    nome: "",
    titulo: "",
    descricao: "",
    valor: "",
    preco: "",
    faixaPreco: "",
    categoria: "",
    categoriaId: "",
    categoriaNome: "",
    tempoMedio: "",
    regiao: "",
    atendeDomicilio: true,
    urgente: false,
    ativo: true,
    fotoURL: "",
    fotos: [],
    fotoImgBbId: "",
  };
}

function normalizePortfolio(value) {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === "object"
      ? Object.values(value)
      : [];

  return list
    .map((item, index) => {
      const data = item && typeof item === "object" ? item : {};
      const fotos = normalizePortfolioFotos(data);
      const categoriaId = String(data.categoriaId || data.categoryId || "").trim();
      const categoriaMeta = getCategoryById(categoriaId);
      const categoriaNome = String(data.categoriaNome || data.categoryName || data.categoria || data.category || categoriaMeta?.label || "").trim();
      const nome = String(data.nome || data.titulo || data.title || "").trim();
      const preco = String(data.preco || data.valor || data.price || "").trim();
      const faixaPreco = String(data.faixaPreco || data.valor || data.priceRange || preco || "").trim();
      return {
        id: String(data.id || data.key || `portfolio_${index}`),
        nome,
        titulo: nome,
        categoriaId,
        categoriaNome,
        descricao: String(data.descricao || data.description || "").trim(),
        preco,
        faixaPreco,
        valor: faixaPreco || preco,
        categoria: categoriaNome,
        tempoMedio: String(data.tempoMedio || data.tempo || data.duration || "").trim(),
        regiao: String(data.regiao || data.regiaoAtendimento || data.region || "").trim(),
        atendeDomicilio: data.atendeDomicilio ?? data.domicilio ?? true,
        urgente: data.urgente ?? data.urgent ?? false,
        ativo: data.ativo ?? data.active ?? true,
        fotoURL: fotos[0] || "",
        fotos,
        fotoImgBbId: String(data.fotoImgBbId || data.imageId || "").trim(),
        createdAt: data.createdAt || data.criadoEm || null,
        updatedAt: data.updatedAt || data.atualizadoEm || null,
      };
    })
    .filter((item) => item.nome || item.descricao || item.valor || item.categoria || item.fotos.length)
    .slice(0, 12);
}

function toPortfolioFirebaseItem(item = {}) {
  const id = String(item.id || `portfolio_${Date.now()}`).trim();
  const categoriaMeta = getCategoryById(item.categoriaId || item.categoria);
  const categoriaId = String(item.categoriaId || categoriaMeta?.id || "").trim();
  const categoriaNome = String(item.categoriaNome || categoriaMeta?.label || item.categoria || "").trim();
  const nome = String(item.nome || item.titulo || "").trim();
  const preco = String(item.preco || "").trim();
  const faixaPreco = String(item.faixaPreco || item.valor || preco || "").trim();

  return {
    id,
    nome,
    titulo: nome,
    categoriaId,
    categoriaNome,
    categoria: categoriaNome,
    preco,
    faixaPreco,
    valor: faixaPreco || preco,
    descricao: String(item.descricao || "").trim(),
    tempoMedio: String(item.tempoMedio || "").trim(),
    fotos: normalizePortfolioFotos(item),
    fotoURL: normalizePortfolioFotos(item)[0] || "",
    regiao: String(item.regiao || "").trim(),
    atendeDomicilio: item.atendeDomicilio !== false,
    urgente: item.urgente === true,
    ativo: item.ativo !== false,
    createdAt: item.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function portfolioListToMap(items = []) {
  return normalizePortfolio(items).reduce((acc, item) => {
    const normalized = toPortfolioFirebaseItem(item);
    if (normalized.id) acc[normalized.id] = normalized;
    return acc;
  }, {});
}

function portfolioListToPublicMap(items = [], profile = {}, uid = "", fotoPrincipal = "") {
  const nome = String(profile.nome || "").trim();
  const cidade = String(profile.cidade || profile.profRegiao || profile.correRegiao || "").trim();
  const isCorre = !!profile.isCorre;
  const isProfissional = !!profile.isProfissional;

  return normalizePortfolio(items).reduce((acc, item) => {
    const normalized = toPortfolioFirebaseItem(item);
    if (!normalized.id || normalized.ativo === false || !normalized.nome) return acc;

    acc[normalized.id] = {
      id: normalized.id,
      nome: normalized.nome,
      titulo: normalized.titulo,
      descricao: normalized.descricao,
      categoriaId: normalized.categoriaId,
      categoriaNome: normalized.categoriaNome,
      categoria: normalized.categoria,
      preco: normalized.preco,
      faixaPreco: normalized.faixaPreco,
      valor: normalized.valor,
      tempoMedio: normalized.tempoMedio,
      fotos: normalized.fotos,
      fotoURL: normalized.fotoURL,
      regiao: normalized.regiao || cidade,
      atendeDomicilio: normalized.atendeDomicilio,
      urgente: normalized.urgente,
      ativo: true,
      profissionalId: uid,
      uid,
      profissionalNome: nome,
      providerName: nome,
      profissionalFotoURL: fotoPrincipal || "",
      providerFotoURL: fotoPrincipal || "",
      cidade,
      isCorre,
      isProfissional,
      createdAt: normalized.createdAt || Date.now(),
      updatedAt: serverTimestamp(),
    };

    return acc;
  }, {});
}

function profileToPublicProfile(profile = {}, uid = "", fotoPrincipal = "", privacySettings = defaultPrivacy, profPortfolio = []) {
  const corre = {
    ativo: !!profile.isCorre,
    titulo: profile.correTitulo || "Corre rapido",
    bio: profile.correBio || profile.bio || "",
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

  return {
    uid,
    id: uid,
    nome: String(profile.nome || "").trim() || "Profissional",
    fotoURL: fotoPrincipal || null,
    photoURL: fotoPrincipal || null,
    avatar: fotoPrincipal || profile.avatarEmoji || "",
    avatarEmoji: profile.avatarEmoji || "",
    cidade: profile.cidade || "",
    bio: profile.bio || "",
    visivel: profile.visivel !== false,
    profileVisible: privacySettings.profileVisible !== false,
    profileVisibilityExplicit: privacySettings.profileVisibilityExplicit === true,
    showOnlineStatus: privacySettings.showOnlineStatus !== false,
    allowPublicContact: privacySettings.allowPublicContact === true,
    isCorre: !!profile.isCorre,
    isProfissional: !!profile.isProfissional,
    correCategorias: Array.isArray(profile.correCategorias) ? profile.correCategorias : [],
    profCategorias: Array.isArray(profile.profCategorias) ? profile.profCategorias : [],
    correTitulo: corre.titulo,
    correResumo: corre.bio,
    correRegiao: corre.regiao,
    correTransporte: corre.transporte,
    profResumo: profissional.descricao || profissional.titulo,
    profCidadeAtende: profissional.regiao,
    profPrecoBase: profissional.preco,
    profWhats: profissional.whatsapp,
    profExperiencia: profissional.experiencia,
    corre,
    profissional,
    profPortfolio,
    portfolio: portfolioListToMap(profPortfolio),
    plano: profile.plano || "Free",
    statusProfissional: profile.statusProfissional || "disponivel",
    agendaAberta: profile.agendaAberta !== false,
    updatedAt: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  };
}

function promiseComTimeout(promise, ms, message = "tempo_esgotado") {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer));
  });
}

export default function PerfilDrawer({ open, onClose, uid, initialTab = "config", initialProfSection = "" }) {
  const [tab, setTab] = useState("config");
  const [profSection, setProfSection] = useState("");
  const [professionalProfileStep, setProfessionalProfileStep] = useState("choice");

  const [profile, setProfile] = useState(initialProfile);
  const [portfolioDraft, setPortfolioDraft] = useState(createEmptyPortfolioDraft);
  const [portfolioEditingId, setPortfolioEditingId] = useState("");
  const [portfolioPhotoUploading, setPortfolioPhotoUploading] = useState(false);
  const [portfolioPhotoError, setPortfolioPhotoError] = useState("");
  const [addresses, setAddresses] = useState([]);
  const [addressDraft, setAddressDraft] = useState(createEmptyAddressDraft);
  const [addressEditingId, setAddressEditingId] = useState("");
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressAviso, setAddressAviso] = useState("");
  const [supportAviso, setSupportAviso] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [photoSuccess, setPhotoSuccess] = useState("");
  const fotoSalvando = uploadingPhoto;
  const fotoAviso = photoError || photoSuccess;
  const [pushInfo, setPushInfo] = useState({
    supported: false,
    permission: "default",
    reason: "Verificando push...",
  });
  const [vapidKey, setVapidKey] = useState("");
  const [vapidConfigured, setVapidConfigured] = useState(false);
  const [pushSalvando, setPushSalvando] = useState(false);
  const [pushTestando, setPushTestando] = useState(false);
  const [pushAviso, setPushAviso] = useState("");
  const [cpfDraft, setCpfDraft] = useState("");
  const [cpfSalvoMask, setCpfSalvoMask] = useState("");
  const [cpfAviso, setCpfAviso] = useState("");
  const [privacyAviso, setPrivacyAviso] = useState("");
  const [configAviso, setConfigAviso] = useState("");
  const [configSecoesAbertas, setConfigSecoesAbertas] = useState({
    presenca: true,
    notificacoes: false,
    privacidade: false,
    experiencia: false,
  });
  const [serviceStats, setServiceStats] = useState({
    total: 0,
    comoCorre: 0,
    comoCliente: 0,
    comoProfissional: 0,
    problemas: 0,
    notaMedia: null,
    avaliacoes: 0,
    ganhosCorreTotal: 0,
    ganhosProfTotal: 0,
    ganhosTotal: 0,
    ganhosCorreSemana: 0,
    ganhosProfSemana: 0,
    ganhosSemana: 0,
    ticketMedioCorre: 0,
    ticketMedioProf: 0,
    ganhosRecentes: [],
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
  const drawerScrollRef = useRef(null);
  const portfolioFormRef = useRef(null);
  const portfolioFirstInputRef = useRef(null);
  const configSaveTimerRef = useRef(null);
  const configSnapshotRef = useRef("");
  const configLastSavedRef = useRef(null);

  const userBasePath = useMemo(() => (uid ? `users/${uid}` : ""), [uid]);

  useEffect(() => {
    settingsLoadedRef.current = false;
    configSnapshotRef.current = "";
    configLastSavedRef.current = null;
    if (configSaveTimerRef.current) {
      window.clearTimeout(configSaveTimerRef.current);
      configSaveTimerRef.current = null;
    }
  }, [open, uid]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab && initialTab !== "perfil" ? initialTab : "config");
    setProfSection(initialTab === "profissional" ? initialProfSection || "perfilProfissional" : "");
    setProfessionalProfileStep("choice");
    setAddressAviso("");
    setSupportAviso("");
    setConfigAviso("");
    setConfigSecoesAbertas({
      presenca: true,
      notificacoes: false,
      privacidade: false,
      experiencia: false,
    });
  }, [open, initialTab, initialProfSection]);

  useEffect(() => {
    if (!open || !uid) return;

    const userRef = ref(database, userBasePath);
    return onValue(userRef, (snap) => {
      const data = snap.val() || {};
      const settings = data.settings || {};
      const settingsMapa = settings.mapa || {};
      const settingsUi = settings.ui || {};
      const privacyData = normalizePrivacy(data.privacy, {
        showOnlineStatus: data.showOnlineStatus ?? data.profile?.showOnlineStatus,
      });
      const mapVisible = data.visivel ?? data.profile?.visivel ?? true;

      const servicosCorre = Number(data.servicosCorre ?? data["serviçosCorre"] ?? 0);
      const servicosProf = Number(data.servicosProf ?? data["serviçosProf"] ?? 0);
      const isProfissionalUser = !!(data.isProfissional || data.profile?.isProfissional || data.profissional?.ativo);

      setAccountStats({
        xp: Number(data.xp || 0),
        moedas: Number(data.moedas || 0),
        servicosCorre,
        servicosProf,
        patenteCorre: Math.max(Number(data.patenteCorre || 1), calcularPatentePorServicos(servicosCorre)),
        patenteProf: isProfissionalUser
          ? Math.max(Number(data.patenteProf || 1), calcularPatentePorServicos(servicosProf))
          : 0,
      });

      const profileData = data.profile || {};
      const portfolioSalvo = normalizePortfolio(
        profileData.profPortfolio ||
          data.profPortfolio ||
          profileData.portfolio ||
          data.portfolio ||
          profileData.profissional?.portfolio ||
          data.profissional?.portfolio,
      );
      const fotoPrincipal = pickFoto(
        data.fotoURL,
        profileData.fotoURL,
        data.avatar,
        profileData.avatar,
        data.photoURL,
        profileData.photoURL,
      );
      const avatarEmoji =
        data.avatarEmoji ||
        profileData.avatarEmoji ||
        (!isFotoValor(data.avatar) ? data.avatar : "") ||
        (!isFotoValor(profileData.avatar) ? profileData.avatar : "") ||
        "";

      setProfile((prev) => ({
        ...prev,
        nome: prev.nome || profileData.nome || data.nome || "",
        cidade: prev.cidade || profileData.cidade || data.cidade || "",
        bairro: prev.bairro || profileData.bairro || data.bairro || "",
        telefone: prev.telefone || profileData.telefone || data.telefone || profileData.phone || data.phone || "",
        email: prev.email || profileData.email || data.email || auth.currentUser?.email || "",
        dataNascimento: prev.dataNascimento || profileData.dataNascimento || data.dataNascimento || "",
        bio: prev.bio || profileData.bio || data.bio || "",
        fotoURL: prev.fotoURL || fotoPrincipal,
        photoURL: prev.photoURL || fotoPrincipal,
        avatar: prev.avatar || fotoPrincipal || avatarEmoji || "",
        avatarEmoji: prev.avatarEmoji || avatarEmoji,
        profPortfolio: portfolioSalvo.length ? portfolioSalvo : prev.profPortfolio || [],
        visivel: mapVisible,
        notificacoes: data.notificacoes ?? profileData.notificacoes ?? prev.notificacoes,
        notificationPreferences: normalizeNotificationPreferences(
          settingsUi.notificationPreferences ?? profileData.notificationPreferences ?? data.notificationPreferences,
          prev.notificationPreferences,
        ),
        modoEconomico: settingsUi.modoEconomico ?? profileData.modoEconomico ?? prev.modoEconomico,
        aparencia: settingsUi.aparencia ?? profileData.aparencia ?? prev.aparencia,
        privacy: privacyData,
      }));

      if (!settingsLoadedRef.current) {
        setProfile((prev) => ({
          ...prev,
          mapMostrarOnline: settingsMapa.mostrarOnline ?? prev.mapMostrarOnline,
          mapAoVivo: settingsMapa.aoVivo ?? prev.mapAoVivo,
          mapLimiteOnline: Math.max(5, Math.min(80, Number(settingsMapa.limiteOnline ?? prev.mapLimiteOnline))),
          animacoes: settingsUi.animacoes ?? prev.animacoes,
          modoEconomico: settingsUi.modoEconomico ?? prev.modoEconomico,
          aparencia: settingsUi.aparencia ?? prev.aparencia,
          notificationPreferences: normalizeNotificationPreferences(
            settingsUi.notificationPreferences ?? prev.notificationPreferences,
            prev.notificationPreferences,
          ),
          notificacoes: data.notificacoes ?? profileData.notificacoes ?? prev.notificacoes,
          privacy: privacyData,
          visivel: mapVisible,
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
          const portfolioSalvo = normalizePortfolio(
            data.profPortfolio ||
              data.portfolio ||
              profissional.portfolio ||
              profissional.profPortfolio,
          );
          const fotoPrincipal = pickFoto(
            data.fotoURL,
            data.avatar,
            prev.fotoURL,
            data.photoURL,
            prev.photoURL,
          );
          const avatarEmoji = data.avatarEmoji || (!isFotoValor(data.avatar) ? data.avatar : "") || prev.avatarEmoji || "";

          return {
            ...prev,
            ...data,
            bairro: data.bairro || prev.bairro || "",
            telefone: data.telefone || data.phone || prev.telefone || "",
            email: data.email || prev.email || auth.currentUser?.email || "",
            dataNascimento: data.dataNascimento || prev.dataNascimento || "",
            notificacoes: data.notificacoes ?? prev.notificacoes,
            notificationPreferences: normalizeNotificationPreferences(
              data.notificationPreferences,
              prev.notificationPreferences,
            ),
            modoEconomico: data.modoEconomico ?? prev.modoEconomico,
            aparencia: data.aparencia || prev.aparencia || "sistema",
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
            fotoURL: fotoPrincipal,
            photoURL: fotoPrincipal,
            avatar: fotoPrincipal || avatarEmoji || "",
            avatarEmoji,
            plano: data.plano || data.assinatura?.plano || prev.plano || "Free",
            statusProfissional: data.statusProfissional || data.profissional?.statusProfissional || prev.statusProfissional || "disponivel",
            ocupadoAte: data.ocupadoAte || data.profissional?.ocupadoAte || prev.ocupadoAte || "",
            agendaAberta: data.agendaAberta ?? data.profissional?.agendaAberta ?? prev.agendaAberta ?? true,
            profPortfolio: portfolioSalvo.length ? portfolioSalvo : prev.profPortfolio || [],
            privacy: prev.privacy || defaultPrivacy,
          };
        });
      }
    });
  }, [open, uid, userBasePath]);

  useEffect(() => {
    if (!open || !uid) {
      setAddresses([]);
      return undefined;
    }

    const addressesRef = ref(database, `enderecos/${uid}`);
    return onValue(addressesRef, (snap) => {
      setAddresses(normalizeAddresses(snap.val() || {}));
    }, () => {
      setAddresses([]);
    });
  }, [open, uid, userBasePath]);

  useEffect(() => {
    if (!open || !uid) return;

    const privateRef = ref(database, `userPrivate/${uid}/verification`);
    return onValue(privateRef, (snap) => {
      const data = snap.val() || {};
      setCpfSalvoMask(maskCpfSalvo(data.cpf || data.cpfDigits || ""));
    }, () => {
      setCpfSalvoMask("");
    });
  }, [open, uid]);

  useEffect(() => {
    if (!open || !uid) return;

    const pedidosRef = ref(database, "pedidos");
    return onValue(pedidosRef, (snap) => {
      const data = snap.val() || {};
      const pedidos = Object.entries(data).map(([id, value]) => ({
        id,
        ...(value && typeof value === "object" ? value : {}),
      }));
      let total = 0;
      let comoCorre = 0;
      let comoCliente = 0;
      let comoProfissional = 0;
      let problemas = 0;
      let notaSoma = 0;
      let avaliacoes = 0;
      let ganhosCorreTotal = 0;
      let ganhosProfTotal = 0;
      let ganhosCorreSemana = 0;
      let ganhosProfSemana = 0;
      const ganhosRecentes = [];
      const inicioSemana = Date.now() - 7 * 24 * 60 * 60 * 1000;

      pedidos.forEach((p) => {
        const souCliente = p?.criador?.id === uid;
        const souCorre = p?.aceite?.id === uid;
        const concluido = normalizeAtendimentoStatus(p?.status) === ATENDIMENTO_STATUS.FINALIZADO;
        const modoProfissional = String(p?.modoPedido || "").toLowerCase() === "profissional";
        const valorPedido = getValorPedido(p);
        const dataConclusao = p?.concluidoEm || p?.atualizadoEm || p?.aceitoEm || p?.criadoEm;
        const msConclusao = getMs(dataConclusao);

        if (concluido && (souCliente || souCorre)) total += 1;
        if (concluido && souCorre && modoProfissional) {
          comoProfissional += 1;
          ganhosProfTotal += valorPedido;
          if (msConclusao >= inicioSemana) ganhosProfSemana += valorPedido;
        }
        if (concluido && souCorre && !modoProfissional) {
          comoCorre += 1;
          ganhosCorreTotal += valorPedido;
          if (msConclusao >= inicioSemana) ganhosCorreSemana += valorPedido;
        }
        if (concluido && souCliente) comoCliente += 1;
        if ((souCliente || souCorre) && p?.problemaServico) problemas += 1;

        const nota = Number(p?.avaliacao?.nota);
        if (souCorre && Number.isFinite(nota) && nota > 0) {
          notaSoma += nota;
          avaliacoes += 1;
        }

        if (concluido && souCorre) {
          ganhosRecentes.push({
            id: p.id,
            titulo: p.titulo || p.tipo || "Servico concluido",
            valor: valorPedido,
            tipo: modoProfissional ? "Profissional" : "Corre",
            data: dataConclusao,
            ms: msConclusao,
          });
        }
      });

      const ganhosTotal = ganhosCorreTotal + ganhosProfTotal;

      setServiceStats({
        total,
        comoCorre,
        comoCliente,
        comoProfissional,
        problemas,
        notaMedia: avaliacoes ? notaSoma / avaliacoes : null,
        avaliacoes,
        ganhosCorreTotal,
        ganhosProfTotal,
        ganhosTotal,
        ganhosCorreSemana,
        ganhosProfSemana,
        ganhosSemana: ganhosCorreSemana + ganhosProfSemana,
        ticketMedioCorre: comoCorre ? ganhosCorreTotal / comoCorre : 0,
        ticketMedioProf: comoProfissional ? ganhosProfTotal / comoProfissional : 0,
        ganhosRecentes: ganhosRecentes.sort((a, b) => (b.ms || 0) - (a.ms || 0)).slice(0, 12),
      });
    });
  }, [open, uid]);

  useEffect(() => {
    if (!open) return;
    let active = true;

    async function carregarPushConfig() {
      const suportaNotification = typeof window !== "undefined" && "Notification" in window;
      const suportaServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;
      const permission = suportaNotification ? Notification.permission : "unsupported";

      try {
        const response = await fetch("/api/firebase-config", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        const hasVapidKey = Boolean(data.vapidKey);

        console.log("[PUSH CONFIG]", {
          vapidKeyConfigured: data.vapidKeyConfigured,
          hasVapidKey,
        });

        if (!active) return;

        setVapidKey(data.vapidKey || "");
        setVapidConfigured(Boolean(data.vapidKeyConfigured && data.vapidKey));

        const supported = suportaNotification && suportaServiceWorker && hasVapidKey;
        const reason = !suportaNotification
          ? "Este navegador nao suporta notificacoes web."
          : !suportaServiceWorker
            ? "Service worker indisponivel neste navegador."
            : !hasVapidKey
              ? "Chave VAPID de notificacoes nao esta configurada no servidor."
              : "";

        setPushInfo((current) => ({
          ...current,
          supported,
          permission,
          reason,
          vapidConfigured: Boolean(data.vapidKeyConfigured && data.vapidKey),
          serviceWorkerAvailable: suportaServiceWorker,
        }));
      } catch (error) {
        if (!active) return;
        setVapidKey("");
        setVapidConfigured(false);
        setPushInfo({
          supported: false,
          permission,
          reason: error?.message || "Nao foi possivel carregar a configuracao de notificacoes.",
          serviceWorkerAvailable: suportaServiceWorker,
        });
      }
    }

    carregarPushConfig();

    return () => {
      active = false;
    };
  }, [open]);

  async function ativarPush() {
    if (!uid || pushSalvando) return;

    try {
      setPushSalvando(true);
      setPushAviso("Abrindo permissão do navegador...");
      const result = await ativarPushNotifications(uid);
      setProfile((p) => ({
        ...p,
        notificacoes: true,
        pushNotifications: {
          enabled: true,
          permission: result.permission,
          tokenKey: result.tokenKey,
        },
      }));
      setPushInfo((p) => ({ ...p, supported: true, permission: result.permission }));
      setPushAviso("Notificações ativadas neste aparelho.");
    } catch (error) {
      setPushAviso(error?.message || "Não consegui ativar notificações agora.");
      const info = await getPushCapabilities().catch(() => null);
      if (info) setPushInfo(info);
    } finally {
      setPushSalvando(false);
    }
  }

  async function desativarPush() {
    if (!uid || pushSalvando) return;

    try {
      setPushSalvando(true);
      await desativarPushNotifications(uid);
      setProfile((p) => ({
        ...p,
        notificacoes: false,
        pushNotifications: {
          ...(p.pushNotifications || {}),
          enabled: false,
        },
      }));
      setPushAviso("Push desativado neste perfil.");
    } catch (error) {
      setPushAviso(error?.message || "Não consegui desativar notificações agora.");
    } finally {
      setPushSalvando(false);
    }
  }

  async function testarPush() {
    if (!uid || pushTestando) return;

    try {
      setPushTestando(true);
      setPushAviso("Enviando teste...");
      const result = await ativarPushNotifications(uid);
      setProfile((p) => ({
        ...p,
        notificacoes: true,
        pushNotifications: {
          enabled: true,
          permission: result.permission,
          tokenKey: result.tokenKey,
        },
      }));
      setPushInfo((p) => ({ ...p, supported: true, permission: result.permission }));
      await testarPushNotification(uid);
      setPushAviso("Notificação de teste enviada.");
    } catch (error) {
      const info = await getPushCapabilities().catch(() => null);
      if (info) setPushInfo(info);
      const permissionDenied =
        typeof Notification !== "undefined" &&
        (Notification.permission === "denied" || /bloquead|negad|permiss/i.test(String(error?.message || "")));
      setPushAviso(permissionDenied ? "Permissão bloqueada no navegador." : error?.message || "Não consegui enviar o teste agora.");
    } finally {
      setPushTestando(false);
    }
  }

  async function sairDaConta() {
    if (!window.confirm("Deseja realmente sair da sua conta?")) return;

    try {
      await signOut(auth);
      [
        "meuId",
        "meuNome",
        "cadastroCompleto",
        "fotoURL",
        "fotoUrl",
        "avatarURL",
        "avatarEmoji",
        "visivelNoMapa",
        "notifsAtivas",
      ].forEach((key) => window.localStorage.removeItem(key));
      if (uid) window.localStorage.removeItem(`cadastroCompleto:${uid}`);
      window.location.href = "/";
    } catch {
      window.location.href = "/";
    }
  }

  async function handleProfilePhotoUpload(file) {
    const currentUser = auth.currentUser;
    const currentUid = currentUser?.uid || "";
    const fotoAnterior = pickFoto(profile.fotoURL, profile.photoURL, profile.avatar);
    const avatarAnterior = profile.avatar || profile.avatarEmoji || "";
    let previewUrl = "";

    setPhotoError("");
    setPhotoSuccess("");

    if (!currentUid) {
      setPhotoError("Entre novamente para salvar a foto.");
      return;
    }

    if (uid && currentUid !== uid) {
      setPhotoError("Sessao diferente do perfil aberto. Entre novamente.");
      return;
    }

    if (!file?.type?.startsWith("image/")) {
      setPhotoError("Escolha um arquivo de imagem.");
      return;
    }

    if (file.size > PHOTO_SOURCE_MAX_BYTES) {
      setPhotoError("Escolha uma imagem de ate 8 MB. O app comprime antes de enviar.");
      return;
    }

    try {
      setUploadingPhoto(true);
      setPhotoSuccess("Enviando foto... 0%");

      previewUrl = URL.createObjectURL(file);
      setProfile((p) => ({
        ...p,
        fotoURL: previewUrl,
        photoURL: previewUrl,
        avatar: previewUrl,
      }));

      const idToken = await currentUser.getIdToken(true);

      const uploaded = await promiseComTimeout(
        uploadProfilePhotoToImgBB(file, {
          uid: currentUid,
          idToken,
          onProgress: (progress) => setPhotoSuccess(`Enviando foto... ${progress}%`),
        }),
        30000,
        "foto_upload_timeout",
      );
      const fotoURL = uploaded.url;

      setPhotoSuccess("Salvando foto... 90%");

      await promiseComTimeout(
        update(ref(database, `users/${currentUid}`), {
          fotoURL,
          fotoAtualizadaEm: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        10000,
        "foto_db_timeout",
      );

      setProfile((p) => ({
        ...p,
        fotoURL,
        photoURL: fotoURL,
        avatar: fotoURL,
        fotoImgBbId: uploaded.imageId || "",
        fotoStorage: "imgbb",
      }));

      try {
        window.localStorage.setItem("fotoURL", fotoURL);
      } catch {}

      setPhotoSuccess("Foto salva. 100%");
      setSalvo(true);
      window.setTimeout(() => setPhotoSuccess(""), 2500);
      window.setTimeout(() => setSalvo(false), 2200);
    } catch (error) {
      console.warn("[PerfilDrawer] upload foto:", error?.code || error?.message || error);
      const code = String(error?.code || error?.message || "");
      const msg =
        error?.message === "foto_upload_timeout"
          ? "A foto demorou para enviar. Tente novamente em uma rede melhor."
          : error?.message === "foto_grande"
            ? "Escolha uma imagem de ate 2 MB."
            : error?.message === "tipo_invalido"
              ? "Escolha um arquivo de imagem."
              : error?.message === "imgbb_config_missing" || code === "imgbb_config_missing"
                ? "ImgBB nao esta configurado. Defina IMGBB_API_KEY no servidor."
              : code === "firebase_admin_not_configured"
                ? "Firebase Admin precisa estar configurado para enviar a foto com seguranca."
              : code === "imgbb_upload_failed"
                ? "ImgBB recusou o upload da foto. Tente outra imagem."
            : error?.message === "foto_db_timeout"
              ? "A foto foi enviada, mas nao consegui salvar no perfil."
            : error?.message === "auth_missing" || code.includes("unauth")
              ? "Entre novamente para salvar a foto."
            : code.toLowerCase().includes("permission")
              ? "O Firebase recusou salvar a foto. Verifique as regras."
            : "Nao foi possivel salvar a foto.";

      setProfile((p) => ({
        ...p,
        fotoURL: fotoAnterior,
        photoURL: fotoAnterior,
        avatar: fotoAnterior || avatarAnterior,
      }));
      setPhotoSuccess("");
      setPhotoError(msg);
    } finally {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setUploadingPhoto(false);
    }
  }

  async function alterarFotoPerfil(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await handleProfilePhotoUpload(file);
  }

  async function handlePortfolioPhotoUpload(file) {
    const currentUser = auth.currentUser;
    const currentUid = currentUser?.uid || "";
    const currentFotos = Array.isArray(portfolioDraft.fotos)
      ? portfolioDraft.fotos
      : normalizePortfolioFotos(portfolioDraft);

    setPortfolioPhotoError("");

    if (!currentUid) {
      setPortfolioPhotoError("Entre novamente para anexar a foto.");
      return;
    }

    if (uid && currentUid !== uid) {
      setPortfolioPhotoError("Sessao diferente do perfil aberto. Entre novamente.");
      return;
    }

    if (!file?.type?.startsWith("image/")) {
      setPortfolioPhotoError("Escolha um arquivo de imagem.");
      return;
    }

    if (file.size > PHOTO_SOURCE_MAX_BYTES) {
      setPortfolioPhotoError("Escolha uma imagem de ate 8 MB. O app comprime antes de enviar.");
      return;
    }

    if (currentFotos.length >= 5) {
      setPortfolioPhotoError("Voce pode anexar ate 5 fotos por trabalho.");
      return;
    }

    try {
      setPortfolioPhotoUploading(true);
      const idToken = await currentUser.getIdToken(true);
      const uploaded = await promiseComTimeout(
        uploadProfilePhotoToImgBB(file, {
          uid: currentUid,
          idToken,
        }),
        30000,
        "portfolio_upload_timeout",
      );

      setPortfolioDraft((prev) => ({
        ...prev,
        fotoURL: prev.fotoURL || uploaded.url,
        fotos: [...new Set([...(Array.isArray(prev.fotos) ? prev.fotos : normalizePortfolioFotos(prev)), uploaded.url])].slice(0, 5),
        fotoImgBbId: uploaded.imageId || "",
      }));
    } catch (error) {
      const code = String(error?.code || error?.message || "");
      setPortfolioPhotoError(
        error?.message === "portfolio_upload_timeout"
          ? "A foto demorou para enviar. Tente novamente."
          : error?.message === "foto_grande"
            ? "Escolha uma imagem de ate 2 MB."
            : code.toLowerCase().includes("permission") || code.toLowerCase().includes("auth")
              ? "Entre novamente para anexar a foto."
              : "Nao foi possivel anexar a foto.",
      );
    } finally {
      setPortfolioPhotoUploading(false);
    }
  }

  async function alterarFotoPortfolio(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;

    const currentFotos = Array.isArray(portfolioDraft.fotos)
      ? portfolioDraft.fotos
      : normalizePortfolioFotos(portfolioDraft);
    const vagas = Math.max(0, 5 - currentFotos.length);

    if (vagas <= 0) {
      setPortfolioPhotoError("Voce pode anexar ate 5 fotos por trabalho.");
      return;
    }

    for (const file of files.slice(0, vagas)) {
      await handlePortfolioPhotoUpload(file);
    }
  }

  function removerFotoPortfolioDraft(fotoURL) {
    setPortfolioDraft((prev) => {
      const fotos = (Array.isArray(prev.fotos) ? prev.fotos : normalizePortfolioFotos(prev)).filter((foto) => foto !== fotoURL);
      return {
        ...prev,
        fotos,
        fotoURL: fotos[0] || "",
      };
    });
    setPortfolioPhotoError("");
  }

  const salvar = async () => {
    if (!uid) return;

    setSalvando(true);
    setSalvo(false);

    try {
      const profPortfolio = normalizePortfolio(profile.profPortfolio);
      const portfolioMap = portfolioListToMap(profPortfolio);

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
        portfolio: portfolioMap,
        profPortfolio,
      };

      const mapSettings = {
        mostrarOnline: !!profile.mapMostrarOnline,
        aoVivo: !!profile.mapAoVivo,
        limiteOnline: Math.max(5, Math.min(80, Number(profile.mapLimiteOnline || 30))),
        atualizadoEm: serverTimestamp(),
      };

      const uiSettings = {
        animacoes: profile.animacoes !== false,
        modoEconomico: profile.modoEconomico === true,
        aparencia: profile.aparencia || "sistema",
        notificationPreferences: normalizeNotificationPreferences(profile.notificationPreferences),
        atualizadoEm: serverTimestamp(),
      };
      const privacySettings = normalizePrivacy(profile.privacy);
      const privacyPayload = {
        ...privacySettings,
        atualizadoEm: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const fotoPrincipal = pickFoto(profile.fotoURL, profile.photoURL, profile.avatar);
      const publicPortfolioMap = privacySettings.profileVisible
        ? portfolioListToPublicMap(profPortfolio, profile, uid, fotoPrincipal)
        : {};
      const publicProfilePayload = privacySettings.profileVisible
        ? profileToPublicProfile(profile, uid, fotoPrincipal, privacySettings, profPortfolio)
        : null;
      const profilePublic = { ...profile };
      delete profilePublic.privacy;
      delete profilePublic.cpf;
      delete profilePublic.cpfDigits;
      delete profilePublic.cpfVerificacao;
      delete profilePublic.cpfMasked;
      delete profilePublic.cpfStatus;
      delete profilePublic.documento;
      delete profilePublic.documentoVerificacao;
      delete profilePublic.telefone;
      delete profilePublic.phone;
      delete profilePublic.email;
      delete profilePublic.dataNascimento;
      delete profilePublic.bairro;

      await update(ref(database, `${userBasePath}/profile`), {
        ...profilePublic,
        cpf: null,
        cpfDigits: null,
        cpfMasked: null,
        cpfStatus: null,
        cpfVerificacao: null,
        documento: null,
        documentoVerificacao: null,
        fotoURL: fotoPrincipal || null,
        photoURL: fotoPrincipal || null,
        avatar: fotoPrincipal || profile.avatarEmoji || "",
        profPortfolio,
        portfolio: portfolioMap,
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
        updatedAt: serverTimestamp(),
      });

      const cpfDigits = onlyDigits(cpfDraft).slice(0, 11);
      if (cpfDigits.length === 11) {
        const masked = maskCpfSalvo(cpfDigits);
        await update(ref(database, `userPrivate/${uid}/verification`), {
          cpf: cpfDigits,
          cpfMasked: masked,
          cpfStatus: "em_breve",
          cpfAtualizadoEm: serverTimestamp(),
        });
        setCpfSalvoMask(masked);
        setCpfDraft("");
        setCpfAviso("CPF salvo para verificação futura.");
      } else if (cpfDigits.length > 0) {
        setCpfAviso("CPF precisa ter 11 dígitos. Perfil salvo sem alterar o CPF.");
      } else {
        setCpfAviso("");
      }

      await update(ref(database, `${userBasePath}/settings/mapa`), mapSettings);
      await update(ref(database, `${userBasePath}/settings/ui`), uiSettings);

      await update(ref(database, `${userBasePath}`), {
        nome: profile.nome,
        cpf: null,
        cpfDigits: null,
        cpfMasked: null,
        cpfStatus: null,
        cpfVerificacao: null,
        documento: null,
        documentoVerificacao: null,
        fotoURL: fotoPrincipal || null,
        photoURL: fotoPrincipal || null,
        avatar: fotoPrincipal || profile.avatarEmoji || "",
        avatarEmoji: profile.avatarEmoji || "",
        profPortfolio,
        portfolio: portfolioMap,
        cidade: profile.cidade || "",
        bairro: profile.bairro || "",
        telefone: profile.telefone || "",
        phone: profile.telefone || "",
        email: profile.email || auth.currentUser?.email || "",
        dataNascimento: profile.dataNascimento || "",
        bio: profile.bio || "",
        visivel: profile.visivel !== false,
        notificacoes: profile.notificacoes !== false,
        privacy: privacyPayload,
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
        showOnlineStatus: privacySettings.showOnlineStatus,
        allowPublicContact: privacySettings.allowPublicContact,
        assinatura: {
          plano: profile.plano || "Free",
          origem: "perfil",
          atualizadoEm: serverTimestamp(),
        },
        atualizadoEm: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await set(
        ref(database, `publicPortfolio/${uid}`),
        Object.keys(publicPortfolioMap).length ? publicPortfolioMap : null
      );
      await set(ref(database, `publicProfiles/${uid}`), publicProfilePayload);

      console.warn("[PRESENCE] caminho legado detectado", {
        path: `usuariosOnline/${uid}`,
        origem: "PerfilDrawer",
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
        visivel: profile.visivel !== false,
        profileVisible: privacySettings.profileVisible,
        profileVisibilityExplicit: privacySettings.profileVisibilityExplicit === true,
        showOnlineStatus: privacySettings.showOnlineStatus,
        allowPublicContact: privacySettings.allowPublicContact,
        plano: profile.plano || "Free",
        statusProfissional: profile.statusProfissional || "disponivel",
        ocupadoAte: profile.ocupadoAte || "",
        agendaAberta: profile.agendaAberta !== false,
        atualizadoEm: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      try {
        if (fotoPrincipal) window.localStorage.setItem("fotoURL", fotoPrincipal);
        if (profile.avatarEmoji) window.localStorage.setItem("avatarEmoji", profile.avatarEmoji);
      } catch {}

      setSalvo(true);
      setTimeout(() => setSalvo(false), 2200);
    } finally {
      setSalvando(false);
    }
  };

  const configSnapshot = useMemo(() => getConfigSnapshot(profile), [profile]);

  useEffect(() => {
    if (!open || !uid || !settingsLoadedRef.current) return undefined;

    const serialized = JSON.stringify(configSnapshot);
    if (!configSnapshotRef.current) {
      configSnapshotRef.current = serialized;
      configLastSavedRef.current = configSnapshot;
      return undefined;
    }

    if (serialized === configSnapshotRef.current) return undefined;

    configSnapshotRef.current = serialized;
    if (configSaveTimerRef.current) window.clearTimeout(configSaveTimerRef.current);

    configSaveTimerRef.current = window.setTimeout(async () => {
      const privacyPayload = {
        ...configSnapshot.privacy,
        atualizadoEm: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      try {
        await Promise.all([
          update(ref(database, `${userBasePath}/settings/mapa`), {
            mostrarOnline: configSnapshot.mapMostrarOnline,
            aoVivo: configSnapshot.mapAoVivo,
            limiteOnline: configSnapshot.mapLimiteOnline,
            atualizadoEm: serverTimestamp(),
          }),
          update(ref(database, `${userBasePath}/settings/ui`), {
            animacoes: configSnapshot.animacoes,
            modoEconomico: configSnapshot.modoEconomico,
            aparencia: configSnapshot.aparencia,
            notificationPreferences: configSnapshot.notificationPreferences,
            atualizadoEm: serverTimestamp(),
          }),
          update(ref(database, `${userBasePath}/profile`), {
            visivel: configSnapshot.visivel,
            notificacoes: configSnapshot.notificacoes,
            notificationPreferences: configSnapshot.notificationPreferences,
            modoEconomico: configSnapshot.modoEconomico,
            aparencia: configSnapshot.aparencia,
          }),
          update(ref(database, userBasePath), {
            visivel: configSnapshot.visivel,
            notificacoes: configSnapshot.notificacoes,
            privacy: privacyPayload,
            showOnlineStatus: configSnapshot.privacy.showOnlineStatus,
            allowPublicContact: configSnapshot.privacy.allowPublicContact,
            atualizadoEm: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        ]);

        configLastSavedRef.current = configSnapshot;
        setConfigAviso("Configuracao salva");
        window.setTimeout(() => setConfigAviso(""), 1800);
      } catch {
        const last = configLastSavedRef.current;
        if (last) {
          setProfile((prev) => ({
            ...prev,
            ...last,
            privacy: last.privacy,
            notificationPreferences: last.notificationPreferences,
          }));
          configSnapshotRef.current = JSON.stringify(last);
        }
        setConfigAviso("Nao foi possivel salvar. Tente novamente.");
      }
    }, 450);

    return () => {
      if (configSaveTimerRef.current) window.clearTimeout(configSaveTimerRef.current);
    };
  }, [configSnapshot, open, uid, userBasePath]);

  if (!open) return null;
  if (!uid) return null;

  const fotoPrincipal = pickFoto(profile.fotoURL, profile.photoURL, profile.avatar);
  const perfilVerificadoOficial = !!(
    profile.verificado ||
    profile.verified ||
    profile.perfilVerificado ||
    profile.trust?.verificado
  );
  const nivelCorreAtual = Math.max(
    Number(accountStats.patenteCorre || 1),
    calcularPatentePorServicos(accountStats.servicosCorre)
  );
  const nivelProfAtual = profile.isProfissional
    ? Math.max(Number(accountStats.patenteProf || 1), calcularPatentePorServicos(accountStats.servicosProf))
    : 0;
  const pushAtivo = profile.pushNotifications?.enabled === true;
  const pushPermission = pushInfo.permission || "default";
  const pushStatusLabel =
    pushPermission === "granted"
      ? "Ativada"
      : pushPermission === "denied"
        ? "Bloqueada"
        : "Não ativada";
  const pushStatusClass =
    pushPermission === "granted"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : pushPermission === "denied"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
  const pushCanUse =
    pushInfo.supported &&
    pushInfo.serviceWorkerAvailable !== false &&
    Boolean(vapidKey) &&
    vapidConfigured;
  const pushReason = vapidConfigured && /vapid/i.test(String(pushInfo.reason || "")) ? "" : pushInfo.reason;
  const privacy = normalizePrivacy(profile.privacy);
  const setPrivacyPreference = (field, value) => {
    setPrivacyAviso("");
    setProfile((prev) => {
      const nextPrivacy = {
        ...normalizePrivacy(prev.privacy),
        [field]: value,
        ...(field === "profileVisible" ? { profileVisibilityExplicit: true } : {}),
      };
      return {
        ...prev,
        privacy: nextPrivacy,
      };
    });
  };
  const setNotificationPreference = (field, value) => {
    setProfile((prev) => ({
      ...prev,
      notificationPreferences: {
        ...normalizeNotificationPreferences(prev.notificationPreferences),
        [field]: value,
      },
    }));
  };
  const toggleConfigSection = (section) => {
    setConfigSecoesAbertas((prev) => {
      const nextOpen = !prev[section];
      if (typeof window !== "undefined" && window.innerWidth < 768 && nextOpen) {
        return Object.fromEntries(Object.keys(prev).map((key) => [key, key === section]));
      }
      return { ...prev, [section]: nextOpen };
    });
  };
  const professionalMode = tab === "profissional";
  const taxaConclusaoProf = serviceStats.total
    ? Math.max(0, Math.round(((serviceStats.total - serviceStats.problemas) / serviceStats.total) * 100))
    : 0;
  const portfolioItems = normalizePortfolio(profile.profPortfolio);
  const portfolioDraftFotos = normalizePortfolioFotos(portfolioDraft);
  const selectedWorkMode = profile.isCorre && profile.isProfissional
    ? "ambos"
    : profile.isProfissional
      ? "profissional"
      : "corre";
  const setProfessionalWorkMode = (mode) => {
    setProfile((prev) => ({
      ...prev,
      isCorre: mode === "corre" || mode === "ambos",
      isProfissional: mode === "profissional" || mode === "ambos",
    }));
  };
  const setProfessionalProfileType = (field, checked) => {
    setProfile((prev) => {
      const next = { ...prev, [field]: checked };
      if (!next.isCorre && !next.isProfissional) {
        return prev;
      }
      return next;
    });
  };
  const goProfessionalProfileStep = (step) => {
    setProfessionalProfileStep(step);
    window.setTimeout(() => {
      drawerScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 40);
  };
  const salvarPerfilProfissional = async () => {
    try {
      await salvar();
      goProfessionalProfileStep("saved");
    } catch (error) {
      console.error("[PERFIL_PROFISSIONAL] erro ao salvar", error);
    }
  };
  const profPages = {
    perfilProfissional: {
      title: "Meu perfil profissional",
      desc: "Como voce trabalha no Corre Aqui.",
    },
    portfolio: {
      title: "Portfolio de servicos",
      desc: "Adicione trabalhos para os clientes conhecerem seu servico.",
    },
    avaliacoes: {
      title: "Avaliacoes",
      desc: "Reputacao, nota e historico de confianca.",
    },
    patentes: {
      title: "Patentes Corre/Pro",
      desc: "Evolucao por servicos concluidos.",
    },
    config: {
      title: "Configuracoes",
      desc: "Disponibilidade, agenda e visibilidade.",
    },
    ajuda: {
      title: "Central de ajuda",
      desc: "Boas praticas para trabalhar com seguranca.",
    },
  };
  const currentProfSection = professionalMode ? profSection || "perfilProfissional" : profSection;
  const profPage = profPages[currentProfSection] || profPages.perfilProfissional;
  const drawerPages = {
    dados: {
      title: "Dados pessoais",
      desc: "Atualize suas informacoes basicas da conta.",
    },
    config: {
      title: "Configurações",
      desc: "Conta, privacidade, notificações e preferências.",
    },
    enderecos: {
      title: "Meus endereços",
      desc: "Cadastre locais para agilizar pedidos e atendimentos.",
    },
    ajuda: {
      title: "Ajuda e suporte",
      desc: "Tire duvidas e encontre orientacoes do Corre Aqui.",
    },
    monetizacao: {
      title: "Planos",
      desc: "Recursos, anúncios e benefícios do Corre Aqui.",
    },
  };
  const drawerPage = drawerPages[tab] || drawerPages.config;
  const updatePortfolioDraft = (field, value) => {
    setPortfolioPhotoError("");
    setPortfolioDraft((prev) => ({ ...prev, [field]: value }));
  };
  const adicionarPortfolioItem = () => {
    const fotos = normalizePortfolioFotos(portfolioDraft);
    const categoriaMeta = getCategoryById(portfolioDraft.categoriaId || portfolioDraft.categoria);
    const categoriaId = String(portfolioDraft.categoriaId || categoriaMeta?.id || "").trim();
    const categoriaNome = String(portfolioDraft.categoriaNome || categoriaMeta?.label || portfolioDraft.categoria || "").trim();
    const id = portfolioEditingId || portfolioDraft.id || `portfolio_${Date.now()}`;
    const item = {
      id,
      nome: String(portfolioDraft.nome || portfolioDraft.titulo || "").trim(),
      titulo: String(portfolioDraft.nome || portfolioDraft.titulo || "").trim(),
      descricao: portfolioDraft.descricao.trim(),
      preco: portfolioDraft.preco.trim(),
      faixaPreco: String(portfolioDraft.faixaPreco || portfolioDraft.valor || portfolioDraft.preco || "").trim(),
      valor: String(portfolioDraft.faixaPreco || portfolioDraft.valor || portfolioDraft.preco || "").trim(),
      categoriaId,
      categoriaNome,
      categoria: categoriaNome,
      tempoMedio: portfolioDraft.tempoMedio.trim(),
      regiao: String(portfolioDraft.regiao || profile.profRegiao || profile.cidade || "").trim(),
      atendeDomicilio: portfolioDraft.atendeDomicilio !== false,
      urgente: portfolioDraft.urgente === true,
      ativo: portfolioDraft.ativo !== false,
      fotoURL: fotos[0] || "",
      fotos,
      fotoImgBbId: portfolioDraft.fotoImgBbId || "",
      createdAt: portfolioDraft.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    if (!item.nome && !item.descricao && !item.valor && !item.categoria && !item.fotos.length) {
      setPortfolioPhotoError("Preencha pelo menos o nome do serviço para adicionar.");
      portfolioFirstInputRef.current?.focus();
      return;
    }

    setProfile((prev) => ({
      ...prev,
      profPortfolio: [
        ...normalizePortfolio(prev.profPortfolio).filter((current) => current.id !== id),
        item,
      ].slice(0, 12),
    }));
    setPortfolioDraft(createEmptyPortfolioDraft());
    setPortfolioEditingId("");
    setPortfolioPhotoError("");
  };
  const editarPortfolioItem = (item) => {
    const normalized = normalizePortfolio([item])[0] || item;
    setPortfolioDraft({
      ...createEmptyPortfolioDraft(),
      ...normalized,
      nome: normalized.nome || normalized.titulo || "",
      titulo: normalized.nome || normalized.titulo || "",
      valor: normalized.valor || normalized.faixaPreco || normalized.preco || "",
      faixaPreco: normalized.faixaPreco || normalized.valor || "",
      categoria: normalized.categoria || normalized.categoriaNome || "",
      categoriaNome: normalized.categoriaNome || normalized.categoria || "",
      fotos: normalizePortfolioFotos(normalized),
    });
    setPortfolioEditingId(normalized.id || "");
    setPortfolioPhotoError("");
  };
  const removerPortfolioItem = (id) => {
    setProfile((prev) => ({
      ...prev,
      profPortfolio: normalizePortfolio(prev.profPortfolio).filter((item) => item.id !== id),
    }));
    if (portfolioEditingId === id) {
      setPortfolioEditingId("");
      setPortfolioDraft(createEmptyPortfolioDraft());
    }
  };

  const updateAddressDraft = (field, value) => {
    setAddressAviso("");
    setAddressDraft((prev) => ({ ...prev, [field]: value }));
  };

  const usarLocalizacaoAtual = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setAddressAviso("Localizacao nao disponivel neste aparelho.");
      return;
    }

    setAddressAviso("Buscando sua localizacao...");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude);
        const lng = Number(pos.coords.longitude);
        setAddressDraft((prev) => ({
          ...prev,
          lat,
          lng,
          referencia: prev.referencia || `Localizacao atual: ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        }));
        setAddressAviso("Localizacao adicionada ao endereco.");
      },
      () => setAddressAviso("Nao foi possivel usar sua localizacao agora."),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  };

  const editarEndereco = (address) => {
    setAddressEditingId(address.id || "");
    setAddressDraft({
      ...createEmptyAddressDraft(),
      ...address,
      nomeLocal: address.nomeLocal || address.nome || "",
    });
    setAddressAviso("");
    window.setTimeout(() => {
      drawerScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
    }, 40);
  };

  const limparEnderecoForm = () => {
    setAddressDraft(createEmptyAddressDraft());
    setAddressEditingId("");
    setAddressAviso("");
  };

  const salvarEndereco = async () => {
    const nomeLocal = String(addressDraft.nomeLocal || "").trim();
    const rua = String(addressDraft.rua || "").trim();
    const numero = String(addressDraft.numero || "").trim();
    const bairro = String(addressDraft.bairro || "").trim();
    const cidade = String(addressDraft.cidade || "").trim();

    if (!nomeLocal || !rua || !numero || !bairro || !cidade) {
      setAddressAviso("Preencha nome do local, rua, numero, bairro e cidade.");
      return;
    }

    const id = addressEditingId || `address_${Date.now()}`;
    const antigo = addresses.find((item) => item.id === id) || {};
    const payload = {
      id,
      nomeLocal,
      nome: nomeLocal,
      cep: String(addressDraft.cep || "").trim(),
      rua,
      numero,
      complemento: String(addressDraft.complemento || "").trim(),
      bairro,
      cidade,
      referencia: String(addressDraft.referencia || "").trim(),
      lat: Number.isFinite(Number(addressDraft.lat)) ? Number(addressDraft.lat) : null,
      lng: Number.isFinite(Number(addressDraft.lng)) ? Number(addressDraft.lng) : null,
      criadoEm: antigo.criadoEm || Date.now(),
      updatedAt: Date.now(),
      atualizadoEm: serverTimestamp(),
    };

    setAddressSaving(true);
    setAddressAviso("");
    try {
      await set(ref(database, `enderecos/${uid}/${id}`), payload);
      setAddressDraft(createEmptyAddressDraft());
      setAddressEditingId("");
      setAddressAviso("Endereco salvo.");
    } catch (error) {
      console.error("[ENDERECOS] erro ao salvar", error);
      setAddressAviso(error?.message || "Nao foi possivel salvar o endereco agora.");
    } finally {
      setAddressSaving(false);
    }
  };

  const removerEndereco = async (id) => {
    if (!id || addressSaving) return;
    const confirmar = typeof window === "undefined" || window.confirm("Remover este endereco?");
    if (!confirmar) return;

    setAddressSaving(true);
    setAddressAviso("");
    try {
      await set(ref(database, `enderecos/${uid}/${id}`), null);
      if (addressEditingId === id) limparEnderecoForm();
      setAddressAviso("Endereco removido.");
    } catch (error) {
      console.error("[ENDERECOS] erro ao remover", error);
      setAddressAviso(error?.message || "Nao foi possivel remover o endereco agora.");
    } finally {
      setAddressSaving(false);
    }
  };

  const abrirSuporteAcao = (mensagem) => {
    setSupportAviso(mensagem);
  };

  const standaloneClientPage = tab === "dados" || tab === "enderecos" || tab === "ajuda";

  return (
    <div className="fixed inset-0 z-[100000] bg-slate-950">
      <div
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.aside
        ref={drawerScrollRef}
        initial={{ opacity: 0, scale: 0.985 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 120, damping: 18 }}
        className={[
          "fixed inset-0 h-screen w-screen border-0 shadow-[0_30px_120px_rgba(15,23,42,0.35)] overflow-y-auto",
          professionalMode ? "bg-[#050b12] text-white" : "bg-white text-slate-950",
        ].join(" ")}
      >
        {!professionalMode && tab !== "config" && (
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-7xl px-3 py-2.5 md:px-8 md:py-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-extrabold text-blue-950 md:text-lg">
                {drawerPage.title}
              </div>
              <div className="text-[11px] font-semibold text-slate-500 md:text-xs">
                {drawerPage.desc}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="h-9 w-9 rounded-2xl border border-slate-200 bg-slate-50 text-slate-700 shadow-sm transition hover:bg-slate-100 active:scale-[0.96] md:h-12 md:w-12 md:rounded-3xl md:text-xl"
              title="Fechar"
            >
              ✕
            </button>
          </div>
        </div>
        )}

        <div className={professionalMode ? "mx-auto min-h-screen w-full max-w-5xl p-3 pb-24 md:p-6 md:pb-28" : "mx-auto w-full max-w-7xl p-2.5 md:p-6"}>
          {/* FOTO + HEADER */}
          {!professionalMode && !standaloneClientPage && tab !== "config" && (
          <div className="overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0b73ff_0%,#18bfd2_48%,#ffe36b_100%)] p-4 text-white shadow-[0_22px_70px_rgba(37,99,235,0.22)] md:rounded-[36px] md:p-8">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-4 text-left">
              <label className={["cursor-pointer relative group", fotoSalvando ? "pointer-events-none opacity-80" : ""].join(" ")}>
                <input
                  type="file"
                  accept="image/*"
                  disabled={fotoSalvando}
                  className="hidden"
                  onChange={alterarFotoPerfil}
                />

                {fotoPrincipal ? (
                  <div
                    className="h-20 w-20 rounded-[28px] border-4 border-white bg-cover bg-center shadow-[0_16px_38px_rgba(15,23,42,0.22)] md:h-28 md:w-28 md:rounded-[36px]"
                    style={{ backgroundImage: `url(${JSON.stringify(fotoPrincipal)})` }}
                    aria-label="Foto do perfil"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-[28px] border-4 border-white bg-white/90 text-3xl text-blue-700 shadow-[0_16px_38px_rgba(15,23,42,0.22)] md:h-28 md:w-28 md:rounded-[36px] md:text-4xl">
                    {profile.avatarEmoji || "📷"}
                  </div>
                )}

                <div className="absolute inset-0 flex items-center justify-center rounded-[28px] bg-blue-950/55 text-xs font-bold opacity-0 transition group-hover:opacity-100 md:rounded-[36px]">
                  {fotoSalvando ? "Salvando..." : "Trocar foto"}
                </div>
              </label>
              <div className="min-w-0">

              {fotoAviso ? (
                <div className="mt-3 rounded-2xl border border-white/30 bg-white/18 px-3 py-2 text-xs font-bold text-white">
                  {fotoAviso}
                </div>
              ) : null}

              <div className="mt-3 text-2xl font-black text-white drop-shadow-sm md:mt-4 md:text-3xl">
                {profile.nome || "Seu nome"}
              </div>

              <div className="mt-0.5 text-xs font-bold text-white/82 md:mt-1 md:text-sm">
                {profile.cidade || "Cidade não informada"}
              </div>

                </div>
                </div>

                <div className="w-fit rounded-full border border-white/70 bg-white/90 px-4 py-2 text-xs font-black text-emerald-600 shadow-[0_12px_28px_rgba(15,23,42,0.12)]">
                  ✨ Em breve
                </div>
              </div>

              <div className="hidden">
                <span
                  className={`px-3 py-1.5 rounded-full text-xs font-black border ${
                    profile.visivel
                      ? "bg-emerald-500/15 border-emerald-400/20 text-emerald-300 shadow-[0_0_22px_rgba(16,185,129,0.12)]"
                      : "bg-slate-500/15 border-slate-400/20 text-slate-300"
                  }`}
                >
                  {profile.visivel ? "🟢 Visível" : "⚫ Oculto"}
                </span>

                {perfilVerificadoOficial ? (
                  <span className="px-3 py-1.5 rounded-full text-xs font-black bg-cyan-500/15 border border-cyan-300/25 text-cyan-200">
                    ✓ Perfil verificado
                  </span>
                ) : (
                  <span className="px-3 py-1.5 rounded-full text-xs font-black bg-emerald-500/10 border border-emerald-300/20 text-emerald-200">
                    🟢 Verificação em breve
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

              </div>

              <div className="hidden">
                <div className="rounded-[18px] border border-white/55 bg-white/88 px-2 py-2 text-blue-950 shadow-[0_12px_24px_rgba(15,23,42,0.10)] md:rounded-2xl md:px-3 md:py-3">
                  <div className="text-base font-black md:text-lg">{serviceStats.total}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Histórico
                  </div>
                </div>
                <div className="rounded-[18px] border border-white/55 bg-white/88 px-2 py-2 text-blue-950 shadow-[0_12px_24px_rgba(15,23,42,0.10)] md:rounded-2xl md:px-3 md:py-3">
                  <div className="text-base font-black md:text-lg">
                    {serviceStats.notaMedia ? `★ ${serviceStats.notaMedia.toFixed(1)}` : "Sem nota"}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Nota
                  </div>
                </div>
                <div className="rounded-[18px] border border-white/55 bg-white/88 px-2 py-2 text-blue-950 shadow-[0_12px_24px_rgba(15,23,42,0.10)] md:rounded-2xl md:px-3 md:py-3">
                  <div className="text-base font-black md:text-lg">{serviceStats.problemas}</div>
                  <div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Problemas
                  </div>
                </div>
              </div>

              <div className="hidden">
                <div className="rounded-[18px] border border-white/40 bg-white/28 px-2.5 py-1.5 md:rounded-2xl md:px-3 md:py-2">
                  <div className="text-sm font-black text-white">{serviceStats.comoCorre}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">Como corre</div>
                </div>
                <div className="rounded-[18px] border border-white/40 bg-white/28 px-2.5 py-1.5 md:rounded-2xl md:px-3 md:py-2">
                  <div className="text-sm font-black text-white">{serviceStats.comoCliente}</div>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-white/70">Como cliente</div>
                </div>
              </div>

              <PlanoResumo
                plano={profile.plano}
                onOpenPlanos={() => setTab("monetizacao")}
              />
            </div>
          </div>
          )}

          {/* MENU DO PERFIL */}
          {!professionalMode && !standaloneClientPage && tab !== "config" && (
          <div className="mt-3 rounded-[22px] border border-slate-200 bg-white p-1.5 shadow-[0_14px_36px_rgba(15,23,42,0.08)] md:mt-4 md:rounded-[28px] md:p-2">
            <div className="grid grid-cols-2 gap-1.5 md:gap-2">
              {["config", "monetizacao"].map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    type="button"
                    className={[
                      "group min-h-[48px] rounded-[16px] px-2 py-2 text-center border transition-all duration-200 active:scale-[0.96] md:min-h-[58px] md:rounded-[22px]",
                      "flex flex-row items-center justify-center gap-2",
                      tab === t
                        ? "border-[#ffd91a] bg-[#ffd91a] text-blue-950 shadow-[0_12px_28px_rgba(250,204,21,0.22)]"
                        : "border-transparent bg-blue-50 text-slate-700 hover:bg-blue-100 hover:text-blue-950",
                    ].join(" ")}
                  >
                    <span className="text-base leading-none md:text-lg">{tabIcon[t]}</span>
                    <span className="text-[10px] sm:text-[12px] font-black leading-tight">
                      {tabLabel[t]}
                    </span>
                  </button>
                ),
              )}
            </div>
          </div>
          )}

          {tab === "dados" && (
            <div className="mx-auto mt-3 max-w-5xl md:mt-5">
              <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_22px_70px_rgba(15,23,42,0.10)] md:rounded-[34px] md:p-8">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setTab("config")}
                    className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-2xl font-black text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.96] md:h-16 md:w-16"
                    aria-label="Voltar"
                  >
                    ←
                  </button>
                  <div>
                    <h2 className="text-2xl font-black leading-tight text-blue-950 md:text-3xl">Dados pessoais</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500 md:text-base">Atualize suas informacoes basicas da conta.</p>
                  </div>
                </div>

                <div className="mt-6 rounded-[24px] border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-blue-50/55 p-4 shadow-[0_14px_36px_rgba(15,23,42,0.06)] md:rounded-[30px] md:p-6">
                  <div className="grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
                    <div>
                      <div className="text-base font-black text-blue-950">Foto de perfil</div>
                      <p className="mt-2 max-w-xs text-sm font-semibold leading-relaxed text-slate-500">
                        Escolha uma foto para seu perfil. Ela sera exibida para outros usuarios.
                      </p>
                    </div>

                    <label className={["relative mx-auto grid h-32 w-32 cursor-pointer place-items-center rounded-full border-[6px] border-rose-100 bg-white shadow-[0_18px_42px_rgba(15,23,42,0.12)] md:h-40 md:w-40", fotoSalvando ? "pointer-events-none opacity-80" : ""].join(" ")}>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={fotoSalvando}
                        className="hidden"
                        onChange={alterarFotoPerfil}
                      />
                      {fotoPrincipal ? (
                        <span
                          className="h-full w-full rounded-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${JSON.stringify(fotoPrincipal)})` }}
                          aria-label="Foto do perfil"
                        />
                      ) : (
                        <span className="text-4xl font-black text-blue-700">{profile.avatarEmoji || "📷"}</span>
                      )}
                      <span className="absolute bottom-1 right-1 grid h-12 w-12 place-items-center rounded-full border-4 border-white bg-blue-600 text-lg text-white shadow-[0_12px_24px_rgba(37,99,235,0.30)]">
                        📷
                      </span>
                    </label>

                    <div className="flex md:justify-end">
                      <button
                        type="button"
                        onClick={() => setProfile((p) => ({ ...p, fotoURL: "", photoURL: "", avatar: p.avatarEmoji || "" }))}
                        className="h-11 rounded-2xl border border-rose-200 bg-white px-5 text-sm font-black text-rose-500 transition hover:bg-rose-50"
                      >
                        Remover foto
                      </button>
                    </div>
                  </div>
                  {fotoAviso ? (
                    <div className="mt-3 rounded-2xl border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-blue-800">
                      {fotoAviso}
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 grid gap-4">
                  <Field label="Nome completo">
                    <input
                      value={profile.nome}
                      onChange={(e) => setProfile((p) => ({ ...p, nome: e.target.value }))}
                      placeholder="Seu nome"
                      className={inputClass()}
                    />
                  </Field>

                  <Field label="Telefone">
                    <div className="grid grid-cols-[132px_1fr] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-blue-100">
                      <div className="flex items-center gap-2 border-r border-slate-200 px-4 text-sm font-black text-slate-700">
                        <span>🇧🇷</span>
                        <span>+55</span>
                      </div>
                      <input
                        value={profile.telefone}
                        onChange={(e) => setProfile((p) => ({ ...p, telefone: e.target.value }))}
                        inputMode="tel"
                        placeholder="(21) 99999-9999"
                        className="h-14 w-full bg-transparent px-4 text-sm font-bold text-slate-700 outline-none md:h-16"
                      />
                    </div>
                  </Field>

                  <Field label="E-mail">
                    <input
                      value={profile.email}
                      onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                      type="email"
                      placeholder="voce@email.com"
                      className={inputClass()}
                    />
                  </Field>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="Cidade">
                      <input
                        value={profile.cidade}
                        onChange={(e) => setProfile((p) => ({ ...p, cidade: e.target.value }))}
                        placeholder="Nova Iguacu"
                        className={inputClass()}
                      />
                    </Field>
                    <Field label="Bairro">
                      <input
                        value={profile.bairro}
                        onChange={(e) => setProfile((p) => ({ ...p, bairro: e.target.value }))}
                        placeholder="Centro"
                        className={inputClass()}
                      />
                    </Field>
                  </div>

                  <Field label="Data de nascimento (opcional)">
                    <input
                      value={profile.dataNascimento}
                      onChange={(e) => setProfile((p) => ({ ...p, dataNascimento: e.target.value }))}
                      type="date"
                      className={inputClass()}
                    />
                  </Field>
                </div>

                <div className="mt-6 flex items-center gap-3 rounded-[22px] border border-blue-200 bg-blue-50 px-4 py-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-100 text-xl text-blue-700">🛡️</div>
                  <div>
                    <div className="text-sm font-black text-blue-700">Suas informacoes estao seguras</div>
                    <div className="text-xs font-bold text-slate-500 md:text-sm">Nao compartilhamos seus dados pessoais com terceiros.</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={salvar}
                  disabled={salvando || fotoSalvando}
                  className="mt-6 h-14 w-full rounded-2xl bg-blue-700 text-base font-black text-white shadow-[0_18px_42px_rgba(37,99,235,0.26)] transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60 active:scale-[0.98] md:h-16 md:rounded-[24px]"
                >
                  {fotoSalvando ? "Salvando foto..." : salvando ? "Salvando..." : salvo ? "Alteracoes salvas" : "Salvar alteracoes"}
                </button>
              </section>
            </div>
          )}

          {tab === "enderecos" && (
            <div className="mx-auto mt-3 max-w-6xl md:mt-5">
              <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_22px_70px_rgba(15,23,42,0.10)] md:rounded-[34px] md:p-8">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setTab("config")}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-2xl font-black text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.96] md:h-16 md:w-16"
                    aria-label="Voltar"
                  >
                    ←
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-black leading-tight text-blue-950 md:text-3xl">Meus endereços</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500 md:text-base">Salve locais para criar pedidos mais rapido.</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4 md:rounded-[30px] md:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-black text-blue-950">
                          {addressEditingId ? "Editar endereco" : "Novo endereco"}
                        </div>
                        <div className="mt-1 text-xs font-bold text-slate-500">Nome, CEP, rua, numero e referencia.</div>
                      </div>
                      <button
                        type="button"
                        onClick={usarLocalizacaoAtual}
                        className="h-10 shrink-0 rounded-xl border border-blue-100 bg-white px-3 text-xs font-black text-blue-700 shadow-sm transition hover:bg-blue-50 active:scale-[0.98]"
                      >
                        Usar localizacao atual
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <Field label="Nome do local">
                        <input
                          value={addressDraft.nomeLocal}
                          onChange={(e) => updateAddressDraft("nomeLocal", e.target.value)}
                          placeholder="Casa, trabalho, cliente..."
                          className={inputClass()}
                        />
                      </Field>
                      <Field label="CEP">
                        <input
                          value={addressDraft.cep}
                          onChange={(e) => updateAddressDraft("cep", e.target.value)}
                          inputMode="numeric"
                          placeholder="00000-000"
                          className={inputClass()}
                        />
                      </Field>
                      <Field label="Rua">
                        <input
                          value={addressDraft.rua}
                          onChange={(e) => updateAddressDraft("rua", e.target.value)}
                          placeholder="Rua, avenida..."
                          className={inputClass()}
                        />
                      </Field>
                      <Field label="Numero">
                        <input
                          value={addressDraft.numero}
                          onChange={(e) => updateAddressDraft("numero", e.target.value)}
                          placeholder="123"
                          className={inputClass()}
                        />
                      </Field>
                      <Field label="Complemento">
                        <input
                          value={addressDraft.complemento}
                          onChange={(e) => updateAddressDraft("complemento", e.target.value)}
                          placeholder="Apto, bloco, casa..."
                          className={inputClass()}
                        />
                      </Field>
                      <Field label="Bairro">
                        <input
                          value={addressDraft.bairro}
                          onChange={(e) => updateAddressDraft("bairro", e.target.value)}
                          placeholder="Centro"
                          className={inputClass()}
                        />
                      </Field>
                      <Field label="Cidade">
                        <input
                          value={addressDraft.cidade}
                          onChange={(e) => updateAddressDraft("cidade", e.target.value)}
                          placeholder="Nova Iguacu"
                          className={inputClass()}
                        />
                      </Field>
                      <Field label="Referencia">
                        <input
                          value={addressDraft.referencia}
                          onChange={(e) => updateAddressDraft("referencia", e.target.value)}
                          placeholder="Perto da praca, portao azul..."
                          className={inputClass()}
                        />
                      </Field>
                    </div>

                    {addressAviso ? (
                      <div className="mt-4 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold text-blue-800">
                        {addressAviso}
                      </div>
                    ) : null}

                    <div className="mt-5 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <button
                        type="button"
                        onClick={salvarEndereco}
                        disabled={addressSaving}
                        className="h-12 rounded-2xl bg-blue-700 px-5 text-sm font-black text-white shadow-[0_16px_34px_rgba(37,99,235,0.24)] transition hover:bg-blue-800 active:scale-[0.98] disabled:opacity-60"
                      >
                        {addressSaving ? "Salvando..." : "Salvar endereco"}
                      </button>
                      {addressEditingId ? (
                        <button
                          type="button"
                          onClick={limparEnderecoForm}
                          className="h-12 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-600 transition hover:bg-slate-50"
                        >
                          Cancelar edicao
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-blue-100 bg-blue-50/60 p-4 md:rounded-[30px]">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-black text-blue-950">Enderecos salvos</div>
                        <div className="mt-1 text-xs font-bold text-slate-500">{addresses.length} local(is)</div>
                      </div>
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-xl shadow-sm">📍</div>
                    </div>

                    <div className="mt-4 space-y-3">
                      {addresses.length ? addresses.map((address) => (
                        <article key={address.id} className="rounded-[20px] border border-slate-200 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-blue-950">{address.nomeLocal || address.nome || "Endereco"}</div>
                              <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{addressLine(address)}</div>
                              {address.referencia ? (
                                <div className="mt-2 line-clamp-2 text-[11px] font-bold text-slate-400">{address.referencia}</div>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => editarEndereco(address)}
                              className="h-9 rounded-xl border border-blue-100 bg-blue-50 text-xs font-black text-blue-700"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => removerEndereco(address.id)}
                              disabled={addressSaving}
                              className="h-9 rounded-xl border border-rose-100 bg-rose-50 text-xs font-black text-rose-600 disabled:opacity-60"
                            >
                              Remover
                            </button>
                          </div>
                        </article>
                      )) : (
                        <div className="rounded-[20px] border border-dashed border-blue-200 bg-white/70 px-4 py-8 text-center">
                          <div className="text-3xl">📍</div>
                          <div className="mt-2 text-sm font-black text-blue-950">Nenhum endereco cadastrado</div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">Salve seu primeiro local para usar nos pedidos.</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {tab === "ajuda" && (
            <div className="mx-auto mt-3 max-w-6xl md:mt-5">
              <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-[0_22px_70px_rgba(15,23,42,0.10)] md:rounded-[34px] md:p-8">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setTab("config")}
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-2xl font-black text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-[0.96] md:h-16 md:w-16"
                    aria-label="Voltar"
                  >
                    ←
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-2xl font-black leading-tight text-blue-950 md:text-3xl">Ajuda e suporte</h2>
                    <p className="mt-1 text-sm font-bold text-slate-500 md:text-base">Encontre orientacoes rapidas para usar o Corre Aqui.</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    ["📝", "Como criar um pedido", "Descreva o servico, escolha categoria, valor e publique para pessoas proximas."],
                    ["💼", "Como contratar pelo portfolio", "Abra o perfil profissional, veja servicos, fotos, preco e solicite pelo chat ou agenda."],
                    ["⚡", "Como funcionam os Corres", "Corres aparecem por disponibilidade, reputacao e proximidade para aceitar pedidos rapidos."],
                    ["🛡", "Seguranca e pagamentos", "Combine tudo no chat, registre detalhes e evite enviar dados sensiveis fora do app."],
                    ["⚠", "Problemas com atendimento", "Use o historico, chat e botao de problema para registrar qualquer ocorrencia."],
                  ].map(([icon, title, text]) => (
                    <article key={title} className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)]">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white text-xl shadow-sm">{icon}</div>
                      <div className="mt-4 text-base font-black text-blue-950">{title}</div>
                      <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">{text}</p>
                    </article>
                  ))}
                </div>

                <div className="mt-6 rounded-[24px] border border-blue-100 bg-blue-50/70 p-4 md:rounded-[30px] md:p-5">
                  <div className="grid gap-3 md:grid-cols-3">
                    <button
                      type="button"
                      onClick={() => abrirSuporteAcao("Suporte acionado. Em breve vamos ligar este botao ao canal oficial.")}
                      className="h-12 rounded-2xl bg-blue-700 px-4 text-sm font-black text-white shadow-[0_16px_34px_rgba(37,99,235,0.22)] transition hover:bg-blue-800 active:scale-[0.98]"
                    >
                      Falar com suporte
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirSuporteAcao("Envio de problema preparado. Use tambem a area de problemas do atendimento.")}
                      className="h-12 rounded-2xl border border-amber-200 bg-white px-4 text-sm font-black text-amber-700 transition hover:bg-amber-50 active:scale-[0.98]"
                    >
                      Enviar problema
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirSuporteAcao("Perguntas frequentes em preparacao: pedidos, portfolio, agenda, chat e seguranca.")}
                      className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 transition hover:bg-slate-50 active:scale-[0.98]"
                    >
                      Ver perguntas frequentes
                    </button>
                  </div>
                  {supportAviso ? (
                    <div className="mt-4 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-bold text-blue-800">
                      {supportAviso}
                    </div>
                  ) : null}
                </div>
              </section>
            </div>
          )}

          {/* PERFIL */}
          {tab === "perfil" && (
            <div className="mt-3 space-y-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:mt-5 md:space-y-4 md:rounded-[30px] md:p-5">
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
                  className={inputClass("min-h-20 resize-y md:min-h-28")}
                />
              </Field>

              <section className="overflow-hidden rounded-[24px] border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-yellow-50 p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
                      Segurança e confiança
                    </div>
                    <h3 className="mt-1 text-lg font-black text-blue-950">
                      🔒 Construindo uma comunidade confiável
                    </h3>
                    <p className="mt-1 max-w-2xl text-xs font-semibold leading-relaxed text-slate-600">
                      O Corre Aqui usa reputação, histórico e avaliações para aumentar a confiança entre clientes, corres e profissionais.
                    </p>
                  </div>

                  <div className="inline-flex w-fit rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-black text-emerald-700">
                    🟢 Perfil verificado em breve
                  </div>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3 md:mt-4 md:gap-3">
                  {trustItems.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-2xl border border-slate-100 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.07)] md:p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-base md:h-10 md:w-10 md:rounded-2xl md:text-lg">
                          {item.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-black text-slate-950">{item.title}</div>
                          <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{item.text}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 rounded-[22px] border border-blue-100 bg-white p-3 shadow-[0_12px_28px_rgba(15,23,42,0.07)] md:mt-4 md:rounded-[28px] md:p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-black text-slate-950">
                        CPF para verificação de perfil
                      </div>
                      <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                        Em breve, perfis verificados terão mais confiança e destaque.
                      </div>

                      {cpfSalvoMask ? (
                        <div className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-black text-emerald-700">
                          CPF salvo: {cpfSalvoMask}
                        </div>
                      ) : (
                        <div className="mt-2 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-500">
                          Opcional
                        </div>
                      )}

                      {cpfAviso ? (
                        <div className="mt-2 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-800">
                          {cpfAviso}
                        </div>
                      ) : null}
                    </div>

                    <div className="w-full lg:w-72">
                      <input
                        value={cpfDraft}
                        onChange={(e) => {
                          setCpfDraft(formatCpfInput(e.target.value));
                          setCpfAviso("");
                        }}
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder={cpfSalvoMask ? "Atualizar CPF" : "000.000.000-00"}
                        className={inputClass()}
                      />
                      <div className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500">
                        O app não pede documento ou selfie nesta etapa.
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* CONFIG */}
          {tab === "config" && (
            <ConfiguracoesOrganizadas
              profile={profile}
              privacy={privacy}
              sections={configSecoesAbertas}
              onToggleSection={toggleConfigSection}
              onBack={onClose}
              onProfileChange={(changes) => setProfile((prev) => ({ ...prev, ...changes }))}
              onMapLimitChange={(value) => setProfile((prev) => ({ ...prev, mapLimiteOnline: value }))}
              onPrivacyChange={setPrivacyPreference}
              onNotificationChange={setNotificationPreference}
              onOpenDados={() => setTab("dados")}
              onLogout={sairDaConta}
              onTogglePush={(checked) => (checked ? ativarPush() : desativarPush())}
              onTestPush={testarPush}
              pushAtivo={pushAtivo}
              pushCanUse={pushCanUse}
              pushSalvando={pushSalvando}
              pushTestando={pushTestando}
              pushAviso={pushAviso}
              configAviso={configAviso}
            />
          )}

          {false && tab === "config" && (
            <div className="mt-3 space-y-3 md:mt-5 md:space-y-4">
              <div className="hidden rounded-[24px] bg-[linear-gradient(135deg,#0b73ff_0%,#18bfd2_52%,#ffe36b_100%)] p-4 text-white shadow-[0_22px_60px_rgba(37,99,235,0.18)] md:rounded-[32px] md:p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/90 text-lg text-blue-700 shadow-lg md:h-12 md:w-12 md:rounded-2xl md:text-xl">
                      ⚙️
                    </div>
                    <div>
                      <div className="text-base font-black text-white md:text-lg">Configurações</div>
                      <div className="text-xs font-semibold text-white/82 md:text-sm">
                        Ajuste presença, notificações, mapa e experiência.
                      </div>
                    </div>
                  </div>

                  <div className="rounded-full bg-[#ffd91a] px-4 py-2 text-xs font-black text-blue-950 shadow-[0_10px_22px_rgba(15,23,42,0.12)] md:px-5 md:py-3 md:text-sm">
                    Mapa limpo por padrão
                  </div>
                </div>
              </div>

              <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_16px_38px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-600 text-lg text-white shadow-[0_12px_26px_rgba(37,99,235,0.22)]">👤</div>
                    <div>
                      <div className="text-base font-black text-blue-950">Presenca</div>
                      <div className="text-xs font-semibold text-slate-500">Controle sua visibilidade e como voce aparece para os outros.</div>
                    </div>
                  </div>
                  <div className="text-lg font-black text-blue-950">⌄</div>
                </div>
              <div className="grid gap-3 lg:grid-cols-2 md:gap-4">
                <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_16px_38px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Presença</div>

                  <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 md:mt-4 md:gap-4 md:px-4 md:py-4">
                    <div>
                      <div className="text-sm font-extrabold text-slate-950">Visível no mapa</div>
                      <div className="text-xs font-semibold text-slate-500">Permite aparecer como disponível para clientes próximos.</div>
                    </div>
                    <ToggleSwitch
                      checked={profile.visivel !== false}
                      onChange={(checked) => setProfile((p) => ({ ...p, visivel: checked }))}
                      label="Alterar visibilidade no mapa"
                      tone="emerald"
                    />
                  </label>

                  <label className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 md:mt-3 md:gap-4 md:px-4 md:py-4">
                    <div>
                      <div className="text-sm font-extrabold text-slate-950">Notificações</div>
                      <div className="text-xs font-semibold text-slate-500">Pedidos, chat, aceite, conclusão e avaliações.</div>
                    </div>
                    <ToggleSwitch
                      checked={profile.notificacoes}
                      onChange={(checked) => setProfile((p) => ({ ...p, notificacoes: checked }))}
                      label="Alterar notificacoes"
                      tone="blue"
                    />
                  </label>

                  <div className="mt-2.5 rounded-[22px] border border-blue-100 bg-blue-50 px-3 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.06)] md:mt-3 md:rounded-[28px] md:px-4 md:py-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-base shadow-sm md:h-10 md:w-10 md:rounded-2xl md:text-lg">
                            🔔
                          </div>
                          <div>
                            <div className="text-sm font-extrabold text-slate-950">Notificações</div>
                            <div className="mt-0.5 text-xs font-semibold leading-relaxed text-slate-500">
                              Receba avisos de chat, aceite, conclusão e avaliação.
                            </div>
                          </div>
                        </div>

                        <div className={`mt-3 inline-flex rounded-full border px-3 py-1.5 text-xs font-black ${pushStatusClass}`}>
                          Status da permissão: {pushStatusLabel}
                        </div>

                        {!pushCanUse && pushReason ? (
                          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
                            {pushReason}
                          </div>
                        ) : null}

                        {pushAviso ? (
                          <div className="mt-2 rounded-2xl border border-blue-100 bg-white px-3 py-2 text-[11px] font-bold text-blue-800">
                            {pushAviso}
                          </div>
                        ) : null}
                      </div>

                      <div className="grid shrink-0 gap-2 sm:min-w-48">
                        <button
                          type="button"
                          onClick={ativarPush}
                          disabled={pushSalvando || pushTestando || !pushCanUse}
                          className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 md:h-11 md:rounded-2xl"
                        >
                          {pushSalvando ? "Ativando..." : "Ativar notificações"}
                        </button>

                        <button
                          type="button"
                          onClick={testarPush}
                          disabled={pushSalvando || pushTestando || !pushCanUse}
                          className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 md:h-11 md:rounded-2xl"
                        >
                          {pushTestando ? "Enviando..." : "Testar notificação"}
                        </button>

                        {pushAtivo ? (
                          <button
                            type="button"
                            onClick={desativarPush}
                            disabled={pushSalvando || pushTestando}
                            className="h-9 rounded-xl border border-slate-200 bg-transparent px-4 text-xs font-black text-slate-500 transition hover:bg-white hover:text-slate-800 disabled:opacity-50 md:h-10 md:rounded-2xl"
                          >
                            Desativar
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_16px_38px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Mapa ao vivo</div>

                  <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 md:mt-4 md:gap-4 md:px-4 md:py-4">
                    <div>
                      <div className="text-sm font-extrabold text-slate-950">Mostrar pessoas online</div>
                      <div className="text-xs font-semibold text-slate-500">Mantido desligado para o mapa ficar mais limpo.</div>
                    </div>
                    <ToggleSwitch
                      checked={profile.mapMostrarOnline}
                      onChange={(checked) => setProfile((p) => ({ ...p, mapMostrarOnline: checked }))}
                      label="Mostrar pessoas online"
                      tone="cyan"
                    />
                  </label>

                  <label className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 md:mt-3 md:gap-4 md:px-4 md:py-4">
                    <div>
                      <div className="text-sm font-extrabold text-slate-950">Atualização ao vivo</div>
                      <div className="text-xs font-semibold text-slate-500">Atualiza marcadores automaticamente quando ativado.</div>
                    </div>
                    <ToggleSwitch
                      checked={profile.mapAoVivo}
                      onChange={(checked) => setProfile((p) => ({ ...p, mapAoVivo: checked }))}
                      label="Alterar atualizacao ao vivo"
                      tone="cyan"
                    />
                  </label>

                  <label className="mt-3 block rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 md:mt-4 md:px-4 md:py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-extrabold text-slate-950">Limite de marcadores</div>
                        <div className="text-xs font-semibold text-slate-500">Use pouco para manter o mapa leve.</div>
                      </div>
                      <div className="rounded-full bg-[#ffd91a] px-3 py-1 text-sm font-black text-blue-950">
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

              </section>

              <section className="overflow-hidden rounded-[26px] border border-blue-100 bg-white shadow-[0_18px_48px_rgba(37,99,235,0.10)] md:rounded-[32px]">
                <div className="flex flex-col gap-3 border-b border-blue-50 bg-gradient-to-r from-blue-50 via-white to-yellow-50 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Privacidade</div>
                    <div className="mt-1 text-lg font-black leading-tight text-blue-950">Controle rapido da sua presenca</div>
                    <div className="mt-1 max-w-2xl text-xs font-bold leading-relaxed text-slate-500">
                      Perfil, localizacao, status online e dados pessoais em um so lugar.
                    </div>
                  </div>
                  <div className="flex w-fit items-center gap-2 rounded-2xl border border-blue-100 bg-white px-3 py-2 text-xs font-black text-blue-700 shadow-sm">
                    🔒
                  </div>
                </div>

                <div className="grid gap-3 p-3 md:p-4 xl:grid-cols-2">
                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-sm">👁️</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-950">Visibilidade do perfil</div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                          Decide se voce aparece em listas publicas.
                        </div>
                        <div className="mt-3 grid grid-cols-2 rounded-2xl bg-white p-1 ring-1 ring-slate-200">
                          <button
                            type="button"
                            onClick={() => setPrivacyPreference("profileVisible", true)}
                            className={[
                              "h-9 rounded-xl text-xs font-black transition active:scale-[0.98]",
                              privacy.profileVisible ? "bg-blue-600 text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)]" : "text-slate-500",
                            ].join(" ")}
                          >
                            Publico
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrivacyPreference("profileVisible", false)}
                            className={[
                              "h-9 rounded-xl text-xs font-black transition active:scale-[0.98]",
                              !privacy.profileVisible ? "bg-slate-950 text-white shadow-[0_10px_22px_rgba(15,23,42,0.18)]" : "text-slate-500",
                            ].join(" ")}
                          >
                            Privado
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-sm">📍</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-950">Localizacao</div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                          Usada somente durante corre ativo.
                        </div>
                        <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
                          <span className="text-xs font-black text-slate-700">Compartilhar durante corre ativo</span>
                          <ToggleSwitch
                            checked={privacy.shareLocationDuringActiveJob}
                            onChange={(checked) => setPrivacyPreference("shareLocationDuringActiveJob", checked)}
                            label="Compartilhar localizacao durante corre ativo"
                            tone="blue"
                          />
                        </label>
                        <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                          Nunca compartilhar em segundo plano.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-sm">🟢</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-950">Status online</div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                          Mostra se voce esta disponivel agora.
                        </div>
                        <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
                          <span className="text-xs font-black text-slate-700">
                            {privacy.showOnlineStatus ? "Mostrar status disponivel" : "Ocultar status online"}
                          </span>
                          <ToggleSwitch
                            checked={privacy.showOnlineStatus}
                            onChange={(checked) => setPrivacyPreference("showOnlineStatus", checked)}
                            label="Mostrar status online"
                            tone="emerald"
                          />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[22px] border border-slate-200 bg-slate-50/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-sm">🔒</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-950">Dados pessoais</div>
                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                          Dados sensiveis ficam protegidos.
                        </div>
                        <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-slate-200">
                          <span className="text-xs font-black text-slate-700">Permitir contato publico</span>
                          <ToggleSwitch
                            checked={privacy.allowPublicContact}
                            onChange={(checked) => setPrivacyPreference("allowPublicContact", checked)}
                            label="Permitir contato publico"
                            tone="blue"
                          />
                        </label>
                        <div className="mt-3 grid gap-2 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => setPrivacyAviso("Em breve voce podera consultar um resumo dos seus dados salvos.")}
                            className="h-9 rounded-xl bg-blue-600 px-3 text-xs font-black text-white shadow-[0_10px_22px_rgba(37,99,235,0.20)] transition hover:bg-blue-500"
                          >
                            Ver meus dados
                          </button>
                          <button
                            type="button"
                            disabled
                            className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-400"
                          >
                            Excluir em breve
                          </button>
                        </div>
                        {privacyAviso ? (
                          <div className="mt-2 rounded-2xl border border-blue-100 bg-white px-3 py-2 text-xs font-bold text-blue-800">
                            {privacyAviso}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_16px_38px_rgba(15,23,42,0.08)] md:rounded-[28px] md:p-4">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Experiência</div>
                <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 md:mt-4 md:gap-4 md:px-4 md:py-4">
                  <div>
                    <div className="text-sm font-extrabold text-slate-950">Animações da interface</div>
                    <div className="text-xs font-semibold text-slate-500">Mantém transições e feedbacks de XP/patente mais vivos.</div>
                  </div>
                  <ToggleSwitch
                    checked={profile.animacoes}
                    onChange={(checked) => setProfile((p) => ({ ...p, animacoes: checked }))}
                    label="Alterar animacoes da interface"
                    tone="violet"
                  />
                </label>
              </section>

              <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_16px_38px_rgba(15,23,42,0.08)] md:rounded-[28px] md:p-4">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Conta</div>
                <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 md:mt-4 md:px-4 md:py-4">
                  <div className="text-sm font-extrabold text-slate-950">Sessão do app</div>
                  <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                    Use esta opção para sair com segurança deste aparelho.
                  </div>
                  <button
                    type="button"
                    onClick={sairDaConta}
                    className="mt-3 h-10 rounded-xl border border-rose-200 bg-rose-50 px-4 text-xs font-black text-rose-700 transition hover:bg-rose-100 md:h-11 md:rounded-2xl"
                  >
                    Sair da conta
                  </button>
                </div>
              </section>
              </div>
              <div className="flex items-center gap-3 rounded-[22px] border border-blue-200 bg-blue-50/80 px-4 py-3 shadow-[0_12px_30px_rgba(37,99,235,0.08)]">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-sm">💡</div>
                <div>
                  <div className="text-sm font-black text-blue-950">Dica rapida</div>
                  <div className="text-xs font-semibold text-slate-600">Mantenha suas configuracoes atualizadas para ter a melhor experiencia no app.</div>
                </div>
              </div>
            </div>
          )}

          {/* CORRE */}
          {tab === "corre" && (
            <div className="mt-3 rounded-[20px] bg-[#0b1628] border border-white/10 p-3 space-y-3 md:mt-5 md:rounded-[28px] md:p-4 md:space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/70 border border-white/10 px-3 py-3 md:gap-4 md:rounded-2xl md:px-4">
                <div>
                  <div className="text-sm font-extrabold text-white">
                    Ativar currículo de Corre
                  </div>
                  <div className="text-xs text-slate-400">
                    Apareça para bicos rápidos e pedidos do bairro.
                  </div>
                </div>
                <ToggleSwitch
                  checked={profile.isCorre}
                  onChange={(checked) => setProfile((p) => ({ ...p, isCorre: checked }))}
                  label="Ativar curriculo de Corre"
                  tone="blue"
                />
              </label>

              {profile.isCorre && (
                <div className="space-y-3 md:space-y-4">
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
                      className={inputClass("min-h-20 resize-y md:min-h-28")}
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:gap-3">
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

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:gap-3">
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
            <div className="min-h-[calc(100dvh-7rem)] space-y-3 md:space-y-4">
              {!currentProfSection ? (
              <>
              <section className="overflow-hidden rounded-[24px] border border-white/10 bg-[#0b1628] p-3 text-white shadow-[0_22px_70px_rgba(15,23,42,0.20)] md:rounded-[32px] md:p-5">
                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/10 text-lg font-black transition hover:bg-white/15"
                    title="Voltar para perfil"
                  >
                    ←
                  </button>
                  <div className="text-sm font-black md:text-base">Perfil Corre/Profissional</div>
                  <button
                    type="button"
                    onClick={() => setProfSection("config")}
                    className="grid h-10 w-10 place-items-center rounded-2xl border border-white/10 bg-white/10 text-lg font-black transition hover:bg-white/15"
                    title="Configurações"
                  >
                    ⚙
                  </button>
                </div>

                <div className="mt-5 flex flex-col items-center text-center">
                  {fotoPrincipal ? (
                    <div
                      className="h-20 w-20 rounded-full border-4 border-white/15 bg-cover bg-center shadow-[0_16px_38px_rgba(0,0,0,0.28)] md:h-24 md:w-24"
                      style={{ backgroundImage: `url(${JSON.stringify(fotoPrincipal)})` }}
                      aria-label="Foto do perfil profissional"
                    />
                  ) : (
                    <div className="grid h-20 w-20 place-items-center rounded-full border-4 border-white/15 bg-white/90 text-3xl text-blue-700 shadow-[0_16px_38px_rgba(0,0,0,0.28)] md:h-24 md:w-24">
                      {profile.avatarEmoji || "👤"}
                    </div>
                  )}

                  <div className="mt-3 text-xl font-black md:text-2xl">
                    {profile.nome || "Seu nome"}
                    {perfilVerificadoOficial ? <span className="ml-1 text-[#ffd91a]">✓</span> : null}
                  </div>

                  <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5 text-xs font-bold text-slate-300">
                    <span className="rounded-full bg-[#ffd91a] px-2.5 py-1 font-black text-blue-950">
                      {serviceStats.notaMedia ? `★ ${serviceStats.notaMedia.toFixed(1)}` : "Sem nota"}
                      {serviceStats.avaliacoes ? ` (${serviceStats.avaliacoes})` : ""}
                    </span>
                    <span>{profile.titulo || "Profissional local"}</span>
                  </div>

                  <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-500/12 px-3 py-1 text-xs font-black text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.75)]" />
                    {profile.statusProfissional === "em_servico" ? "Em serviço" : profile.visivel ? "Online" : "Oculto"}
                  </div>

                  <div className="mt-5 grid w-full grid-cols-2 gap-2 md:grid-cols-4">
                    {[
                      ["Ganhos", formatMoneyBR(serviceStats.ganhosTotal)],
                      ["Como Corre", formatMoneyBR(serviceStats.ganhosCorreTotal)],
                      ["Como Pro", formatMoneyBR(serviceStats.ganhosProfTotal)],
                      ["Serviços", serviceStats.comoCorre + serviceStats.comoProfissional],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.06] px-2 py-2">
                        <div className="truncate text-base font-black md:text-lg">{value}</div>
                        <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[24px]">
                {[
                  ["perfilProfissional", "Meu perfil profissional", "Como voce trabalha no Corre Aqui."],
                  ["portfolio", "Portfólio de serviços", "Serviços, preço, região e experiência."],
                  ["avaliacoes", "Avaliações", "Nota, histórico e reputação."],
                  ["patentes", "Patentes", "Niveis de experiencia e confianca."],
                  ["config", "Configurações", "Conta, seguranca e privacidade."],
                  ["ajuda", "Ajuda", "Duvidas e suporte."],
                ].map(([id, label, desc], index, arr) => {
                  const active = currentProfSection === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setProfSection(id);
                        if (id === "perfilProfissional") setProfessionalProfileStep("choice");
                      }}
                      className={[
                        "group flex w-full items-center gap-3 px-4 py-2.5 text-left transition md:gap-4 md:px-5 md:py-3",
                        index < arr.length - 1 ? "border-b border-slate-100" : "",
                        active ? "bg-slate-50 text-blue-950" : "text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center text-slate-600 transition group-hover:text-blue-700 md:h-8 md:w-8">
                        <ProfMenuIcon id={id} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-black leading-tight text-slate-950 md:text-base">{label}</span>
                        <span className="mt-0.5 block truncate text-[11px] font-semibold leading-tight text-slate-500 md:text-sm">{desc}</span>
                      </span>
                      <span className="grid h-6 w-6 shrink-0 place-items-center text-xl font-light text-slate-500 transition group-hover:text-blue-700 md:h-7 md:w-7 md:text-2xl">›</span>
                    </button>
                  );
                })}
              </section>

              </>
              ) : (
              <>
              {currentProfSection !== "perfilProfissional" && (
              <section className="rounded-[24px] border border-white/10 bg-[#0b1628] p-3 text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)] md:rounded-[30px] md:p-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/10 text-lg font-black transition hover:bg-white/15"
                    title="Voltar"
                  >
                    ←
                  </button>
                  <div className="min-w-0">
                    <div className="truncate text-base font-black">{profPage.title}</div>
                    <div className="mt-0.5 truncate text-xs font-semibold text-slate-400">{profPage.desc}</div>
                  </div>
                </div>
              </section>
              )}

              {currentProfSection === "perfilProfissional" && (
                <section className="mx-auto w-full max-w-[430px] rounded-[26px] border border-slate-200 bg-white p-4 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,0.16)] md:max-w-[520px] md:rounded-[32px] md:p-5">
                  <div className="flex h-10 items-center justify-between">
                    <button
                      type="button"
                      onClick={onClose}
                      className="grid h-10 w-10 place-items-center rounded-full text-xl font-black text-blue-950 transition hover:bg-slate-50"
                      title="Voltar"
                    >
                      ‹
                    </button>
                    <div className="text-sm font-black text-blue-950 md:text-base">Meu perfil profissional</div>
                    <button
                      type="button"
                      className="grid h-10 w-10 place-items-center rounded-full text-sm font-black text-blue-950 transition hover:bg-slate-50"
                      title="Informacoes"
                    >
                      i
                    </button>
                  </div>

                  {professionalProfileStep === "choice" && (
                    <div className="pt-8">
                      <h3 className="text-xl font-black leading-tight text-blue-950 md:text-2xl">Como você trabalha?</h3>
                      <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">Selecione o que melhor te representa.</p>

                      <div className="mt-6 space-y-3">
                        {[
                          {
                            id: "corre",
                            icon: "corre",
                            title: "Corre rápido",
                            desc: "Entregas, compras e serviços rápidos",
                            tone: "bg-blue-600 text-white",
                          },
                          {
                            id: "profissional",
                            icon: "profissional",
                            title: "Profissional",
                            desc: "Serviços profissionais e agendamentos",
                            tone: "bg-emerald-500 text-white",
                          },
                          {
                            id: "ambos",
                            icon: "ambos",
                            title: "Ambos",
                            desc: "Quero atuar como corre e profissional",
                            tone: "bg-violet-500 text-white",
                          },
                        ].map((option) => {
                          const active = selectedWorkMode === option.id;
                          return (
                            <button
                              key={option.id}
                              type="button"
                              onClick={() => setProfessionalWorkMode(option.id)}
                              className={[
                                "flex min-h-[88px] w-full items-center gap-4 rounded-[18px] border bg-white p-3 text-left transition active:scale-[0.99]",
                                active ? "border-blue-200 shadow-[0_16px_35px_rgba(37,99,235,0.10)]" : "border-slate-200 hover:border-blue-100",
                              ].join(" ")}
                            >
                              <span className={["grid h-12 w-12 shrink-0 place-items-center rounded-full shadow-[0_10px_24px_rgba(15,23,42,0.12)]", option.tone].join(" ")}>
                                <WorkModeIcon type={option.icon} />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm font-black text-blue-950">{option.title}</span>
                                <span className="mt-1 block text-xs font-semibold leading-snug text-slate-500">{option.desc}</span>
                              </span>
                              <span className={["grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", active ? "border-blue-600" : "border-slate-300"].join(" ")}>
                                {active ? <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> : null}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={() => goProfessionalProfileStep("form")}
                        className="mt-12 h-12 w-full rounded-xl bg-blue-700 text-sm font-black text-white shadow-[0_14px_26px_rgba(37,99,235,0.24)] transition hover:bg-blue-800 active:scale-[0.98]"
                      >
                        Continuar
                      </button>
                    </div>
                  )}

                  {professionalProfileStep === "form" && (
                    <div className="space-y-5 pt-8">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-black text-blue-950">Corre rápido <span className="font-semibold text-slate-400">(opcional)</span></div>
                          <MiniSwitch
                            checked={profile.isCorre}
                            onChange={(checked) => setProfessionalProfileType("isCorre", checked)}
                            label="Ativar Corre rapido"
                          />
                        </div>

                        {profile.isCorre && (
                          <div className="space-y-3">
                            <Field label="Transporte">
                              <select
                                value={profile.correTransporte}
                                onChange={(e) => setProfile((p) => ({ ...p, correTransporte: e.target.value }))}
                                className={inputClass("h-12")}
                              >
                                <option value="" className="text-black">Selecione</option>
                                <option value="A pé" className="text-black">A pé</option>
                                <option value="Bike" className="text-black">Bike</option>
                                <option value="Moto" className="text-black">Moto</option>
                                <option value="Carro" className="text-black">Carro</option>
                                <option value="Van" className="text-black">Van</option>
                              </select>
                            </Field>

                            <Field label="Região principal">
                              <input
                                value={profile.correRegiao}
                                onChange={(e) => setProfile((p) => ({ ...p, correRegiao: e.target.value }))}
                                placeholder="Nova Iguaçu - RJ"
                                className={inputClass("h-12")}
                              />
                            </Field>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3 border-t border-slate-100 pt-5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm font-black text-blue-950">Serviços profissionais <span className="font-semibold text-slate-400">(opcional)</span></div>
                          <MiniSwitch
                            checked={profile.isProfissional}
                            onChange={(checked) => setProfessionalProfileType("isProfissional", checked)}
                            label="Ativar servicos profissionais"
                          />
                        </div>

                        {profile.isProfissional && (
                          <div className="space-y-3">
                            <Field label="Profissão principal">
                              <input
                                value={profile.titulo}
                                onChange={(e) => setProfile((p) => ({ ...p, titulo: e.target.value }))}
                                placeholder="Eletricista"
                                className={inputClass("h-12")}
                              />
                            </Field>

                            <Field label="Resumo do serviço">
                              <textarea
                                value={profile.descricao}
                                onChange={(e) => setProfile((p) => ({ ...p, descricao: e.target.value }))}
                                placeholder="Instalações, manutenções e reparos elétricos."
                                maxLength={120}
                                className={inputClass("min-h-24 resize-none")}
                              />
                              <div className="mt-1 text-right text-[11px] font-bold text-slate-400">
                                {String(profile.descricao || "").length}/120
                              </div>
                            </Field>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={salvarPerfilProfissional}
                        disabled={salvando || fotoSalvando}
                        className="h-12 w-full rounded-xl bg-blue-700 text-sm font-black text-white shadow-[0_14px_26px_rgba(37,99,235,0.24)] transition hover:bg-blue-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {salvando || fotoSalvando ? "Salvando..." : "Salvar perfil"}
                      </button>
                    </div>
                  )}

                  {professionalProfileStep === "saved" && (
                    <div className="pt-10 text-center">
                      <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                        <WorkModeIcon type="check" />
                      </div>
                      <h3 className="mt-5 text-xl font-black text-blue-950">Perfil salvo!</h3>
                      <p className="mx-auto mt-2 max-w-[240px] text-sm font-semibold leading-relaxed text-slate-500">
                        Seu perfil está pronto para aparecer para clientes.
                      </p>

                      <div className="mt-8 space-y-3 text-left">
                        {profile.isCorre && (
                          <div className="flex items-center gap-3 rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue-600 text-white">
                              <WorkModeIcon type="corre" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-black text-blue-950">Corre rápido</div>
                              <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                                {(profile.correTransporte || "Transporte")} • {(profile.correRegiao || profile.cidade || "Região")}
                              </div>
                            </div>
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">Ativo</span>
                          </div>
                        )}

                        {profile.isProfissional && (
                          <div className="flex items-center gap-3 rounded-[18px] border border-slate-200 bg-white p-3 shadow-sm">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                              <WorkModeIcon type="profissional" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-black text-blue-950">Serviços profissionais</div>
                              <div className="mt-0.5 truncate text-xs font-semibold text-slate-500">
                                {profile.titulo || "Profissional"}
                              </div>
                              {profile.descricao ? (
                                <div className="mt-1 line-clamp-2 text-xs font-semibold leading-snug text-slate-500">{profile.descricao}</div>
                              ) : null}
                            </div>
                            <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">Ativo</span>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={onClose}
                        className="mt-8 h-12 w-full rounded-xl bg-blue-700 text-sm font-black text-white shadow-[0_14px_26px_rgba(37,99,235,0.24)] transition hover:bg-blue-800 active:scale-[0.98]"
                      >
                        Ver perfil
                      </button>
                      <button
                        type="button"
                        onClick={() => goProfessionalProfileStep("form")}
                        className="mt-3 w-full text-sm font-black text-blue-700"
                      >
                        Editar perfil
                      </button>
                    </div>
                  )}
                </section>
              )}

              {currentProfSection === "portfolio" && (
                <section className="overflow-hidden rounded-[26px] border border-blue-950/12 bg-white p-3 shadow-[0_22px_70px_rgba(15,23,42,0.10)] ring-1 ring-blue-950/5 md:rounded-[34px] md:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-16 w-20 shrink-0 place-items-center rounded-[22px] border border-blue-100 bg-blue-50 shadow-[0_14px_30px_rgba(37,99,235,0.14)]">
                        <ServiceToolboxIllustration className="h-14 w-20" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="text-lg font-black leading-tight text-blue-950 md:text-2xl">Seu portfólio profissional</h3>
                        <p className="mt-1 text-xs font-bold text-slate-500 md:text-sm">Mostre seus serviços, preços e trabalhos feitos.</p>
                        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-black text-blue-700">
                          <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                          {portfolioItems.length} serviços cadastrados
                        </span>
                      </div>
                    </div>

                    <div className="rounded-[18px] border border-blue-100 bg-blue-50/70 p-3 md:w-[260px]">
                      <div className="flex items-start gap-2">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-white text-blue-700 shadow-sm">✧</span>
                        <div>
                          <div className="text-xs font-black text-blue-700">Dica rápida</div>
                          <p className="mt-0.5 text-[11px] font-bold leading-snug text-slate-500">
                            Perfis com fotos reais recebem até 3x mais contatos.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        icon: "R$",
                        label: "Preço base",
                        value: profile.preco,
                        placeholder: "R$ 50,00",
                        hint: "Valor mínimo de referência",
                        onChange: (value) => setProfile((p) => ({ ...p, preco: value })),
                        tone: "bg-emerald-500 text-white",
                        inputMode: "decimal",
                      },
                      {
                        icon: "☎",
                        label: "WhatsApp",
                        value: profile.whatsapp,
                        placeholder: "(21) 3778-1502",
                        hint: "Para clientes te chamarem",
                        onChange: (value) => setProfile((p) => ({ ...p, whatsapp: value })),
                        tone: "bg-emerald-500 text-white",
                        inputMode: "tel",
                      },
                      {
                        icon: "⌖",
                        label: "Região",
                        value: profile.profRegiao,
                        placeholder: "Nova Iguaçu - RJ",
                        hint: "Onde você atua",
                        onChange: (value) => setProfile((p) => ({ ...p, profRegiao: value })),
                        tone: "bg-blue-600 text-white",
                        inputMode: "text",
                      },
                      {
                        icon: "★",
                        label: "Experiência",
                        value: profile.profExperiencia,
                        placeholder: "5 anos",
                        hint: "Na sua área de atuação",
                        onChange: (value) => setProfile((p) => ({ ...p, profExperiencia: value })),
                        tone: "bg-[#ffd91a] text-blue-950",
                        inputMode: "text",
                      },
                    ].map((card) => (
                      <label key={card.label} className="group block rounded-[18px] border border-slate-100 bg-white p-3 shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition focus-within:border-blue-300 focus-within:ring-4 focus-within:ring-blue-100">
                        <div className="flex items-center justify-between gap-2">
                          <span className={["grid h-9 w-9 place-items-center rounded-2xl text-xs font-black shadow-sm", card.tone].join(" ")}>
                            {card.icon}
                          </span>
                          <span className="grid h-8 w-8 place-items-center rounded-full text-slate-300 transition group-focus-within:bg-blue-50 group-focus-within:text-blue-700">✎</span>
                        </div>
                        <div className="mt-2 text-[11px] font-black text-slate-500">{card.label}</div>
                        <input
                          value={card.value}
                          onChange={(e) => card.onChange(e.target.value)}
                          placeholder={card.placeholder}
                          inputMode={card.inputMode}
                          aria-label={`Editar ${card.label}`}
                          className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-black text-blue-950 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
                        />
                        <div className="mt-1 text-[10px] font-bold text-slate-400">{card.hint}</div>
                      </label>
                    ))}
                  </div>

                  <div
                    ref={portfolioFormRef}
                    className={[
                      "mt-4 scroll-mt-6 rounded-[22px] border bg-white p-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)] transition md:p-4",
                      "border-slate-100",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-700 text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)]">
                        <ServiceBriefcaseIcon className="h-5 w-5" />
                      </span>
                      <div>
                        <div className="text-sm font-black text-blue-950">
                          {portfolioEditingId ? "Editar serviço" : "Novo serviço"}
                        </div>
                        <div className="text-xs font-semibold text-slate-500">Preencha os dados do serviço que você oferece</div>
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-3">
                      <Field label="Nome do serviço">
                        <input
                          ref={portfolioFirstInputRef}
                          value={portfolioDraft.nome || portfolioDraft.titulo}
                          onChange={(e) => updatePortfolioDraft("nome", e.target.value)}
                          placeholder="Ex: Instalação elétrica"
                          className={inputClass("bg-white")}
                        />
                      </Field>
                      <Field label="Categoria">
                        <select
                          value={portfolioDraft.categoriaId}
                          onChange={(e) => {
                            const cat = getCategoryById(e.target.value);
                            setPortfolioDraft((prev) => ({
                              ...prev,
                              categoriaId: e.target.value,
                              categoriaNome: cat?.label || "",
                              categoria: cat?.label || "",
                            }));
                          }}
                          className={inputClass("bg-white")}
                        >
                          <option value="" className="text-black">Selecione</option>
                          {CATEGORIES.map((cat) => (
                            <option key={cat.id} value={cat.id} className="text-black">{cat.emoji} {cat.label}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Valor ou faixa">
                        <input
                          value={portfolioDraft.faixaPreco || portfolioDraft.valor}
                          onChange={(e) => updatePortfolioDraft("faixaPreco", e.target.value)}
                          placeholder="Ex: R$ 100 - R$ 200"
                          className={inputClass("bg-white")}
                        />
                      </Field>
                      <Field label="Descrição curta">
                        <input
                          value={portfolioDraft.descricao}
                          onChange={(e) => updatePortfolioDraft("descricao", e.target.value)}
                          placeholder="Descreva seu serviço em poucas palavras"
                          className={inputClass("bg-white")}
                        />
                      </Field>
                      <Field label="Tempo médio">
                        <input
                          value={portfolioDraft.tempoMedio}
                          onChange={(e) => updatePortfolioDraft("tempoMedio", e.target.value)}
                          placeholder="Ex: 2 horas"
                          className={inputClass("bg-white")}
                        />
                      </Field>
                      <Field label="Região de atendimento">
                        <input
                          value={portfolioDraft.regiao}
                          onChange={(e) => updatePortfolioDraft("regiao", e.target.value)}
                          placeholder="Ex: Nova Iguaçu - RJ"
                          className={inputClass("bg-white")}
                        />
                      </Field>
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2.5 lg:grid-cols-[1fr_2.2fr]">
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:grid-cols-1">
                        {[
                          ["atendeDomicilio", "Atende em domicílio?"],
                          ["urgente", "Serviço urgente?"],
                          ["ativo", "Ativo na vitrine?"],
                        ].map(([field, label]) => (
                          <div key={field} className="rounded-[16px] border border-slate-100 bg-slate-50 p-3">
                            <div className="text-xs font-black text-blue-950">{label}</div>
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              {[true, false].map((value) => (
                                <button
                                  key={String(value)}
                                  type="button"
                                  onClick={() => updatePortfolioDraft(field, value)}
                                  className={[
                                    "h-9 rounded-full border text-xs font-black transition active:scale-[0.98]",
                                    portfolioDraft[field] === value
                                      ? "border-blue-200 bg-blue-50 text-blue-700"
                                      : "border-slate-200 bg-white text-slate-500",
                                  ].join(" ")}
                                >
                                  {value ? "Sim" : "Não"}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-[16px] border border-slate-100 bg-slate-50 p-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <div className="text-xs font-black text-blue-950">Fotos do serviço (até 5)</div>
                            <div className="text-[11px] font-semibold text-slate-500">Mostre fotos reais dos seus trabalhos</div>
                          </div>
                          <label className={["grid h-9 cursor-pointer place-items-center rounded-xl border border-blue-100 bg-white px-4 text-xs font-black text-blue-700 shadow-sm transition active:scale-[0.98]", portfolioPhotoUploading || portfolioDraftFotos.length >= 5 ? "pointer-events-none opacity-60" : ""].join(" ")}>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              disabled={portfolioPhotoUploading || portfolioDraftFotos.length >= 5}
                              className="hidden"
                              onChange={alterarFotoPortfolio}
                            />
                            {portfolioPhotoUploading ? "Enviando..." : "Fotos"}
                          </label>
                        </div>

                        <div className="mt-3 grid grid-cols-5 gap-2">
                          {Array.from({ length: 5 }).map((_, index) => {
                            const foto = portfolioDraftFotos[index];
                            return (
                              <div key={foto || index} className={["relative grid aspect-square place-items-center overflow-hidden rounded-[14px] border text-[10px] font-black", foto ? "border-slate-200 bg-slate-100" : "border-dashed border-blue-200 bg-white text-blue-600"].join(" ")}>
                                {foto ? (
                                  <>
                                    <span
                                      className="h-full w-full bg-cover bg-center"
                                      style={{ backgroundImage: `url(${foto})` }}
                                    />
                                    <button
                                      type="button"
                                      onClick={() => removerFotoPortfolioDraft(foto)}
                                      className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-slate-950/80 text-[10px] font-black text-white"
                                      aria-label="Remover foto"
                                    >
                                      ×
                                    </button>
                                  </>
                                ) : (
                                  index === 0 ? "+ Foto" : "▧"
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {portfolioPhotoError ? (
                          <div className="mt-2 text-xs font-black text-rose-600">{portfolioPhotoError}</div>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      {portfolioEditingId ? (
                        <button
                          type="button"
                        onClick={() => {
                          setPortfolioEditingId("");
                          setPortfolioDraft(createEmptyPortfolioDraft());
                        }}
                          className="h-10 rounded-xl border border-slate-200 bg-white px-5 text-xs font-black text-slate-600 transition active:scale-[0.98]"
                        >
                          Cancelar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={adicionarPortfolioItem}
                        className="h-10 rounded-xl bg-blue-700 px-5 text-xs font-black text-white shadow-[0_12px_26px_rgba(37,99,235,0.24)] transition hover:bg-blue-800 active:scale-[0.98]"
                      >
                        {portfolioEditingId ? "Salvar serviço" : "Adicionar"}
                      </button>
                    </div>
                  </div>

                  {!portfolioItems.length ? (
                    <div className="mt-4 flex flex-col gap-4 rounded-[22px] border border-slate-100 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.07)] md:flex-row md:items-center md:px-8">
                      <div className="relative grid h-32 w-44 shrink-0 place-items-center">
                        <ServiceToolboxIllustration className="h-32 w-44" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-blue-950">Você ainda não cadastrou serviços</div>
                        <p className="mt-1 max-w-xl text-xs font-semibold leading-relaxed text-slate-500">
                          Preencha o formulário acima e finalize pelo botão Adicionar para montar sua vitrine profissional.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-4 rounded-[22px] border border-slate-100 bg-white p-3 shadow-[0_14px_36px_rgba(15,23,42,0.07)] md:p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-black text-blue-950">Seus serviços cadastrados</div>
                        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-black text-blue-700">{portfolioItems.length} serviços</span>
                      </div>
                      <button type="button" className="h-8 w-fit rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-500">
                        Mais recentes
                      </button>
                    </div>

                    {portfolioItems.length ? (
                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {portfolioItems.map((item) => {
                          const cover = item.fotos?.[0] || "";
                          const title = item.nome || item.titulo || "Serviço sem título";
                          const category = item.categoriaNome || item.categoria || "Serviço";
                          const price = item.faixaPreco || item.valor || item.preco || "A combinar";
                          return (
                            <article key={item.id} className="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                              <div className="relative h-32 bg-gradient-to-br from-blue-50 via-slate-100 to-emerald-50">
                                {cover ? (
                                  <span
                                    className="block h-full w-full bg-cover bg-center"
                                    style={{ backgroundImage: `url(${cover})` }}
                                  />
                                ) : (
                                  <div className="grid h-full place-items-center text-3xl text-blue-200">▧</div>
                                )}
                                {item.urgente ? (
                                  <span className="absolute left-2 top-2 rounded-full bg-[#ffd91a] px-2 py-1 text-[10px] font-black text-blue-950">Destaque</span>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => editarPortfolioItem(item)}
                                  className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/95 text-xs font-black text-slate-600 shadow-sm"
                                  aria-label="Editar serviço"
                                >
                                  ⋮
                                </button>
                              </div>
                              <div className="p-3">
                                <div className="line-clamp-1 text-sm font-black text-blue-950">{title}</div>
                                <div className="mt-0.5 text-[11px] font-bold text-slate-500">Em {category}</div>
                                <div className="mt-2 text-sm font-black text-emerald-600">{price}</div>
                                <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-bold text-slate-500">
                                  {item.regiao ? <span>{item.regiao}</span> : null}
                                  {item.tempoMedio ? <span>{item.tempoMedio}</span> : null}
                                  {item.ativo === false ? <span className="text-slate-400">Oculto</span> : null}
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => editarPortfolioItem(item)}
                                    className="h-9 rounded-xl border border-blue-100 bg-blue-50 text-xs font-black text-blue-700"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removerPortfolioItem(item.id)}
                                    className="h-9 rounded-xl border border-rose-100 bg-rose-50 text-xs font-black text-rose-600"
                                  >
                                    Remover
                                  </button>
                                </div>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
                        Nenhum serviço cadastrado ainda.
                      </div>
                    )}
                  </div>

                  <div className="mt-4 flex flex-col gap-2 rounded-[18px] border border-yellow-200 bg-yellow-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs font-bold text-yellow-900">
                      <b>Dica para se destacar:</b> mantenha fotos reais e descrição objetiva para o cliente decidir mais rápido.
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setProfSection("perfilProfissional");
                        setProfessionalProfileStep("choice");
                      }}
                      className="h-9 rounded-xl bg-[#ffd91a] px-4 text-xs font-black text-blue-950 shadow-sm"
                    >
                      Ver meu perfil
                    </button>
                  </div>
                </section>
              )}

              {currentProfSection === "avaliacoes" && (
                <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Avaliações</div>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {[
                      ["Nota", serviceStats.notaMedia ? `${serviceStats.notaMedia.toFixed(1)} ★` : "--"],
                      ["Avaliações", serviceStats.avaliacoes],
                      ["Problemas", serviceStats.problemas],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[18px] border border-slate-100 bg-slate-50 px-2 py-3 text-center">
                        <div className="text-lg font-black text-blue-950">{value}</div>
                        <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">{label}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-3 text-xs font-bold leading-relaxed text-slate-600">
                    As avaliações aparecem após serviços concluídos. Quanto mais histórico positivo, mais confiança o perfil transmite.
                  </div>
                </section>
              )}

              {currentProfSection === "patentes" && (
                <section className="overflow-hidden rounded-[30px] border border-white/10 bg-[#07111F] p-1.5 shadow-[0_24px_70px_rgba(15,23,42,0.28)] md:p-2">
                  <PainelPatentes
                    accountStats={accountStats}
                    serviceStats={serviceStats}
                    isProfissional={profile.isProfissional}
                    onBack={onClose}
                  />
                </section>
              )}

              {currentProfSection === "config" && (
                <section className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Configuracoes</div>
                    <div className="mt-1 text-sm font-bold text-slate-500">Ajuste sua agenda e disponibilidade de atendimento.</div>
                  </div>

                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <div>
                      <div className="text-sm font-black text-blue-950">Agenda aberta</div>
                      <div className="text-xs font-semibold text-slate-500">Permite receber solicitações de horário.</div>
                    </div>
                    <ToggleSwitch
                      checked={profile.agendaAberta}
                      onChange={(checked) => setProfile((p) => ({ ...p, agendaAberta: checked }))}
                      label="Alterar agenda aberta"
                      tone="blue"
                    />
                  </label>

                  <Field label="Status profissional">
                    <select
                      value={profile.statusProfissional}
                      onChange={(e) => setProfile((p) => ({ ...p, statusProfissional: e.target.value }))}
                      className={inputClass()}
                    >
                      <option value="disponivel">Disponível</option>
                      <option value="em_servico">Em serviço</option>
                      <option value="oculto">Oculto</option>
                    </select>
                  </Field>
                </section>
              )}

              {currentProfSection === "ajuda" && (
                <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Central de ajuda</div>
                  <div className="mt-3 grid gap-2">
                    {[
                      "Mantenha o combinado no chat do app.",
                      "Confirme valor, horário e endereço antes de sair.",
                      "Finalize o serviço apenas quando o cliente confirmar.",
                      "Use Problema com serviço se algo sair do combinado.",
                    ].map((item) => (
                      <div key={item} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm font-bold text-slate-700">
                        {item}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              </>
              )}
            </div>
          )}

          {/* MONETIZAÇÃO */}
          {tab === "monetizacao" && (
            <div className="mt-3 space-y-3 md:mt-5 md:space-y-4">
              <div className="rounded-[20px] bg-gradient-to-br from-emerald-500/10 via-[#0b1628] to-blue-500/10 border border-cyan-400/10 p-3 shadow-[0_0_35px_rgba(34,211,238,0.06)] md:rounded-[28px] md:p-4">
                <div className="text-base font-black text-white md:text-lg">
                  💚 Corre Aqui sem taxa
                </div>
                <div className="mt-1 text-xs leading-snug text-slate-300 md:text-sm md:leading-relaxed">
                  O trabalhador fica com 100% do valor do serviço. Recursos premium, anúncios locais e boosts serão preparados com calma, sem cobrança obrigatória agora.
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 md:mt-4 md:gap-3">
                  {[
                    "✨ Premium em breve",
                    "📢 Anúncios locais",
                    "🚀 Boosts futuros",
                  ].map((item) => (
                    <div
                      key={item}
                      className="rounded-xl border border-white/10 bg-slate-900/70 px-3 py-2.5 text-xs font-black text-white md:rounded-2xl md:py-3 md:text-sm"
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[20px] bg-[#0b1628] border border-white/10 p-3 md:rounded-[28px] md:p-4">
                <PlanosCorreAqui
                  planoAtual={profile.plano || "Free"}
                  onSelecionarPlano={(plano) =>
                    setProfile((p) => ({ ...p, plano }))
                  }
                />
              </div>
            </div>
          )}

          {tab !== "dados" && tab !== "config" && (!professionalMode || (currentProfSection && currentProfSection !== "perfilProfissional")) && (
          <button
            onClick={salvar}
            disabled={salvando || fotoSalvando}
            className="
              w-full mt-3 py-3 md:mt-5 md:py-4 rounded-2xl md:rounded-3xl
              bg-[#ffd91a] hover:bg-yellow-300
              text-blue-950 font-black
              shadow-[0_18px_42px_rgba(250,204,21,0.24)]
              disabled:opacity-60 disabled:cursor-not-allowed
              active:scale-[0.98] transition
            "
            type="button"
          >
            {fotoSalvando ? "Salvando foto…" : salvando ? "Salvando…" : salvo ? "Salvo ✅" : "Salvar"}
          </button>
          )}

          <div className="h-8" />

        </div>

        
      </motion.aside>
    </div>
  );
}
