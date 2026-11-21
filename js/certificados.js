/* Verificação e descarga de certificados (certificados.html).
   Os ficheiros PDF e PNG estão no Cloudinary com o public ID
   certificados/pdf/CÓDIGO e certificados/png/CÓDIGO; o link calcula-se
   a partir do código (os JSON não têm campo "link"). */
(function () {
  "use strict";

  // ===== Configuração =====
  var CLOUD = "y1pydrcc";
  var PASTA = "certificados";
  // true: o ficheiro descarregado chama-se "Certificado-CÓDIGO".
  // Se a descarga falhar com esta forma, mude para false (fica só "fl_attachment").
  var USAR_NOME_NO_DOWNLOAD = true;
  // Plano B se não for possível confirmar a existência dos ficheiros
  // (pedido HEAD bloqueado por CORS ou sem rede): mostra os botões destas edições.
  var EDICOES_COM_FICHEIROS = [
    "CON-WS6-",
    "CON-GC6-",
    "CON-MOD6-",
    "CON-WS7-",
    "CON-GC7-",
    "CON-MOD7-",
  ];
  // Manter em sintonia com a lista FICHEIROS_DADOS de js/admin.js
  var FICHEIROS_DADOS = [
    "assets/certificados-participantes.json",
    "assets/certificados-oradores.json",
    "assets/certificados-moderadores.json",
    "assets/certificados-ws6.json",
    "assets/certificados-ws7.json",
  ];
  var FICHEIRO_PAINEL = "data/certificados-painel.json"; // só existe depois da Fase 2
  var WHATSAPP = "https://wa.me/244935269451";
  var RE_CODIGO = /^CON-(WS|GC|MOD)[0-9]{1,2}-[0-9]{4}-[0-9]{2}-[0-9]{3}$/;
  var ESPERA_HEAD_MS = 10000;

  var pedidoActual = 0;

  // Escapa texto antes de o pôr no HTML
  function esc(v) {
    if (v === undefined || v === null) return "";
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Lê um ficheiro de dados. Nunca falha: em erro devolve null.
  function lerLista(url) {
    return fetch(url + "?v=" + Date.now(), { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) return null;
        return r.json();
      })
      .then(function (j) {
        if (Array.isArray(j)) return j;
        if (j && Array.isArray(j.certificados)) return j.certificados;
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  // Carrega todos os ficheiros; os do painel substituem os antigos com o mesmo código.
  function carregarCertificados() {
    var urls = FICHEIROS_DADOS.concat([FICHEIRO_PAINEL]);
    return Promise.all(urls.map(lerLista)).then(function (listas) {
      var mapa = new Map();
      var lidos = 0;
      listas.forEach(function (lista, i) {
        if (!lista) return;
        if (i < FICHEIROS_DADOS.length) lidos++;
        lista.forEach(function (c) {
          if (c && typeof c.codigo === "string")
            mapa.set(c.codigo.trim().toUpperCase(), c);
        });
      });
      return { mapa: mapa, lidos: lidos };
    });
  }

  function urlVer(codigo, tipo) {
    return (
      "https://res.cloudinary.com/" +
      CLOUD +
      "/image/upload/" +
      PASTA +
      "/" +
      tipo +
      "/" +
      codigo +
      "." +
      tipo
    );
  }

  function urlDescarregar(codigo, tipo) {
    var flag = USAR_NOME_NO_DOWNLOAD
      ? "fl_attachment:Certificado-" + codigo
      : "fl_attachment";
    return (
      "https://res.cloudinary.com/" +
      CLOUD +
      "/image/upload/" +
      flag +
      "/" +
      PASTA +
      "/" +
      tipo +
      "/" +
      codigo +
      "." +
      tipo
    );
  }

  // "sim" (existe), "nao" (o servidor respondeu sem sucesso) ou "erro" (CORS, rede, tempo)
  function existe(url) {
    var ctl =
      typeof AbortController === "function" ? new AbortController() : null;
    var t = setTimeout(function () {
      if (ctl) ctl.abort();
    }, ESPERA_HEAD_MS);
    return fetch(url, {
      method: "HEAD",
      cache: "no-store",
      signal: ctl ? ctl.signal : undefined,
    }).then(
      function (r) {
        clearTimeout(t);
        return r.ok ? "sim" : "nao";
      },
      function () {
        clearTimeout(t);
        return "erro";
      },
    );
  }

  function edicaoComFicheiros(codigo) {
    return EDICOES_COM_FICHEIROS.some(function (p) {
      return codigo.indexOf(p) === 0;
    });
  }

  // "AAAA-MM-DD" válido -> "dd/mm/aaaa"; caso contrário ""
  function dataActualizado(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof v === "string" ? v : "");
    if (!m) return "";
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (
      d.getUTCFullYear() !== +m[1] ||
      d.getUTCMonth() !== +m[2] - 1 ||
      d.getUTCDate() !== +m[3]
    )
      return "";
    return m[3] + "/" + m[2] + "/" + m[1];
  }

  function botaoDescarga(codigo, tipo) {
    var icone = tipo === "pdf" ? "fa-solid fa-file-pdf" : "fa-solid fa-image";
    var texto = tipo === "pdf" ? "Descarregar PDF" : "Descarregar PNG";
    return (
      '<a class="btn-download btn-download-' +
      tipo +
      '" href="' +
      esc(urlDescarregar(codigo, tipo)) +
      '" rel="noopener" download><i class="' +
      icone +
      '" aria-hidden="true"></i> ' +
      texto +
      "</a>"
    );
  }

  // Mostra os botões de descarga (só com código validado e encontrado)
  function mostrarDescargas(codigo, caixa, pedido) {
    var conhecida = edicaoComFicheiros(codigo);
    Promise.all([
      existe(urlVer(codigo, "pdf")),
      existe(urlVer(codigo, "png")),
    ]).then(function (r) {
      if (pedido !== pedidoActual) return; // já há outra verificação
      var botoes = "";
      ["pdf", "png"].forEach(function (tipo, i) {
        var mostrar = r[i] === "sim" || (r[i] === "erro" && conhecida);
        if (mostrar) botoes += botaoDescarga(codigo, tipo);
      });
      if (botoes) {
        caixa.innerHTML =
          '<div class="cert-downloads-botoes">' + botoes + "</div>";
        caixa.hidden = false;
      } else if (conhecida) {
        caixa.innerHTML =
          '<p class="cert-indisponivel"><i class="fa-solid fa-circle-info" aria-hidden="true"></i> ' +
          "Não conseguimos aceder ao ficheiro. " +
          '<a href="' +
          WHATSAPP +
          '" target="_blank" rel="noopener">Contacte-nos por WhatsApp.</a></p>';
        caixa.hidden = false;
      } else {
        caixa.innerHTML = "";
        caixa.hidden = true;
      }
    });
  }

  function mostrarErro(resultado, html) {
    resultado.style.display = "block";
    resultado.className = "resultado erro";
    resultado.innerHTML = html;
  }

  async function verificar() {
    const codigo = document.getElementById("codigo").value.trim().toUpperCase();
    const resultado = document.getElementById("resultado");
    const pedido = ++pedidoActual;

    if (!codigo) {
      mostrarErro(
        resultado,
        "<p><i class='fa-solid fa-triangle-exclamation' aria-hidden='true'></i> Por favor, insira um código válido.</p>",
      );
      return;
    }

    try {
      const dadosCarregados = await carregarCertificados();
      if (pedido !== pedidoActual) return;
      if (!dadosCarregados.lidos) throw new Error("Nenhum ficheiro de dados.");

      // Procura pelo código
      const certificado = dadosCarregados.mapa.get(codigo);

      if (certificado) {
        let detalhes = "";

        // ===== PARTICIPANTES =====
        if (codigo.startsWith("CON-WS")) {
          detalhes = `
          <p><strong>Workshop:</strong> ${esc(certificado.workshop)}</p>
          <p><strong>${esc(certificado.rotulo_orador || "Orador")}:</strong> ${esc(certificado.orador)}</p>
          ${certificado.edicao ? `<p><strong>Edição:</strong> ${esc(certificado.edicao)}</p>` : ""}
          <p><strong>Data:</strong> ${esc(certificado.data)} (${esc(certificado.duracao)})</p>
          <p><strong>Plataforma:</strong> ${esc(certificado.plataforma)}</p>
        `;
        }

        // ===== ORADORES CONVIDADOS =====
        else if (codigo.startsWith("CON-GC")) {
          detalhes = `
          <p><strong>Função:</strong> ${esc(certificado.funcao || "Orador Convidado")}</p>
          <p><strong>Tema:</strong> ${esc(certificado.evento)}</p>
          <p><strong>Edição:</strong> ${esc(certificado.edicao)}</p>
          <p><strong>Data:</strong> ${esc(certificado.data)}</p>
        `;
        }

        // ===== MODERADORES =====
        else if (codigo.startsWith("CON-MOD")) {
          detalhes = `
          <p><strong>Função:</strong> ${esc(certificado.funcao)}</p>
          <p><strong>Tema:</strong> ${esc(certificado.evento)}</p>
          <p><strong>Edição:</strong> ${esc(certificado.edicao)}</p>
          <p><strong>Data:</strong> ${esc(certificado.data)}</p>
        `;
        }

        resultado.style.display = "block";
        resultado.className = "resultado sucesso";

        // Certificados de 2025 (sem o campo "kectil") foram emitidos no âmbito do Kectil in Action.
        // Os novos levam "kectil": false e mostram só o Grupo Conecta.
        const noKectil = certificado.kectil !== false;
        const entidade = esc(certificado.entidade_emissora || "Grupo Conecta");
        const nota = noKectil
          ? `Este certificado foi emitido pelo <strong>${entidade}</strong> no âmbito do <strong>Kectil in Action</strong>.`
          : `Este certificado foi emitido pelo <strong>${entidade}</strong>.`;
        const logoKectil = noKectil
          ? `<img src="assets/icons/KectilinActionLogo.svg" alt="Kectil in Action" class="kectil">`
          : "";
        const actualizado = dataActualizado(certificado.atualizado);
        const linhaActualizado = actualizado
          ? `<p class="cert-actualizado"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Certificado actualizado em ${esc(actualizado)}</p>`
          : "";
        const codigoValido = RE_CODIGO.test(codigo);

        resultado.innerHTML = `
          <h3><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Certificado Válido</h3>

        <p><strong>Nome:</strong> ${esc(certificado.nome)}</p>

        ${detalhes}

        <p><strong>Código:</strong> ${esc(certificado.codigo)}</p>
        ${linhaActualizado}

        ${codigoValido ? `<div class="cert-downloads" id="cert-downloads" aria-live="polite"><p class="cert-a-preparar"><i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i> A preparar os ficheiros…</p></div>` : ""}

        <p class="nota">
          ${nota}
        </p>

        <div class="logos">
          <img src="assets/icons/logoblue.svg" alt="Grupo Conecta" class="conecta">
          ${logoKectil}
        </div>
      `;

        if (codigoValido)
          mostrarDescargas(
            codigo,
            document.getElementById("cert-downloads"),
            pedido,
          );
      } else {
        mostrarErro(
          resultado,
          `
        <h3><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i> Certificado não encontrado</h3>
        <p>O código <strong>${esc(codigo)}</strong> não consta na nossa base de dados.</p>
      `,
        );
      }
    } catch (error) {
      console.error(error);
      mostrarErro(
        resultado,
        "<p><i class='fa-solid fa-triangle-exclamation' aria-hidden='true'></i> Erro ao verificar. Tente novamente mais tarde.</p>",
      );
    }
  }

  document.getElementById("verificar").addEventListener("click", verificar);
  // Enter no campo também verifica
  document.getElementById("codigo").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      verificar();
    }
  });
})();
