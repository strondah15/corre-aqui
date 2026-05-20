const html = `
  <div style="min-height:100vh;padding:30px;background:#020617;color:white;font-family:Arial,sans-serif;">
    <h1>Teste mobile click</h1>
    <p id="status" style="color:#93c5fd;">HTML nativo carregado</p>

    <button
      type="button"
      onclick="window.testeClick1()"
      style="position:relative;z-index:999999;padding:20px;margin:10px;background:white;color:black;border:0;border-radius:10px;font-weight:800;pointer-events:auto;touch-action:manipulation;"
    >
      Testar clique
    </button>

    <button
      type="button"
      onclick="window.testeClickStorage()"
      style="position:relative;z-index:999999;padding:20px;margin:10px;background:#22c55e;color:black;border:0;border-radius:10px;font-weight:800;pointer-events:auto;touch-action:manipulation;"
    >
      Testar localStorage
    </button>

    <a
      href="/"
      style="display:inline-block;position:relative;z-index:999999;padding:20px;margin:10px;background:#38bdf8;color:black;border-radius:10px;font-weight:800;text-decoration:none;pointer-events:auto;touch-action:manipulation;"
    >
      Voltar home link nativo
    </a>

    <button
      type="button"
      onclick="window.location.href='/'"
      style="position:relative;z-index:999999;padding:20px;margin:10px;background:#facc15;color:black;border:0;border-radius:10px;font-weight:800;pointer-events:auto;touch-action:manipulation;"
    >
      Voltar home JS
    </button>

    <script>
      document.getElementById("status").textContent = "Script nativo executou";

      window.testeClick1 = function () {
        document.getElementById("status").textContent = "Botao 1 clicou";
        alert("Botão 1 clicou");
      };

      window.testeClickStorage = function () {
        localStorage.setItem("testeMobile", "ok");
        document.getElementById("status").textContent = "localStorage ok";
        alert("localStorage ok");
      };
    </script>
  </div>
`;

export default function TesteClick() {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
