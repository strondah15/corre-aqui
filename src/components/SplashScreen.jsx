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
          0% { opacity: 0; transform: translate3d(-155%, 34%, 0) scale(1) rotate(-8deg); }
          8% { opacity: 1; }
          86% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
          94% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1) rotate(0deg); }
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
        .corre-splash-logo-float { animation: corre-splash-float 1.45s ease-in-out 1.75s infinite; }
        .corre-splash-runner { animation: corre-runner-enter 1.45s linear .12s both; }
        .corre-splash-runner-image {
          filter: saturate(1.12) contrast(1.04) brightness(1.04);
        }
        .corre-splash-pin-aura {
          background:
            radial-gradient(circle at 52% 84%, rgba(255, 226, 27, .44), transparent 26%),
            radial-gradient(circle at 45% 34%, rgba(255, 255, 255, .22), transparent 35%),
            radial-gradient(circle at 50% 48%, rgba(14, 165, 233, .36), transparent 52%);
          filter: blur(12px);
          transform: scale(.9);
        }
        .corre-splash-pin-base {
          filter:
            saturate(1.22)
            contrast(1.1)
            brightness(1.05)
            drop-shadow(0 18px 34px rgba(2, 23, 57, .28))
            drop-shadow(0 0 24px rgba(14, 165, 233, .18));
        }
        .corre-splash-ring { animation: corre-splash-ring .92s ease-out 1.28s both; }
        .corre-splash-streak { animation: corre-splash-streak 1.26s ease-out .18s both; }
        .corre-splash-title { animation: corre-splash-rise .38s ease-out 1.5s both; }
        .corre-splash-status { animation: corre-splash-rise .32s ease-out 1.68s both; }

        @media (prefers-reduced-motion: reduce) {
          .corre-splash-orbit,
          .corre-splash-pulse,
          .corre-splash-logo,
          .corre-splash-logo-float,
          .corre-splash-runner,
          .corre-splash-pin-aura,
          .corre-splash-pin-base,
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

      <section className="relative flex min-h-[min(680px,100dvh)] w-full max-w-sm flex-col items-center justify-center px-2 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+1rem)] text-center">
        <div className="relative mx-auto h-[248px] w-[248px] sm:h-[320px] sm:w-[320px]">
          <div
            className="corre-splash-pulse absolute inset-8 rounded-full bg-blue-700/18 blur-3xl sm:inset-10"
            aria-hidden="true"
          />

          <div className="corre-splash-logo absolute inset-0 grid place-items-center">
            <div className="corre-splash-logo-float h-full w-full">
              <div className="relative h-full w-full scale-[1.22] drop-shadow-[0_28px_60px_rgba(15,23,42,0.28)]">
                <div className="corre-splash-pin-aura pointer-events-none absolute inset-[9%]" aria-hidden="true" />

                <Image
                  src="/pin_vazio.png"
                  width={460}
                  height={640}
                  alt=""
                  aria-hidden="true"
                  priority
                  unoptimized
                  className="corre-splash-pin-base absolute left-1/2 top-[3%] h-[88%] w-auto -translate-x-1/2 object-contain"
                />

                <div className="corre-splash-runner absolute left-[35.8%] top-[6.6%] w-[45%]">
                  <Image
                    src="/boneco_correndo.png"
                    width={420}
                    height={500}
                    alt=""
                    aria-hidden="true"
                    priority
                    unoptimized
                    className="corre-splash-runner-image relative z-10 h-auto w-full object-contain"
                  />
                </div>
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

        </div>

        <h1 className="corre-splash-title mt-8 w-full text-center text-[2.45rem] font-black leading-none tracking-[0] text-white drop-shadow-[0_8px_22px_rgba(37,99,235,0.28)] sm:mt-10 sm:text-5xl">
          Corre Aqui
        </h1>

        <div className="corre-splash-status mt-16 w-full max-w-[340px] text-center text-[0.78rem] font-black uppercase leading-relaxed tracking-[0.28em] text-blue-950/70 sm:mt-20 sm:text-sm">
          {status}
        </div>
      </section>
    </motion.main>
  )
}
