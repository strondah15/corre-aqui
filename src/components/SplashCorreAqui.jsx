"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

export default function SplashCorreAqui({ onFinish }) {
  const [visivel, setVisivel] = useState(true);

  useEffect(() => {
    const mobile = window.matchMedia?.("(max-width: 640px)")?.matches;
    const timer = setTimeout(() => {
      setVisivel(false);
      onFinish?.();
    }, mobile ? 3300 : 3800);

    return () => clearTimeout(timer);
  }, [onFinish]);

  if (!visivel) return null;

  return (
    <motion.div
      className="corre-splash-mobile-safe pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#020617]"
      aria-hidden="true"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      onAnimationEnd={onFinish}
      style={{ animation: "correSplashOut 360ms ease 3.25s forwards" }}
    >
      <style>{`
        @keyframes correSplashOut {
          to {
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
          }
        }

        .corre-splash-mobile-safe,
        .corre-splash-mobile-safe * {
          pointer-events: none !important;
        }

        @media (max-width: 640px) {
          .corre-splash-mobile-safe {
            animation-delay: 2.8s !important;
          }
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.12),transparent_34%)]" />

      <div className="relative h-[190px] w-[190px] sm:h-[260px] sm:w-[260px]">
        <motion.img
          src="/pin_vazio.png"
          alt="Pin"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 w-full h-full object-contain"
        />

        <motion.img
          src="/boneco_correndo.png"
          alt="Boneco"
          initial={{
            x: -260,
            y: 20,
            opacity: 1,
            scale: 1,
          }}
          animate={{
            x: -10,
            y: -6,
            opacity: 1,
            scale: 1,
          }}
          transition={{
            type: "spring",
            stiffness: 90,
            damping: 12,
            delay: 0.35,
          }}
          className="absolute left-[88px] top-[31px] w-[84px] sm:left-[121px] sm:top-[42px] sm:w-[115px]"
        />

        <motion.div
          className="absolute -bottom-9 left-1/2 -translate-x-1/2 text-center text-xs font-black uppercase tracking-[0.22em] text-cyan-100/80 sm:-bottom-11"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.35 }}
        >
          Corre Aqui
        </motion.div>
      </div>
    </motion.div>
  );
}
