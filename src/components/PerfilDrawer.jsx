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

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

function isFotoValor(v) {
  const s = String(v || "").trim();
  return /^(https?:\/\/|data:image\/|blob:|\/)/i.test(s);
}

function pickFoto(...vals) {
  return vals.map((v) => String(v || "").trim()).find(isFotoValor) || "";
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

export default function PerfilDrawer({ open, onClose, uid }) {
  const [tab, setTab] = useState("perfil");

  const [profile, setProfile] = useState(initialProfile);
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
        patenteCorre: Math.max(Number(data.patenteCorre || 1), calcularPatentePorServicos(servicosCorre)),
        patenteProf: isProfissionalUser
          ? Math.max(Number(data.patenteProf || 1), calcularPatentePorServicos(servicosProf))
          : 0,
      });

      const profileData = data.profile || {};
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
      }));

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
        if (concluido && souCorre && modoProfissional) comoProfissional += 1;
        if (concluido && souCorre && !modoProfissional) comoCorre += 1;
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

    if (file.size > PHOTO_MAX_BYTES) {
      setPhotoError("Escolha uma imagem de ate 2 MB.");
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

      const fotoPrincipal = pickFoto(profile.fotoURL, profile.photoURL, profile.avatar);
      const profilePublic = { ...profile };
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
        className="
          fixed inset-0 h-screen w-screen
          bg-white text-slate-950
          border-0
          shadow-[0_30px_120px_rgba(15,23,42,0.35)]
          overflow-y-auto
        "
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto w-full max-w-7xl px-3 py-2.5 md:px-8 md:py-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-base font-extrabold text-blue-950 md:text-lg">
                Meu perfil
              </div>
              <div className="text-[11px] font-semibold text-slate-500 md:text-xs">
                Perfil, confiança, notificações e preferências.
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

        <div className="mx-auto w-full max-w-7xl p-2.5 md:p-6">
          {/* FOTO + HEADER */}
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

              <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 md:mt-4 md:gap-2">
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

                <Patente tipo="corre" nivel={nivelCorreAtual} size="sm" />
                {profile.isProfissional && nivelProfAtual > 0 ? (
                  <Patente tipo="prof" nivel={nivelProfAtual} size="sm" />
                ) : null}
              </div>

              <div className="mt-3 grid grid-cols-3 gap-1.5 w-full md:mt-5 md:gap-2">
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

              <div className="mt-1.5 grid grid-cols-2 gap-1.5 w-full text-left md:mt-2 md:gap-2">
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

          {/* MENU DO PERFIL */}
          <div className="mt-3 rounded-[24px] border border-slate-200 bg-white p-1.5 shadow-[0_18px_45px_rgba(15,23,42,0.10)] md:mt-5 md:rounded-[30px] md:p-2">
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 md:gap-2">
              {["perfil", "corre", "profissional", "config", "monetizacao", "patentes"].map(
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
                      checked={profile.visivel}
                      onChange={(e) => setProfile((p) => ({ ...p, visivel: e.target.checked }))}
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
            <div className="mt-3 rounded-[20px] bg-[#0b1628] border border-white/10 p-3 space-y-3 md:mt-5 md:rounded-[28px] md:p-4 md:space-y-4">
              <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-900/70 border border-white/10 px-3 py-3 md:gap-4 md:rounded-2xl md:px-4">
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
                <div className="space-y-3 md:space-y-4">

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
                      className={inputClass("min-h-20 resize-y md:min-h-28")}
                    />
                  </Field>

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:gap-3">
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

                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:gap-3">
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
