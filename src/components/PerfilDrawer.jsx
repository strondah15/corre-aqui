"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { ref, onValue, update, serverTimestamp } from "firebase/database";
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

const PlanosCorreAqui = dynamic(() => import("@/components/PlanosCorreAqui"), {
  ssr: false,
});

const defaultPrivacy = {
  profileVisible: true,
  shareLocationDuringActiveJob: true,
  showOnlineStatus: true,
  allowPublicContact: false,
};

function normalizePrivacy(value = {}, fallback = {}) {
  return {
    profileVisible: value.profileVisible ?? fallback.profileVisible ?? true,
    shareLocationDuringActiveJob:
      value.shareLocationDuringActiveJob ?? fallback.shareLocationDuringActiveJob ?? true,
    showOnlineStatus: value.showOnlineStatus ?? fallback.showOnlineStatus ?? true,
    allowPublicContact: value.allowPublicContact ?? fallback.allowPublicContact ?? false,
  };
}

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
  profPortfolio: [],
  plano: "Free",
  statusProfissional: "disponivel",
  ocupadoAte: "",
  agendaAberta: true,
  mapMostrarOnline: false,
  mapAoVivo: false,
  mapLimiteOnline: 30,
  animacoes: true,
  privacy: defaultPrivacy,
};

const tabLabel = {
  perfil: "Perfil",
  corre: "Corre",
  profissional: "Corre/Pro",
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
    <div className="mt-5 w-full rounded-[26px] border border-blue-100 bg-white/88 p-4 text-left text-slate-950 shadow-[0_18px_38px_rgba(15,23,42,0.10)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] font-black text-blue-700">
            Crescimento justo
          </div>
          <div className="mt-1 text-sm font-extrabold text-blue-950">
            💚 Sem taxa do app
          </div>
          <div className="mt-1 text-xs leading-relaxed text-slate-600">
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
        className="mt-3 w-full rounded-2xl bg-blue-700 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-blue-800 active:scale-[0.98]"
      >
        Ver recursos em breve
      </button>
      
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

function ProfMenuIcon({ id }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  const icons = {
    perfilPublico: (
      <>
        <path {...common} d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
        <path {...common} d="M4.5 20a7.5 7.5 0 0 1 15 0" />
      </>
    ),
    corre: <path {...common} d="M13 2 5 14h6l-1 8 9-13h-6l1-7Z" />,
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
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      {icons[id] || icons.perfilPublico}
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

function promiseComTimeout(promise, ms, message = "tempo_esgotado") {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise
      .then(resolve)
      .catch(reject)
      .finally(() => window.clearTimeout(timer));
  });
}

export default function PerfilDrawer({ open, onClose, uid, initialTab = "perfil" }) {
  const [tab, setTab] = useState("perfil");
  const [profSection, setProfSection] = useState("");

  const [profile, setProfile] = useState(initialProfile);
  const [portfolioDraft, setPortfolioDraft] = useState(createEmptyPortfolioDraft);
  const [portfolioEditingId, setPortfolioEditingId] = useState("");
  const [portfolioStarterActive, setPortfolioStarterActive] = useState(false);
  const [portfolioPhotoUploading, setPortfolioPhotoUploading] = useState(false);
  const [portfolioPhotoError, setPortfolioPhotoError] = useState("");
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
  const [pushSalvando, setPushSalvando] = useState(false);
  const [pushTestando, setPushTestando] = useState(false);
  const [pushAviso, setPushAviso] = useState("");
  const [cpfDraft, setCpfDraft] = useState("");
  const [cpfSalvoMask, setCpfSalvoMask] = useState("");
  const [cpfAviso, setCpfAviso] = useState("");
  const [privacyAviso, setPrivacyAviso] = useState("");
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

  const userBasePath = useMemo(() => (uid ? `users/${uid}` : ""), [uid]);

  useEffect(() => {
    settingsLoadedRef.current = false;
  }, [open, uid]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab || "perfil");
    setProfSection("");
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || !uid) return;

    const userRef = ref(database, userBasePath);
    return onValue(userRef, (snap) => {
      const data = snap.val() || {};
      const settings = data.settings || {};
      const settingsMapa = settings.mapa || {};
      const settingsUi = settings.ui || {};
      const privacyData = normalizePrivacy(data.privacy, {
        profileVisible: data.visivel ?? data.profile?.visivel,
        showOnlineStatus: data.showOnlineStatus ?? data.profile?.showOnlineStatus,
      });

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
        bio: prev.bio || profileData.bio || data.bio || "",
        fotoURL: prev.fotoURL || fotoPrincipal,
        photoURL: prev.photoURL || fotoPrincipal,
        avatar: prev.avatar || fotoPrincipal || avatarEmoji || "",
        avatarEmoji: prev.avatarEmoji || avatarEmoji,
        profPortfolio: portfolioSalvo.length ? portfolioSalvo : prev.profPortfolio || [],
        visivel: privacyData.profileVisible,
        privacy: privacyData,
      }));

      if (!settingsLoadedRef.current) {
        setProfile((prev) => ({
          ...prev,
          mapMostrarOnline: settingsMapa.mostrarOnline ?? prev.mapMostrarOnline,
          mapAoVivo: settingsMapa.aoVivo ?? prev.mapAoVivo,
          mapLimiteOnline: settingsMapa.limiteOnline ?? prev.mapLimiteOnline,
          animacoes: settingsUi.animacoes ?? prev.animacoes,
          privacy: privacyData,
          visivel: privacyData.profileVisible,
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
        const concluido = String(p?.status || "").toLowerCase() === "concluido";
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
    getPushCapabilities()
      .then((info) => {
        if (!active) return;
        setPushInfo(info);
      })
      .catch((error) => {
        if (!active) return;
        setPushInfo({
          supported: false,
          permission: typeof Notification !== "undefined" ? Notification.permission : "unsupported",
          reason: error?.message || "Push indisponivel neste navegador.",
        });
      });

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
        limiteOnline: Math.max(5, Math.min(120, Number(profile.mapLimiteOnline || 30))),
        atualizadoEm: serverTimestamp(),
      };

      const uiSettings = {
        animacoes: profile.animacoes !== false,
        atualizadoEm: serverTimestamp(),
      };
      const privacySettings = normalizePrivacy(profile.privacy, {
        profileVisible: profile.visivel,
      });
      const privacyPayload = {
        ...privacySettings,
        atualizadoEm: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const fotoPrincipal = pickFoto(profile.fotoURL, profile.photoURL, profile.avatar);
      const profilePublic = { ...profile };
      delete profilePublic.privacy;
      delete profilePublic.cpf;
      delete profilePublic.cpfDigits;
      delete profilePublic.cpfVerificacao;
      delete profilePublic.cpfMasked;
      delete profilePublic.cpfStatus;
      delete profilePublic.documento;
      delete profilePublic.documentoVerificacao;

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
        bio: profile.bio || "",
        visivel: privacySettings.profileVisible,
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
        visivel: privacySettings.profileVisible,
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
  const privacy = normalizePrivacy(profile.privacy, {
    profileVisible: profile.visivel,
  });
  const setPrivacyPreference = (field, value) => {
    setPrivacyAviso("");
    setProfile((prev) => {
      const nextPrivacy = {
        ...normalizePrivacy(prev.privacy, { profileVisible: prev.visivel }),
        [field]: value,
      };
      return {
        ...prev,
        privacy: nextPrivacy,
        ...(field === "profileVisible" ? { visivel: value } : {}),
      };
    });
  };
  const professionalMode = tab === "profissional";
  const taxaConclusaoProf = serviceStats.total
    ? Math.max(0, Math.round(((serviceStats.total - serviceStats.problemas) / serviceStats.total) * 100))
    : 0;
  const portfolioItems = normalizePortfolio(profile.profPortfolio);
  const portfolioDraftFotos = normalizePortfolioFotos(portfolioDraft);
  const profPages = {
    perfilPublico: {
      title: "Meu perfil publico",
      desc: "Dados que aparecem para clientes.",
    },
    corre: {
      title: "Perfil de Corre",
      desc: "Configure seus corres rapidos.",
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
  const profPage = profPages[profSection] || profPages.perfilPublico;
  const drawerPages = {
    perfil: {
      title: "Meu perfil",
      desc: "Dados pessoais, confiança e verificação.",
    },
    config: {
      title: "Ajustes",
      desc: "Presença, notificações, mapa e experiência.",
    },
    monetizacao: {
      title: "Planos",
      desc: "Recursos, anúncios e benefícios do Corre Aqui.",
    },
  };
  const drawerPage = drawerPages[tab] || drawerPages.perfil;
  const updatePortfolioDraft = (field, value) => {
    setPortfolioPhotoError("");
    setPortfolioDraft((prev) => ({ ...prev, [field]: value }));
  };
  const prepararPrimeiroServico = () => {
    setPortfolioEditingId("");
    setPortfolioPhotoError("");
    setPortfolioStarterActive(true);
    setPortfolioDraft({
      ...createEmptyPortfolioDraft(),
      regiao: profile.profRegiao || profile.cidade || "",
      ativo: true,
      atendeDomicilio: true,
    });

    window.setTimeout(() => {
      const drawer = drawerScrollRef.current;
      const form = portfolioFormRef.current;

      if (drawer && form) {
        const drawerBox = drawer.getBoundingClientRect();
        const formBox = form.getBoundingClientRect();
        const targetTop = Math.max(0, drawer.scrollTop + formBox.top - drawerBox.top - 18);
        drawer.scrollTo({ top: targetTop, behavior: "smooth" });
      } else {
        form?.scrollIntoView({ behavior: "smooth", block: "start" });
      }

      window.setTimeout(() => {
        portfolioFirstInputRef.current?.focus();
      }, 180);
    }, 60);
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
    setPortfolioStarterActive(false);
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
    setPortfolioStarterActive(false);
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
        {!professionalMode && (
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
          {!professionalMode && (
          <div className="overflow-hidden rounded-[28px] bg-[linear-gradient(135deg,#0b73ff_0%,#18bfd2_48%,#ffe36b_100%)] p-3 text-white shadow-[0_22px_70px_rgba(37,99,235,0.22)] md:rounded-[36px] md:p-6">
            <div className="flex flex-col items-center text-center">
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
          {!professionalMode && (
          <div className="mt-3 rounded-[24px] border border-slate-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.10)] md:mt-5 md:rounded-[30px] md:p-2">
            <div className="grid grid-cols-3 gap-1.5 md:gap-2">
              {["perfil", "config", "monetizacao"].map(
                (t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    type="button"
                    className={[
                      "group min-h-[54px] rounded-[16px] px-1.5 py-2 text-center border transition-all duration-200 active:scale-[0.96] md:min-h-[72px] md:rounded-[24px] md:px-2 md:py-3",
                      "flex flex-col items-center justify-center gap-1",
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
            <div className="mt-3 space-y-3 md:mt-5 md:space-y-4">
              <div className="rounded-[24px] bg-[linear-gradient(135deg,#0b73ff_0%,#18bfd2_52%,#ffe36b_100%)] p-4 text-white shadow-[0_22px_60px_rgba(37,99,235,0.18)] md:rounded-[32px] md:p-6">
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

              <div className="grid gap-3 lg:grid-cols-2 md:gap-4">
                <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_16px_38px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Presença</div>

                  <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 md:mt-4 md:gap-4 md:px-4 md:py-4">
                    <div>
                      <div className="text-sm font-extrabold text-slate-950">Visível no mapa</div>
                      <div className="text-xs font-semibold text-slate-500">Permite aparecer como disponível para clientes próximos.</div>
                    </div>
                    <ToggleSwitch
                      checked={privacy.profileVisible}
                      onChange={(checked) => setPrivacyPreference("profileVisible", checked)}
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

                        {!pushInfo.supported && pushInfo.reason ? (
                          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800">
                            {pushInfo.reason}
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
                          disabled={pushSalvando || pushTestando || !pushInfo.supported}
                          className="h-10 rounded-xl bg-blue-600 px-4 text-xs font-black text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 md:h-11 md:rounded-2xl"
                        >
                          {pushSalvando ? "Ativando..." : "Ativar notificações"}
                        </button>

                        <button
                          type="button"
                          onClick={testarPush}
                          disabled={pushSalvando || pushTestando || !pushInfo.supported}
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

              <section className="rounded-[24px] border border-blue-100 bg-white p-3 shadow-[0_16px_38px_rgba(37,99,235,0.10)] md:rounded-[30px] md:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Privacidade</div>
                    <div className="mt-1 text-sm font-bold text-slate-500">
                      Controle como seu perfil, localizacao e status aparecem no Corre Aqui.
                    </div>
                  </div>
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-xl text-blue-700 ring-1 ring-blue-100">
                    🔒
                  </div>
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[20px] border border-slate-100 bg-slate-50 p-3 md:rounded-[24px] md:p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-sm">👁️</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-950">Visibilidade do perfil</div>
                        <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                          Publico aparece quando voce estiver disponivel. Privado nao entra em listas publicas.
                        </div>
                        <div className="mt-3 grid grid-cols-2 rounded-2xl bg-white p-1 ring-1 ring-slate-200">
                          <button
                            type="button"
                            onClick={() => setPrivacyPreference("profileVisible", true)}
                            className={[
                              "h-10 rounded-xl text-xs font-black transition active:scale-[0.98]",
                              privacy.profileVisible ? "bg-blue-600 text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)]" : "text-slate-500",
                            ].join(" ")}
                          >
                            Publico
                          </button>
                          <button
                            type="button"
                            onClick={() => setPrivacyPreference("profileVisible", false)}
                            className={[
                              "h-10 rounded-xl text-xs font-black transition active:scale-[0.98]",
                              !privacy.profileVisible ? "bg-slate-950 text-white shadow-[0_10px_22px_rgba(15,23,42,0.18)]" : "text-slate-500",
                            ].join(" ")}
                          >
                            Privado
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-slate-100 bg-slate-50 p-3 md:rounded-[24px] md:p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-sm">📍</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-950">Localizacao</div>
                        <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                          Sua localizacao so deve ser usada durante um corre ativo.
                        </div>
                        <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 ring-1 ring-slate-200">
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

                  <div className="rounded-[20px] border border-slate-100 bg-slate-50 p-3 md:rounded-[24px] md:p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-sm">🟢</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-950">Status online</div>
                        <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                          Escolha se outras pessoas podem ver que voce esta disponivel.
                        </div>
                        <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 ring-1 ring-slate-200">
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

                  <div className="rounded-[20px] border border-slate-100 bg-slate-50 p-3 md:rounded-[24px] md:p-4">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white text-lg shadow-sm">🔒</div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-slate-950">Dados pessoais</div>
                        <div className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                          Documentos e dados sensiveis ficam protegidos na area privada da conta.
                        </div>
                        <label className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 ring-1 ring-slate-200">
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
                            className="h-10 rounded-xl bg-blue-600 px-3 text-xs font-black text-white transition hover:bg-blue-500 md:rounded-2xl"
                          >
                            Ver meus dados
                          </button>
                          <button
                            type="button"
                            disabled
                            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-400 md:rounded-2xl"
                          >
                            Excluir conta em breve
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

              <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_16px_38px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
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

              <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_16px_38px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
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
              {!profSection ? (
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

              <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-3">
                {[
                  ["perfilPublico", "Meu perfil público", "Como clientes veem seu perfil.", "from-purple-500 via-violet-500 to-indigo-700"],
                  ["corre", "Perfil de Corre", "Título, transporte e disponibilidade.", "from-yellow-300 via-orange-400 to-orange-600"],
                  ["portfolio", "Portfólio de serviços", "Serviços, preço, região e experiência.", "from-sky-400 via-blue-500 to-blue-700"],
                  ["avaliacoes", "Avaliações", "Nota, histórico e reputação.", "from-yellow-300 via-amber-400 to-orange-500"],
                  ["patentes", "Patentes Corre/Pro", "Níveis de experiência e confiança.", "from-yellow-300 via-amber-400 to-orange-500"],
                  ["config", "Configurações", "Disponibilidade e agenda.", "from-slate-300 via-slate-500 to-slate-700"],
                  ["ajuda", "Central de ajuda", "Boas práticas e segurança.", "from-emerald-300 via-teal-500 to-emerald-700"],
                ].map(([id, label, desc, tone]) => {
                  const active = profSection === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setProfSection(id)}
                      className={[
                        "group flex w-full items-center gap-4 rounded-[20px] px-3 py-4 text-left transition md:rounded-[24px] md:px-5 md:py-5",
                        active ? "bg-blue-50 text-blue-950 ring-1 ring-blue-100" : "text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <span className={["grid h-14 w-14 shrink-0 place-items-center rounded-[18px] bg-gradient-to-br text-white shadow-[0_14px_28px_rgba(15,23,42,0.16)] transition group-hover:scale-[1.02] md:h-16 md:w-16 md:rounded-[22px]", tone].join(" ")}>
                        <ProfMenuIcon id={id} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-lg font-black leading-tight text-slate-950 md:text-xl">{label}</span>
                        <span className="mt-1 block text-sm font-semibold leading-snug text-slate-500 md:text-base">{desc}</span>
                      </span>
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-3xl font-light text-slate-500 transition group-hover:bg-slate-100 group-hover:text-blue-700">›</span>
                    </button>
                  );
                })}
              </section>

              </>
              ) : (
              <>
              <section className="rounded-[24px] border border-white/10 bg-[#0b1628] p-3 text-white shadow-[0_18px_45px_rgba(15,23,42,0.16)] md:rounded-[30px] md:p-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setProfSection("")}
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

              {profSection === "perfilPublico" && (
                <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                  <div className="mb-3">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Meu perfil público</div>
                    <div className="mt-1 text-sm font-bold text-slate-500">Essas informações aparecem para clientes quando procuram um profissional.</div>
                  </div>
                  <div className="space-y-3 md:space-y-4">
                    <Field label="Título profissional">
                      <input
                        value={profile.titulo}
                        onChange={(e) => setProfile((p) => ({ ...p, titulo: e.target.value }))}
                        placeholder="Ex: Eletricista, diarista, técnico..."
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="Descrição do serviço">
                      <textarea
                        value={profile.descricao}
                        onChange={(e) => setProfile((p) => ({ ...p, descricao: e.target.value }))}
                        placeholder="Conte o que você faz, região que atende e diferenciais."
                        className={inputClass("min-h-20 resize-y md:min-h-28")}
                      />
                    </Field>
                  </div>

                </section>
              )}

              {profSection === "corre" && (
                <section className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Perfil de Corre</div>
                    <div className="mt-1 text-sm font-bold text-slate-500">Essas informações aparecem para clientes quando procuram corres rápidos.</div>
                  </div>

                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <div>
                      <div className="text-sm font-black text-blue-950">Modo Corre ativo</div>
                      <div className="text-xs font-semibold text-slate-500">Apareça para bicos rápidos, compras, entregas e serviços do bairro.</div>
                    </div>
                    <ToggleSwitch
                      checked={profile.isCorre}
                      onChange={(checked) => setProfile((p) => ({ ...p, isCorre: checked }))}
                      label="Ativar modo Corre"
                      tone="blue"
                    />
                  </label>

                  <Field label="Título do Corre">
                    <input
                      value={profile.correTitulo}
                      onChange={(e) => setProfile((p) => ({ ...p, correTitulo: e.target.value }))}
                      placeholder="Ex: Faço entregas, compras e pequenos serviços"
                      className={inputClass()}
                    />
                  </Field>

                  <Field label="Resumo do Corre">
                    <textarea
                      value={profile.correBio}
                      onChange={(e) => setProfile((p) => ({ ...p, correBio: e.target.value }))}
                      placeholder="Conte que tipo de corre você faz, como trabalha e sua experiência."
                      className={inputClass("min-h-20 resize-y md:min-h-28")}
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:gap-3">
                    <Field label="Transporte">
                      <select
                        value={profile.correTransporte}
                        onChange={(e) => setProfile((p) => ({ ...p, correTransporte: e.target.value }))}
                        className={inputClass()}
                      >
                        <option value="" className="text-black">Selecione</option>
                        <option value="A pé" className="text-black">🚶 A pé</option>
                        <option value="Bike" className="text-black">🚲 Bike</option>
                        <option value="Moto" className="text-black">🏍️ Moto</option>
                        <option value="Carro" className="text-black">🚗 Carro</option>
                        <option value="Van" className="text-black">🚐 Van</option>
                      </select>
                    </Field>

                    <Field label="Região que atende">
                      <input
                        value={profile.correRegiao}
                        onChange={(e) => setProfile((p) => ({ ...p, correRegiao: e.target.value }))}
                        placeholder="Ex: Centro, bairros próximos"
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="Disponibilidade">
                      <input
                        value={profile.correDisponibilidade}
                        onChange={(e) => setProfile((p) => ({ ...p, correDisponibilidade: e.target.value }))}
                        placeholder="Ex: Noites, fins de semana, qualquer hora"
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="Experiência">
                      <input
                        value={profile.correExperiencia}
                        onChange={(e) => setProfile((p) => ({ ...p, correExperiencia: e.target.value }))}
                        placeholder="Ex: 2 anos fazendo entregas e compras"
                        className={inputClass()}
                      />
                    </Field>
                  </div>
                </section>
              )}

              {profSection === "portfolio" && (
                <section className="overflow-hidden rounded-[26px] border border-blue-950/12 bg-white p-3 shadow-[0_22px_70px_rgba(15,23,42,0.10)] ring-1 ring-blue-950/5 md:rounded-[34px] md:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-blue-700 text-xl text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)]">
                        ▣
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
                      portfolioStarterActive ? "border-blue-300 ring-4 ring-blue-100" : "border-slate-100",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-blue-700 text-2xl font-black text-white shadow-[0_12px_24px_rgba(37,99,235,0.24)]">
                        +
                      </span>
                      <div>
                        <div className="text-sm font-black text-blue-950">
                          {portfolioEditingId ? "Editar serviço" : portfolioStarterActive ? "Cadastrar primeiro serviço" : "Adicionar novo serviço"}
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
                            {portfolioPhotoUploading ? "Enviando..." : "Adicionar"}
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
                                  index === 0 ? "+ Adicionar" : "▧"
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
                          setPortfolioStarterActive(false);
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
                        {portfolioEditingId ? "Salvar serviço" : "Adicionar serviço"}
                      </button>
                    </div>
                  </div>

                  {!portfolioItems.length ? (
                    <div className="mt-4 flex flex-col gap-3 rounded-[22px] border border-slate-100 bg-white p-4 shadow-[0_14px_36px_rgba(15,23,42,0.07)] md:flex-row md:items-center md:px-8">
                      <div className="relative h-24 w-32 shrink-0">
                        <div className="absolute bottom-2 left-5 h-12 w-20 rounded-[18px] bg-blue-600 shadow-[0_14px_28px_rgba(37,99,235,0.20)]" />
                        <div className="absolute bottom-9 left-9 h-8 w-12 rounded-t-[18px] border-4 border-blue-300" />
                        <div className="absolute left-4 top-4 rotate-[-18deg] text-2xl">▤</div>
                        <div className="absolute right-3 top-5 rotate-[18deg] text-3xl">🔧</div>
                        <div className="absolute bottom-8 left-12 h-3 w-3 rounded-full bg-[#ffd91a]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black text-blue-950">Você ainda não cadastrou serviços</div>
                        <p className="mt-1 text-xs font-semibold text-slate-500">Adicione seu primeiro trabalho para aparecer melhor para clientes e aumentar suas chances de receber contatos.</p>
                        <button
                          type="button"
                          onClick={prepararPrimeiroServico}
                          className="mt-3 h-10 rounded-xl bg-blue-700 px-4 text-xs font-black text-white shadow-[0_10px_22px_rgba(37,99,235,0.22)]"
                        >
                          Adicionar meu primeiro serviço
                        </button>
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
                      onClick={() => setProfSection("perfilPublico")}
                      className="h-9 rounded-xl bg-[#ffd91a] px-4 text-xs font-black text-blue-950 shadow-sm"
                    >
                      Ver meu perfil
                    </button>
                  </div>
                </section>
              )}

              {profSection === "avaliacoes" && (
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

              {profSection === "patentes" && (
                <section className="rounded-[24px] border border-white/10 bg-[#050b12] p-3 shadow-[0_18px_45px_rgba(15,23,42,0.18)] md:rounded-[30px] md:p-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Patente tipo="corre" nivel={nivelCorreAtual} size="sm" />
                    {profile.isProfissional && nivelProfAtual > 0 ? (
                      <Patente tipo="prof" nivel={nivelProfAtual} size="sm" />
                    ) : null}
                  </div>
                  <PainelPatentes
                    accountStats={accountStats}
                    serviceStats={serviceStats}
                    isProfissional={profile.isProfissional}
                  />
                </section>
              )}

              {profSection === "config" && (
                <section className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <div>
                      <div className="text-sm font-black text-blue-950">Modo profissional</div>
                      <div className="text-xs font-semibold text-slate-500">Apareça na lista de profissionais para clientes.</div>
                    </div>
                    <ToggleSwitch
                      checked={profile.isProfissional}
                      onChange={(checked) => setProfile((p) => ({ ...p, isProfissional: checked }))}
                      label="Ativar modo profissional"
                      tone="blue"
                    />
                  </label>

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

              {profSection === "ajuda" && (
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

          {(!professionalMode || profSection) && (
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
