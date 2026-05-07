"use client";

import { useState } from "react";
import SplashCorreAqui from "@/components/SplashCorreAqui";
import LoginGate from "@/components/LoginGate";
import ModoGate from "@/components/ModoGate";

export default function Page() {
  const [mostrarLogo, setMostrarLogo] = useState(true);

  if (mostrarLogo) {
    return <SplashCorreAqui onFinish={() => setMostrarLogo(false)} />;
  }

  return (
    <LoginGate>
      <ModoGate />
    </LoginGate>
  );
}
