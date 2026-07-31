"use client";

import { useCallback, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  PROFESSIONAL_FEATURED_PLAN_ID,
  formatCommercialPrice,
} from "@/lib/commercialProducts";

const benefits = [
  "Presenca em Profissionais em Destaque",
  "Participacao no carrossel regional",
  "Maior exposicao na Home Cliente",
  "Mais visualizacoes do perfil e portfolio",
  "Acesso futuro as estatisticas do destaque",
];

const states = [
  ["Sem plano", "Conhecer plano"],
  ["Checkout criado", "Aguardando pagamento"],
  ["Pagamento pendente", "Pagamento em analise"],
  ["Confirmando", "Aguardando webhook"],
  ["Plano ativo", "Destaque ativo"],
];

export default function PlanosCorreAqui() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const handleCheckout = useCallback(async () => {
    setLoading(true);
    setError("");
    setStatus("");

    try {
      const user = auth.currentUser;
      if (!user) {
        setError("Entre na sua conta para conhecer o plano.");
        return;
      }

      const token = await user.getIdToken();
      const response = await fetch("/api/planos/checkout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ planId: PROFESSIONAL_FEATURED_PLAN_ID }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data?.ok) {
        setError(data?.reason || data?.error || "Nao foi possivel criar o checkout agora.");
        return;
      }

      setStatus(data?.message || "Checkout criado. Aguarde a confirmacao do pagamento.");
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (checkoutError) {
      console.error("[PLANOS] checkout profissional falhou:", checkoutError);
      setError("Falha temporaria ao criar checkout. Tente novamente em instantes.");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-[28px] border border-amber-200 bg-white p-5 text-slate-950 shadow-[0_24px_70px_rgba(15,23,42,0.14)] md:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(37,99,235,0.14),transparent_32%),radial-gradient(circle_at_92%_6%,rgba(245,158,11,0.18),transparent_30%),linear-gradient(135deg,rgba(255,217,26,0.18),transparent_44%)]" />

        <div className="relative grid gap-5 md:grid-cols-[1.2fr_0.8fr] md:items-start">
          <div>
            <div className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-amber-800">
              Corre Aqui Destaque
            </div>
            <h2 className="mt-3 text-2xl font-black tracking-tight text-blue-950 md:text-4xl">
              Ganhe mais visibilidade
            </h2>
            <p className="mt-2 max-w-xl text-sm font-semibold leading-relaxed text-slate-600 md:text-base">
              Apareca para mais clientes da sua regiao por {formatCommercialPrice()}/30 dias, sem alterar sua reputacao organica.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {benefits.map((benefit) => (
                <div key={benefit} className="flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-xs font-bold text-slate-700">
                  <span className="mt-0.5 text-emerald-600" aria-hidden="true">✓</span>
                  <span>{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="rounded-[24px] border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-4 shadow-inner">
            <div className="text-sm font-black text-blue-950">Plano destaque</div>
            <div className="mt-2 text-4xl font-black text-blue-950">
              R$ 9,99
              <span className="text-sm font-black text-slate-500"> / 30 dias</span>
            </div>
            <p className="mt-2 text-xs font-semibold leading-snug text-slate-600">
              Destaque valido por 30 dias. Renovacao automatica fica desativada ate a infraestrutura recorrente estar segura.
            </p>

            <button
              type="button"
              onClick={handleCheckout}
              disabled={loading}
              className="mt-4 h-12 w-full rounded-2xl bg-[#ffd91a] text-sm font-black text-blue-950 shadow-[0_14px_28px_rgba(245,158,11,0.25)] transition hover:bg-yellow-300 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Criando checkout..." : "Assinar por R$ 9,99"}
            </button>

            {status ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
                {status}
              </div>
            ) : null}
            {error ? (
              <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                {error}
              </div>
            ) : null}
          </aside>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
        <h3 className="text-base font-black text-blue-950">Estados do plano</h3>
        <div className="mt-3 grid gap-2 md:grid-cols-5">
          {states.map(([title, description]) => (
            <div key={title} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
              <div className="text-[11px] font-black uppercase tracking-[0.08em] text-slate-500">{title}</div>
              <div className="mt-1 text-xs font-bold text-slate-800">{description}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold leading-relaxed text-blue-900">
          O destaque aumenta a visibilidade, mas nao altera avaliacoes, reputacao, servicos concluidos ou posicao organica fora da area patrocinada.
        </p>
      </section>
    </div>
  );
}
