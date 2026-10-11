/* ============================================================
   admin.js — painel de administração (admin.html), Passo 9, etapas 2 e 3.
   Núcleo: formulários para tudo, validação, pré-visualização dos números
   calculados e "Descarregar JSON". Etapa 3: entrada com senha, leitura e
   publicação pelo Worker (Cloudflare), histórico e restaurar. O token do
   GitHub nunca chega aqui; a sessão do Worker vive só em memória.
   Todo o texto é escrito com textContent (nunca innerHTML com dados).
   ============================================================ */
(function () {
  "use strict";

  /* ==========================================================
     1. NÚCLEO (funções puras, sem interface; testáveis)
     ========================================================== */
  var Nucleo = {};

  function clonar(o) {
    return JSON.parse(JSON.stringify(o));
  }
  Nucleo.clonar = clonar;

  // Aceita youtu.be/ID, watch?v=ID, /embed/ID, /shorts/ID (como js/videos.js)
  Nucleo.idYoutube = function (url) {
    if (!url || typeof url !== "string") return "";
    var u = url.trim();
    var m =
      u.match(
        /^https?:\/\/(?:www\.|m\.)?youtu\.be\/([\w-]{11})(?:[?&#/].*)?$/i,
      ) ||
      u.match(
        /^https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?(?:.*&)?v=([\w-]{11})(?:[&#].*)?$/i,
      ) ||
      u.match(
        /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:embed|shorts)\/([\w-]{11})(?:[?&#/].*)?$/i,
      );
    return m ? m[1] : "";
  };

  // Lista branca: strong, em, br, a (href http/https/mailto). O resto é retirado
  // (o texto mantém-se; script e style desaparecem por completo).
  Nucleo.sanitizarHtml = function (html) {
    var doc = new DOMParser().parseFromString(
      "<body>" + String(html || "") + "</body>",
      "text/html",
    );
    var REMOVER = {
      SCRIPT: 1,
      STYLE: 1,
      IFRAME: 1,
      OBJECT: 1,
      EMBED: 1,
      NOSCRIPT: 1,
      TEMPLATE: 1,
    };
    var MAPA = { B: "strong", I: "em" };

    function desembrulhar(no, f) {
      while (f.firstChild) no.insertBefore(f.firstChild, f);
      f.remove();
    }

    function limpar(no) {
      Array.prototype.slice.call(no.childNodes).forEach(function (f) {
        if (f.nodeType === 3) return;
        if (f.nodeType !== 1) {
          f.remove();
          return;
        }
        var t = f.tagName;
        if (REMOVER[t]) {
          f.remove();
          return;
        }
        limpar(f);
        if (MAPA[t]) {
          var novo = doc.createElement(MAPA[t]);
          while (f.firstChild) novo.appendChild(f.firstChild);
          no.replaceChild(novo, f);
          return;
        }
        if (t !== "STRONG" && t !== "EM" && t !== "BR" && t !== "A") {
          desembrulhar(no, f);
          return;
        }
        Array.prototype.slice.call(f.attributes).forEach(function (a) {
          if (!(t === "A" && a.name === "href")) f.removeAttribute(a.name);
        });
        if (t === "A") {
          var h = (f.getAttribute("href") || "").trim();
          if (!/^(https?:\/\/|mailto:)/i.test(h)) {
            desembrulhar(no, f);
            return;
          }
          f.setAttribute("href", h);
          if (/^https?:/i.test(h)) {
            f.setAttribute("target", "_blank");
            f.setAttribute("rel", "noopener noreferrer");
          }
        }
      });
    }
    limpar(doc.body);
    return doc.body.innerHTML;
  };

  function numOuNull(v) {
    if (v === undefined || v === null || v === "") return null;
    var n = Number(v);
    return isNaN(n) ? null : n;
  }

  // Novo workshop com os valores por omissão do v5 (secção 8b)
  Nucleo.novoWorkshop = function (dados) {
    var maior = 0;
    var ids = {};
    (dados.workshops || []).forEach(function (w) {
      ids[w.id] = true;
      var n = numOuNull(w.numero) || 0;
      var d = /^ws(\d+)$/.exec(w.id || "");
      if (d) n = Math.max(n, Number(d[1]));
      if (n > maior) maior = n;
    });
    var seg = maior + 1;
    while (ids["ws" + seg]) seg++;
    var global = numOuNull((dados.pagamento || {}).valorMinimo);
    return {
      id: "ws" + seg,
      numero: seg,
      tema: "",
      orador: "",
      descricao: "",
      resumo: "",
      data: "",
      horaInicio: "",
      horaFim: "",
      local: "Online – Zoom",
      imagem: "",
      inscricoes: "encerradas",
      video: "",
      lote: numOuNull((dados.campanha || {}).loteActivo) || 1,
      valorMinimo: global === null ? 500 : global,
      aprenderao: [],
      participantes: 0,
      arrecadado: 0,
    };
  };

  var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var RE_WA = /^244\d{9}$/;

  function dataValida(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return (
      d.getUTCFullYear() === +m[1] &&
      d.getUTCMonth() === +m[2] - 1 &&
      d.getUTCDate() === +m[3]
    );
  }

  function rotuloWs(w) {
    return (
      "Workshop " +
      (w.numero !== undefined && w.numero !== "" ? w.numero : w.id)
    );
  }

  // Devolve { erros: [{path, msg}], avisos: [{path, msg}] }
  Nucleo.validar = function (d) {
    var erros = [];
    var avisos = [];
    function e(path, msg) {
      erros.push({ path: path, msg: msg });
    }
    function a(path, msg) {
      avisos.push({ path: path, msg: msg });
    }
    var ws = d.workshops || [];

    // Workshops
    var vistos = {};
    ws.forEach(function (w, i) {
      var p = "workshops." + i + ".";
      var r = rotuloWs(w) + ": ";
      if (!w.id) e(p + "id", r + "falta o identificador.");
      else if (vistos[w.id])
        e(p + "id", r + "identificador repetido (" + w.id + ").");
      vistos[w.id] = true;
      if (!String(w.tema || "").trim()) e(p + "tema", r + "falta o tema.");
      if (!String(w.orador || "").trim())
        e(p + "orador", r + "falta o orador.");
      if (!w.data) e(p + "data", r + "falta a data.");
      else if (!dataValida(w.data)) e(p + "data", r + "data inválida.");
      if (w.horaInicio && w.horaFim && w.horaFim <= w.horaInicio)
        e(
          p + "horaFim",
          r + "a hora de fim tem de ser depois da hora de início.",
        );
      if (w.horaFim && !w.horaInicio)
        e(p + "horaInicio", r + "indique também a hora de início.");
      if (w.video && !Nucleo.idYoutube(w.video))
        e(p + "video", r + "o link do vídeo não é um link de YouTube válido.");
      if (w.inscricoes !== "abertas" && w.inscricoes !== "encerradas")
        e(p + "inscricoes", r + "estado das inscrições inválido.");
      if (w.valorMinimo !== undefined && w.valorMinimo !== "") {
        var vm = numOuNull(w.valorMinimo);
        if (vm === null || vm < 0)
          e(
            p + "valorMinimo",
            r + "o valor mínimo tem de ser um número igual ou maior que 0.",
          );
      } else if (w.valorMinimo === "") {
        e(p + "valorMinimo", r + "indique o valor mínimo (0 = gratuito).");
      }
      ["participantes", "arrecadado", "mulheres", "homens", "lote"].forEach(
        function (c) {
          if (w[c] === undefined) return;
          var n = numOuNull(w[c]);
          if (n === null || n < 0)
            e(
              p + c,
              r +
                "o campo '" +
                c +
                "' tem de ser um número igual ou maior que 0.",
            );
        },
      );
      var m = numOuNull(w.mulheres);
      var h = numOuNull(w.homens);
      if ((m === null) !== (h === null))
        a(
          p + "mulheres",
          r +
            "preencha mulheres e homens (só contam se ambos estiverem preenchidos).",
        );
      if (
        m !== null &&
        h !== null &&
        m + h !== (numOuNull(w.participantes) || 0)
      )
        a(
          p + "mulheres",
          r +
            "mulheres (" +
            m +
            ") + homens (" +
            h +
            ") não é igual a participantes (" +
            (numOuNull(w.participantes) || 0) +
            ").",
        );
      if (w.imagem && !/^(https?:\/\/|assets\/)/i.test(w.imagem))
        e(
          p + "imagem",
          r +
            "a imagem tem de ser um link (https://…) ou um caminho em assets/.",
        );
      if (
        Array.isArray(w.aprenderao) &&
        w.aprenderao.some(function (t) {
          return !String(t).trim();
        })
      )
        a(
          p + "aprenderao",
          r +
            "há tópicos vazios em 'O que vai aprender' (serão retirados ao gravar).",
        );
    });

    // Workshop activo
    if (
      !ws.some(function (w) {
        return w.id === d.workshopActivo;
      })
    )
      e("workshopActivo", "O workshop activo não existe na lista.");
    else {
      var act = ws.filter(function (w) {
        return w.id === d.workshopActivo;
      })[0];
      if (act.inscricoes === "abertas" && (!act.data || !act.horaInicio))
        a(
          "workshops",
          "O workshop activo tem inscrições abertas mas falta a data ou a hora de início.",
        );
    }

    // Vídeos em destaque
    var vd = d.videosDestaque;
    if (vd !== undefined) {
      if (!Array.isArray(vd))
        e("videosDestaque", "Vídeos em destaque inválidos.");
      else {
        if (vd.length > 3)
          e("videosDestaque", "Só pode escolher até 3 vídeos em destaque.");
        vd.forEach(function (id) {
          var w = ws.filter(function (x) {
            return x.id === id;
          })[0];
          if (!w)
            e(
              "videosDestaque",
              "Vídeo em destaque: o workshop '" + id + "' não existe.",
            );
          else if (!Nucleo.idYoutube(w.video))
            e(
              "videosDestaque",
              "Vídeo em destaque: o " +
                rotuloWs(w) +
                " não tem um vídeo válido.",
            );
        });
        if (vd.length !== new Set(vd).size)
          e("videosDestaque", "Há vídeos repetidos nos destaques.");
      }
    }

    // Campanha
    var c = d.campanha || {};
    var meta = numOuNull(c.meta);
    if (meta === null || meta <= 0)
      e("campanha.meta", "A meta da campanha tem de ser maior que 0.");
    var lote = numOuNull(c.loteActivo);
    if (lote === null || lote < 1 || Math.floor(lote) !== lote)
      e(
        "campanha.loteActivo",
        "O lote activo tem de ser um número inteiro a partir de 1.",
      );
    var ov = numOuNull(c.outrosValores);
    if (c.outrosValores !== undefined && (ov === null || ov < 0))
      e(
        "campanha.outrosValores",
        "'Outros valores' tem de ser um número igual ou maior que 0.",
      );
    if (!String(c.titulo || "").trim())
      e("campanha.titulo", "Falta o título do lote.");
    if (c.linkPrestacaoContas && !/^https?:\/\//i.test(c.linkPrestacaoContas))
      e(
        "campanha.linkPrestacaoContas",
        "O link da prestação de contas tem de começar por http:// ou https://.",
      );

    // Pagamento
    var pg = d.pagamento || {};
    var metodos = pg.metodos || [];
    if (
      !metodos.some(function (m) {
        return m.activo;
      })
    )
      e(
        "pagamento.metodos",
        "Tem de haver pelo menos um método de pagamento activo.",
      );
    metodos.forEach(function (m, i) {
      if (!m.activo) return;
      var p = "pagamento.metodos." + i + ".";
      if (!String(m.instrucao || "").trim())
        e(p + "instrucao", "Pagamento " + m.nome + ": falta a instrução.");
      if (!m.campos || !m.campos.length)
        e(
          p + "campos",
          "Pagamento " + m.nome + ": falta pelo menos um dado (número, IBAN…).",
        );
      (m.campos || []).forEach(function (cp, j) {
        if (!String(cp.rotulo || "").trim() || !String(cp.valor || "").trim())
          e(
            p + "campos." + j + ".valor",
            "Pagamento " + m.nome + ": há um dado com rótulo ou valor vazio.",
          );
      });
    });
    if (!RE_WA.test(String(pg.whatsapp || "")))
      e(
        "pagamento.whatsapp",
        "Pagamento: o WhatsApp deve ter só dígitos, no formato 244 + 9 dígitos.",
      );
    if (!RE_EMAIL.test(String(pg.email || "")))
      e("pagamento.email", "Pagamento: e-mail inválido.");
    var gv = numOuNull(pg.valorMinimo);
    if (gv === null || gv < 0)
      e(
        "pagamento.valorMinimo",
        "Pagamento: o valor mínimo global tem de ser um número igual ou maior que 0.",
      );

    // Contactos
    var ct = d.contactos || {};
    if (!RE_EMAIL.test(String(ct.email || "")))
      e("contactos.email", "Contactos: e-mail inválido.");
    if (!RE_WA.test(String(ct.whatsapp || "")))
      e(
        "contactos.whatsapp",
        "Contactos: o WhatsApp deve ter só dígitos, no formato 244 + 9 dígitos.",
      );
    if (!String(ct.whatsappTexto || "").trim())
      e(
        "contactos.whatsappTexto",
        "Contactos: falta o número como deve aparecer (ex.: (+244) 935269451).",
      );
    if (!String(ct.local || "").trim())
      e("contactos.local", "Contactos: falta a localização.");

    // Estatísticas
    var es = d.estatisticas || {};
    var bp = numOuNull(es.baseParticipacoes);
    var bm = numOuNull(es.baseMulheres);
    if (bp !== null || bm !== null) {
      if (bp === null || bp <= 0)
        e(
          "estatisticas.baseParticipacoes",
          "Estatísticas: a base de participações tem de ser maior que 0.",
        );
      else if (bm === null || bm < 0 || bm > bp)
        e(
          "estatisticas.baseMulheres",
          "Estatísticas: a base de mulheres tem de estar entre 0 e a base de participações.",
        );
    }
    return { erros: erros, avisos: avisos };
  };

  // Cópia pronta a gravar: texto limpo, números como números, HTML sanitizado.
  // Preserva todos os campos desconhecidos.
  Nucleo.limparParaGravar = function (d) {
    var o = clonar(d);
    (o.workshops || []).forEach(function (w) {
      [
        "tema",
        "orador",
        "resumo",
        "local",
        "imagem",
        "video",
        "data",
        "horaInicio",
        "horaFim",
      ].forEach(function (c) {
        if (typeof w[c] === "string") w[c] = w[c].trim();
      });
      if (typeof w.descricao === "string")
        w.descricao = Nucleo.sanitizarHtml(w.descricao.trim());
      [
        "numero",
        "lote",
        "valorMinimo",
        "participantes",
        "arrecadado",
        "mulheres",
        "homens",
      ].forEach(function (c) {
        if (w[c] === undefined || w[c] === "") return;
        var n = numOuNull(w[c]);
        if (n !== null) w[c] = n;
      });
      if (Array.isArray(w.aprenderao))
        w.aprenderao = w.aprenderao
          .map(function (t) {
            return String(t).trim();
          })
          .filter(Boolean);
    });
    var c = o.campanha || {};
    ["loteActivo", "meta", "outrosValores"].forEach(function (k) {
      var n = numOuNull(c[k]);
      if (n !== null) c[k] = n;
    });
    if (typeof c.titulo === "string") c.titulo = c.titulo.trim();
    if (typeof c.linkPrestacaoContas === "string")
      c.linkPrestacaoContas = c.linkPrestacaoContas.trim();
    var pg = o.pagamento || {};
    if (pg.valorMinimo !== undefined)
      pg.valorMinimo = numOuNull(pg.valorMinimo);
    ["whatsapp", "email"].forEach(function (k) {
      if (typeof pg[k] === "string") pg[k] = pg[k].trim();
    });
    (pg.metodos || []).forEach(function (m) {
      m.titular = ""; // regra 16: o titular nunca é mostrado nem gravado
      if (typeof m.instrucao === "string") m.instrucao = m.instrucao.trim();
      (m.campos || []).forEach(function (cp) {
        cp.rotulo = String(cp.rotulo || "").trim();
        cp.valor = String(cp.valor || "").trim();
      });
      m.campos = (m.campos || []).filter(function (cp) {
        return cp.rotulo || cp.valor;
      });
    });
    var ct = o.contactos || {};
    Object.keys(ct).forEach(function (k) {
      if (typeof ct[k] === "string") ct[k] = ct[k].trim();
    });
    if (ct.whatsapp) ct.whatsapp = String(ct.whatsapp).replace(/\D/g, "");
    var es = o.estatisticas || {};
    ["baseParticipacoes", "baseMulheres"].forEach(function (k) {
      var n = numOuNull(es[k]);
      if (n !== null) es[k] = n;
    });
    return o;
  };

  // Lista plana "caminho: valor" para comparar blocos (usada no bloco pagamento)
  Nucleo.achatar = function (obj, prefixo, saida) {
    saida = saida || {};
    if (obj !== null && typeof obj === "object") {
      Object.keys(obj).forEach(function (k) {
        Nucleo.achatar(obj[k], prefixo ? prefixo + "." + k : k, saida);
      });
    } else {
      saida[prefixo] = obj === undefined ? "" : String(obj);
    }
    return saida;
  };

  Nucleo.diferencas = function (antes, depois) {
    var A = Nucleo.achatar(antes || {});
    var B = Nucleo.achatar(depois || {});
    var chaves = {};
    Object.keys(A)
      .concat(Object.keys(B))
      .forEach(function (k) {
        chaves[k] = true;
      });
    var lista = [];
    Object.keys(chaves).forEach(function (k) {
      if (A[k] !== B[k]) lista.push({ campo: k, antes: A[k], depois: B[k] });
    });
    return lista;
  };

  /* ==========================================================
     2. ESTADO
     ========================================================== */
  var CHAVE_RASCUNHO = "conecta-admin-rascunho-v1";
  var original = null; // versão carregada (publicada)
  var dados = null; // versão em edição
  var tabActual = "workshops";
  var wsAberto = null; // índice do workshop aberto no acordeão
  var alterado = false;
  var tempoRascunho = null;

  // Endereço do Worker (sem "/" no fim). Substitua pelo endereço real.
  var WORKER_URL = "https://conecta-painel.contornosdesigns.workers.dev";
  var MEMBROS = [
    "Salvador Fernando",
    "Félix Júnior",
    "Febe Jamba",
    "Sednilson Maquenha",
    "Ernesto Xavier",
  ];
  var INACTIVIDADE_MS = 30 * 60 * 1000; // igual à do Worker

  // Sessão: só em memória (nunca localStorage).
  var Sessao = { token: null, nome: "", sha: null };
  var tempoInactividade = null;
  var aOcupado = false;

  function erroRede() {
    var e = new Error(
      "Sem ligação ao servidor do painel. Verifique a internet e tente de novo.",
    );
    e.status = 0;
    return e;
  }

  // Pedido ao Worker. Renova o token de sessão a cada resposta (X-Sessao).
  function api(rota, op) {
    op = op || {};
    var cab = {};
    if (op.corpo !== undefined) cab["Content-Type"] = "application/json";
    if (Sessao.token) cab.Authorization = "Bearer " + Sessao.token;
    return fetch(WORKER_URL + rota, {
      method: op.metodo || "GET",
      headers: cab,
      body: op.corpo !== undefined ? JSON.stringify(op.corpo) : undefined,
      cache: "no-store",
    }).then(
      function (r) {
        var novo = r.headers.get("X-Sessao");
        if (novo) Sessao.token = novo;
        return r.text().then(function (t) {
          var j = {};
          try {
            j = t ? JSON.parse(t) : {};
          } catch (e) {
            j = {};
          }
          if (!r.ok) {
            var e = new Error(j.erro || "Erro do servidor (" + r.status + ").");
            e.status = r.status;
            e.dados = j;
            if (r.status === 401 && j.sessao === false) e.sessaoInvalida = true;
            throw e;
          }
          return j;
        });
      },
      function () {
        throw erroRede();
      },
    );
  }

  // Fonte dos dados: lê a branch "content" pelo Worker.
  var Fonte = {
    carregar: function () {
      return api("/site").then(function (r) {
        Sessao.sha = r.sha;
        return r.dados;
      });
    },
  };

  /* ==========================================================
     3. AJUDAS DE INTERFACE
     ========================================================== */
  function $(id) {
    return document.getElementById(id);
  }

  // el("div", {class:"x", text:"..."}, filho1, filho2)
  function el(tag, attrs) {
    var n = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === undefined || v === null || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.indexOf("on") === 0 && typeof v === "function")
        n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : v);
    });
    function juntar(f) {
      if (f === undefined || f === null || f === false) return;
      if (Array.isArray(f)) {
        f.forEach(juntar);
        return;
      }
      n.appendChild(typeof f === "string" ? document.createTextNode(f) : f);
    }
    for (var i = 2; i < arguments.length; i++) juntar(arguments[i]);
    return n;
  }

  function icone(classe) {
    return el("i", { class: classe, "aria-hidden": "true" });
  }

  function botao(texto, classe, aoClicar, iconeClasse) {
    return el(
      "button",
      { type: "button", class: "ad-btn " + classe, onclick: aoClicar },
      iconeClasse ? icone(iconeClasse) : null,
      texto,
    );
  }

  function obter(path) {
    var o = dados;
    for (var i = 0; i < path.length; i++) {
      if (o === undefined || o === null) return undefined;
      o = o[path[i]];
    }
    return o;
  }

  function definir(path, valor) {
    var o = dados;
    for (var i = 0; i < path.length - 1; i++) {
      if (o[path[i]] === undefined || o[path[i]] === null)
        o[path[i]] = typeof path[i + 1] === "number" ? [] : {};
      o = o[path[i]];
    }
    var ult = path[path.length - 1];
    if (valor === undefined) delete o[ult];
    else o[ult] = valor;
  }

  // Campo de formulário ligado ao estado.
  // op: {rotulo, ajuda, path:[...], tipo:"text|number|date|time|textarea|select|email",
  //      opcoes:[[valor,texto]], opcional:true, largo:true, placeholder, aoMudar}
  function campo(op) {
    var idc = "ad-c-" + Math.random().toString(36).slice(2, 9);
    var atual = obter(op.path);
    var entrada;
    if (op.tipo === "textarea") {
      entrada = el("textarea", { id: idc, rows: op.linhas || 4 });
      entrada.value = atual === undefined ? "" : String(atual);
    } else if (op.tipo === "select") {
      entrada = el("select", { id: idc });
      op.opcoes.forEach(function (o) {
        entrada.appendChild(el("option", { value: o[0], text: o[1] }));
      });
      entrada.value = atual === undefined ? op.opcoes[0][0] : String(atual);
    } else {
      entrada = el("input", {
        id: idc,
        type: op.tipo === "number" ? "number" : op.tipo || "text",
        min: op.tipo === "number" ? "0" : false,
        step: op.tipo === "number" ? "1" : false,
        inputmode: op.tipo === "number" ? "numeric" : false,
        autocomplete: "off",
      });
      entrada.value =
        atual === undefined || atual === null ? "" : String(atual);
    }
    if (op.placeholder) entrada.setAttribute("placeholder", op.placeholder);
    entrada.setAttribute("data-path", op.path.join("."));

    var evento = op.tipo === "select" ? "change" : "input";
    entrada.addEventListener(evento, function () {
      var v = entrada.value;
      if (op.tipo === "number") {
        if (v === "") v = op.opcional ? undefined : "";
        else v = Number(v);
      } else if (op.opcional && v === "") {
        v = undefined;
      }
      if (!op.semEstado) definir(op.path, v);
      var wrap = entrada.closest(".ad-campo");
      if (wrap) wrap.classList.remove("ad-invalido");
      if (op.aoMudar) op.aoMudar(v, entrada);
      alterou();
    });

    return el(
      "div",
      { class: "ad-campo" + (op.largo ? " ad-largo" : "") },
      el("label", { for: idc, text: op.rotulo }),
      entrada,
      op.ajuda ? el("small", { text: op.ajuda }) : null,
    );
  }

  function fmtPct(n) {
    return (Math.round(n * 10) / 10).toString().replace(".", ",") + "%";
  }

  /* ==========================================================
     4. PRÉ-VISUALIZAÇÃO E ESTADO
     ========================================================== */
  function pintarNumeros() {
    var r = SiteData.resumo(dados);
    var act = (dados.workshops || []).filter(function (w) {
      return w.id === dados.workshopActivo;
    })[0];
    var itens = [
      [
        SiteData.formatarKz(r.arrecadado),
        "Arrecadado (lote " + (dados.campanha || {}).loteActivo + ")",
      ],
      [fmtPct(r.percentagem), "da meta de " + SiteData.formatarKz(r.meta)],
      [SiteData.formatarKz(r.faltam), "Faltam para a meta"],
      [SiteData.formatarNumero(r.participacoes), "Participações"],
      [String(r.workshopsRealizados), "Workshops realizados"],
      [r.mulheres + "%", "Mulheres"],
      [r.homens + "%", "Homens"],
      [act ? "Workshop " + act.numero : "—", "Activo na inscrição"],
    ];
    var caixa = $("ad-numeros");
    caixa.textContent = "";
    itens.forEach(function (i) {
      caixa.appendChild(
        el(
          "div",
          { class: "ad-num" },
          el("b", { text: i[0] }),
          el("span", { text: i[1] }),
        ),
      );
    });
  }

  function dizer(msg, tipo) {
    var b = $("ad-barra-msg");
    b.textContent = msg || "";
    b.className = "ad-barra-msg" + (tipo ? " " + tipo : "");
  }

  function pintarEstado() {
    $("ad-estado").textContent = alterado
      ? "Alterações por guardar"
      : "Sem alterações";
  }

  function alterou() {
    alterado = true;
    pintarEstado();
    pintarNumeros();
    clearTimeout(tempoRascunho);
    tempoRascunho = setTimeout(guardarRascunho, 600);
  }

  function guardarRascunho() {
    try {
      localStorage.setItem(
        CHAVE_RASCUNHO,
        JSON.stringify({ quando: Date.now(), dados: dados }),
      );
    } catch (e) {
      /* só conveniência */
    }
  }

  function lerRascunho() {
    try {
      var s = localStorage.getItem(CHAVE_RASCUNHO);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      return null;
    }
  }

  function apagarRascunho() {
    try {
      localStorage.removeItem(CHAVE_RASCUNHO);
    } catch (e) {
      /* ignora */
    }
  }

  /* ==========================================================
     5. MODAL DE CONFIRMAÇÃO
     ========================================================== */
  function confirmar(titulo, corpo, textoSim, textoNao) {
    return new Promise(function (resolve) {
      var m = $("ad-modal");
      var sim = $("ad-modal-sim");
      var nao = $("ad-modal-nao");
      $("ad-modal-t").textContent = titulo;
      var c = $("ad-modal-corpo");
      c.textContent = "";
      c.appendChild(corpo);
      sim.textContent = textoSim || "Confirmar";
      nao.textContent = textoNao || "Cancelar";
      nao.hidden = textoNao === false;
      m.hidden = false;
      sim.focus();
      function fechar(v) {
        m.hidden = true;
        sim.removeEventListener("click", ok);
        nao.removeEventListener("click", cancela);
        document.removeEventListener("keydown", tecla);
        resolve(v);
      }
      function ok() {
        fechar(true);
      }
      function cancela() {
        fechar(false);
      }
      function tecla(ev) {
        if (ev.key === "Escape") fechar(false);
      }
      sim.addEventListener("click", ok);
      nao.addEventListener("click", cancela);
      document.addEventListener("keydown", tecla);
    });
  }

  function listaMensagens(itens, classe) {
    var ul = el("ul", { class: "ad-lista-msgs" });
    itens.forEach(function (i) {
      ul.appendChild(el("li", { class: classe, text: i.msg }));
    });
    return ul;
  }

  /* ==========================================================
     6. SEPARADORES
     ========================================================== */
  var TABS = [
    ["workshops", "Workshops", "fa-solid fa-chalkboard-user", renderWorkshops],
    ["campanha", "Campanha", "fa-solid fa-bag-shopping", renderCampanha],
    ["videos", "Vídeos em destaque", "fa-brands fa-youtube", renderVideos],
    [
      "estatisticas",
      "Estatísticas",
      "fa-solid fa-chart-pie",
      renderEstatisticas,
    ],
    ["pagamento", "Pagamento", "fa-solid fa-credit-card", renderPagamento],
    ["contactos", "Contactos", "fa-solid fa-address-book", renderContactos],
  ];

  function montarTabs() {
    var nav = $("ad-tabs");
    nav.textContent = "";
    TABS.forEach(function (t) {
      var b = el(
        "button",
        {
          type: "button",
          class: "ad-tab",
          role: "tab",
          id: "ad-tab-" + t[0],
          "aria-selected": String(t[0] === tabActual),
          "aria-controls": "ad-paineis",
          onclick: function () {
            mostrarTab(t[0]);
          },
          onkeydown: function (ev) {
            var i = TABS.findIndex(function (x) {
              return x[0] === tabActual;
            });
            if (ev.key === "ArrowRight") i = (i + 1) % TABS.length;
            else if (ev.key === "ArrowLeft")
              i = (i - 1 + TABS.length) % TABS.length;
            else return;
            ev.preventDefault();
            mostrarTab(TABS[i][0]);
            $("ad-tab-" + TABS[i][0]).focus();
          },
        },
        icone(t[2]),
        t[1],
      );
      nav.appendChild(b);
    });
  }

  function mostrarTab(id) {
    tabActual = id;
    Array.prototype.forEach.call($("ad-tabs").children, function (b) {
      b.setAttribute("aria-selected", String(b.id === "ad-tab-" + id));
    });
    var caixa = $("ad-paineis");
    caixa.textContent = "";
    caixa.setAttribute("role", "tabpanel");
    caixa.setAttribute("aria-labelledby", "ad-tab-" + id);
    TABS.filter(function (t) {
      return t[0] === id;
    })[0][3](caixa);
  }

  /* ----------------------------------------------------------
     6.1 Workshops
     ---------------------------------------------------------- */
  function renderWorkshops(caixa) {
    var ws = dados.workshops;

    var topo = el(
      "div",
      { class: "ad-cartao" },
      el("h3", { text: "Workshop activo no site" }),
    );
    topo.appendChild(
      el("p", {
        class: "ad-ajuda",
        text: "É o workshop que aparece na inscrição e no cartão da página inicial.",
      }),
    );
    var opcoes = ws
      .slice()
      .sort(function (a, b) {
        return (b.numero || 0) - (a.numero || 0);
      })
      .map(function (w) {
        return [w.id, "Workshop " + w.numero + ": " + (w.tema || "(sem tema)")];
      });
    topo.appendChild(
      el(
        "div",
        { class: "ad-grelha" },
        campo({
          rotulo: "Workshop activo",
          path: ["workshopActivo"],
          tipo: "select",
          opcoes: opcoes,
          aoMudar: function () {
            mostrarTab("workshops");
          },
        }),
      ),
    );
    topo.appendChild(
      el(
        "div",
        { class: "ad-ws-acoes" },
        botao("Novo workshop", "ad-btn-prim", novoWorkshop, "fa-solid fa-plus"),
      ),
    );
    caixa.appendChild(topo);

    ws.map(function (w, i) {
      return i;
    })
      .sort(function (i, j) {
        return (ws[j].numero || 0) - (ws[i].numero || 0);
      })
      .forEach(function (i) {
        caixa.appendChild(cartaoWorkshop(i));
      });
  }

  function etiquetas(w) {
    var e = [];
    if (w.id === dados.workshopActivo)
      e.push(el("span", { class: "ad-etiq ad-etiq-verde", text: "Activo" }));
    e.push(
      el("span", {
        class: "ad-etiq " + (w.inscricoes === "abertas" ? "ad-etiq-verde" : ""),
        text: w.inscricoes === "abertas" ? "Inscrições abertas" : "Encerradas",
      }),
    );
    var vm = numOuNull(w.valorMinimo);
    e.push(
      el("span", {
        class: "ad-etiq ad-etiq-azul",
        text: vm === 0 ? "Gratuito" : "Pago",
      }),
    );
    return e;
  }

  function cartaoWorkshop(i) {
    var w = dados.workshops[i];
    var aberto = wsAberto === i;
    var cab = el(
      "button",
      {
        type: "button",
        class: "ad-ws-cab",
        "aria-expanded": String(aberto),
        onclick: function () {
          wsAberto = wsAberto === i ? null : i;
          mostrarTab("workshops");
        },
      },
      el("span", { class: "ad-ws-num", text: "#" + w.numero }),
      el("span", { class: "ad-ws-tema", text: w.tema || "(sem tema)" }),
      etiquetas(w),
      icone(aberto ? "fa-solid fa-chevron-up" : "fa-solid fa-chevron-down"),
    );
    var cartao = el("div", { class: "ad-ws" }, cab);
    if (aberto) cartao.appendChild(formWorkshop(i));
    return cartao;
  }

  function formWorkshop(i) {
    var P = function (c) {
      return ["workshops", i, c];
    };
    var w = dados.workshops[i];
    var corpo = el("div", { class: "ad-ws-corpo" });

    corpo.appendChild(
      el(
        "div",
        { class: "ad-grelha" },
        campo({ rotulo: "Tema", path: P("tema"), largo: true }),
        campo({ rotulo: "Orador", path: P("orador") }),
        campo({
          rotulo: "Número do workshop",
          path: P("numero"),
          tipo: "number",
        }),
      ),
    );
    corpo.lastChild.className = "ad-grelha c2";

    var quando = el(
      "div",
      { class: "ad-grelha c3" },
      campo({ rotulo: "Data", path: P("data"), tipo: "date" }),
      campo({ rotulo: "Hora de início", path: P("horaInicio"), tipo: "time" }),
      campo({ rotulo: "Hora de fim", path: P("horaFim"), tipo: "time" }),
    );
    corpo.appendChild(quando);

    corpo.appendChild(
      el(
        "div",
        { class: "ad-grelha c2" },
        campo({ rotulo: "Local", path: P("local") }),
        campo({
          rotulo: "Inscrições",
          path: P("inscricoes"),
          tipo: "select",
          opcoes: [
            ["abertas", "Abertas"],
            ["encerradas", "Encerradas"],
          ],
          aoMudar: function () {
            refrescarCab(i);
          },
        }),
      ),
    );

    // Tipo de inscrição: gratuita ou paga (escreve valorMinimo)
    var vmAtual = numOuNull(w.valorMinimo);
    var global = numOuNull((dados.pagamento || {}).valorMinimo);
    var gratuito = vmAtual === 0;
    var campoValor = campo({
      rotulo: "Valor mínimo obrigatório (Kz)",
      path: P("valorMinimo"),
      tipo: "number",
      ajuda: "Quem se inscreve tem de contribuir pelo menos este valor.",
      aoMudar: function () {
        refrescarCab(i);
      },
    });
    campoValor.hidden = gratuito;
    var seletorTipo = campo({
      rotulo: "Tipo de inscrição",
      path: ["__tipo", i],
      semEstado: true,
      tipo: "select",
      opcoes: [
        ["pago", "Paga (mínimo obrigatório)"],
        ["gratuito", "Gratuita (contribuição opcional)"],
      ],
      aoMudar: function (v) {
        if (v === "gratuito") {
          definir(P("valorMinimo"), 0);
          campoValor.hidden = true;
        } else {
          var nv = global === null || global === 0 ? 500 : global;
          definir(P("valorMinimo"), nv);
          campoValor.querySelector("input").value = String(nv);
          campoValor.hidden = false;
        }
        refrescarCab(i);
        alterou();
      },
    });
    seletorTipo.querySelector("select").value = gratuito ? "gratuito" : "pago";
    seletorTipo.querySelector("select").setAttribute("data-path", "");
    corpo.appendChild(
      el("div", { class: "ad-grelha c2" }, seletorTipo, campoValor),
    );

    corpo.appendChild(
      el(
        "div",
        { class: "ad-grelha" },
        campo({
          rotulo: "Resumo (texto curto do cartão da página inicial)",
          path: P("resumo"),
          tipo: "textarea",
          linhas: 2,
          largo: true,
          opcional: true,
        }),
        campo({
          rotulo: "Descrição",
          path: P("descricao"),
          tipo: "textarea",
          linhas: 5,
          largo: true,
          ajuda:
            'Pode usar <strong>negrito</strong>, <em>itálico</em>, <br> e <a href="https://…">links</a>. O resto é retirado ao gravar.',
        }),
      ),
    );

    corpo.appendChild(
      el(
        "div",
        { class: "ad-grelha c2" },
        campo({
          rotulo: "Imagem (link)",
          path: P("imagem"),
          ajuda:
            "Link https://… ou caminho em assets/. O envio de imagens pelo painel chega numa etapa seguinte.",
          placeholder: "assets/images/workshop.webp",
        }),
        campo({
          rotulo: "Vídeo do YouTube (link)",
          path: P("video"),
          placeholder: "https://youtu.be/…",
          ajuda: "Deixe vazio se ainda não há gravação.",
        }),
      ),
    );

    corpo.appendChild(
      el(
        "div",
        { class: "ad-grelha c3" },
        campo({ rotulo: "Lote de sacolas", path: P("lote"), tipo: "number" }),
        campo({
          rotulo: "Participantes",
          path: P("participantes"),
          tipo: "number",
        }),
        campo({
          rotulo: "Arrecadado (Kz)",
          path: P("arrecadado"),
          tipo: "number",
        }),
        campo({
          rotulo: "Mulheres",
          path: P("mulheres"),
          tipo: "number",
          opcional: true,
          ajuda: "Só para workshops novos.",
        }),
        campo({
          rotulo: "Homens",
          path: P("homens"),
          tipo: "number",
          opcional: true,
          ajuda: "Só para workshops novos.",
        }),
      ),
    );

    corpo.appendChild(editorTopicos(i));

    corpo.appendChild(
      el(
        "div",
        { class: "ad-ws-acoes" },
        w.id !== dados.workshopActivo
          ? botao(
              "Usar como workshop activo",
              "ad-btn-sec",
              function () {
                dados.workshopActivo = w.id;
                alterou();
                mostrarTab("workshops");
              },
              "fa-solid fa-star",
            )
          : null,
      ),
    );
    return corpo;
  }

  function refrescarCab(i) {
    // Actualiza só o cabeçalho (mantém o foco no formulário)
    var cartoes = $("ad-paineis").querySelectorAll(".ad-ws");
    var w = dados.workshops[i];
    Array.prototype.forEach.call(cartoes, function (c) {
      var num = c.querySelector(".ad-ws-num");
      if (num && num.textContent === "#" + w.numero) {
        var cab = c.querySelector(".ad-ws-cab");
        Array.prototype.slice
          .call(cab.querySelectorAll(".ad-etiq"))
          .forEach(function (x) {
            x.remove();
          });
        var seta = cab.querySelector("i");
        etiquetas(w).forEach(function (x) {
          cab.insertBefore(x, seta);
        });
        cab.querySelector(".ad-ws-tema").textContent = w.tema || "(sem tema)";
      }
    });
  }

  function editorTopicos(i) {
    var w = dados.workshops[i];
    if (!Array.isArray(w.aprenderao)) w.aprenderao = [];
    var caixa = el("div", {
      class: "ad-campo ad-largo",
      style: "margin-top:12px",
    });
    caixa.appendChild(
      el("span", {
        class: "ad-rotulo",
        text: "O que você vai aprender (tópicos)",
      }),
    );
    caixa.appendChild(
      el("small", {
        text: "Cada linha é um ponto do quadro na página de inscrição. Sem tópicos, o quadro não aparece.",
      }),
    );
    var ul = el("ul", { class: "ad-lista" });
    caixa.appendChild(ul);

    function pintar() {
      ul.textContent = "";
      w.aprenderao.forEach(function (t, k) {
        var inp = el("input", {
          type: "text",
          value: t,
          "aria-label": "Tópico " + (k + 1),
          "data-path": "workshops." + i + ".aprenderao." + k,
        });
        inp.addEventListener("input", function () {
          w.aprenderao[k] = inp.value;
          alterou();
        });
        ul.appendChild(
          el(
            "li",
            { class: "ad-item" },
            inp,
            el(
              "button",
              {
                type: "button",
                class: "ad-ico",
                "aria-label": "Subir",
                disabled: k === 0,
                onclick: function () {
                  mover(k, -1);
                },
              },
              icone("fa-solid fa-arrow-up"),
            ),
            el(
              "button",
              {
                type: "button",
                class: "ad-ico",
                "aria-label": "Descer",
                disabled: k === w.aprenderao.length - 1,
                onclick: function () {
                  mover(k, 1);
                },
              },
              icone("fa-solid fa-arrow-down"),
            ),
            el(
              "button",
              {
                type: "button",
                class: "ad-ico",
                "aria-label": "Remover",
                onclick: function () {
                  w.aprenderao.splice(k, 1);
                  alterou();
                  pintar();
                },
              },
              icone("fa-solid fa-xmark"),
            ),
          ),
        );
      });
    }
    function mover(k, d) {
      var x = w.aprenderao.splice(k, 1)[0];
      w.aprenderao.splice(k + d, 0, x);
      alterou();
      pintar();
    }
    pintar();
    caixa.appendChild(
      el(
        "div",
        { class: "ad-ws-acoes" },
        botao(
          "Adicionar tópico",
          "ad-btn-sec ad-btn-pq",
          function () {
            w.aprenderao.push("");
            alterou();
            pintar();
            var ins = ul.querySelectorAll("input");
            if (ins.length) ins[ins.length - 1].focus();
          },
          "fa-solid fa-plus",
        ),
      ),
    );
    return caixa;
  }

  function novoWorkshop() {
    var w = Nucleo.novoWorkshop(dados);
    dados.workshops.push(w);
    wsAberto = dados.workshops.length - 1;
    alterou();
    mostrarTab("workshops");
    dizer(
      "Novo workshop criado (" +
        w.id +
        "). Preencha o tema, o orador e a data.",
      "ok",
    );
  }

  /* ----------------------------------------------------------
     6.2 Campanha
     ---------------------------------------------------------- */
  function renderCampanha(caixa) {
    if (!dados.campanha) dados.campanha = {};
    var P = function (c) {
      return ["campanha", c];
    };
    var c = el(
      "div",
      { class: "ad-cartao" },
      el("h3", { text: "Sacolas Eco Conecta" }),
    );
    c.appendChild(
      el("p", {
        class: "ad-ajuda",
        text: "O arrecadado do lote activo é a soma dos workshops desse lote mais 'Outros valores'.",
      }),
    );
    c.appendChild(
      el(
        "div",
        { class: "ad-grelha c2" },
        campo({ rotulo: "Título do lote", path: P("titulo"), largo: true }),
        campo({
          rotulo: "Lote activo",
          path: P("loteActivo"),
          tipo: "number",
          ajuda:
            "Ao mudar para o lote 2, marque os novos workshops com lote 2: a barra recomeça do zero.",
        }),
        campo({
          rotulo: "Meta de produção (Kz)",
          path: P("meta"),
          tipo: "number",
        }),
        campo({
          rotulo: "Outros valores (Kz)",
          path: P("outrosValores"),
          tipo: "number",
          ajuda: "Contribuições avulsas fora dos workshops.",
        }),
        campo({
          rotulo: "Link da prestação de contas",
          path: P("linkPrestacaoContas"),
          ajuda:
            "Opcional. Se preenchido, aparece o link 'Ver prestação de contas'.",
          placeholder: "https://…",
        }),
        campo({
          rotulo: "Imagem da campanha (link)",
          path: P("imagem"),
          placeholder: "assets/images/campanha-sacolas.webp",
        }),
      ),
    );
    caixa.appendChild(c);
  }

  /* ----------------------------------------------------------
     6.3 Vídeos em destaque
     ---------------------------------------------------------- */
  function renderVideos(caixa) {
    if (!Array.isArray(dados.videosDestaque)) dados.videosDestaque = [];
    var c = el(
      "div",
      { class: "ad-cartao" },
      el("h3", { text: "Vídeos na página inicial" }),
    );
    c.appendChild(
      el("p", {
        class: "ad-ajuda",
        text: "Escolha até 3 workshops com vídeo e a ordem. Sem escolha, aparecem os 3 mais recentes.",
      }),
    );
    var ul = el("ul", { class: "ad-lista" });
    c.appendChild(ul);
    var sel = el("select", { "aria-label": "Workshop a acrescentar" });
    var linhaAdd = el("div", { class: "ad-item", style: "margin-top:10px" });

    function rotulo(id) {
      var w = dados.workshops.filter(function (x) {
        return x.id === id;
      })[0];
      return w ? "Workshop " + w.numero + ": " + w.tema : id + " (não existe)";
    }
    function pintar() {
      ul.textContent = "";
      var lista = dados.videosDestaque;
      lista.forEach(function (id, k) {
        ul.appendChild(
          el(
            "li",
            { class: "ad-item" },
            el("span", { class: "ad-ws-num", text: String(k + 1) }),
            el("span", { class: "ad-item-texto", text: rotulo(id) }),
            el(
              "button",
              {
                type: "button",
                class: "ad-ico",
                "aria-label": "Subir",
                disabled: k === 0,
                onclick: function () {
                  mover(k, -1);
                },
              },
              icone("fa-solid fa-arrow-up"),
            ),
            el(
              "button",
              {
                type: "button",
                class: "ad-ico",
                "aria-label": "Descer",
                disabled: k === lista.length - 1,
                onclick: function () {
                  mover(k, 1);
                },
              },
              icone("fa-solid fa-arrow-down"),
            ),
            el(
              "button",
              {
                type: "button",
                class: "ad-ico",
                "aria-label": "Remover",
                onclick: function () {
                  lista.splice(k, 1);
                  alterou();
                  pintar();
                },
              },
              icone("fa-solid fa-xmark"),
            ),
          ),
        );
      });
      if (!lista.length)
        ul.appendChild(
          el("li", {
            class: "ad-nota",
            text: "Nenhum escolhido: aparecem os 3 vídeos mais recentes.",
          }),
        );
      sel.textContent = "";
      var livres = dados.workshops
        .filter(function (w) {
          return Nucleo.idYoutube(w.video) && lista.indexOf(w.id) === -1;
        })
        .sort(function (a, b) {
          return (b.numero || 0) - (a.numero || 0);
        });
      livres.forEach(function (w) {
        sel.appendChild(
          el("option", {
            value: w.id,
            text: "Workshop " + w.numero + ": " + w.tema,
          }),
        );
      });
      linhaAdd.hidden = !livres.length || lista.length >= 3;
    }
    function mover(k, d) {
      var x = dados.videosDestaque.splice(k, 1)[0];
      dados.videosDestaque.splice(k + d, 0, x);
      alterou();
      pintar();
    }
    linhaAdd.appendChild(sel);
    linhaAdd.appendChild(
      botao(
        "Acrescentar",
        "ad-btn-sec",
        function () {
          if (!sel.value || dados.videosDestaque.length >= 3) return;
          dados.videosDestaque.push(sel.value);
          alterou();
          pintar();
        },
        "fa-solid fa-plus",
      ),
    );
    c.appendChild(linhaAdd);
    pintar();
    caixa.appendChild(c);
  }

  /* ----------------------------------------------------------
     6.4 Estatísticas de género
     ---------------------------------------------------------- */
  function renderEstatisticas(caixa) {
    if (!dados.estatisticas) dados.estatisticas = {};
    var g = SiteData.generoGlobal(dados);
    var c = el(
      "div",
      { class: "ad-cartao" },
      el("h3", { text: "Mulheres e homens nos workshops" }),
    );
    c.appendChild(
      el("p", {
        class: "ad-ajuda",
        text: "A percentagem global calcula-se sozinha: parte da base de 2025 e soma os workshops novos que tenham 'mulheres' e 'homens' preenchidos (separador Workshops).",
      }),
    );
    var base = Number(dados.estatisticas.baseParticipacoes) || 0;
    c.appendChild(
      el(
        "div",
        { class: "ad-numeros" },
        el(
          "div",
          { class: "ad-num" },
          el("b", { text: g.mulheres + "%" }),
          el("span", { text: "Mulheres (resultado)" }),
        ),
        el(
          "div",
          { class: "ad-num" },
          el("b", { text: g.homens + "%" }),
          el("span", { text: "Homens (resultado)" }),
        ),
        el(
          "div",
          { class: "ad-num" },
          el("b", { text: String(base) }),
          el("span", { text: "Participações na base de 2025" }),
        ),
        el(
          "div",
          { class: "ad-num" },
          el("b", { text: String(g.totalNovos) }),
          el("span", { text: "Participações novas contadas" }),
        ),
      ),
    );
    var av = el(
      "details",
      { class: "ad-nota ad-nota-aviso" },
      el("summary", {
        text: "Avançado: base de 2025 (só mude se tiver a contagem exacta)",
      }),
    );
    av.appendChild(
      el(
        "div",
        { class: "ad-grelha c2" },
        campo({
          rotulo: "Participações na base",
          path: ["estatisticas", "baseParticipacoes"],
          tipo: "number",
          aoMudar: function () {
            pintarNumeros();
          },
        }),
        campo({
          rotulo: "Mulheres na base",
          path: ["estatisticas", "baseMulheres"],
          tipo: "number",
          ajuda: "44 é uma estimativa a partir dos 41% do relatório final.",
        }),
      ),
    );
    c.appendChild(av);
    caixa.appendChild(c);
  }

  /* ----------------------------------------------------------
     6.5 Pagamento
     ---------------------------------------------------------- */
  function renderPagamento(caixa) {
    if (!dados.pagamento) dados.pagamento = { metodos: [] };
    var c = el(
      "div",
      { class: "ad-cartao" },
      el("h3", { text: "Contactos e valor mínimo" }),
    );
    c.appendChild(
      el("p", {
        class: "ad-ajuda",
        text: "O site não processa pagamentos: mostra estes dados e a equipa confirma ao receber o comprovativo.",
      }),
    );
    c.appendChild(
      el(
        "div",
        { class: "ad-grelha c3" },
        campo({
          rotulo: "WhatsApp dos comprovativos",
          path: ["pagamento", "whatsapp"],
          ajuda: "Só dígitos, formato 244…",
          placeholder: "244935269451",
        }),
        campo({
          rotulo: "E-mail dos comprovativos",
          path: ["pagamento", "email"],
          tipo: "email",
        }),
        campo({
          rotulo: "Valor mínimo global (Kz)",
          path: ["pagamento", "valorMinimo"],
          tipo: "number",
          ajuda: "Usado quando o workshop não tem valor próprio.",
        }),
      ),
    );
    c.appendChild(
      el("p", {
        class: "ad-nota ad-nota-aviso",
        text: "Alterações a esta secção pedem uma confirmação antes de gravar (mostra o antes e o depois). O nome do titular das contas não se mostra no site, por decisão de segurança.",
      }),
    );
    caixa.appendChild(c);

    (dados.pagamento.metodos || []).forEach(function (m, i) {
      var card = el(
        "div",
        { class: "ad-cartao" },
        el("h3", { text: m.titulo || m.nome }),
      );
      card.appendChild(
        el(
          "div",
          { class: "ad-campo ad-campo-check" },
          (function () {
            var cb = el("input", { type: "checkbox", id: "ad-act-" + i });
            cb.checked = !!m.activo;
            cb.addEventListener("change", function () {
              m.activo = cb.checked;
              alterou();
            });
            return cb;
          })(),
          el("label", {
            for: "ad-act-" + i,
            text: "Método activo (aparece no site)",
          }),
        ),
      );
      card.appendChild(
        el(
          "div",
          { class: "ad-grelha" },
          campo({
            rotulo: "Instrução",
            path: ["pagamento", "metodos", i, "instrucao"],
            tipo: "textarea",
            linhas: 2,
            largo: true,
          }),
        ),
      );
      var lista = el("div");
      card.appendChild(lista);
      function pintarCampos() {
        lista.textContent = "";
        (m.campos = m.campos || []).forEach(function (cp, j) {
          var r = el("input", {
            type: "text",
            value: cp.rotulo || "",
            "aria-label": "Rótulo",
            placeholder: "Rótulo (ex.: IBAN)",
            "data-path": "pagamento.metodos." + i + ".campos." + j + ".rotulo",
          });
          var v = el("input", {
            type: "text",
            value: cp.valor || "",
            "aria-label": "Valor",
            placeholder: "Valor",
            "data-path": "pagamento.metodos." + i + ".campos." + j + ".valor",
          });
          r.addEventListener("input", function () {
            cp.rotulo = r.value;
            alterou();
          });
          v.addEventListener("input", function () {
            cp.valor = v.value;
            v.closest(".ad-par").classList.remove("ad-invalido");
            alterou();
          });
          lista.appendChild(
            el(
              "div",
              { class: "ad-par" },
              r,
              v,
              el(
                "button",
                {
                  type: "button",
                  class: "ad-btn ad-btn-sec ad-btn-pq ad-btn-perigo",
                  onclick: function () {
                    m.campos.splice(j, 1);
                    alterou();
                    pintarCampos();
                  },
                },
                icone("fa-solid fa-trash"),
                "Remover dado",
              ),
            ),
          );
        });
      }
      pintarCampos();
      card.appendChild(
        el(
          "div",
          { class: "ad-ws-acoes" },
          botao(
            "Adicionar dado",
            "ad-btn-sec ad-btn-pq",
            function () {
              m.campos.push({ rotulo: "", valor: "" });
              alterou();
              pintarCampos();
            },
            "fa-solid fa-plus",
          ),
        ),
      );
      caixa.appendChild(card);
    });
  }

  /* ----------------------------------------------------------
     6.6 Contactos do rodapé
     ---------------------------------------------------------- */
  function renderContactos(caixa) {
    if (!dados.contactos) dados.contactos = {};
    var c = el(
      "div",
      { class: "ad-cartao" },
      el("h3", { text: "Contactos do rodapé" }),
    );
    c.appendChild(
      el("p", {
        class: "ad-ajuda",
        text: "Aparecem no rodapé de todas as páginas.",
      }),
    );
    c.appendChild(
      el(
        "div",
        { class: "ad-grelha c2" },
        campo({
          rotulo: "E-mail",
          path: ["contactos", "email"],
          tipo: "email",
        }),
        campo({
          rotulo: "WhatsApp (só dígitos)",
          path: ["contactos", "whatsapp"],
          placeholder: "244935269451",
        }),
        campo({
          rotulo: "WhatsApp como aparece",
          path: ["contactos", "whatsappTexto"],
          placeholder: "(+244) 935269451",
        }),
        campo({ rotulo: "Localização", path: ["contactos", "local"] }),
      ),
    );
    caixa.appendChild(c);
  }

  /* ==========================================================
     7. VERIFICAR E DESCARREGAR
     ========================================================== */
  function marcarInvalidos(itens) {
    Array.prototype.forEach.call(
      document.querySelectorAll(".ad-invalido"),
      function (x) {
        x.classList.remove("ad-invalido");
      },
    );
    itens.forEach(function (it) {
      var alvo = document.querySelector('[data-path="' + it.path + '"]');
      if (alvo) {
        var wrap = alvo.closest(".ad-campo") || alvo.closest(".ad-par");
        if (wrap) wrap.classList.add("ad-invalido");
      }
    });
  }

  function verificar() {
    var r = Nucleo.validar(dados);
    marcarInvalidos(r.erros);
    if (!r.erros.length && !r.avisos.length) {
      dizer("Tudo certo: não há erros nem avisos.", "ok");
    } else if (r.erros.length) {
      dizer(
        r.erros.length +
          " erro(s) por corrigir: " +
          r.erros[0].msg +
          (r.erros.length > 1 ? " (e mais " + (r.erros.length - 1) + ")" : ""),
        "erro",
      );
    } else {
      dizer(r.avisos.length + " aviso(s): " + r.avisos[0].msg, "");
    }
    if (r.erros.length || r.avisos.length) {
      var corpo = el("div");
      if (r.erros.length) {
        corpo.appendChild(
          el("strong", { text: "Erros (têm de ser corrigidos)" }),
        );
        corpo.appendChild(listaMensagens(r.erros, "e"));
      }
      if (r.avisos.length) {
        corpo.appendChild(el("strong", { text: "Avisos" }));
        corpo.appendChild(listaMensagens(r.avisos, "a"));
      }
      confirmar("Resultado da verificação", corpo, "Fechar", false);
    }
    return r;
  }

  // Valida, mostra avisos e confirma alterações ao pagamento.
  // Devolve uma Promise com os dados limpos, ou null se o membro desistir.
  function prepararEnvio() {
    var r = Nucleo.validar(dados);
    marcarInvalidos(r.erros);
    if (r.erros.length) {
      verificar();
      return Promise.resolve(null);
    }
    var limpo = Nucleo.limparParaGravar(dados);

    function passoAvisos() {
      if (!r.avisos.length) return Promise.resolve(true);
      var c = el(
        "div",
        {},
        el("p", {
          text: "Há avisos. Pode continuar, mas confirme que está tudo como pretende.",
        }),
        listaMensagens(r.avisos, "a"),
      );
      return confirmar("Continuar com avisos?", c, "Continuar");
    }
    function passoPagamento() {
      var dif = Nucleo.diferencas(original.pagamento, limpo.pagamento);
      if (!dif.length) return Promise.resolve(true);
      var c = el(
        "div",
        {},
        el("p", {
          text: "Está a alterar os dados de pagamento, que são públicos no site. Confira o antes e o depois.",
        }),
      );
      dif.forEach(function (d) {
        c.appendChild(
          el(
            "div",
            { class: "ad-dif" },
            el("div", { text: d.campo }),
            el("div", {
              class: "antes",
              text: "Antes: " + (d.antes === "" ? "(vazio)" : d.antes),
            }),
            el("div", {
              class: "depois",
              text: "Depois: " + (d.depois === "" ? "(vazio)" : d.depois),
            }),
          ),
        );
      });
      return confirmar(
        "Confirmar alterações ao pagamento",
        c,
        "Confirmar alterações",
      );
    }

    return passoAvisos()
      .then(function (ok) {
        return ok ? passoPagamento() : false;
      })
      .then(function (ok) {
        return ok ? limpo : null;
      });
  }

  function descarregar() {
    prepararEnvio().then(function (limpo) {
      if (!limpo) return;
      var blob = new Blob([JSON.stringify(limpo, null, 2) + "\n"], {
        type: "application/json",
      });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "site.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
      dizer(
        "Ficheiro site.json descarregado. É uma cópia de segurança: ainda não foi publicado.",
        "ok",
      );
    });
  }

  /* ==========================================================
     7b. SESSÃO, PUBLICAR, HISTÓRICO
     ========================================================== */
  function ocupar(sim) {
    aOcupado = sim;
    [
      "ad-btn-validar",
      "ad-btn-descarregar",
      "ad-btn-publicar",
      "ad-btn-historico",
    ].forEach(function (id) {
      $(id).disabled = sim;
    });
  }

  function mostrarLogin(aviso) {
    clearTimeout(tempoInactividade);
    Sessao.token = null;
    Sessao.sha = null;
    $("ad-sessao").hidden = true;
    $("ad-app").hidden = true;
    $("ad-barra").hidden = true;
    $("ad-carregando").hidden = true;
    $("ad-erro-carga").hidden = true;
    $("ad-aviso-rascunho").hidden = true;
    $("ad-estado").textContent = "";
    var av = $("ad-login-aviso");
    av.textContent = aviso || "";
    av.hidden = !aviso;
    $("ad-login-erro").hidden = true;
    $("ad-login-senha").value = "";
    $("ad-login").hidden = false;
    $("ad-login-senha").focus();
  }

  // Termina a sessão neste browser. Guarda o rascunho para não perder trabalho.
  function terminarSessao(aviso) {
    if (alterado) guardarRascunho();
    alterado = false;
    mostrarLogin(aviso);
  }

  function tocar() {
    if (!Sessao.token) return;
    clearTimeout(tempoInactividade);
    tempoInactividade = setTimeout(function () {
      terminarSessao(
        "A sessão terminou por inactividade." +
          " O que escreveu ficou como rascunho neste browser.",
      );
    }, INACTIVIDADE_MS);
  }

  // Trata um erro de pedido autenticado. Devolve true se já o tratou.
  function tratarErroSessao(e) {
    if (e && e.sessaoInvalida) {
      terminarSessao(
        e.message + " O que escreveu ficou como rascunho neste browser.",
      );
      return true;
    }
    return false;
  }

  function entrar(ev) {
    ev.preventDefault();
    var nome = $("ad-login-nome").value;
    var senha = $("ad-login-senha").value;
    var erro = $("ad-login-erro");
    erro.hidden = true;
    if (/SEU-SUBDOMINIO/.test(WORKER_URL)) {
      erro.textContent =
        "Falta pôr o endereço do Worker na constante WORKER_URL de js/admin.js.";
      erro.hidden = false;
      return;
    }
    if (!senha) {
      erro.textContent = "Escreva a sua senha.";
      erro.hidden = false;
      return;
    }
    var btn = $("ad-login-btn");
    btn.disabled = true;
    api("/login", { metodo: "POST", corpo: { nome: nome, senha: senha } })
      .then(function (r) {
        Sessao.token = r.token;
        Sessao.nome = r.nome;
        $("ad-login-senha").value = "";
        $("ad-login").hidden = true;
        $("ad-sessao-nome").textContent = r.nome;
        $("ad-sessao").hidden = false;
        $("ad-carregando").hidden = false;
        tocar();
        return carregarSite();
      })
      .catch(function (e) {
        $("ad-carregando").hidden = true;
        if (Sessao.token) {
          // Entrou, mas a leitura falhou
          mostrarErroCarga(e);
          return;
        }
        erro.textContent = e.message;
        erro.hidden = false;
      })
      .then(function () {
        btn.disabled = false;
      });
  }

  function mostrarErroCarga(e) {
    if (tratarErroSessao(e)) return;
    var b = $("ad-erro-carga");
    b.hidden = false;
    b.textContent = "Não foi possível carregar os dados do site. " + e.message;
  }

  function carregarSite() {
    return Fonte.carregar().then(function (json) {
      try {
        iniciar(json);
      } catch (err) {
        console.error(err);
        var b = $("ad-erro-carga");
        b.hidden = false;
        b.textContent =
          "Erro ao desenhar o painel: " +
          (err && err.message ? err.message : err);
      }
    });
  }

  function sair() {
    function fazer() {
      api("/logout", { metodo: "POST" }).catch(function () {});
      terminarSessao("Saiu do painel.");
    }
    if (!alterado) return fazer();
    confirmar(
      "Sair do painel?",
      el("p", {
        text: "Tem alterações por publicar. Ficam como rascunho neste browser, mas não no site.",
      }),
      "Sair",
    ).then(function (ok) {
      if (ok) fazer();
    });
  }

  function publicar() {
    if (aOcupado) return;
    prepararEnvio().then(function (limpo) {
      if (!limpo) return;
      confirmar(
        "Publicar no site",
        el("p", {
          text: "As alterações ficam no site dentro de cerca de 1 a 2 minutos.",
        }),
        "Publicar",
      ).then(function (ok) {
        if (ok) enviar(limpo);
      });
    });
  }

  function enviar(limpo) {
    ocupar(true);
    dizer("A publicar…", "");
    api("/site", { metodo: "PUT", corpo: { dados: limpo, sha: Sessao.sha } })
      .then(function (r) {
        Sessao.sha = r.sha;
        original = clonar(limpo);
        dados = clonar(limpo);
        alterado = false;
        clearTimeout(tempoRascunho);
        apagarRascunho();
        pintarEstado();
        pintarNumeros();
        mostrarTab(tabActual);
        if (r.semAlteracoes) {
          dizer("Não há alterações para publicar.", "ok");
        } else {
          dizer(
            "Publicado. O site actualiza em cerca de 1 a 2 minutos." +
              (r.aviso ? " " + r.aviso : ""),
            r.aviso ? "" : "ok",
          );
        }
      })
      .catch(function (e) {
        if (tratarErroSessao(e)) return;
        if (e.status === 409) return conflito();
        dizer(e.message, "erro");
      })
      .then(function () {
        ocupar(false);
      });
  }

  // Alguém publicou entretanto: guarda o rascunho e carrega a versão nova.
  function conflito() {
    guardarRascunho();
    return confirmar(
      "Alguém alterou os dados entretanto",
      el("p", {
        text:
          "As suas alterações ficaram como rascunho. Vamos carregar a versão mais recente;" +
          " depois use «Restaurar» no aviso do rascunho e reveja tudo antes de publicar.",
      }),
      "Carregar a versão nova",
      false,
    ).then(function () {
      alterado = false;
      return carregarSite().catch(mostrarErroCarga);
    });
  }

  function abrirHistorico() {
    if (aOcupado) return;
    ocupar(true);
    dizer("A ler o histórico…", "");
    api("/historico")
      .then(function (r) {
        dizer("", "");
        var itens = r.itens || [];
        var escolhido = null;
        var corpo = el("div");
        if (!itens.length) {
          corpo.appendChild(
            el("p", { text: "Ainda não há versões gravadas." }),
          );
        } else {
          corpo.appendChild(
            el("p", {
              text: "Últimas versões do site. Restaurar volta a publicar essa versão.",
            }),
          );
          var ul = el("ul", { class: "ad-hist" });
          itens.forEach(function (it, i) {
            var quando = it.data
              ? new Date(it.data).toLocaleString("pt-PT")
              : "";
            ul.appendChild(
              el(
                "li",
                {},
                el(
                  "div",
                  {},
                  el("strong", { text: quando }),
                  el("small", {
                    text:
                      (it.autor ? it.autor + " · " : "") + (it.mensagem || ""),
                  }),
                ),
                i === 0
                  ? el("span", {
                      class: "ad-hist-actual",
                      text: "Versão actual",
                    })
                  : botao("Restaurar", "ad-btn-sec ad-btn-pq", function () {
                      escolhido = it;
                      $("ad-modal-sim").click();
                    }),
              ),
            );
          });
          corpo.appendChild(ul);
        }
        return confirmar(
          "Histórico de alterações",
          corpo,
          "Fechar",
          false,
        ).then(function () {
          if (!escolhido) return;
          return restaurar(escolhido);
        });
      })
      .catch(function (e) {
        if (tratarErroSessao(e)) return;
        dizer(e.message, "erro");
      })
      .then(function () {
        ocupar(false);
      });
  }

  function restaurar(it) {
    var quando = it.data ? new Date(it.data).toLocaleString("pt-PT") : "";
    var texto =
      "Vai voltar à versão de " +
      quando +
      (it.autor ? " (" + it.autor + ")" : "") +
      " e publicá-la. " +
      (alterado ? "As alterações que tem por publicar perdem-se. " : "") +
      "O site actualiza em cerca de 1 a 2 minutos.";
    return confirmar(
      "Restaurar esta versão?",
      el("p", { text: texto }),
      "Restaurar",
    ).then(function (ok) {
      if (!ok) return;
      dizer("A restaurar…", "");
      return api("/restaurar", {
        metodo: "POST",
        corpo: { commit: it.sha },
      }).then(function (r) {
        Sessao.sha = r.sha;
        alterado = false;
        clearTimeout(tempoRascunho);
        apagarRascunho();
        if (r.dados) iniciar(r.dados);
        dizer(
          r.semAlteracoes
            ? "Essa versão já é a que está no site."
            : "Versão restaurada. O site actualiza em cerca de 1 a 2 minutos." +
                (r.aviso ? " " + r.aviso : ""),
          r.semAlteracoes || r.aviso ? "" : "ok",
        );
      });
    });
  }

  /* ==========================================================
     8. ARRANQUE
     ========================================================== */
  function iniciar(json) {
    original = clonar(json);
    dados = clonar(json);
    if (!Array.isArray(dados.workshops)) dados.workshops = [];
    $("ad-aviso-rascunho").hidden = true;
    $("ad-carregando").hidden = true;
    $("ad-app").hidden = false;
    $("ad-barra").hidden = false;
    alterado = false;
    montarTabs();
    pintarNumeros();
    pintarEstado();
    mostrarTab(tabActual);

    var rasc = lerRascunho();
    if (
      rasc &&
      rasc.dados &&
      JSON.stringify(rasc.dados) !== JSON.stringify(original)
    ) {
      var banner = $("ad-aviso-rascunho");
      banner.textContent = "";
      banner.hidden = false;
      var quando = new Date(rasc.quando).toLocaleString("pt-PT");
      banner.appendChild(icone("fa-solid fa-triangle-exclamation"));
      banner.appendChild(
        el("span", { text: "Tem um rascunho não publicado (" + quando + ")." }),
      );
      banner.appendChild(
        botao("Restaurar", "ad-btn-sec ad-btn-pq", function () {
          dados = clonar(rasc.dados);
          if (!Array.isArray(dados.workshops)) dados.workshops = [];
          alterado = true;
          banner.hidden = true;
          pintarEstado();
          pintarNumeros();
          mostrarTab(tabActual);
        }),
      );
      banner.appendChild(
        botao("Descartar", "ad-btn-sec ad-btn-pq", function () {
          apagarRascunho();
          banner.hidden = true;
        }),
      );
    }
  }

  function arrancar() {
    var sel = $("ad-login-nome");
    MEMBROS.forEach(function (n) {
      sel.appendChild(el("option", { value: n, text: n }));
    });
    $("ad-login-form").addEventListener("submit", entrar);
    $("ad-btn-sair").addEventListener("click", sair);
    $("ad-btn-validar").addEventListener("click", verificar);
    $("ad-btn-descarregar").addEventListener("click", descarregar);
    $("ad-btn-publicar").addEventListener("click", publicar);
    $("ad-btn-historico").addEventListener("click", abrirHistorico);
    ["click", "keydown", "input", "touchstart"].forEach(function (ev) {
      document.addEventListener(ev, tocar, true);
    });
    window.addEventListener("beforeunload", function (ev) {
      if (alterado) {
        ev.preventDefault();
        ev.returnValue = "";
      }
    });
    mostrarLogin("");
  }

  // Exposto para testes e para as etapas seguintes
  window.Admin = {
    Nucleo: Nucleo,
    estado: function () {
      return dados;
    },
    original: function () {
      return original;
    },
    iniciar: iniciar,
    verificar: verificar,
    Fonte: Fonte,
    Sessao: Sessao,
    api: api,
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
