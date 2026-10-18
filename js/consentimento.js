/* =====================================================================
   consentimento.js
   Aviso de cookies e carregamento condicional de:
     - Google Analytics (G-ZHPQD4KRT1)
     - Meta Pixel (2279744039238290)
   Nada disto carrega antes de o visitante clicar em "Aceitar".
   Carregar em todas as páginas públicas, no <head>, com defer:
     <script src="js/consentimento.js" defer></script>
   NÃO carregar em admin.html.
   ===================================================================== */
(function () {
  "use strict";

  var ID_ANALYTICS = "G-ZHPQD4KRT1";
  var ID_PIXEL = "2279744039238290";
  var CHAVE = "conecta_cookies";
  // Subir este número quando a política de cookies mudar: o aviso volta a aparecer.
  var VERSAO = 1;
  var LINK_POLITICA = "privacidade.html#cookies";

  var banner = null;
  var emMemoria = null; // usado se o browser não permitir guardar a escolha

  /* ---------- Escolha guardada ---------- */
  function lerEscolha() {
    var bruto = null;
    try {
      bruto = window.localStorage.getItem(CHAVE);
    } catch (e) {
      return emMemoria;
    }
    if (!bruto) return emMemoria;
    try {
      var o = JSON.parse(bruto);
      if (o && o.v === VERSAO && (o.e === "aceite" || o.e === "recusado")) {
        return o.e;
      }
    } catch (e) {}
    return null;
  }

  function guardarEscolha(estado) {
    emMemoria = estado;
    try {
      window.localStorage.setItem(
        CHAVE,
        JSON.stringify({ v: VERSAO, e: estado, t: new Date().toISOString() }),
      );
    } catch (e) {}
  }

  /* ---------- Google Analytics ---------- */
  function carregarAnalytics() {
    if (window.__conectaGA) return;
    window.__conectaGA = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", ID_ANALYTICS);
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + ID_ANALYTICS;
    document.head.appendChild(s);
  }

  /* ---------- Meta Pixel ---------- */
  // Código-base oficial da Meta, sem o <noscript> (a imagem pediria o
  // PageView ao Facebook mesmo sem consentimento, por isso não é usada).
  function carregarPixel() {
    if (window.fbq) return;
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () {
        n.callMethod
          ? n.callMethod.apply(n, arguments)
          : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n;
      n.push = n;
      n.loaded = !0;
      n.version = "2.0";
      n.queue = [];
      t = b.createElement(e);
      t.async = !0;
      t.src = v;
      s = b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t, s);
    })(
      window,
      document,
      "script",
      "https://connect.facebook.net/en_US/fbevents.js",
    );
    window.fbq("init", ID_PIXEL);
    window.fbq("track", "PageView");
  }

  /* ---------- Apagar cookies de medição (ao recusar depois de aceitar) ---------- */
  function apagarCookies() {
    var host = location.hostname;
    var partes = host.split(".");
    var dominios = ["", host, "." + host];
    if (partes.length > 2) dominios.push("." + partes.slice(-2).join("."));
    document.cookie.split(";").forEach(function (c) {
      var nome = c.split("=")[0].trim();
      if (!/^(_ga|_gid|_gat|_fbp|_fbc)/.test(nome)) return;
      dominios.forEach(function (d) {
        document.cookie =
          nome +
          "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" +
          (d ? "; domain=" + d : "");
      });
    });
  }

  /* ---------- Aplicar a escolha ---------- */
  function aplicar(estado, mudouDeAceiteParaRecusado) {
    if (estado === "aceite") {
      carregarAnalytics();
      carregarPixel();
    } else if (mudouDeAceiteParaRecusado) {
      apagarCookies();
    }
  }

  /* ---------- Banner ---------- */
  function criar(tag, classe, texto) {
    var el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto) el.textContent = texto;
    return el;
  }

  function construirBanner() {
    var caixa = criar("div", "cc-banner");
    caixa.setAttribute("role", "region");
    caixa.setAttribute("aria-label", "Aviso de cookies");
    caixa.hidden = true;

    var texto = criar("div", "cc-texto");
    var corpo = criar("p", "cc-corpo");
    corpo.appendChild(
      document.createTextNode(
        "Usamos cookies para perceber o que funciona no site e chegar a mais jovens com os nossos workshops. Só os activamos se você aceitar. ",
      ),
    );
    var link = criar("a", "cc-link", "Saber mais");
    link.href = LINK_POLITICA;
    corpo.appendChild(link);
    corpo.appendChild(document.createTextNode("."));
    texto.appendChild(corpo);

    var botoes = criar("div", "cc-botoes");
    var recusar = criar(
      "button",
      "cc-btn cc-btn-recusar",
      "Continuar sem aceitar",
    );
    recusar.type = "button";
    var aceitar = criar("button", "cc-btn cc-btn-aceitar", "Aceitar");
    aceitar.type = "button";
    botoes.appendChild(recusar);
    botoes.appendChild(aceitar);

    caixa.appendChild(texto);
    caixa.appendChild(botoes);

    aceitar.addEventListener("click", function () {
      escolher("aceite");
    });
    recusar.addEventListener("click", function () {
      escolher("recusado");
    });

    return caixa;
  }

  function mostrarBanner() {
    if (!banner) {
      banner = construirBanner();
      document.body.appendChild(banner);
    }
    banner.hidden = false;
    // Dá um instante para a transição de entrada funcionar
    window.requestAnimationFrame(function () {
      banner.classList.add("cc-visivel");
    });
  }

  function esconderBanner() {
    if (!banner) return;
    banner.classList.remove("cc-visivel");
    banner.hidden = true;
  }

  function escolher(estado) {
    var antes = lerEscolha();
    guardarEscolha(estado);
    esconderBanner();
    aplicar(estado, antes === "aceite" && estado === "recusado");
    actualizarEstadoNaPagina();
  }

  /* ---------- Estado visível em elementos da página ----------
     Qualquer elemento com data-cookies-estado recebe o texto da escolha actual
     (útil na privacidade.html). */
  function actualizarEstadoNaPagina() {
    var e = lerEscolha();
    var texto =
      e === "aceite"
        ? "Neste momento: cookies aceites."
        : e === "recusado"
          ? "Neste momento: cookies recusados."
          : "Ainda não escolheu.";
    var els = document.querySelectorAll("[data-cookies-estado]");
    for (var i = 0; i < els.length; i++) els[i].textContent = texto;
  }

  /* ---------- API pública ---------- */
  window.Consentimento = {
    estado: function () {
      return lerEscolha();
    },
    abrir: function () {
      mostrarBanner();
    },
    // Regista um evento do Pixel, só se houve consentimento.
    // Exemplo: Consentimento.evento("CompleteRegistration")
    evento: function (nome, parametros) {
      if (lerEscolha() !== "aceite" || !window.fbq) return;
      if (parametros) window.fbq("track", nome, parametros);
      else window.fbq("track", nome);
    },
  };

  /* ---------- Arranque ---------- */
  function iniciar() {
    var e = lerEscolha();
    if (e === "aceite") aplicar("aceite", false);
    else if (e !== "recusado") mostrarBanner();
    actualizarEstadoNaPagina();

    // Qualquer elemento com data-cookies-abrir reabre o aviso
    document.addEventListener("click", function (ev) {
      var alvo = ev.target.closest && ev.target.closest("[data-cookies-abrir]");
      if (!alvo) return;
      ev.preventDefault();
      mostrarBanner();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
