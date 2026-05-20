const html = `
  <div style="min-height:100vh;padding:30px;background:#020617;color:white;font-family:Arial,sans-serif;">
    <h1>Teste click static via rota</h1>
    <p id="status">HTML nativo carregado</p>

    <button
      type="button"
      onclick="window.testeStaticClick1()"
      style="position:relative;z-index:999999;padding:20px;margin:10px;background:white;color:black;border:0;border-radius:10px;font-weight:800;pointer-events:auto;touch-action:manipulation;"
    >
      Testar clique
    </button>

    <button
      type="button"
      onclick="window.testeStaticStorage()"
      style="position:relative;z-index:999999;padding:20px;margin:10px;background:#22c55e;color:black;border:0;border-radius:10px;font-weight:800;pointer-events:auto;touch-action:manipulation;"
    >
      Testar localStorage
    </button>

    <script>
      document.getElementById("status").textContent = "Script nativo executou";

      window.testeStaticClick1 = function () {
        document.getElementById("status").textContent = "Botao static clicou";
        alert("Botão static clicou");
      };

      window.testeStaticStorage = function () {
        localStorage.setItem("testeStaticMobile", "ok");
        document.getElementById("status").textContent = "localStorage static ok";
        alert("localStorage static ok");
      };
    </script>
  </div>
`;

export default function TesteClickStatic() {
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
