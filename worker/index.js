/* ============================================================
   worker/index.js — Worker do painel do Grupo Conecta (Cloudflare)
   Passo 9, etapa 3. Fluxo: painel (browser) -> este Worker -> API do GitHub.

   O token do GitHub vive só aqui (segredo GITHUB_TOKEN); o browser
   nunca o vê. Este Worker só lê e escreve, na branch "content",
   data/site.json e data/certificados-painel.json (lista fechada) e
   dispara o workflow de publicação na "main".
   Para os certificados assina os envios ao Cloudinary: o ficheiro vai
   do browser directamente ao Cloudinary e o API secret nunca sai daqui.

   Ligações e variáveis (ver worker/README.md):
     KV        LIMITES          tentativas de entrada falhadas e auditoria
                                dos pedidos de assinatura (auditoria:cert:)
     Segredos  GITHUB_TOKEN     token fine-grained do GitHub
               SESSAO_SEGREDO   chave de assinatura das sessões (>= 32 caracteres)
               SENHAS           JSON com o hash da senha de cada membro
               CLOUDINARY_API_KEY     chave de API "painel-worker"
               CLOUDINARY_API_SECRET  segredo dessa chave
     Variáveis REPO             "Fernando2300/Grupo-Conecta-Website"
               ORIGENS          origens permitidas, separadas por vírgula
               WORKFLOW         (opcional) nome do workflow; omissão "pages.yml"
               CLOUDINARY_CLOUD "y1pydrcc"

   Endpoints:
     GET  /               teste de vida (sem dados)
     POST /login          { nome, senha } -> sessão
     GET  /site           -> { dados, sha }
     PUT  /site           { dados, sha } -> valida, grava e publica
     GET  /historico      -> últimas alterações (?ficheiro=site|certificados; omissão site)
     POST /restaurar      { commit } -> volta a uma versão anterior
                          (?ficheiro=site|certificados; omissão site)
     POST /logout         (a sessão é só do browser; o painel descarta-a)
     GET  /certificados             -> { dados, sha } de data/certificados-painel.json
     PUT  /certificados             { certificados:[...] } -> valida, junta por código
                                    (nunca apaga), grava e publica
     POST /certificados/assinatura  { itens:[{codigo, tipo}] } (máx. 25) -> assinaturas
     GET  /certificados/ficheiros   -> { pdf:[códigos], png:[códigos] } no Cloudinary
   ============================================================ */

/* ---------- Constantes (não vêm do ambiente, de propósito) ---------- */
// Únicos ficheiros que se escrevem (lista fechada)
var FICHEIROS = {
  site: "data/site.json",
  certificados: "data/certificados-painel.json",
};
var CAMINHO = FICHEIROS.site;
var RAMO = "content"; // única branch onde se escreve
var REF_WORKFLOW = "main"; // o workflow corre sempre a partir da main
var TAMANHO_MAX = 200000; // bytes do corpo de um pedido
var SESSAO_MIN = 30; // inactividade máxima (minutos)
var SESSAO_MAX_H = 8; // duração máxima absoluta (horas)
var TENTATIVAS_MEMBRO = 5; // falhas por membro
var TENTATIVAS_IP = 20; // falhas por IP
var BLOQUEIO_SEG = 900; // 15 minutos
var PBKDF2_PADRAO = 10000;
// Certificados
var CERT_MAX_ITENS_ASSINATURA = 25;
var CERT_MAX_ENTRADAS = 300;
var CERT_AVISO_BYTES = 700 * 1024;
var CERT_MAX_BYTES = 900 * 1024;
var CERT_PASTA = "certificados";
var CERT_USAR_ASSET_FOLDER = true; // se o Cloudinary recusar asset_folder, mude para false
var CERT_AUDITORIA_SEG = 180 * 24 * 3600;
var CERT_MAX_PAGINAS = 10;
var RE_CODIGO_CERT = /^CON-(WS|GC|MOD)[0-9]{1,2}-[0-9]{4}-[0-9]{2}-[0-9]{3}$/;

var enc = new TextEncoder();
var dec = new TextDecoder();

/* ==========================================================
   1. Utilitários
   ========================================================== */
function ErroHttp(status, msg, extra) {
  this.status = status;
  this.msg = msg;
  this.extra = extra || {};
}

function paraB64(bytes) {
  var s = "";
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}
function deB64(str) {
  var s = atob(str);
  var u = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
function paraB64Url(bytes) {
  return paraB64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
function deB64Url(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return deB64(str);
}

function iguais(a, b) {
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a[i] ^ b[i];
  return r === 0;
}

function norm(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function repo(env) {
  var r = String(env.REPO || "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(r))
    throw new ErroHttp(500, "Configuração em falta: variável REPO.");
  return r;
}

function origensPermitidas(env) {
  return String(env.ORIGENS || "")
    .split(",")
    .map(function (o) {
      return o.trim().replace(/\/+$/, "");
    })
    .filter(Boolean);
}

/* ==========================================================
   2. Respostas e CORS
   ========================================================== */
function responder(env, origem, status, corpo, extra) {
  var h = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  if (origem && origensPermitidas(env).indexOf(origem) !== -1) {
    h.set("Access-Control-Allow-Origin", origem);
    h.set("Vary", "Origin");
    h.set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    h.set(
      "Access-Control-Expose-Headers",
      "X-Sessao, X-Sessao-Expira, Retry-After",
    );
    h.set("Access-Control-Max-Age", "600");
  }
  if (extra)
    Object.keys(extra).forEach(function (k) {
      h.set(k, extra[k]);
    });
  return new Response(status === 204 ? null : JSON.stringify(corpo || {}), {
    status: status,
    headers: h,
  });
}

async function lerCorpo(req) {
  var tipo = req.headers.get("Content-Type") || "";
  if (tipo.toLowerCase().indexOf("application/json") !== 0)
    throw new ErroHttp(415, "O pedido tem de ser JSON.");
  var cl = parseInt(req.headers.get("Content-Length") || "0", 10);
  if (cl > TAMANHO_MAX) throw new ErroHttp(413, "O pedido é demasiado grande.");
  var texto = await req.text();
  if (texto.length > TAMANHO_MAX)
    throw new ErroHttp(413, "O pedido é demasiado grande.");
  try {
    var o = JSON.parse(texto);
  } catch (e) {
    throw new ErroHttp(400, "JSON inválido.");
  }
  if (!o || typeof o !== "object" || Array.isArray(o))
    throw new ErroHttp(400, "JSON inválido.");
  return o;
}

/* ==========================================================
   3. Membros, senhas e sessões
   ========================================================== */
function lerMembros(env) {
  var obj;
  try {
    obj = JSON.parse(env.SENHAS || "");
  } catch (e) {
    throw new ErroHttp(500, "Configuração em falta: segredo SENHAS.");
  }
  var mapa = {};
  Object.keys(obj || {}).forEach(function (nome) {
    var m = obj[nome];
    if (m && typeof m.salt === "string" && typeof m.hash === "string")
      mapa[norm(nome)] = {
        nome: nome,
        salt: m.salt,
        hash: m.hash,
        it: m.it || PBKDF2_PADRAO,
      };
  });
  return mapa;
}

async function derivar(senha, saltB64, it) {
  var chave = await crypto.subtle.importKey(
    "raw",
    enc.encode(String(senha).normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  var bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: deB64(saltB64), iterations: it },
    chave,
    256,
  );
  return new Uint8Array(bits);
}

function chaveSessao(env) {
  if (!env.SESSAO_SEGREDO || String(env.SESSAO_SEGREDO).length < 32)
    throw new ErroHttp(500, "Configuração em falta: segredo SESSAO_SEGREDO.");
  return crypto.subtle.importKey(
    "raw",
    enc.encode(env.SESSAO_SEGREDO),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function criarSessao(env, nome, ini) {
  var agora = Date.now();
  var limite = ini + SESSAO_MAX_H * 3600000;
  var exp = Math.min(agora + SESSAO_MIN * 60000, limite);
  var corpo = paraB64Url(
    enc.encode(JSON.stringify({ n: nome, ini: ini, exp: exp })),
  );
  var ass = await crypto.subtle.sign(
    "HMAC",
    await chaveSessao(env),
    enc.encode(corpo),
  );
  return { token: corpo + "." + paraB64Url(new Uint8Array(ass)), exp: exp };
}

// Devolve { nome, ini } ou lança 401
async function exigirSessao(env, req) {
  var m = /^Bearer ([\w-]+)\.([\w-]+)$/.exec(
    req.headers.get("Authorization") || "",
  );
  if (!m)
    throw new ErroHttp(401, "Entre no painel para continuar.", {
      sessao: false,
    });
  var ok = false;
  try {
    ok = await crypto.subtle.verify(
      "HMAC",
      await chaveSessao(env),
      deB64Url(m[2]),
      enc.encode(m[1]),
    );
  } catch (e) {
    ok = false;
  }
  if (!ok)
    throw new ErroHttp(401, "A sessão não é válida. Entre de novo.", {
      sessao: false,
    });
  var p;
  try {
    p = JSON.parse(dec.decode(deB64Url(m[1])));
  } catch (e) {
    throw new ErroHttp(401, "A sessão não é válida. Entre de novo.", {
      sessao: false,
    });
  }
  if (
    !p ||
    typeof p.exp !== "number" ||
    typeof p.ini !== "number" ||
    Date.now() >= p.exp
  )
    throw new ErroHttp(401, "A sessão expirou. Entre de novo.", {
      sessao: false,
    });
  // O membro tem de continuar na lista (revogar = tirar do segredo SENHAS)
  var membros = lerMembros(env);
  var existe = Object.keys(membros).some(function (k) {
    return membros[k].nome === p.n;
  });
  if (!existe)
    throw new ErroHttp(401, "A sessão não é válida. Entre de novo.", {
      sessao: false,
    });
  return { nome: p.n, ini: p.ini };
}

/* ---------- Limite de tentativas (KV) ---------- */
async function contar(env, chave) {
  var v = await env.LIMITES.get(chave);
  return v ? parseInt(v, 10) || 0 : 0;
}
async function somarFalha(env, chave, actual) {
  await env.LIMITES.put(chave, String(actual + 1), {
    expirationTtl: BLOQUEIO_SEG,
  });
}

async function login(env, req) {
  var corpo = await lerCorpo(req);
  var nome = String(corpo.nome || "");
  var senha = String(corpo.senha || "");
  if (!nome || !senha || senha.length > 200)
    throw new ErroHttp(400, "Escolha o seu nome e escreva a senha.");

  var ip = req.headers.get("CF-Connecting-IP") || "desconhecido";
  var kIp = "f:ip:" + ip;
  var membros = lerMembros(env);
  var m = membros[norm(nome)] || null;
  var kMembro = m ? "f:m:" + norm(m.nome) : null;

  var nIp, nMembro;
  try {
    nIp = await contar(env, kIp);
    nMembro = kMembro ? await contar(env, kMembro) : 0;
  } catch (e) {
    // Sem KV não há limite de tentativas: não deixamos entrar
    throw new ErroHttp(
      503,
      "A entrada está indisponível de momento. Tente mais tarde.",
    );
  }
  if (nIp >= TENTATIVAS_IP || nMembro >= TENTATIVAS_MEMBRO)
    throw new ErroHttp(
      429,
      "Demasiadas tentativas. Tente de novo dentro de 15 minutos.",
      { retry: BLOQUEIO_SEG },
    );

  // Mesmo trabalho para nomes que não existem (tempo igual)
  var alvo = m || {
    salt: "AAAAAAAAAAAAAAAAAAAAAA==",
    hash: "",
    it: PBKDF2_PADRAO,
  };
  var calc = await derivar(senha, alvo.salt, alvo.it);
  var certo = m && iguais(calc, deB64(alvo.hash));

  if (!certo) {
    try {
      await somarFalha(env, kIp, nIp);
      if (kMembro) await somarFalha(env, kMembro, nMembro);
    } catch (e) {
      /* o pedido já falhou; nada a fazer */
    }
    throw new ErroHttp(401, "Nome ou senha incorrectos.");
  }
  if (nMembro > 0) {
    try {
      await env.LIMITES.delete(kMembro);
    } catch (e) {
      /* sem importância */
    }
  }
  var ini = Date.now();
  var s = await criarSessao(env, m.nome, ini);
  return { nome: m.nome, token: s.token, expira: s.exp };
}

/* ==========================================================
   4. GitHub
   ========================================================== */
function gh(env, caminho, opcoes) {
  opcoes = opcoes || {};
  var h = {
    Authorization: "Bearer " + env.GITHUB_TOKEN,
    Accept: "application/vnd.github+json",
    "User-Agent": "conecta-painel",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (opcoes.body) h["Content-Type"] = "application/json";
  return fetch("https://api.github.com" + caminho, {
    method: opcoes.method || "GET",
    headers: h,
    body: opcoes.body,
  });
}

// Caminho de um ficheiro da lista fechada; qualquer outro é recusado
function caminhoDe(ficheiro) {
  var f = ficheiro || "site";
  if (!Object.prototype.hasOwnProperty.call(FICHEIROS, f))
    throw new ErroHttp(400, "Ficheiro não permitido.");
  return FICHEIROS[f];
}

// ficheiro: "site" (omissão) ou "certificados".
// semFicheiro: se true, devolve null quando o ficheiro não existe (em vez de erro).
async function lerFicheiro(env, ref, ficheiro, semFicheiro) {
  var caminho = caminhoDe(ficheiro);
  var r = await gh(
    env,
    "/repos/" +
      repo(env) +
      "/contents/" +
      caminho +
      "?ref=" +
      encodeURIComponent(ref),
  );
  if (r.status === 404 && semFicheiro) return null;
  if (r.status === 404)
    throw new ErroHttp(
      502,
      ref === RAMO
        ? "Não encontrei " +
            caminho +
            " na branch content (ainda não foi criada?)."
        : "Não encontrei essa versão no histórico.",
    );
  if (!r.ok)
    throw new ErroHttp(
      502,
      "O GitHub não respondeu como esperado (" + r.status + ").",
    );
  var j = await r.json();
  var texto = dec.decode(deB64(String(j.content || "").replace(/\s/g, "")));
  var dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    throw new ErroHttp(502, "O ficheiro no GitHub não é um JSON válido.");
  }
  return { sha: j.sha, dados: dados };
}

// ficheiro: "site" (omissão) ou "certificados". shaActual null = criar o ficheiro.
async function escrever(env, limpo, shaActual, mensagem, ficheiro) {
  var caminho = caminhoDe(ficheiro);
  var texto = JSON.stringify(limpo, null, 2) + "\n";
  if (caminho === CAMINHO) {
    if (texto.length > TAMANHO_MAX)
      throw new ErroHttp(413, "Os dados são demasiado grandes.");
  } else if (enc.encode(texto).length > CERT_MAX_BYTES) {
    throw new ErroHttp(413, MSG_CERT_GRANDE);
  }
  var pedido = {
    message: mensagem,
    content: paraB64(enc.encode(texto)),
    branch: RAMO,
  };
  if (shaActual) pedido.sha = shaActual;
  var r = await gh(env, "/repos/" + repo(env) + "/contents/" + caminho, {
    method: "PUT",
    body: JSON.stringify(pedido),
  });
  if (r.status === 409 || r.status === 422)
    throw new ErroHttp(409, "Alguém alterou os dados entretanto.", {
      conflito: true,
    });
  if (!r.ok)
    throw new ErroHttp(
      502,
      "Não foi possível gravar no GitHub (" + r.status + ").",
    );
  var j = await r.json();
  return { sha: j.content && j.content.sha, commit: j.commit && j.commit.sha };
}

async function dispararPublicacao(env) {
  try {
    var wf = String(env.WORKFLOW || "pages.yml");
    if (!/^[\w.-]+\.ya?ml$/.test(wf)) return false;
    var r = await gh(
      env,
      "/repos/" + repo(env) + "/actions/workflows/" + wf + "/dispatches",
      { method: "POST", body: JSON.stringify({ ref: REF_WORKFLOW }) },
    );
    return r.status === 204;
  } catch (e) {
    return false;
  }
}

function seccoesAlteradas(antes, depois) {
  var chaves = {};
  Object.keys(antes || {}).forEach(function (k) {
    chaves[k] = 1;
  });
  Object.keys(depois || {}).forEach(function (k) {
    chaves[k] = 1;
  });
  return Object.keys(chaves).filter(function (k) {
    return (
      /^\w+$/.test(k) &&
      JSON.stringify((antes || {})[k]) !== JSON.stringify((depois || {})[k])
    );
  });
}

/* ==========================================================
   5. Validação (porta de Admin.Nucleo.validar e limparParaGravar
      de js/admin.js; manter as duas em paralelo)
   ========================================================== */
var RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
var RE_WA = /^244\d{9}$/;

function numOuNull(v) {
  if (v === undefined || v === null || v === "") return null;
  var n = Number(v);
  return isNaN(n) ? null : n;
}

function ehObj(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

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
    "Workshop " + (w.numero !== undefined && w.numero !== "" ? w.numero : w.id)
  );
}

function idYoutube(url) {
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
}

// Forma geral: tipos certos e textos de tamanho razoável
function validarEstrutura(d) {
  if (!ehObj(d)) return ["O conteúdo enviado não é um objecto."];
  var e = [];
  if (
    !Array.isArray(d.workshops) ||
    d.workshops.length > 200 ||
    !d.workshops.every(ehObj)
  )
    e.push("A lista de workshops é inválida.");
  else
    d.workshops.forEach(function (w) {
      if (
        w.aprenderao !== undefined &&
        (!Array.isArray(w.aprenderao) || w.aprenderao.length > 50)
      )
        e.push("Os tópicos 'O que vai aprender' são inválidos.");
    });
  var pg = d.pagamento;
  if (
    !ehObj(pg) ||
    !Array.isArray(pg.metodos) ||
    pg.metodos.length > 20 ||
    !pg.metodos.every(function (m) {
      return (
        ehObj(m) &&
        (m.campos === undefined ||
          (Array.isArray(m.campos) &&
            m.campos.length <= 30 &&
            m.campos.every(ehObj)))
      );
    })
  )
    e.push("O bloco de pagamento é inválido.");
  ["campanha", "contactos", "estatisticas"].forEach(function (k) {
    if (!ehObj(d[k])) e.push("O bloco '" + k + "' é inválido.");
  });
  if (
    d.videosDestaque !== undefined &&
    (!Array.isArray(d.videosDestaque) ||
      d.videosDestaque.length > 20 ||
      !d.videosDestaque.every(function (x) {
        return typeof x === "string";
      }))
  )
    e.push("Os vídeos em destaque são inválidos.");
  var longo = false;
  (function andar(v, n) {
    if (longo || n > 8) {
      longo = longo || n > 8;
      return;
    }
    if (typeof v === "string") {
      if (v.length > 20000) longo = true;
    } else if (Array.isArray(v))
      v.forEach(function (x) {
        andar(x, n + 1);
      });
    else if (ehObj(v))
      Object.keys(v).forEach(function (k) {
        andar(v[k], n + 1);
      });
  })(d, 0);
  if (longo) e.push("Há textos demasiado longos ou dados demasiado aninhados.");
  return e;
}

// Devolve { erros: [{path,msg}], avisos: [{path,msg}] } (igual ao painel)
function validar(d) {
  var erros = [];
  var avisos = [];
  function e(path, msg) {
    erros.push({ path: path, msg: msg });
  }
  function a(path, msg) {
    avisos.push({ path: path, msg: msg });
  }
  var ws = d.workshops || [];

  var vistos = {};
  ws.forEach(function (w, i) {
    var p = "workshops." + i + ".";
    var r = rotuloWs(w) + ": ";
    if (!w.id) e(p + "id", r + "falta o identificador.");
    else if (vistos[w.id])
      e(p + "id", r + "identificador repetido (" + w.id + ").");
    vistos[w.id] = true;
    if (!String(w.tema || "").trim()) e(p + "tema", r + "falta o tema.");
    if (!String(w.orador || "").trim()) e(p + "orador", r + "falta o orador.");
    if (!w.data) e(p + "data", r + "falta a data.");
    else if (!dataValida(w.data)) e(p + "data", r + "data inválida.");
    if (w.horaInicio && w.horaFim && w.horaFim <= w.horaInicio)
      e(
        p + "horaFim",
        r + "a hora de fim tem de ser depois da hora de início.",
      );
    if (w.horaFim && !w.horaInicio)
      e(p + "horaInicio", r + "indique também a hora de início.");
    if (w.video && !idYoutube(w.video))
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
    if (m !== null && h !== null && m + h !== (numOuNull(w.participantes) || 0))
      a(p + "mulheres", r + "mulheres + homens não é igual a participantes.");
    if (w.imagem && !/^(https?:\/\/|assets\/)/i.test(w.imagem))
      e(
        p + "imagem",
        r + "a imagem tem de ser um link (https://…) ou um caminho em assets/.",
      );
  });

  if (
    !ws.some(function (w) {
      return w.id === d.workshopActivo;
    })
  )
    e("workshopActivo", "O workshop activo não existe na lista.");

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
        else if (!idYoutube(w.video))
          e(
            "videosDestaque",
            "Vídeo em destaque: o " + rotuloWs(w) + " não tem um vídeo válido.",
          );
      });
      if (vd.length !== new Set(vd).size)
        e("videosDestaque", "Há vídeos repetidos nos destaques.");
    }
  }

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
      "Contactos: falta o número como deve aparecer.",
    );
  if (!String(ct.local || "").trim())
    e("contactos.local", "Contactos: falta a localização.");

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
}

// Lista branca: strong, em, br, a (href http/https/mailto). O resto é
// retirado (o texto fica; script, style e afins desaparecem por completo).
function sanitizarHtml(html) {
  var s = String(html || "");
  s = s.replace(/<!--[\s\S]*?(-->|$)/g, "");
  [
    "script",
    "style",
    "iframe",
    "object",
    "embed",
    "noscript",
    "template",
  ].forEach(function (t) {
    s = s.replace(
      new RegExp("<" + t + "\\b[\\s\\S]*?<\\/" + t + "\\s*>", "gi"),
      "",
    );
    s = s.replace(new RegExp("<" + t + "\\b[\\s\\S]*$", "gi"), "");
  });
  function texto(t) {
    return t.replace(/</g, "&lt;");
  }
  function escAttr(t) {
    return t
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }
  var saida = "";
  var ultimo = 0;
  var pilha = [];
  var re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/g;
  var m;
  while ((m = re.exec(s))) {
    saida += texto(s.slice(ultimo, m.index));
    ultimo = re.lastIndex;
    var nome = m[2].toLowerCase();
    var fecha = m[1] === "/";
    if (nome === "b") nome = "strong";
    if (nome === "i") nome = "em";
    if (nome === "br") {
      if (!fecha) saida += "<br>";
      continue;
    }
    if (nome !== "strong" && nome !== "em" && nome !== "a") continue;
    if (!fecha) {
      if (nome === "a") {
        var hm = /(?:^|\s)href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(
          m[3],
        );
        var href = hm
          ? (hm[1] !== undefined
              ? hm[1]
              : hm[2] !== undefined
                ? hm[2]
                : hm[3]
            ).trim()
          : "";
        if (!/^(https?:\/\/|mailto:)/i.test(href)) {
          pilha.push({ nome: "a", manter: false });
          continue;
        }
        saida +=
          '<a href="' +
          escAttr(href) +
          '"' +
          (/^https?:/i.test(href)
            ? ' target="_blank" rel="noopener noreferrer"'
            : "") +
          ">";
        pilha.push({ nome: "a", manter: true });
      } else {
        saida += "<" + nome + ">";
        pilha.push({ nome: nome, manter: true });
      }
    } else {
      var i = -1;
      for (var k = pilha.length - 1; k >= 0; k--)
        if (pilha[k].nome === nome) {
          i = k;
          break;
        }
      if (i < 0) continue;
      while (pilha.length > i) {
        var p = pilha.pop();
        if (p.manter) saida += "</" + p.nome + ">";
      }
    }
  }
  saida += texto(s.slice(ultimo));
  while (pilha.length) {
    var q = pilha.pop();
    if (q.manter) saida += "</" + q.nome + ">";
  }
  return saida;
}

function limparParaGravar(d) {
  var o = JSON.parse(JSON.stringify(d));
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
      w.descricao = sanitizarHtml(w.descricao.trim());
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
  if (pg.valorMinimo !== undefined) pg.valorMinimo = numOuNull(pg.valorMinimo);
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
}

// Estrutura + regras + limpeza. Devolve os dados prontos a gravar ou lança 422.
function prepararParaGravar(dados) {
  var es = validarEstrutura(dados);
  if (es.length)
    throw new ErroHttp(422, "Os dados não são válidos.", {
      erros: es.map(function (m) {
        return { path: "", msg: m };
      }),
    });
  var limpo = limparParaGravar(dados);
  var r = validar(limpo);
  if (r.erros.length)
    throw new ErroHttp(422, "Os dados não são válidos.", { erros: r.erros });
  return limpo;
}

/* ==========================================================
   6. Rotas autenticadas
   ========================================================== */
async function rotaLerSite(env) {
  var f = await lerFicheiro(env, RAMO);
  return { dados: f.dados, sha: f.sha };
}

async function rotaGravarSite(env, sessao, req) {
  var corpo = await lerCorpo(req);
  if (typeof corpo.sha !== "string" || !/^[0-9a-f]{40}$/.test(corpo.sha))
    throw new ErroHttp(400, "Falta a versão de partida (sha).");
  var limpo = prepararParaGravar(corpo.dados);
  var actual = await lerFicheiro(env, RAMO);
  if (actual.sha !== corpo.sha)
    throw new ErroHttp(
      409,
      "Alguém alterou os dados entretanto. Recarregue e reveja.",
      {
        conflito: true,
        sha: actual.sha,
      },
    );
  var seccoes = seccoesAlteradas(actual.dados, limpo);
  if (!seccoes.length)
    return { ok: true, semAlteracoes: true, sha: actual.sha };
  var msg = "Painel: " + sessao.nome + " actualizou " + seccoes.join(", ");
  var g = await escrever(env, limpo, actual.sha, msg);
  var wf = await dispararPublicacao(env);
  return {
    ok: true,
    sha: g.sha,
    commit: g.commit,
    seccoes: seccoes,
    publicacaoIniciada: wf,
    aviso: wf
      ? ""
      : "Os dados foram gravados, mas a publicação automática não arrancou.",
  };
}

async function rotaHistorico(env, ficheiro) {
  var r = await gh(
    env,
    "/repos/" +
      repo(env) +
      "/commits?path=" +
      encodeURIComponent(caminhoDe(ficheiro)) +
      "&sha=" +
      encodeURIComponent(RAMO) +
      "&per_page=20",
  );
  if (!r.ok)
    throw new ErroHttp(
      502,
      "Não foi possível ler o histórico (" + r.status + ").",
    );
  var lista = await r.json();
  return {
    itens: (Array.isArray(lista) ? lista : []).map(function (c) {
      var linha = String((c.commit && c.commit.message) || "")
        .split("\n")[0]
        .slice(0, 200);
      var q = /^Painel: (.+?) (?:actualizou|restaurou)\b/.exec(linha);
      return {
        sha: c.sha,
        data: c.commit && c.commit.committer && c.commit.committer.date,
        mensagem: linha,
        autor: q
          ? q[1]
          : (c.commit && c.commit.author && c.commit.author.name) || "",
      };
    }),
  };
}

async function rotaRestaurar(env, sessao, req, ficheiro) {
  if (ficheiro === "certificados")
    return rotaRestaurarCertificados(env, sessao, req);
  var corpo = await lerCorpo(req);
  if (typeof corpo.commit !== "string" || !/^[0-9a-f]{40}$/.test(corpo.commit))
    throw new ErroHttp(400, "Versão inválida.");
  var antiga = await lerFicheiro(env, corpo.commit);
  var limpo = prepararParaGravar(antiga.dados);
  var actual = await lerFicheiro(env, RAMO);
  if (!seccoesAlteradas(actual.dados, limpo).length)
    return {
      ok: true,
      semAlteracoes: true,
      sha: actual.sha,
      dados: actual.dados,
    };
  var msg =
    "Painel: " +
    sessao.nome +
    " restaurou a versão " +
    corpo.commit.slice(0, 7);
  var g = await escrever(env, limpo, actual.sha, msg);
  var wf = await dispararPublicacao(env);
  return {
    ok: true,
    sha: g.sha,
    commit: g.commit,
    dados: limpo,
    publicacaoIniciada: wf,
    aviso: wf
      ? ""
      : "Os dados foram restaurados, mas a publicação automática não arrancou.",
  };
}

/* ==========================================================
   6b. Certificados (data/certificados-painel.json e Cloudinary)
   A validação das entradas é igual à de js/admin.js
   (validarEntradaCert); manter as duas em paralelo.
   ========================================================== */
var MSG_CERT_GRANDE =
  "O ficheiro de certificados ficaria com mais de 900 KB, perto do limite da API de conteúdos do GitHub." +
  " Fale com o responsável técnico para dividir os dados por ano antes de acrescentar mais.";

var CERT_CAMPOS_PART = [
  "codigo",
  "nome",
  "workshop",
  "orador",
  "rotulo_orador",
  "edicao",
  "data",
  "duracao",
  "plataforma",
  "entidade_emissora",
  "kectil",
  "atualizado",
];
var CERT_CAMPOS_FUNCAO = [
  "codigo",
  "nome",
  "funcao",
  "evento",
  "edicao",
  "data",
  "entidade_emissora",
  "kectil",
  "atualizado",
];
var CERT_MAX_TEXTO = {
  codigo: 30,
  nome: 120,
  workshop: 300,
  evento: 300,
  orador: 120,
  funcao: 60,
  rotulo_orador: 30,
  edicao: 120,
  plataforma: 40,
  duracao: 20,
  entidade_emissora: 80,
  data: 10,
  atualizado: 10,
};

function dataDMAValida(s) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || "");
  return !!m && dataValida(m[3] + "-" + m[2] + "-" + m[1]);
}

// Data de hoje em Angola (UTC+1), AAAA-MM-DD
function hojeAngola() {
  return new Date(Date.now() + 3600000).toISOString().slice(0, 10);
}

// Valida e limpa uma entrada. Devolve { entrada, erros:[texto], avisos:[texto] }
function validarEntradaCert(bruta) {
  var erros = [];
  var avisos = [];
  if (!ehObj(bruta))
    return { entrada: null, erros: ["a entrada não é um objecto."], avisos };
  var codigo =
    typeof bruta.codigo === "string" ? bruta.codigo.trim().toUpperCase() : "";
  if (!RE_CODIGO_CERT.test(codigo))
    return {
      entrada: null,
      erros: ["código em falta ou inválido."],
      avisos: avisos,
    };
  var part = codigo.indexOf("CON-WS") === 0;
  var permitidos = part ? CERT_CAMPOS_PART : CERT_CAMPOS_FUNCAO;
  var obrig = part
    ? ["codigo", "nome", "edicao", "data", "workshop", "orador"]
    : ["codigo", "nome", "edicao", "data", "funcao", "evento"];
  var e = {};
  Object.keys(bruta).forEach(function (k) {
    if (permitidos.indexOf(k) === -1) {
      erros.push("campo desconhecido '" + k + "'.");
      return;
    }
    var v = bruta[k];
    if (k === "kectil") {
      if (typeof v !== "boolean")
        erros.push("'kectil' tem de ser true ou false.");
      else e.kectil = v;
      return;
    }
    if (typeof v !== "string") {
      erros.push("'" + k + "' tem de ser texto.");
      return;
    }
    v = v.trim();
    if (k === "codigo") v = codigo;
    if (!v) {
      erros.push("'" + k + "' está vazio.");
      return;
    }
    if (/[<>\u0000-\u001f\u007f]/.test(v)) {
      erros.push(
        "'" + k + "' tem caracteres não permitidos (< > ou de controlo).",
      );
      return;
    }
    if (v.length > CERT_MAX_TEXTO[k]) {
      erros.push(
        "'" + k + "' é demasiado longo (máximo " + CERT_MAX_TEXTO[k] + ").",
      );
      return;
    }
    e[k] = v;
  });
  obrig.forEach(function (k) {
    if (bruta[k] === undefined) erros.push("falta o campo '" + k + "'.");
  });
  if (e.data && !dataDMAValida(e.data))
    erros.push("data inválida (use dd/mm/aaaa).");
  if (e.duracao && !/^[0-9]{1,2}h([0-9]{2})?$/.test(e.duracao))
    erros.push("duração inválida (por exemplo 1h50).");
  if (e.atualizado && !dataValida(e.atualizado))
    erros.push("'atualizado' inválido (use AAAA-MM-DD).");
  if (e.data && dataDMAValida(e.data)) {
    var anoMes = /-(\d{4})-(\d{2})-\d{3}$/.exec(codigo);
    var dm = e.data.split("/");
    if (anoMes && (anoMes[1] !== dm[2] || anoMes[2] !== dm[1]))
      avisos.push(
        "o mês e o ano do código (" +
          anoMes[1] +
          "-" +
          anoMes[2] +
          ") não coincidem com a data.",
      );
  }
  // Ordem fixa dos campos
  var ordenada = {};
  permitidos.forEach(function (k) {
    if (e[k] !== undefined) ordenada[k] = e[k];
  });
  return { entrada: erros.length ? null : ordenada, erros, avisos };
}

// Lista de entradas -> { entradas, erros:[{path,msg}], avisos:[{path,msg}] }
function validarListaCert(lista) {
  var erros = [];
  var avisos = [];
  var entradas = [];
  var vistos = {};
  lista.forEach(function (b, i) {
    var r = validarEntradaCert(b);
    var rot =
      (ehObj(b) && typeof b.codigo === "string" && b.codigo.trim()
        ? b.codigo.trim().toUpperCase()
        : "Entrada " + (i + 1)) + ": ";
    r.erros.forEach(function (m) {
      erros.push({ path: "certificados." + i, msg: rot + m });
    });
    r.avisos.forEach(function (m) {
      avisos.push({ path: "certificados." + i, msg: rot + m });
    });
    if (r.entrada) {
      if (vistos[r.entrada.codigo])
        erros.push({
          path: "certificados." + i,
          msg: rot + "código repetido neste envio.",
        });
      vistos[r.entrada.codigo] = true;
      entradas.push(r.entrada);
    }
  });
  return { entradas, erros, avisos };
}

function semActualizado(o) {
  var c = {};
  Object.keys(o || {}).forEach(function (k) {
    if (k !== "atualizado") c[k] = o[k];
  });
  return JSON.stringify(c);
}

// Junta por código (nunca apaga). Devolve { lista, novos, corrigidos, inalterados }
function juntarCertificados(actuais, entradas, hoje) {
  var lista = actuais.slice();
  var indice = {};
  lista.forEach(function (c, i) {
    if (ehObj(c) && typeof c.codigo === "string")
      indice[c.codigo.toUpperCase()] = i;
  });
  var novos = 0;
  var corrigidos = 0;
  var inalterados = 0;
  entradas.forEach(function (e) {
    var i = indice[e.codigo];
    if (i === undefined) {
      // Entrada nova no ficheiro do painel. Se traz "atualizado", é a
      // correcção de um certificado que só existia nos JSON antigos.
      if (e.atualizado) corrigidos++;
      else novos++;
      indice[e.codigo] = lista.length;
      lista.push(e);
    } else if (semActualizado(lista[i]) === semActualizado(e)) {
      inalterados++;
    } else {
      var n = JSON.parse(JSON.stringify(e));
      if (!n.atualizado) n.atualizado = hoje;
      lista[i] = n;
      corrigidos++;
    }
  });
  return {
    lista: lista,
    novos: novos,
    corrigidos: corrigidos,
    inalterados: inalterados,
  };
}

function listaDoFicheiro(dados) {
  if (Array.isArray(dados)) return dados;
  if (ehObj(dados) && Array.isArray(dados.certificados))
    return dados.certificados;
  throw new ErroHttp(
    502,
    "O ficheiro de certificados no GitHub não tem o formato esperado.",
  );
}

async function rotaLerCertificados(env) {
  var f = await lerFicheiro(env, RAMO, "certificados", true);
  if (!f) return { dados: { versao: 1, certificados: [] }, sha: null };
  return {
    dados: { versao: 1, certificados: listaDoFicheiro(f.dados) },
    sha: f.sha,
  };
}

async function rotaGravarCertificados(env, sessao, req) {
  var corpo = await lerCorpo(req);
  if (!Array.isArray(corpo.certificados))
    throw new ErroHttp(400, "Envie { certificados: [...] }.");
  if (!corpo.certificados.length)
    throw new ErroHttp(400, "Não há certificados para gravar.");
  if (corpo.certificados.length > CERT_MAX_ENTRADAS)
    throw new ErroHttp(
      413,
      "No máximo " +
        CERT_MAX_ENTRADAS +
        " certificados de cada vez. Divida o ficheiro.",
    );
  var v = validarListaCert(corpo.certificados);
  if (v.erros.length)
    throw new ErroHttp(422, "Os certificados não são válidos.", {
      erros: v.erros,
      avisos: v.avisos,
    });

  for (var tentativa = 1; tentativa <= 2; tentativa++) {
    var actual = await lerFicheiro(env, RAMO, "certificados", true);
    var lista = actual ? listaDoFicheiro(actual.dados) : [];
    var j = juntarCertificados(lista, v.entradas, hojeAngola());
    var resumo = {
      novos: j.novos,
      corrigidos: j.corrigidos,
      inalterados: j.inalterados,
      total: j.lista.length,
    };
    if (v.avisos.length)
      resumo.avisos = v.avisos.map(function (a) {
        return a.msg;
      });
    if (!j.novos && !j.corrigidos) {
      resumo.ok = true;
      resumo.semAlteracoes = true;
      return resumo;
    }
    var dados = { versao: 1, certificados: j.lista };
    var bytes = enc.encode(JSON.stringify(dados, null, 2) + "\n").length;
    if (bytes > CERT_MAX_BYTES) throw new ErroHttp(413, MSG_CERT_GRANDE);
    var msg =
      "Painel: " +
      sessao.nome +
      " actualizou certificados (" +
      j.novos +
      " novos, " +
      j.corrigidos +
      " corrigidos)";
    try {
      await escrever(
        env,
        dados,
        actual ? actual.sha : null,
        msg,
        "certificados",
      );
    } catch (e) {
      // Conflito de versão: lê de novo, junta e tenta mais uma vez
      if (e instanceof ErroHttp && e.status === 409 && tentativa === 1)
        continue;
      throw e;
    }
    var wf = await dispararPublicacao(env);
    resumo.ok = true;
    resumo.publicacaoIniciada = wf;
    var avisoTam =
      bytes > CERT_AVISO_BYTES
        ? "O ficheiro de certificados já tem " +
          Math.round(bytes / 1024) +
          " KB (limite prático de 900 KB)."
        : "";
    var avisoWf = wf
      ? ""
      : "Os certificados foram gravados, mas a publicação automática não arrancou.";
    var aviso = [avisoWf, avisoTam].filter(Boolean).join(" ");
    if (aviso) resumo.aviso = aviso;
    return resumo;
  }
}

async function rotaRestaurarCertificados(env, sessao, req) {
  var corpo = await lerCorpo(req);
  if (typeof corpo.commit !== "string" || !/^[0-9a-f]{40}$/.test(corpo.commit))
    throw new ErroHttp(400, "Versão inválida.");
  var antiga = await lerFicheiro(env, corpo.commit, "certificados");
  var v = validarListaCert(listaDoFicheiro(antiga.dados));
  if (v.erros.length)
    throw new ErroHttp(422, "Essa versão dos certificados não é válida.", {
      erros: v.erros,
    });
  var dados = { versao: 1, certificados: v.entradas };
  var actual = await lerFicheiro(env, RAMO, "certificados", true);
  if (actual && JSON.stringify(actual.dados) === JSON.stringify(dados))
    return { ok: true, semAlteracoes: true, sha: actual.sha };
  var msg =
    "Painel: " +
    sessao.nome +
    " restaurou a versão " +
    corpo.commit.slice(0, 7) +
    " dos certificados";
  var g = await escrever(
    env,
    dados,
    actual ? actual.sha : null,
    msg,
    "certificados",
  );
  var wf = await dispararPublicacao(env);
  return {
    ok: true,
    sha: g.sha,
    commit: g.commit,
    total: dados.certificados.length,
    publicacaoIniciada: wf,
    aviso: wf
      ? ""
      : "Os certificados foram restaurados, mas a publicação automática não arrancou.",
  };
}

/* ---------- Cloudinary ---------- */
function cloudinaryConfig(env) {
  var cloud = String(env.CLOUDINARY_CLOUD || "").trim();
  var chave = String(env.CLOUDINARY_API_KEY || "").trim();
  var segredo = String(env.CLOUDINARY_API_SECRET || "").trim();
  if (!cloud || !chave || !segredo || !/^[a-z0-9_-]+$/i.test(cloud))
    throw new ErroHttp(500, "Cloudinary não configurado no Worker.");
  return { cloud: cloud, chave: chave, segredo: segredo };
}

function paraHex(buf) {
  var u = new Uint8Array(buf);
  var s = "";
  for (var i = 0; i < u.length; i++)
    s += (u[i] < 16 ? "0" : "") + u[i].toString(16);
  return s;
}

// Parâmetros assinados (iguais aos de worker/enviar-certificados.mjs)
function paramsCert(codigo, tipo, timestamp) {
  var p = {
    allowed_formats: tipo,
    invalidate: "true",
    overwrite: "true",
    public_id: CERT_PASTA + "/" + tipo + "/" + codigo,
    timestamp: String(timestamp),
  };
  if (CERT_USAR_ASSET_FOLDER) p.asset_folder = CERT_PASTA + "/" + tipo;
  return p;
}

// SHA-1 hexadecimal de "chave=valor&..." (ordenado) seguido do segredo
async function assinarCloudinary(params, segredo) {
  var cadeia = Object.keys(params)
    .sort()
    .map(function (k) {
      return k + "=" + params[k];
    })
    .join("&");
  var h = await crypto.subtle.digest("SHA-1", enc.encode(cadeia + segredo));
  return paraHex(h);
}

async function rotaAssinatura(env, sessao, req) {
  var cfg = cloudinaryConfig(env);
  var corpo = await lerCorpo(req);
  var itens = corpo.itens;
  if (!Array.isArray(itens) || !itens.length)
    throw new ErroHttp(400, "Indique os ficheiros a assinar.");
  if (itens.length > CERT_MAX_ITENS_ASSINATURA)
    throw new ErroHttp(
      400,
      "No máximo " + CERT_MAX_ITENS_ASSINATURA + " ficheiros por pedido.",
    );
  var limpos = itens.map(function (it) {
    var codigo =
      ehObj(it) && typeof it.codigo === "string"
        ? it.codigo.trim().toUpperCase()
        : "";
    var tipo = ehObj(it) ? it.tipo : "";
    if (!RE_CODIGO_CERT.test(codigo))
      throw new ErroHttp(400, "Código de certificado inválido.");
    if (tipo !== "pdf" && tipo !== "png")
      throw new ErroHttp(400, "Tipo de ficheiro inválido (pdf ou png).");
    return { codigo: codigo, tipo: tipo };
  });
  var ts = Math.floor(Date.now() / 1000);
  var saida = [];
  for (var i = 0; i < limpos.length; i++) {
    var p = paramsCert(limpos[i].codigo, limpos[i].tipo, ts);
    saida.push({
      codigo: limpos[i].codigo,
      tipo: limpos[i].tipo,
      params: p,
      assinatura: await assinarCloudinary(p, cfg.segredo),
    });
  }
  // Auditoria (best-effort): nunca bloqueia o pedido
  try {
    await env.LIMITES.put(
      "auditoria:cert:" +
        new Date().toISOString() +
        ":" +
        Math.random().toString(36).slice(2, 8),
      JSON.stringify({
        nome: sessao.nome,
        itens: limpos.map(function (x) {
          return x.codigo + ":" + x.tipo;
        }),
        em: new Date().toISOString(),
      }),
      { expirationTtl: CERT_AUDITORIA_SEG },
    );
  } catch (e) {
    /* sem auditoria; o envio continua */
  }
  return { cloud: cfg.cloud, apiKey: cfg.chave, itens: saida };
}

async function rotaFicheirosCert(env) {
  var cfg = cloudinaryConfig(env);
  var auth = "Basic " + btoa(cfg.chave + ":" + cfg.segredo);
  var saida = { pdf: [], png: [] };
  var incompleto = false;
  var tipos = ["pdf", "png"];
  for (var t = 0; t < tipos.length; t++) {
    var tipo = tipos[t];
    var cursor = "";
    var vistos = {};
    for (var pag = 0; pag < CERT_MAX_PAGINAS; pag++) {
      var url =
        "https://api.cloudinary.com/v1_1/" +
        cfg.cloud +
        "/resources/image/upload?prefix=" +
        encodeURIComponent(CERT_PASTA + "/" + tipo + "/") +
        "&max_results=500" +
        (cursor ? "&next_cursor=" + encodeURIComponent(cursor) : "");
      var r = await fetch(url, { headers: { Authorization: auth } });
      if (!r.ok)
        throw new ErroHttp(
          502,
          "O Cloudinary não respondeu como esperado (" + r.status + ").",
        );
      var j = await r.json();
      (j.resources || []).forEach(function (x) {
        var cod = String(x.public_id || "")
          .split("/")
          .pop();
        if (RE_CODIGO_CERT.test(cod) && !vistos[cod]) {
          vistos[cod] = true;
          saida[tipo].push(cod);
        }
      });
      cursor = j.next_cursor || "";
      if (!cursor) break;
    }
    if (cursor) incompleto = true;
    saida[tipo].sort();
  }
  if (incompleto) saida.incompleto = true;
  return saida;
}

/* ==========================================================
   7. Entrada
   ========================================================== */
async function tratar(req, env) {
  var url = new URL(req.url);
  var rota = url.pathname.replace(/\/+$/, "") || "/";
  var origem = req.headers.get("Origin");
  var permitidas = origensPermitidas(env);

  if (origem && permitidas.indexOf(origem) === -1)
    return responder(env, null, 403, { erro: "Origem não permitida." });
  if (req.method === "OPTIONS") return responder(env, origem, 204);

  var resp = function (status, corpo, extra) {
    return responder(env, origem, status, corpo, extra);
  };
  var metodo = req.method;

  if (rota === "/" && metodo === "GET")
    return resp(200, { ok: true, servico: "conecta-painel" });

  if (rota === "/login" && metodo === "POST")
    return resp(200, await login(env, req));
  if (rota === "/logout" && metodo === "POST") return resp(204);

  var caminhos = {
    "/site": ["GET", "PUT"],
    "/historico": ["GET"],
    "/restaurar": ["POST"],
    "/certificados": ["GET", "PUT"],
    "/certificados/assinatura": ["POST"],
    "/certificados/ficheiros": ["GET"],
  };
  if (!caminhos[rota]) return resp(404, { erro: "Não encontrado." });
  if (caminhos[rota].indexOf(metodo) === -1)
    return resp(405, { erro: "Método não permitido." });

  var sessao = await exigirSessao(env, req);
  // Histórico e restaurar: ?ficheiro=site (omissão) ou certificados
  var ficheiro = url.searchParams.get("ficheiro") || "site";
  if (
    (rota === "/historico" || rota === "/restaurar") &&
    !Object.prototype.hasOwnProperty.call(FICHEIROS, ficheiro)
  )
    throw new ErroHttp(400, "Ficheiro não permitido.");
  var corpo;
  if (rota === "/site" && metodo === "GET") corpo = await rotaLerSite(env);
  else if (rota === "/site") corpo = await rotaGravarSite(env, sessao, req);
  else if (rota === "/historico") corpo = await rotaHistorico(env, ficheiro);
  else if (rota === "/restaurar")
    corpo = await rotaRestaurar(env, sessao, req, ficheiro);
  else if (rota === "/certificados" && metodo === "GET")
    corpo = await rotaLerCertificados(env);
  else if (rota === "/certificados")
    corpo = await rotaGravarCertificados(env, sessao, req);
  else if (rota === "/certificados/assinatura")
    corpo = await rotaAssinatura(env, sessao, req);
  else corpo = await rotaFicheirosCert(env);

  // Sessão deslizante: cada pedido renova os 30 minutos (até ao máximo absoluto)
  var nova = await criarSessao(env, sessao.nome, sessao.ini);
  return resp(200, corpo, {
    "X-Sessao": nova.token,
    "X-Sessao-Expira": String(nova.exp),
  });
}

export default {
  async fetch(req, env) {
    var origem = req.headers.get("Origin");
    try {
      return await tratar(req, env);
    } catch (e) {
      if (e instanceof ErroHttp) {
        var extra = e.extra || {};
        var corpo = { erro: e.msg };
        Object.keys(extra).forEach(function (k) {
          if (k !== "retry") corpo[k] = extra[k];
        });
        return responder(
          env,
          origem,
          e.status,
          corpo,
          extra.retry ? { "Retry-After": String(extra.retry) } : null,
        );
      }
      console.error("Erro interno:", e && e.message);
      return responder(env, origem, 500, {
        erro: "Erro interno. Tente de novo.",
      });
    }
  },
};
