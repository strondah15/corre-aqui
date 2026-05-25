"use client";

import LoginGate from "@/components/LoginGate";
import ModoGate from "@/components/ModoGate";

export default function Page() {
  return (
    <LoginGate>
      <ModoGate />
    </LoginGate>
  );
}
