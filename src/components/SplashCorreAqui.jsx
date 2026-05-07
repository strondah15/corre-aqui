"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";

export default function SplashCorreAqui({ onFinish }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish?.();
    }, 2500);

    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#020617] overflow-hidden">
      <div className="relative w-[260px] h-[260px]">
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
          className="absolute top-[42px] left-[121px] w-[115px]"
        />
      </div>
    </div>
  );
}
