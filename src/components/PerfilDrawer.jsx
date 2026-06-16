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
      return {
        id: String(data.id || data.key || `portfolio_${index}`),
        titulo: String(data.titulo || data.title || "").trim(),
        descricao: String(data.descricao || data.description || "").trim(),
        valor: String(data.valor || data.preco || data.price || "").trim(),
        categoria: String(data.categoria || data.category || "").trim(),
        fotoURL: fotos[0] || "",
        fotos,
        fotoImgBbId: String(data.fotoImgBbId || data.imageId || "").trim(),
      };
    })
    .filter((item) => item.titulo || item.descricao || item.valor || item.categoria || item.fotos.length)
    .slice(0, 12);
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
  const [portfolioDraft, setPortfolioDraft] = useState({
    titulo: "",
    descricao: "",
    valor: "",
    categoria: "",
    fotoURL: "",
    fotos: [],
    fotoImgBbId: "",
  });
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
        ganhosRecentes: ganhosRecentes.sort((a, b) => (b.ms || 0) - (a.ms || 0)).slice(0, 6),
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
        portfolio: profPortfolio,
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
    ganhos: {
      title: "Ganhos",
      desc: "Resumo dos valores combinados.",
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
    setPortfolioDraft((prev) => ({ ...prev, [field]: value }));
  };
  const adicionarPortfolioItem = () => {
    const fotos = normalizePortfolioFotos(portfolioDraft);
    const item = {
      id: `portfolio_${Date.now()}`,
      titulo: portfolioDraft.titulo.trim(),
      descricao: portfolioDraft.descricao.trim(),
      valor: portfolioDraft.valor.trim(),
      categoria: portfolioDraft.categoria.trim(),
      fotoURL: fotos[0] || "",
      fotos,
      fotoImgBbId: portfolioDraft.fotoImgBbId || "",
    };

    if (!item.titulo && !item.descricao && !item.valor && !item.categoria && !item.fotos.length) return;

    setProfile((prev) => ({
      ...prev,
      profPortfolio: [...normalizePortfolio(prev.profPortfolio), item].slice(0, 12),
    }));
    setPortfolioDraft({ titulo: "", descricao: "", valor: "", categoria: "", fotoURL: "", fotos: [], fotoImgBbId: "" });
    setPortfolioPhotoError("");
  };
  const removerPortfolioItem = (id) => {
    setProfile((prev) => ({
      ...prev,
      profPortfolio: normalizePortfolio(prev.profPortfolio).filter((item) => item.id !== id),
    }));
  };

  return (
    <div className="fixed inset-0 z-[100000] bg-slate-950">
      <div
        className="absolute inset-0 bg-slate-950/55 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.aside
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
                    <input
                      type="checkbox"
                      checked={privacy.profileVisible}
                      onChange={(e) => setPrivacyPreference("profileVisible", e.target.checked)}
                      className="h-5 w-5 accent-emerald-500"
                    />
                  </label>

                  <label className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 md:mt-3 md:gap-4 md:px-4 md:py-4">
                    <div>
                      <div className="text-sm font-extrabold text-slate-950">Notificações</div>
                      <div className="text-xs font-semibold text-slate-500">Pedidos, chat, aceite, conclusão e avaliações.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={profile.notificacoes}
                      onChange={(e) => setProfile((p) => ({ ...p, notificacoes: e.target.checked }))}
                      className="h-5 w-5 accent-blue-600"
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
                    <input
                      type="checkbox"
                      checked={profile.mapMostrarOnline}
                      onChange={(e) => setProfile((p) => ({ ...p, mapMostrarOnline: e.target.checked }))}
                      className="h-5 w-5 accent-cyan-500"
                    />
                  </label>

                  <label className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3 md:mt-3 md:gap-4 md:px-4 md:py-4">
                    <div>
                      <div className="text-sm font-extrabold text-slate-950">Atualização ao vivo</div>
                      <div className="text-xs font-semibold text-slate-500">Atualiza marcadores automaticamente quando ativado.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={profile.mapAoVivo}
                      onChange={(e) => setProfile((p) => ({ ...p, mapAoVivo: e.target.checked }))}
                      className="h-5 w-5 accent-cyan-500"
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
                          <input
                            type="checkbox"
                            checked={privacy.shareLocationDuringActiveJob}
                            onChange={(e) => setPrivacyPreference("shareLocationDuringActiveJob", e.target.checked)}
                            className="h-5 w-5 accent-blue-600"
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
                          <input
                            type="checkbox"
                            checked={privacy.showOnlineStatus}
                            onChange={(e) => setPrivacyPreference("showOnlineStatus", e.target.checked)}
                            className="h-5 w-5 accent-emerald-500"
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
                          <input
                            type="checkbox"
                            checked={privacy.allowPublicContact}
                            onChange={(e) => setPrivacyPreference("allowPublicContact", e.target.checked)}
                            className="h-5 w-5 accent-blue-600"
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
                  <input
                    type="checkbox"
                    checked={profile.animacoes}
                    onChange={(e) => setProfile((p) => ({ ...p, animacoes: e.target.checked }))}
                    className="h-5 w-5 accent-violet-500"
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
                <input
                  type="checkbox"
                  checked={profile.isCorre}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, isCorre: e.target.checked }))
                  }
                  className="w-5 h-5 accent-blue-600"
                />
              </label>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.06] p-3 text-white md:rounded-[24px] md:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.16em] text-yellow-200">Ganhos como Corre</div>
                    <div className="mt-1 text-2xl font-black leading-none md:text-3xl">
                      {formatMoneyBR(serviceStats.ganhosCorreTotal)}
                    </div>
                  </div>
                  <span className="rounded-full bg-[#ffd91a] px-3 py-1 text-xs font-black text-blue-950">
                    {serviceStats.comoCorre} concluído{serviceStats.comoCorre === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2">
                    <div className="text-sm font-black">{formatMoneyBR(serviceStats.ganhosCorreSemana)}</div>
                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Semana</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.055] px-3 py-2">
                    <div className="text-sm font-black">{formatMoneyBR(serviceStats.ticketMedioCorre)}</div>
                    <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">Ticket médio</div>
                  </div>
                </div>
              </section>

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

              <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-2">
                {[
                  ["perfilPublico", "👤", "Meu perfil público", "Como clientes veem seu perfil."],
                  ["corre", "⚡", "Perfil de Corre", "Título, transporte e disponibilidade."],
                  ["ganhos", "💰", "Ganhos dos corres", "Valores combinados e concluídos."],
                  ["portfolio", "▣", "Portfólio de serviços", "Serviços, preço, região e experiência."],
                  ["avaliacoes", "★", "Avaliações", "Nota, histórico e reputação."],
                  ["patentes", "🏆", "Patentes Corre/Pro", "Níveis de experiência e confiança."],
                  ["config", "⚙", "Configurações", "Disponibilidade e agenda."],
                  ["ajuda", "?", "Central de ajuda", "Boas práticas e segurança."],
                ].map(([id, icon, label, desc]) => {
                  const active = profSection === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setProfSection(id)}
                      className={[
                        "flex w-full items-center gap-3 rounded-[18px] px-3 py-3 text-left transition md:rounded-[22px] md:px-4",
                        active ? "bg-blue-50 text-blue-950" : "text-slate-700 hover:bg-slate-50",
                      ].join(" ")}
                    >
                      <span className={["grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-base", active ? "bg-[#ffd91a]" : "bg-slate-100"].join(" ")}>
                        {icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-black md:text-base">{label}</span>
                        <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{desc}</span>
                      </span>
                      <span className="text-xl font-black text-slate-400">›</span>
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
                    <input
                      type="checkbox"
                      checked={profile.isCorre}
                      onChange={(e) => setProfile((p) => ({ ...p, isCorre: e.target.checked }))}
                      className="h-5 w-5 accent-blue-600"
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

              {profSection === "ganhos" && (
                <section className="space-y-3 rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Ganhos dos corres</div>
                    <div className="mt-1 text-sm font-bold text-slate-500">Resumo calculado pelos pedidos concluídos e pelo valor combinado no app.</div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                    {[
                      ["Total", formatMoneyBR(serviceStats.ganhosTotal)],
                      ["Corre", formatMoneyBR(serviceStats.ganhosCorreTotal)],
                      ["Pro", formatMoneyBR(serviceStats.ganhosProfTotal)],
                      ["Semana", formatMoneyBR(serviceStats.ganhosSemana)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-[18px] border border-blue-100 bg-blue-50 px-3 py-3">
                        <div className="truncate text-base font-black text-blue-950 md:text-lg">{value}</div>
                        <div className="mt-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-blue-700/70">{label}</div>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[20px] border border-slate-100 bg-slate-50 p-3 md:rounded-[24px] md:p-4">
                    <div className="text-sm font-black text-blue-950">Resumo</div>
                    <div className="mt-3 grid gap-2">
                      {[
                        ["Serviços como Corre", serviceStats.comoCorre],
                        ["Ticket médio Corre", formatMoneyBR(serviceStats.ticketMedioCorre)],
                        ["Serviços como Pro", serviceStats.comoProfissional],
                        ["Ticket médio Pro", formatMoneyBR(serviceStats.ticketMedioProf)],
                      ].map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2">
                          <span className="text-xs font-bold text-slate-500">{label}</span>
                          <span className="text-sm font-black text-blue-950">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-slate-100 bg-slate-50 p-3 md:rounded-[24px] md:p-4">
                    <div className="text-sm font-black text-blue-950">Ganhos recentes</div>
                    <div className="mt-3 grid gap-2">
                      {serviceStats.ganhosRecentes.length ? (
                        serviceStats.ganhosRecentes.map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2.5">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-black text-slate-900">{item.titulo}</div>
                              <div className="mt-0.5 text-xs font-semibold text-slate-500">{item.tipo} · {formatDataCurta(item.data)}</div>
                            </div>
                            <div className="shrink-0 rounded-full bg-[#ffd91a] px-3 py-1 text-xs font-black text-blue-950">
                              {formatMoneyBR(item.valor)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-4 text-center text-sm font-bold text-slate-500">
                          Serviços concluídos com valor combinado aparecem aqui.
                        </div>
                      )}
                    </div>
                  </div>
                </section>
              )}

              {profSection === "portfolio" && (
                <section className="rounded-[24px] border border-slate-200 bg-white p-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] md:rounded-[30px] md:p-5">
                  <div className="mb-3">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Portfólio de serviços</div>
                    <div className="mt-1 text-sm font-bold text-slate-500">Organize o que você oferece sem criar uma tela pesada.</div>
                  </div>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:gap-3">
                    <Field label="Preço base">
                      <input
                        value={profile.preco}
                        onChange={(e) => setProfile((p) => ({ ...p, preco: e.target.value }))}
                        placeholder="Ex: 50"
                        inputMode="decimal"
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="WhatsApp">
                      <input
                        value={profile.whatsapp}
                        onChange={(e) => setProfile((p) => ({ ...p, whatsapp: e.target.value }))}
                        placeholder="21999999999"
                        inputMode="tel"
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="Região profissional">
                      <input
                        value={profile.profRegiao}
                        onChange={(e) => setProfile((p) => ({ ...p, profRegiao: e.target.value }))}
                        placeholder="Ex: Baixada, Centro, Zona Norte"
                        className={inputClass()}
                      />
                    </Field>

                    <Field label="Experiência profissional">
                      <input
                        value={profile.profExperiencia}
                        onChange={(e) => setProfile((p) => ({ ...p, profExperiencia: e.target.value }))}
                        placeholder="Ex: 5 anos como eletricista"
                        className={inputClass()}
                      />
                    </Field>
                  </div>

                  <div className="mt-3 rounded-[20px] border border-blue-100 bg-blue-50 p-3 md:rounded-[24px] md:p-4">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">Adicionar trabalho</div>
                    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <input
                        value={portfolioDraft.titulo}
                        onChange={(e) => updatePortfolioDraft("titulo", e.target.value)}
                        placeholder="Nome do trabalho"
                        className={inputClass()}
                      />
                      <input
                        value={portfolioDraft.valor}
                        onChange={(e) => updatePortfolioDraft("valor", e.target.value)}
                        placeholder="Valor ou faixa"
                        className={inputClass()}
                      />
                      <input
                        value={portfolioDraft.categoria}
                        onChange={(e) => updatePortfolioDraft("categoria", e.target.value)}
                        placeholder="Categoria"
                        className={inputClass()}
                      />
                      <input
                        value={portfolioDraft.descricao}
                        onChange={(e) => updatePortfolioDraft("descricao", e.target.value)}
                        placeholder="Descricao curta"
                        className={inputClass()}
                      />
                    </div>
                    <div className="mt-3 rounded-[18px] border border-white bg-white/80 p-2.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-black text-blue-950">Fotos do servico feito</div>
                          <div className="mt-0.5 text-xs font-semibold text-slate-500">Anexe ate 5 fotos para mostrar acabamento e resultado.</div>
                        </div>
                        <label className={["grid h-10 cursor-pointer place-items-center rounded-2xl bg-white px-4 text-xs font-black text-blue-700 shadow-sm ring-1 ring-blue-100 transition active:scale-[0.98]", portfolioPhotoUploading || portfolioDraftFotos.length >= 5 ? "pointer-events-none opacity-60" : ""].join(" ")}>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            disabled={portfolioPhotoUploading || portfolioDraftFotos.length >= 5}
                            className="hidden"
                            onChange={alterarFotoPortfolio}
                          />
                          {portfolioPhotoUploading ? "Enviando..." : portfolioDraftFotos.length ? `Anexar mais (${portfolioDraftFotos.length}/5)` : "Anexar fotos"}
                        </label>
                      </div>

                      <div className="mt-2 grid grid-cols-5 gap-1.5">
                        {Array.from({ length: 5 }).map((_, index) => {
                          const foto = portfolioDraftFotos[index];
                          return (
                            <div key={foto || index} className="relative grid aspect-square place-items-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 text-[10px] font-black text-slate-400">
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
                                "+"
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-1">
                        {portfolioPhotoError ? (
                          <div className="mt-1 text-xs font-black text-rose-600">{portfolioPhotoError}</div>
                        ) : null}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={adicionarPortfolioItem}
                      className="mt-3 h-11 w-full rounded-2xl bg-blue-700 px-4 text-sm font-black text-white shadow-[0_12px_28px_rgba(37,99,235,0.20)] transition hover:bg-blue-800 active:scale-[0.98]"
                    >
                      Adicionar ao portfolio
                    </button>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {portfolioItems.length ? (
                      portfolioItems.map((item) => (
                        <div key={item.id} className="rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="line-clamp-2 text-sm font-black text-blue-950">{item.titulo || "Trabalho sem titulo"}</div>
                              {item.descricao ? <div className="mt-1 line-clamp-2 text-xs font-semibold text-slate-600">{item.descricao}</div> : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => removerPortfolioItem(item.id)}
                              className="shrink-0 rounded-xl border border-rose-200 bg-white px-3 py-1 text-xs font-black text-rose-600"
                            >
                              Remover
                            </button>
                          </div>
                          {item.fotos?.length ? (
                            <div className="mt-2 grid grid-cols-5 gap-1.5">
                              {item.fotos.slice(0, 5).map((foto, index) => (
                                <div
                                  key={`${item.id}_foto_${index}`}
                                  className="aspect-square rounded-xl bg-cover bg-center shadow-sm ring-1 ring-slate-200"
                                  style={{ backgroundImage: `url(${foto})` }}
                                  aria-label="Foto do trabalho"
                                />
                              ))}
                            </div>
                          ) : null}
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.categoria ? <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-slate-600">{item.categoria}</span> : null}
                            {item.valor ? <span className="rounded-full bg-[#ffd91a] px-2.5 py-1 text-[11px] font-black text-blue-950">{item.valor}</span> : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[18px] border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-500">
                        Nenhum trabalho cadastrado ainda.
                      </div>
                    )}
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
                    <input
                      type="checkbox"
                      checked={profile.isProfissional}
                      onChange={(e) => setProfile((p) => ({ ...p, isProfissional: e.target.checked }))}
                      className="h-5 w-5 accent-blue-600"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                    <div>
                      <div className="text-sm font-black text-blue-950">Agenda aberta</div>
                      <div className="text-xs font-semibold text-slate-500">Permite receber solicitações de horário.</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={profile.agendaAberta}
                      onChange={(e) => setProfile((p) => ({ ...p, agendaAberta: e.target.checked }))}
                      className="h-5 w-5 accent-blue-600"
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
