/* Rodapé partilhado (todas as páginas).
   Uso: <div id="site-footer"></div> dentro do <footer>, e <script src="js/footer.js"></script>.
   O ano do copyright é calculado aqui: não é preciso actualizar. */
(function () {
  "use strict";

  // Valores por omissão: usados se o site.json não carregar ou não tiver "contactos".
  var CONTACTO_BASE = {
    whatsapp: "244935269451",
    whatsappTexto: "(+244) 935269451",
    email: "gconecta05angola@gmail.com",
    local: "Huambo, Angola",
  };
  var CONTACTO = {
    whatsapp: CONTACTO_BASE.whatsapp,
    whatsappTexto: CONTACTO_BASE.whatsappTexto,
    email: CONTACTO_BASE.email,
    local: CONTACTO_BASE.local,
  };

  // Escapa texto vindo do JSON antes de o pôr no HTML
  function esc(t) {
    return String(t)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Lê o bloco "contactos" do site.json; campos em falta mantêm o valor por omissão
  function aplicarContactos(c) {
    if (!c || typeof c !== "object") return false;
    var mudou = false;
    ["email", "whatsapp", "whatsappTexto", "local"].forEach(function (k) {
      if (typeof c[k] === "string" && c[k].trim() !== "") {
        CONTACTO[k] = c[k].trim();
        mudou = true;
      }
    });
    CONTACTO.whatsapp = CONTACTO.whatsapp.replace(/\D/g, "");
    return mudou;
  }

  var EXPLORAR = [
    ["Início", "index.html"],
    ["Quem Somos", "sobre.html"],
    ["Workshops gravados", "workshops-gravados.html"],
    ["Verificar certificado", "certificados.html"],
    ["Contacto", "contacto.html"],
  ];

  var PARTICIPE = [
    ["Inscrever-se no workshop", "inscricao.html"],
    ["Sacolas Eco Conecta", "index.html#sacolas-section"],
    ["Contribuir", "index.html?contribuir=1"],
  ];

  function lista(itens) {
    return itens
      .map(function (i) {
        return '<li><a href="' + i[1] + '">' + i[0] + "</a></li>";
      })
      .join("");
  }

  function html() {
    var ano = new Date().getFullYear();
    var wa =
      "https://wa.me/" +
      encodeURIComponent(CONTACTO.whatsapp) +
      "?text=" +
      encodeURIComponent("Olá, gostaria de receber uma informação");

    return (
      '<div class="sf-main">' +
      '<div class="sf-col sf-brand">' +
      '<a href="index.html" class="sf-logo-link" aria-label="Grupo Conecta, página inicial">' +
      '<img src="assets/icons/logowhite.png" alt="Grupo Conecta" class="sf-logo" />' +
      "</a>" +
      "<p>Conectando jovens ao conhecimento, às experiências e aos propósitos que transformam vidas e comunidades.</p>" +
      "</div>" +
      '<nav class="sf-col" aria-label="Explorar">' +
      "<h3>Explorar</h3><ul>" +
      lista(EXPLORAR) +
      "</ul></nav>" +
      '<nav class="sf-col" aria-label="Participe">' +
      "<h3>Participe</h3><ul>" +
      lista(PARTICIPE) +
      "</ul></nav>" +
      '<div class="sf-col">' +
      "<h3>Contacto</h3>" +
      '<ul class="sf-contactos">' +
      '<li><a href="' +
      wa +
      '" target="_blank" rel="noopener noreferrer"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i><span>' +
      esc(CONTACTO.whatsappTexto) +
      "</span></a></li>" +
      '<li><a href="mailto:' +
      esc(CONTACTO.email) +
      '"><i class="fa-regular fa-envelope" aria-hidden="true"></i><span>' +
      esc(CONTACTO.email) +
      "</span></a></li>" +
      '<li class="sf-local"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>' +
      esc(CONTACTO.local) +
      "</span></li>" +
      "</ul></div>" +
      "</div>" +
      '<div class="sf-bottom">' +
      "<p>&copy; " +
      ano +
      " Grupo Conecta. Todos os direitos reservados.</p>" +
      '<ul class="sf-legal">' +
      '<li><a href="privacidade.html">Política de Privacidade</a></li>' +
      '<li><a href="termos.html">Termos de Uso</a></li>' +
      "</ul>" +
      '<p class="sf-creditos">Desenvolvido por <a href="https://facebook.com/ContornosDesigns" target="_blank" rel="noopener noreferrer">Contornos Designs</a></p>' +
      "</div>"
    );
  }

  function montar() {
    var alvo = document.getElementById("site-footer");
    if (!alvo) return;
    alvo.className = "site-footer";
    alvo.innerHTML = html();

    // Depois de mostrar o rodapé com os valores por omissão, vai buscar os contactos
    // ao site.json e, se forem diferentes, volta a desenhar.
    if (typeof fetch !== "function") return;
    fetch("data/site.json?v=" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("site.json indisponível");
        return r.json();
      })
      .then(function (dados) {
        if (aplicarContactos(dados && dados.contactos)) {
          alvo.innerHTML = html();
        }
      })
      .catch(function () {
        /* mantém os valores por omissão */
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montar);
  } else {
    montar();
  }
})();
