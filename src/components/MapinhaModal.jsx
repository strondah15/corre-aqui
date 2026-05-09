"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

/* =========================================================
   Leaflet default icon fix (Next/SSR)
========================================================= */
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

/* =========================================================
   Fallback green marker for online users
========================================================= */
const greenIcon = new L.Icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/* =========================================================
   ✅ Opção 3: Ícones "neon" (Você / Destino)
========================================================= */
function getNeonDotIcon(kind = "me") {
  const cfg =
    kind === "dest"
      ? {
          label: "🎯",
          border: "rgba(244,63,94,.95)",
          glow: "rgba(244,63,94,.55)",
        } // rosa/vermelho
      : { label: "🧭", border: "rgba(34,211,238,.95)", glow: "rgba(34,211,238,.55)" }; // azul

  const size = 34;
  const html = `
    <div style="
      width:${size}px;height:${size}px;border-radius:9999px;
      display:flex;align-items:center;justify-content:center;
      border:2px solid ${cfg.border};
      background:
        radial-gradient(circle at 30% 20%, rgba(255,255,255,.28), rgba(255,255,255,0) 52%),
        rgba(0,0,0,.35);
      box-shadow:
        0 0 0 2px rgba(255,255,255,.12),
        0 0 16px ${cfg.glow},
        0 12px 26px rgba(0,0,0,.55);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      font-size:16px; line-height:1;
      filter: drop-shadow(0 6px 10px rgba(0,0,0,.55));
    ">
      ${cfg.label}
    </div>
  `;
  return L.divIcon({
    className: "",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

/* =========================================================
   Utils
========================================================= */
function isValidLoc(loc) {
  return (
    !!loc &&
    Number.isFinite(Number(loc.lat)) &&
    Number.isFinite(Number(loc.lng))
  );
}

function safeUrl(u) {
  const s = String(u || "").trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) return "";
  return s;
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const toInt = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

/* =========================================================
   Avatar icons (LRU-ish cache)
========================================================= */
const iconCache = new Map();
const ICON_CACHE_MAX = 220;

function cacheSet(key, icon) {
  if (iconCache.has(key)) iconCache.delete(key);
  iconCache.set(key, icon);
  while (iconCache.size > ICON_CACHE_MAX) {
    const firstKey = iconCache.keys().next().value;
    iconCache.delete(firstKey);
  }
}

function getAvatarIcon({ fotoURL, emoji, kind }) {
  const key = `foto:${fotoURL || ""}|emoji:${emoji || ""}|kind:${kind || ""}`;

  if (iconCache.has(key)) {
    const v = iconCache.get(key);
    iconCache.delete(key);
    iconCache.set(key, v);
    return v;
  }

  const size = 44;

  const ring =
    kind === "profissional"
      ? "rgba(59,130,246,.95)"
      : kind === "corre"
        ? "rgba(250,204,21,.95)"
        : "";

  const glow =
    kind === "profissional"
      ? "rgba(59,130,246,.55)"
      : kind === "corre"
        ? "rgba(250,204,21,.55)"
        : "";
  const html = `
    <div style="
      width:${size}px;height:${size}px;
      border-radius:9999px;
      overflow:hidden;
      border:2px solid ${ring};
      box-shadow:
        0 0 0 2px rgba(255,255,255,.14),
        0 0 18px ${glow},
        0 14px 34px rgba(0,0,0,.55);
      background:
        radial-gradient(circle at 30% 20%, rgba(255,255,255,.22), rgba(255,255,255,0) 45%),
        rgba(0,0,0,.35);
      display:flex;align-items:center;justify-content:center;
      position:relative;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    ">
      ${
        fotoURL
          ? `<img src="${fotoURL}" referrerpolicy="no-referrer" style="width:100%;height:100%;object-fit:cover;display:block;" />`
          : `<div style="font-size:20px;line-height:1;filter:drop-shadow(0 8px 14px rgba(0,0,0,.55));">${
              emoji || "🙂"
            }</div>`
      }
      <span style="
        position:absolute;right:3px;bottom:3px;
        width:10px;height:10px;border-radius:9999px;
        background:#22c55e;
        border:2px solid rgba(255,255,255,.92);
        box-shadow:0 0 14px rgba(34,197,94,.75);
      "></span>
      <span style="
        pointer-events:none;
        position:absolute;inset:-6px;
        border-radius:9999px;
        border:1px solid rgba(56,189,248,.35);
        box-shadow:0 0 18px ${glow};
      "></span>
    </div>
  `;

  const icon = L.divIcon({
    className: "",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });

  cacheSet(key, icon);
  return icon;
}

/* =========================================================
   Helper: fit + invalidate map on open / changes
========================================================= */
function FitAndInvalidate({ open, start, dest, sheetHeight }) {
  const map = useMap();

  useEffect(() => {
    if (!open) return;

    const t = setTimeout(() => {
      try {
        map.invalidateSize(true);

        if (start && dest) {
          const bounds = L.latLngBounds([start, dest]);
          map.fitBounds(bounds, { padding: [40, 40] });
        } else if (dest) {
          map.setView(dest, 16, { animate: true });
        } else if (start) {
          map.setView(start, 16, { animate: true });
        }
      } catch {}
    }, 90);

    return () => clearTimeout(t);
  }, [open, map, start, dest, sheetHeight]);

  return null;
}

/* =========================================================
   Component
========================================================= */
/**
 * Props novos (opcionais):
 * - mapSettings: { mostrarOnline, aoVivo, limiteOnline }
 * - myUid: uid do usuário atual (pra esconder ele da lista online)
 */
export default function MapinhaModal({
  onClickUser,
  open,
  onClose,
  pedidoLocal,
  aceiteLocal,
  titulo = "Mapa",
  infoExtra,
  onlineUsers = [],
  limitOnlineMarkers = 30,
  myUid = null,

  // ✅ NOVO: vem de users/{uid}/settings/mapa
  mapSettings = null,
}) {
  // mounted (evita SSR hydration com portal)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Preferência visual do mapa: claro / escuro
  const [modoMapa, setModoMapa] = useState("claro");

  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem("correAquiModoMapa");
      if (salvo === "claro" || salvo === "escuro") {
        setModoMapa(salvo);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("correAquiModoMapa", modoMapa);
    } catch {}
  }, [modoMapa]);

  // trava scroll do body quando aberto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const [route, setRoute] = useState([]);
  const [distKm, setDistKm] = useState(null);
  const [durMin, setDurMin] = useState(null);
  const [startLocal, setStartLocal] = useState(null);
  const [loadingStart, setLoadingStart] = useState(false);

  const isMapaAoVivo = useMemo(() => !isValidLoc(pedidoLocal), [pedidoLocal]);

  /* =========================
      Defaults por Settings
  ========================= */
  const defaultShowOnline = useMemo(() => {
    if (mapSettings && typeof mapSettings?.mostrarOnline === "boolean") {
      return !!mapSettings.mostrarOnline;
    }
    // se for mapa ao vivo, por padrão liga online
    return !!isMapaAoVivo;
  }, [mapSettings, isMapaAoVivo]);

  const defaultLiveMode = useMemo(() => {
    if (mapSettings && typeof mapSettings?.aoVivo === "boolean") {
      return !!mapSettings.aoVivo;
    }
    return !!isMapaAoVivo;
  }, [mapSettings, isMapaAoVivo]);

  const defaultLimitOnline = useMemo(() => {
    const fromSettings = mapSettings?.limiteOnline;
    if (fromSettings != null) return clamp(toInt(fromSettings, 30), 5, 120);
    return clamp(toInt(limitOnlineMarkers, 30), 5, 120);
  }, [mapSettings, limitOnlineMarkers]);

  // topo toggles
  const [showPedido, setShowPedido] = useState(true);
  const [showOnline, setShowOnline] = useState(false);
  const [liveMode, setLiveMode] = useState(false);
  const [onlineLimit, setOnlineLimit] = useState(30);

  // online freeze/live
  const frozenOnlineRef = useRef([]);
  const liveTickRef = useRef(0);
  const [liveTick, setLiveTick] = useState(0);

  // bottom sheet
  const SHEET_MIN = 80;
  const SHEET_MID = 190;
  const [sheet, setSheet] = useState("mid");
  const [sheetHeight, setSheetHeight] = useState(SHEET_MID);

  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  const startHRef = useRef(SHEET_MID);
  const sheetHeightRef = useRef(SHEET_MID);
  const sheetScrollRef = useRef(null);

  const getMaxH = () => {
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    return Math.max(360, Math.round(h * 0.74));
  };

  const snapTo = (target) => {
    const maxH = getMaxH();
    const midH = Math.min(SHEET_MID, maxH);

    if (target === "max") {
      setSheet("max");
      setSheetHeight(maxH);
      return;
    }
    if (target === "mid") {
      setSheet("mid");
      setSheetHeight(midH);
      return;
    }
    setSheet("min");
    setSheetHeight(SHEET_MIN);
  };

  useEffect(() => {
    sheetHeightRef.current = sheetHeight;
  }, [sheetHeight]);

  // ao abrir: reset + defaults
  useEffect(() => {
    if (!open) return;

    setRoute([]);
    setDistKm(null);
    setDurMin(null);
    setStartLocal(null);
    setLoadingStart(false);

    // ✅ defaults vindos das configs do perfil
    setOnlineLimit(defaultLimitOnline);

    if (isMapaAoVivo) {
      setShowPedido(false);
      setShowOnline(true);
      setLiveMode(true);
      snapTo("mid");
    } else {
      setShowPedido(true);
      setShowOnline(defaultShowOnline);
      setLiveMode(defaultLiveMode);
      snapTo("mid");
    }

    frozenOnlineRef.current = Array.isArray(onlineUsers) ? onlineUsers : [];
    liveTickRef.current = 0;
    setLiveTick(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    open,
    isMapaAoVivo,
    defaultShowOnline,
    defaultLiveMode,
    defaultLimitOnline,
  ]);

  // resize -> resnap
  useEffect(() => {
    if (!open) return;
    const onResize = () => snapTo(sheet);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sheet]);

  // drag handlers
  const onDragStart = (clientY) => {
    draggingRef.current = true;
    startYRef.current = clientY;
    startHRef.current = sheetHeightRef.current;
  };

  const onDragMove = (clientY) => {
    if (!draggingRef.current) return;

    const sc = sheetScrollRef.current;
    const delta = startYRef.current - clientY;
    const tryingUp = delta > 0;
    const tryingDown = delta < 0;

    // se o conteúdo interno está rolando, deixa rolar
    if (sc) {
      const atTop = sc.scrollTop <= 0;
      const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1;
      if (!atTop && !atBottom) return;
      if (!atTop && tryingDown) return;
      if (!atBottom && tryingUp) return;
    }

    const maxH = getMaxH();
    const next = Math.min(maxH, Math.max(SHEET_MIN, startHRef.current + delta));
    setSheetHeight(next);
  };

  const onDragEnd = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;

    const maxH = getMaxH();
    const midH = Math.min(SHEET_MID, maxH);

    const candidates = [
      { k: "min", h: SHEET_MIN },
      { k: "mid", h: midH },
      { k: "max", h: maxH },
    ];
    candidates.sort(
      (a, b) =>
        Math.abs(a.h - sheetHeightRef.current) -
        Math.abs(b.h - sheetHeightRef.current),
    );
    snapTo(candidates[0].k);
  };

  useEffect(() => {
    if (!open) return;

    const mm = (e) => onDragMove(e.clientY);
    const mu = () => onDragEnd();
    const tm = (e) => {
      e.preventDefault();
      onDragMove(e.touches?.[0]?.clientY ?? 0);
    };
    const tu = () => onDragEnd();

    window.addEventListener("mousemove", mm);
    window.addEventListener("mouseup", mu);
    window.addEventListener("touchmove", tm, { passive: false });
    window.addEventListener("touchend", tu);

    return () => {
      window.removeEventListener("mousemove", mm);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("touchmove", tm);
      window.removeEventListener("touchend", tu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // live timer
  useEffect(() => {
    if (!open) return;
    if (!showOnline) return;
    if (!liveMode) return;

    const id = setInterval(() => {
      frozenOnlineRef.current = Array.isArray(onlineUsers) ? onlineUsers : [];
      liveTickRef.current += 1;
      setLiveTick(liveTickRef.current);
    }, 2200);

    return () => clearInterval(id);
  }, [open, showOnline, liveMode, onlineUsers]);

  // freeze when liveMode off
  useEffect(() => {
    if (!open) return;
    if (!showOnline) return;
    if (liveMode) return;

    frozenOnlineRef.current = Array.isArray(onlineUsers) ? onlineUsers : [];
    liveTickRef.current += 1;
    setLiveTick(liveTickRef.current);
  }, [open, showOnline, liveMode, onlineUsers]);

  const pedidoOk = isValidLoc(pedidoLocal);
  const aceiteOk = isValidLoc(aceiteLocal);
  const startOk = isValidLoc(startLocal);

  const start = useMemo(() => {
    if (aceiteOk) return [Number(aceiteLocal.lat), Number(aceiteLocal.lng)];
    if (startOk) return [Number(startLocal.lat), Number(startLocal.lng)];
    return null;
  }, [aceiteOk, aceiteLocal, startOk, startLocal]);

  const dest = useMemo(() => {
    if (!showPedido) return null;
    return pedidoOk ? [Number(pedidoLocal.lat), Number(pedidoLocal.lng)] : null;
  }, [showPedido, pedidoOk, pedidoLocal]);

  const center = useMemo(() => {
    if (start && dest)
      return [(start[0] + dest[0]) / 2, (start[1] + dest[1]) / 2];
    if (dest) return dest;
    if (start) return start;
    return [-22.9068, -43.1729]; // RJ fallback
  }, [start, dest]);

  // normaliza online -> markers válidos + avatar + dedupe
  const onlineMarkers = useMemo(() => {
    if (!showOnline) return [];

    const source = frozenOnlineRef.current || [];
    const list = Array.isArray(source) ? source : [];

    let out = list
      .map((u) => {
        const loc = u?.local;
        if (!isValidLoc(loc)) return null;

        const uidU = u?.uid || u?.id || null;
        if (myUid && uidU && String(uidU) === String(myUid)) return null;

        const lat = Number(loc.lat);
        const lng = Number(loc.lng);

        const fotoURLraw =
          u?.fotoURL ||
          u?.profile?.fotoURL ||
          u?.avatarURL ||
          u?.avatar?.url ||
          "";
        const fotoURL = safeUrl(fotoURLraw);
        const avatarEmoji = String(u?.avatarEmoji || u?.avatar?.emoji || "");

        return {
          id: uidU || `${lat},${lng}`,
          nome: u?.nome || "Online",
          lat,
          lng,
          lastSeen: Number(u?.lastSeen || 0),
          fotoURL,
          avatarEmoji,
        };
      })
      .filter(Boolean);

    // dedupe por lat/lng (evita marker em cima)
    const seen = new Set();
    out = out.filter((m) => {
      const k = `${m.lat.toFixed(5)}|${m.lng.toFixed(5)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    out.sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
    return out.slice(0, clamp(toInt(onlineLimit, 30), 5, 120));
  }, [showOnline, onlineLimit, liveTick, myUid]);

  /* =========================================================
     OSRM route (only if start + dest)
  ========================================================= */
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();

    async function fetchRoute() {
      setRoute([]);
      setDistKm(null);
      setDurMin(null);

      if (!start || !dest) return;

      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json();

        const r = data?.routes?.[0];
        const coords = r?.geometry?.coordinates || [];
        const latlng = coords.map(([lng, lat]) => [lat, lng]);

        setRoute(latlng);
        if (typeof r?.distance === "number") setDistKm(r.distance / 1000);
        if (typeof r?.duration === "number") setDurMin(r.duration / 60);
      } catch (e) {
        if (e?.name === "AbortError") return;
        console.log("Falha ao buscar rota OSRM:", e);
      }
    }

    fetchRoute();
    return () => controller.abort();
  }, [open, start, dest]);

  /* =========================================================
     Get user location
  ========================================================= */
  async function usarMinhaLocalizacao() {
    setLoadingStart(true);
    try {
      if (!navigator.geolocation) {
        alert("Seu navegador não suporta localização.");
        return;
      }

      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setStartLocal({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            });
            resolve();
          },
          (err) => reject(err),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
    } catch {
      alert(
        "Não consegui pegar sua localização. Verifique as permissões do navegador.",
      );
    } finally {
      setLoadingStart(false);
    }
  }

  const googleMapsUrl = useMemo(() => {
    if (!dest) return null;
    if (start)
      return `https://www.google.com/maps/dir/?api=1&origin=${start[0]},${start[1]}&destination=${dest[0]},${dest[1]}&travelmode=driving`;
    return `https://www.google.com/maps/search/?api=1&query=${dest[0]},${dest[1]}`;
  }, [start, dest]);

  if (!open || !mounted) return null;

  const isDragging = draggingRef.current;

  const MAPA_CLARO_URL =
    "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
  const MAPA_ESCURO_URL =
    "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
  const tileUrl = modoMapa === "escuro" ? MAPA_ESCURO_URL : MAPA_CLARO_URL;

  // ✅ UI mapa premium: escuro, limpo e com profundidade
  const glass =
    "bg-[#071120]/78 backdrop-blur-xl border border-cyan-400/10 shadow-[0_24px_80px_rgba(0,0,0,0.45)] text-white";

  const pillBase =
    "px-3 py-1.5 rounded-full text-[11px] font-black border transition active:scale-[0.96] shadow-[0_14px_35px_rgba(0,0,0,0.24)]";
  const pillOn =
    "bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-300/30 shadow-[0_0_28px_rgba(34,211,238,0.22)]";
  const pillOff =
    "bg-[#0f1b2d]/90 text-slate-200 border-white/10 hover:bg-[#14243a]";

  const isLiveMap = isMapaAoVivo;
  const onlineResumo = showOnline
    ? liveMode
      ? "ao vivo"
      : "congelado"
    : "oculto";

  const ui = (
    <>
      {/* backdrop */}
      <motion.div
        className="fixed inset-0 z-[4000] bg-[#020617]/70 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
      />

      {/* mapa */}
      <motion.div
        className="fixed inset-0 z-[4500] overflow-hidden"
        initial={{ opacity: 0, scale: 1.015 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
      >
        <MapContainer
          center={center}
          zoom={15}
          className="h-full w-full"
          preferCanvas={true}
          style={{
            filter:
              modoMapa === "escuro"
                ? "brightness(1.08) contrast(1.25) saturate(1.08)"
                : "brightness(0.98) contrast(1.12) saturate(1.04)",
            background: modoMapa === "escuro" ? "#020617" : "#eef2f7",
          }}
        >
          <FitAndInvalidate
            open={open}
            start={start}
            dest={dest}
            sheetHeight={sheetHeight}
          />

          <TileLayer
            attribution="&copy; OpenStreetMap contributors &copy; CARTO"
            url={tileUrl}
          />

          {/* ONLINE */}
          {onlineMarkers.map((m) => {
            const icon =
              m.fotoURL || m.avatarEmoji
                ? getAvatarIcon({
                    fotoURL: m.fotoURL,
                    emoji: m.avatarEmoji,
                    kind: m.isProfissional
                      ? "profissional"
                      : m.isCorre
                        ? "corre"
                        : "",
                  })
                : greenIcon;

            return (
              <Marker
                key={`on_${m.id}`}
                position={[m.lat, m.lng]}
                icon={icon}
                eventHandlers={{ click: () => onClickUser?.(m) }}
              >
                <Popup>
                  <div className="text-sm">
                    <b>🟢 {m.nome}</b>
                    {m.lastSeen ? (
                      <div className="text-xs text-gray-600">
                        lastSeen: {new Date(m.lastSeen).toLocaleTimeString()}
                      </div>
                    ) : null}
                  </div>
                </Popup>
              </Marker>
            );
          })}

          {/* VOCÊ */}
          {start && (
            <Marker
              position={start}
              icon={getNeonDotIcon("me")}
              eventHandlers={{
                click: () =>
                  onClickUser?.({
                    id: myUid,
                    nome: "Você",
                    cidade: "",
                    fotoURL: "",
                    avatarEmoji: "🧭",
                    profissional: null,
                  }),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <b>Você</b>
                </div>
              </Popup>
            </Marker>
          )}

          {/* DESTINO */}
          {dest && (
            <Marker
              position={dest}
              icon={getNeonDotIcon("dest")}
              eventHandlers={{
                click: () =>
                  onClickUser?.({
                    id: "destino",
                    nome: "Destino",
                    cidade: "",
                    fotoURL: "",
                    avatarEmoji: "🎯",
                    profissional: null,
                  }),
              }}
            >
              <Popup>
                <div className="text-sm">
                  <b>Destino (pedido)</b>
                </div>
              </Popup>
            </Marker>
          )}

          {/* ROTA */}
          {route.length > 1 && (
            <Polyline positions={route} weight={6} opacity={0.9} />
          )}
        </MapContainer>

        {/* seletor claro/escuro */}
        <div className="pointer-events-auto absolute right-4 top-5 z-[4700] flex items-center gap-1 rounded-full border border-white/15 bg-[#020617]/80 p-1.5 shadow-[0_14px_40px_rgba(0,0,0,0.28)] backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setModoMapa("claro")}
            className={`rounded-full px-3 py-2 text-xs font-black transition active:scale-95 ${
              modoMapa === "claro"
                ? "bg-white text-slate-950 shadow-lg"
                : "text-white/80 hover:bg-white/10"
            }`}
            title="Mapa claro"
          >
            ☀️ Claro
          </button>
          <button
            type="button"
            onClick={() => setModoMapa("escuro")}
            className={`rounded-full px-3 py-2 text-xs font-black transition active:scale-95 ${
              modoMapa === "escuro"
                ? "bg-cyan-500 text-white shadow-[0_0_24px_rgba(34,211,238,0.35)]"
                : "text-white/80 hover:bg-white/10"
            }`}
            title="Mapa escuro"
          >
            🌙 Escuro
          </button>
        </div>

      </motion.div>

      {/* topo premium */}
      <motion.div
        className="fixed top-4 left-4 right-4 z-[9000] pointer-events-none"
        initial={{ opacity: 0, y: -18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.28, ease: "easeOut" }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="pointer-events-auto flex items-center gap-2">
            {!isMapaAoVivo && (
              <button
                type="button"
                className={`${pillBase} ${showPedido ? pillOn : pillOff}`}
                onClick={() => setShowPedido((v) => !v)}
                title="Mostrar/ocultar o pedido no mapa"
              >
                📍 Pedido
              </button>
            )}

            <button
              type="button"
              className={`${pillBase} ${showOnline ? pillOn : pillOff}`}
              onClick={() => setShowOnline((v) => !v)}
              title="Mostrar pessoas online"
            >
              🟢 Online
            </button>

            {showOnline && (
              <button
                type="button"
                className={`${pillBase} ${liveMode ? pillOn : pillOff}`}
                onClick={() => setLiveMode((v) => !v)}
                title="Atualizar online em tempo real (pode gastar mais dados)"
              >
                🔄 Ao vivo
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="pointer-events-auto w-12 h-12 rounded-3xl bg-[#0f1b2d]/95 border border-white/10 text-white flex items-center justify-center hover:bg-[#14243a] active:scale-[0.96] transition shadow-[0_14px_40px_rgba(0,0,0,0.28)] text-xl"
            title="Fechar"
            type="button"
          >
            ✕
          </button>
        </div>
      </motion.div>

      {isLiveMap && (
        <motion.div
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[9000] w-[min(92vw,520px)] pointer-events-none"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.25 }}
        >
          <div className="pointer-events-auto rounded-3xl bg-[#071120]/78 border border-cyan-400/10 shadow-[0_18px_60px_rgba(0,0,0,0.38)] backdrop-blur-xl px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-3xl bg-cyan-400/10 border border-cyan-300/15 flex items-center justify-center text-xl shadow-[0_0_24px_rgba(34,211,238,0.12)]">
                🔎
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-extrabold text-white">
                  Mapa ao vivo
                </div>
                <div className="text-xs text-slate-300 truncate">
                  {onlineMarkers.length} online · {onlineResumo}
                </div>
              </div>

              {showOnline && (
                <div className="hidden sm:flex items-center gap-2 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-3xl px-3 py-2">
                  <span className="font-bold">Limite</span>
                  <input
                    type="range"
                    min={5}
                    max={80}
                    value={onlineLimit}
                    onChange={(e) => setOnlineLimit(Number(e.target.value))}
                    className="w-20 accent-blue-600"
                  />
                  <span className="font-extrabold text-white w-7 text-right">{onlineLimit}</span>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* bottom sheet premium */}
      <motion.div
        className="fixed left-0 right-0 bottom-0 z-[8000]"
        initial={{ opacity: 0, y: 80 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12, duration: 0.32, ease: "easeOut" }}
      >
        <div
          className={[
            "mx-auto max-w-[820px] rounded-t-[28px] overflow-hidden",
            glass,
          ].join(" ")}
          style={{
            height: isLiveMap ? Math.min(sheetHeight, 210) : sheetHeight,
            transition: isDragging ? "none" : "height 180ms ease",
            background:
              "linear-gradient(to top, rgba(7,17,32,0.98), rgba(11,23,40,0.94))",
          }}
        >
          {/* header / handle */}
          <div
            className="px-5 pt-3 pb-3 select-none"
            onMouseDown={(e) => onDragStart(e.clientY)}
            onTouchStart={(e) => {
              e.preventDefault();
              onDragStart(e.touches[0].clientY);
            }}
          >
            <div className="mx-auto h-1.5 w-12 rounded-full bg-cyan-300/30 shadow-[0_0_18px_rgba(34,211,238,0.18)]" />

            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-base font-extrabold text-white truncate">
                  {isLiveMap ? "🟢 Pessoas online agora" : `📍 ${titulo}`}
                </div>
                <div className="mt-1 text-xs text-slate-300">
                  {isLiveMap
                    ? "Acompanhe usuários ativos sem pesar a tela principal."
                    : "Detalhes do pedido e rota."}
                </div>
              </div>

              {!isLiveMap && (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => snapTo(sheet === "max" ? "mid" : "max")}
                    className="px-3 py-2 rounded-3xl text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-100 shadow-sm active:scale-[0.97] transition"
                  >
                    {sheet === "max" ? "↧ Recolher" : "↥ Expandir"}
                  </button>

                  <button
                    type="button"
                    onClick={() => snapTo(sheet === "min" ? "mid" : "min")}
                    className="px-3 py-2 rounded-3xl text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-slate-100 shadow-sm active:scale-[0.97] transition"
                  >
                    {sheet === "min" ? "▢ Detalhes" : "— Minimizar"}
                  </button>
                </div>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-3xl bg-white/5 border border-white/10 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="text-slate-400">Online</div>
                <div className="font-extrabold text-white">{onlineMarkers.length}</div>
              </div>

              <div className="rounded-3xl bg-white/5 border border-white/10 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="text-slate-400">Modo</div>
                <div className="font-extrabold text-white">{onlineResumo}</div>
              </div>

              <div className="rounded-3xl bg-white/5 border border-white/10 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="text-slate-400">Distância</div>
                <div className="font-extrabold text-white">
                  {distKm != null ? `${distKm.toFixed(2)} km` : "—"}
                </div>
              </div>

              <div className="rounded-3xl bg-white/5 border border-white/10 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                <div className="text-slate-400">Tempo</div>
                <div className="font-extrabold text-white">
                  {durMin != null ? `${Math.round(durMin)} min` : "—"}
                </div>
              </div>
            </div>

            {(!start || !dest) && !isLiveMap && (
              <div className="mt-2 text-[11px] text-slate-500">
                Sem 2 locais para rota
              </div>
            )}
          </div>

          {!isLiveMap && (
            <div
              ref={sheetScrollRef}
              className="px-5 pb-5 overflow-auto"
              style={{ height: sheetHeight - 118 }}
            >
              <div className="text-xs text-slate-300">
                {infoExtra?.status ? (
                  <>
                    Status:{" "}
                    <b className="text-white">
                      {String(infoExtra.status).toUpperCase()}
                    </b>
                  </>
                ) : null}
                {infoExtra?.criador ? (
                  <>
                    {" "}
                    · Criador: <b className="text-white">{infoExtra.criador}</b>
                  </>
                ) : null}
                {infoExtra?.aceitador ? (
                  <>
                    {" "}
                    · Aceitador:{" "}
                    <b className="text-white">{infoExtra.aceitador}</b>
                  </>
                ) : null}
              </div>

              <div className="mt-3 flex gap-2 flex-wrap">
                {!start && dest && (
                  <button
                    onClick={usarMinhaLocalizacao}
                    disabled={loadingStart}
                    className="px-4 py-3 rounded-3xl text-white font-bold disabled:opacity-60 active:scale-[0.98]"
                    type="button"
                    style={{
                      background: "linear-gradient(135deg,#2563eb,#1d4ed8)",
                      boxShadow: "0 8px 20px rgba(37,99,235,0.35)",
                    }}
                  >
                    {loadingStart
                      ? "Pegando localização…"
                      : "Traçar rota usando minha localização"}
                  </button>
                )}

                {googleMapsUrl && (
                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-3 rounded-3xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold shadow-sm active:scale-[0.98] transition"
                  >
                    Abrir no Google Maps
                  </a>
                )}
              </div>

              {!dest && !isMapaAoVivo && showPedido && (
                <div className="mt-3 text-xs text-amber-200 bg-amber-400/10 border border-amber-300/15 rounded-3xl px-3 py-2">
                  Este pedido não tem localização salva ainda.
                </div>
              )}

              {!showPedido && !isMapaAoVivo && (
                <div className="mt-3 text-xs text-slate-300 bg-white/5 border border-white/10 rounded-3xl px-3 py-2">
                  Pedido oculto (você desligou no topo). Ligue em “📍 Pedido”.
                </div>
              )}

              <div className="h-10" />
            </div>
          )}
        </div>
      </motion.div>
    </>
  );

  // ✅ Portal seguro (se não existir #modal-root, usa body)
  const getModalRoot = () => {
    if (typeof window === "undefined") return null;
    let root = document.getElementById("modal-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "modal-root";
      document.body.appendChild(root);
    }
    return root;
  };

  const modalRoot = getModalRoot();
  if (!modalRoot) return null;

  return createPortal(ui, modalRoot);
}