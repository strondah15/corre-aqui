'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'

export default function SplashScreen({ exiting = false, status = 'Conectando perto de voc\u00ea...' }) {
  return (
    <motion.main
      className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[linear-gradient(135deg,#0b73ff_0%,#19b7c8_44%,#ffe36b_100%)] px-5 text-white"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1, scale: exiting ? 0.985 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      aria-busy="true"
    >
      <style>{`
        @keyframes corre-splash-orbit {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(12deg); }
          50% { transform: translate3d(16px, -10px, 0) rotate(18deg); }
        }

        @keyframes corre-splash-soft-pulse {
          0%, 100% { opacity: .34; transform: scale(.92); }
          50% { opacity: .68; transform: scale(1.14); }
        }

        @keyframes corre-splash-pin-pop {
          0% { opacity: .7; transform: translate3d(0, 16px, 0) scale(.82) rotate(-3deg); }
          58% { opacity: 1; transform: translate3d(0, -7px, 0) scale(1.06) rotate(1.5deg); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        }

        @keyframes corre-splash-float {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(0, -5px, 0) scale(1.025); }
        }

        @keyframes corre-runner-enter {
          0% { opacity: 0; transform: translate3d(-118%, 34%, 0) scale(.48) rotate(-10deg); }
          14% { opacity: 1; }
          48% { opacity: 1; transform: translate3d(-34%, 12%, 0) scale(.72) rotate(-4deg); }
          76% { opacity: 1; transform: translate3d(2%, -2%, 0) scale(1.04) rotate(1deg); }
          90% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
          100% { opacity: 0; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
        }

        @keyframes corre-final-logo {
          0%, 72% { opacity: 0; transform: scale(.98); }
          86%, 100% { opacity: 1; transform: scale(1); }
        }

        @keyframes corre-splash-ring {
          0% { opacity: 0; transform: scale(.86); }
          35% { opacity: .34; }
          100% { opacity: 0; transform: scale(1.24); }
        }

        @keyframes corre-splash-streak {
          0% { opacity: 0; transform: translate3d(-72px, 0, 0); }
          42% { opacity: .95; }
          100% { opacity: 0; transform: translate3d(122px, 0, 0); }
        }

        @keyframes corre-splash-rise {
          0% { opacity: .78; transform: translate3d(0, 10px, 0) scale(.97); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }

        .corre-splash-orbit { animation: corre-splash-orbit 3.2s ease-in-out infinite; }
        .corre-splash-pulse { animation: corre-splash-soft-pulse 1.15s ease-in-out infinite; }
        .corre-splash-logo { animation: corre-splash-pin-pop .56s cubic-bezier(.2,.9,.2,1) both; }
        .corre-splash-logo-float { animation: corre-splash-float 1.45s ease-in-out 1.05s infinite; }
        .corre-splash-runner { animation: corre-runner-enter .9s cubic-bezier(.18,.84,.2,1) .08s both; }
        .corre-splash-final-logo { animation: corre-final-logo 1.05s ease-out both; }
        .corre-splash-ring { animation: corre-splash-ring .92s ease-out .66s both; }
        .corre-splash-streak { animation: corre-splash-streak .78s ease-out .12s both; }
        .corre-splash-title { animation: corre-splash-rise .38s ease-out .76s both; }
        .corre-splash-status { animation: corre-splash-rise .32s ease-out .9s both; }

        @media (prefers-reduced-motion: reduce) {
          .corre-splash-orbit,
          .corre-splash-pulse,
          .corre-splash-logo,
          .corre-splash-logo-float,
          .corre-splash-runner,
          .corre-splash-final-logo,
          .corre-splash-ring,
          .corre-splash-streak,
          .corre-splash-title,
          .corre-splash-status {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            animation-delay: 0s !important;
          }
        }
      `}</style>

      <div className="corre-splash-orbit pointer-events-none absolute -right-24 top-12 h-80 w-80 rounded-[80px] bg-yellow-200/30" />
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/16" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.22),transparent_38%)]" />

      <section className="relative w-full max-w-sm text-center">
        <div className="relative mx-auto h-[240px] w-[240px] sm:h-[320px] sm:w-[320px]">
          <div
            className="corre-splash-pulse absolute inset-8 rounded-full bg-blue-700/18 blur-3xl sm:inset-10"
            aria-hidden="true"
          />

          <div className="corre-splash-logo absolute inset-0 grid place-items-center">
            <div className="corre-splash-logo-float h-full w-full">
              <div className="relative h-full w-full scale-[1.28] drop-shadow-[0_28px_60px_rgba(15,23,42,0.28)]">
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox="0 0 512 512"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="correPinSplash" x1="92" x2="420" y1="42" y2="450" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#0b73ff" />
                      <stop offset="0.52" stopColor="#18bfd2" />
                      <stop offset="1" stopColor="#0646a8" />
                    </linearGradient>
                  </defs>
                  <path d="M256 24C153.9 24 71 106.5 71 208.2c0 131.6 154.9 244.8 176.9 260.2a14.3 14.3 0 0 0 16.2 0C286.1 453 441 339.8 441 208.2 441 106.5 358.1 24 256 24Z" fill="url(#correPinSplash)" />
                  <path d="M256 52c86.4 0 156.5 69.8 156.5 155.9 0 105.2-112 200.4-156.5 234.7C211.5 408.3 99.5 313.1 99.5 207.9 99.5 121.8 169.6 52 256 52Z" fill="#ffffff" opacity="0.16" />
                  <circle cx="256" cy="205" r="121" fill="#ffffff" opacity="0.94" />
                  <circle cx="256" cy="205" r="96" fill="#eaf7ff" />
                </svg>

                <Image
                  src="/corre-runner.png"
                  width={900}
                  height={1185}
                  alt=""
                  aria-hidden="true"
                  priority
                  unoptimized
                  className="corre-splash-runner absolute left-[30.8%] top-[18%] h-auto w-[43%] object-contain"
                />

                <Image
                  src="/corre-logo-simple.png"
                  width={1024}
                  height={1024}
                  alt=""
                  aria-hidden="true"
                  priority
                  unoptimized
                  className="corre-splash-final-logo absolute inset-0 h-full w-full object-contain"
                />
              </div>
            </div>
          </div>

          <div className="corre-splash-ring absolute inset-0 grid place-items-center" aria-hidden="true">
            <div className="h-[78%] w-[78%] rounded-full border border-white/45" />
          </div>

          <div
            className="corre-splash-streak absolute left-2 top-[38%] h-2 w-16 rounded-full bg-yellow-200/90 blur-[1px] sm:left-3 sm:w-20"
            aria-hidden="true"
          />

          <div className="corre-splash-title absolute -bottom-10 left-1/2 w-max -translate-x-1/2 text-center text-2xl font-black tracking-tight text-white drop-shadow-[0_8px_22px_rgba(37,99,235,0.28)] sm:-bottom-14 sm:text-4xl">
            Corre Aqui
          </div>
        </div>

        <div className="corre-splash-status mt-16 text-xs font-black uppercase tracking-[0.18em] text-blue-950/70 sm:mt-20">
          {status}
        </div>
      </section>
    </motion.main>
  )
}
