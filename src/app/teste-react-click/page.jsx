"use client";

import { useEffect, useState } from "react";

export default function TesteReactClick() {
  const [status, setStatus] = useState("React ainda nao hidratou");

  useEffect(() => {
    setStatus("React hidratou");
    console.log("[TesteReactClick] hidratou");
  }, []);

  return (
    <div style={{ minHeight: "100vh", padding: 30, background: "#020617", color: "white" }}>
      <h1>Teste React click</h1>
      <p>{status}</p>

      <button
        type="button"
        onClick={() => {
          console.log("[TesteReactClick] Botao React clicou");
          setStatus("Botao React clicou");
          alert("React clicou");
        }}
        style={{
          position: "relative",
          zIndex: 999999,
          padding: 20,
          margin: 10,
          background: "white",
          color: "black",
          pointerEvents: "auto",
          touchAction: "manipulation",
        }}
      >
        Testar React clique
      </button>

      <button
        type="button"
        onClick={() => {
          localStorage.setItem("testeReactMobile", "ok");
          console.log("[TesteReactClick] localStorage ok");
          setStatus("React localStorage ok");
          alert("React localStorage ok");
        }}
        style={{
          position: "relative",
          zIndex: 999999,
          padding: 20,
          margin: 10,
          background: "#22c55e",
          color: "black",
          pointerEvents: "auto",
          touchAction: "manipulation",
        }}
      >
        Testar React localStorage
      </button>
    </div>
  );
}
