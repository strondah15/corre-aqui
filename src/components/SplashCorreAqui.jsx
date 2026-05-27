"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

function BluePin() {
  return (
    <svg viewBox="0 0 512 512" className="h-full w-full drop-shadow-[0_26px_58px_rgba(37,99,235,0.32)]" aria-hidden="true">
      <defs>
        <linearGradient id="splash-old-pin-blue" x1="96" x2="418" y1="48" y2="438" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0b73ff" />
          <stop offset="0.54" stopColor="#18bfd2" />
          <stop offset="1" stopColor="#0646a8" />
        </linearGradient>
      </defs>
      <path d="M256 24C153.9 24 71 106.5 71 208.2c0 131.6 154.9 244.8 176.9 260.2a14.3 14.3 0 0 0 16.2 0C286.1 453 441 339.8 441 208.2 441 106.5 358.1 24 256 24Z" fill="url(#splash-old-pin-blue)" />
      <circle cx="256" cy="205" r="121" fill="#fff" opacity="0.94" />
      <circle cx="256" cy="205" r="96" fill="#eaf7ff" />
    </svg>
  );
}

function YellowRunner({ className = "" }) {
  return (
    <svg viewBox="0 0 220 220" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="splash-old-runner-yellow" x1="30" x2="190" y1="30" y2="190" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fff173" />
          <stop offset="0.55" stopColor="#ffd91a" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <g fill="none" stroke="url(#splash-old-runner-yellow)" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="132" cy="45" r="18" fill="url(#splash-old-runner-yellow)" stroke="none" />
        <path d="M116 76 91 121" strokeWidth="27" />
        <path d="M110 86 64 81" strokeWidth="21" />
        <path d="M114 86 153 103 178 83" strokeWidth="21" />
        <path d="M91 121 55 169 30 200" strokeWidth="24" />
        <path d="M92 122 143 148 125 199" strokeWidth="24" />
      </g>
    </svg>
  );
}

export default function SplashCorreAqui({ onFinish }) {
  const [visivel, setVisivel] = useState(true);

  useEffect(() => {
    const mobile = window.matchMedia?.("(max-width: 640px)")?.matches;
    const timer = setTimeout(
      () => {
        setVisivel(false);
        onFinish?.();
      },
      mobile ? 3300 : 3800,
    );

    return () => clearTimeout(timer);
  }, [onFinish]);

  if (!visivel) return null;

  return (
    <motion.div
      className="corre-splash-mobile-safe pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_100%)]"
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
      <div className="pointer-events-none absolute -right-24 top-12 h-80 w-80 rounded-[80px] bg-yellow-200/30 rotate-12" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/16" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.2),transparent_38%)]" />

      <div className="relative h-[190px] w-[190px] sm:h-[260px] sm:w-[260px]">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="absolute inset-0 w-full h-full object-contain"
        >
          <BluePin />
        </motion.div>

        <motion.div
          initial={{
            x: -260,
            y: 30,
            opacity: 1,
            scale: 1,
          }}
          animate={{
            x: 8,
            y: 6,
            opacity: 1,
            scale: 1,
          }}
          transition={{
            type: "spring",
            stiffness: 90,
            damping: 12,
            delay: 0.35,
          }}
          className="absolute left-[74px] top-[36px] w-[74px] sm:left-[101px] sm:top-[49px] sm:w-[100px]"
        >
          <YellowRunner className="h-full w-full" />
        </motion.div>

        <motion.div
          className="absolute -bottom-9 left-1/2 -translate-x-1/2 text-center text-lg font-black tracking-tight text-white drop-shadow-[0_8px_22px_rgba(37,99,235,0.28)] sm:-bottom-12 sm:text-2xl"
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
