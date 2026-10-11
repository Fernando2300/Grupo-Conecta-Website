/* Rodapé partilhado (todas as páginas).
   Uso: <div id="site-footer"></div> dentro do <footer>, e <script src="js/footer.js"></script>.
   O ano do copyright é calculado aqui: não é preciso actualizar. */
(function () {
  "use strict";

  var CONTACTO = {
    whatsapp: "244935269451",
    whatsappTexto: "(+244) 935269451",
    email: "gconecta05angola@gmail.com",
    local: "Huambo, Angola",
  };

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
      CONTACTO.whatsapp +
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
      CONTACTO.whatsappTexto +
      "</span></a></li>" +
      '<li><a href="mailto:' +
      CONTACTO.email +
      '"><i class="fa-regular fa-envelope" aria-hidden="true"></i><span>' +
      CONTACTO.email +
      "</span></a></li>" +
      '<li class="sf-local"><i class="fa-solid fa-location-dot" aria-hidden="true"></i><span>' +
      CONTACTO.local +
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", montar);
  } else {
    montar();
  }
})();
