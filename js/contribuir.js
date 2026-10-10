/* ============================================================
   contribuir.js — janela (pop-up) "Contribuir para as sacolas"
   Abre quando se clica em qualquer elemento com o atributo
   data-contribuir, ou quando o endereço traz ?contribuir=1.
   Os dados de pagamento vêm de data/site.json (bloco "pagamento").
   ============================================================ */
(function () {
  let overlay = null;
  let ultimoGatilho = null;

  function criarJanela() {
    overlay = document.createElement("div");
    overlay.className = "contribuir-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="contribuir-janela" role="dialog" aria-modal="true" aria-labelledby="contribuir-titulo">
        <button type="button" class="contribuir-fechar" aria-label="Fechar">&times;</button>
        <h3 id="contribuir-titulo">Contribuir para as sacolas</h3>
        <p class="contribuir-intro">Use os dados abaixo para realizar o <strong>pagamento por referência</strong>:</p>
        <img src="assets/images/unitelmoney_logo.jpg" alt="Logo Unitel Money" class="contribuir-logo" />
        <div class="contribuir-dados">
          <p><strong>Entidade:</strong> <span id="contribuir-entidade"></span>
             <span class="contribuir-copiar" role="button" tabindex="0" data-alvo="contribuir-entidade">[copiar]</span></p>
          <p><strong>Referência:</strong> <span id="contribuir-referencia"></span>
             <span class="contribuir-copiar" role="button" tabindex="0" data-alvo="contribuir-referencia">[copiar]</span></p>
        </div>
        <p class="contribuir-nota" id="contribuir-nota"></p>
        <div class="contribuir-envio">
          <a id="contribuir-whatsapp" class="contribuir-wa" target="_blank" rel="noopener" href="#">Enviar via WhatsApp</a>
          <a id="contribuir-email" class="contribuir-email" href="#">Enviar por E-mail</a>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    // Fechar: botão, clique fora da janela
    overlay
      .querySelector(".contribuir-fechar")
      .addEventListener("click", fechar);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) fechar();
    });

    // Copiar entidade / referência
    overlay.querySelectorAll(".contribuir-copiar").forEach((el) => {
      const copiar = async () => {
        const texto = document.getElementById(el.dataset.alvo).textContent;
        try {
          await navigator.clipboard.writeText(texto);
          el.textContent = "[copiado]";
          setTimeout(() => (el.textContent = "[copiar]"), 1500);
        } catch (err) {
          console.error("Erro ao copiar:", err);
        }
      };
      el.addEventListener("click", copiar);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          copiar();
        }
      });
    });

    // Teclado: Esc fecha, Tab fica dentro da janela
    document.addEventListener("keydown", (e) => {
      if (overlay.hidden) return;
      if (e.key === "Escape") {
        fechar();
        return;
      }
      if (e.key === "Tab") {
        const focaveis = overlay.querySelectorAll(
          "button, a[href], [tabindex='0']",
        );
        const primeiro = focaveis[0];
        const ultimo = focaveis[focaveis.length - 1];
        if (e.shiftKey && document.activeElement === primeiro) {
          e.preventDefault();
          ultimo.focus();
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    });
  }

  function preencher(p) {
    document.getElementById("contribuir-entidade").textContent = p.entidade;
    document.getElementById("contribuir-referencia").textContent = p.referencia;
    document.getElementById("contribuir-nota").textContent =
      `A contribuição mínima é de ${p.valorMinimo} Kz. Após efectuar o pagamento, envie o seu comprovativo clicando no botão abaixo.`;

    const mensagem =
      "Olá, segue o meu comprovativo da contribuição para a Sacolas Eco Conecta.";
    document.getElementById("contribuir-whatsapp").href =
      `https://wa.me/${p.whatsapp}?text=${encodeURIComponent(mensagem)}`;

    const email = document.getElementById("contribuir-email");
    const assunto = "Comprovativo%20de%20Pagamento";
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
      email.href = `mailto:${p.email}?subject=${assunto}`;
    } else {
      email.href = `https://mail.google.com/mail/?view=cm&fs=1&to=${p.email}&su=${assunto}`;
      email.target = "_blank";
      email.rel = "noopener";
    }
  }

  async function abrir(gatilho) {
    try {
      const dados = await SiteData.carregar();
      if (!overlay) criarJanela();
      preencher(dados.pagamento);
    } catch (err) {
      console.error("Não foi possível abrir a janela de contribuição:", err);
      return;
    }
    ultimoGatilho = gatilho || null;
    overlay.hidden = false;
    document.body.classList.add("contribuir-aberto");
    overlay.querySelector(".contribuir-fechar").focus();
  }

  function fechar() {
    if (!overlay) return;
    overlay.hidden = true;
    document.body.classList.remove("contribuir-aberto");
    if (ultimoGatilho) ultimoGatilho.focus();
  }

  document.addEventListener("click", function (e) {
    const gatilho = e.target.closest("[data-contribuir]");
    if (!gatilho) return;
    e.preventDefault();
    abrir(gatilho);
  });

  // Vindo de uma ligação com ?contribuir=1
  document.addEventListener("DOMContentLoaded", function () {
    if (new URLSearchParams(window.location.search).get("contribuir") === "1") {
      abrir(null);
    }
  });
})();
