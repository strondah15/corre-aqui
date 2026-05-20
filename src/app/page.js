"use client";

import { useCallback, useEffect, useState } from "react";
import LoginGate from "@/components/LoginGate";
import ModoGate from "@/components/ModoGate";
import SplashCorreAqui from "@/components/SplashCorreAqui";

export default function Page() {
  const [mostrarIntro, setMostrarIntro] = useState(true);

  const fecharIntro = useCallback(() => {
    setMostrarIntro(false);
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    const mobile = window.matchMedia?.("(max-width: 640px)")?.matches;
    const timer = window.setTimeout(fecharIntro, reduceMotion ? 550 : mobile ? 3400 : 3900);

    return () => window.clearTimeout(timer);
  }, [fecharIntro]);

  return (
    <>
      <LoginGate>
        <ModoGate />
      </LoginGate>

      {mostrarIntro ? <SplashCorreAqui onFinish={fecharIntro} /> : null}
    </>
  );
}
