/* ============================================================
   worker/enviar-certificados.mjs — corre no SEU computador (Node 18 ou superior).
   Envia para o Cloudinary os certificados exportados do Canva (PDF e PNG).
   Não vai para o site publicado e não guarda nada em ficheiros.

   Uso (PowerShell, dentro da pasta do projecto):
     node worker/enviar-certificados.mjs --pdf "C:\caminho\pdf" --png "C:\caminho\png" --dados assets/certificados-ws7.json [--dados outro.json] [--enviar]

   Por omissão é uma SIMULAÇÃO: verifica tudo e não envia nada.
   Só envia com --enviar.

   Credenciais só por variáveis de ambiente (nunca em ficheiros):
     CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET e, opcional, CLOUDINARY_CLOUD_NAME
   Cada ficheiro fica com o public ID certificados/pdf/CÓDIGO ou
   certificados/png/CÓDIGO (substitui o que lá estiver: correcções).
   ============================================================ */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// ---------- Configuração ----------
export const CLOUD_PADRAO = "y1pydrcc";
export const PASTA = "certificados";
// Se o Cloudinary rejeitar o parâmetro asset_folder, mude para false.
export const USAR_ASSET_FOLDER = true;
export const TAMANHO_MAX = 10 * 1024 * 1024; // 10 MB por ficheiro
const EM_PARALELO = 3;
const TENTATIVAS = 3;
const ESPERA_MS = 60000; // tempo máximo de cada envio
const PAUSA_BASE_MS = 2000; // espera entre tentativas (cresce)

// Formato do código (igual ao do site e do Worker)
export const RE_CODIGO =
  /^CON-(WS|GC|MOD)[0-9]{1,2}-[0-9]{4}-[0-9]{2}-[0-9]{3}$/;
// Procura códigos dentro de um nome de ficheiro (sem distinguir maiúsculas)
const RE_CODIGO_NOME =
  /(?<![A-Za-z0-9])CON-(?:WS|GC|MOD)[0-9]{1,2}-[0-9]{4}-[0-9]{2}-[0-9]{3}(?![0-9])/gi;
const IGNORAR = ["desktop.ini", "thumbs.db", ".ds_store"];

const CABECALHO = {
  pdf: Buffer.from("%PDF-", "latin1"),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
};

/* ==========================================================
   Funções puras (exportadas para os testes)
   ========================================================== */

// Devolve { codigo, exacto } ou { erro }
export function codigoDoNome(nomeFicheiro) {
  const base = path.parse(nomeFicheiro).name;
  const achados = base.match(RE_CODIGO_NOME) || [];
  if (achados.length === 0)
    return { erro: "o nome não contém um código de certificado." };
  const unicos = [...new Set(achados.map((c) => c.toUpperCase()))];
  if (achados.length > 1)
    return {
      erro: "o nome contém mais do que um código (" + unicos.join(", ") + ").",
    };
  const codigo = unicos[0];
  return { codigo, exacto: base === codigo };
}

export function cabecalhoValido(buf, tipo) {
  const esperado = CABECALHO[tipo];
  return (
    Buffer.isBuffer(buf) &&
    buf.length >= esperado.length &&
    buf.subarray(0, esperado.length).equals(esperado)
  );
}

// Parâmetros assinados de um envio (sem api_key, file nem signature)
export function parametros(codigo, tipo, timestamp) {
  const p = {
    allowed_formats: tipo,
    invalidate: "true",
    overwrite: "true",
    public_id: PASTA + "/" + tipo + "/" + codigo,
    timestamp: String(timestamp),
  };
  if (USAR_ASSET_FOLDER) p.asset_folder = PASTA + "/" + tipo;
  return p;
}

// Cadeia a assinar: chave=valor ordenados alfabeticamente, unidos por "&"
export function cadeiaAssinatura(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== "")
    .sort()
    .map((k) => k + "=" + params[k])
    .join("&");
}

// SHA-1 hexadecimal da cadeia seguida do segredo (sem separador)
export function assinar(params, segredo) {
  return createHash("sha1")
    .update(cadeiaAssinatura(params) + segredo, "utf8")
    .digest("hex");
}

export function urlPublico(cloud, codigo, tipo) {
  return (
    "https://res.cloudinary.com/" +
    cloud +
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

export function lerArgumentos(argv) {
  const op = { pdf: null, png: null, dados: [], enviar: false, extra: false };
  const erros = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--enviar") op.enviar = true;
    else if (a === "--incluir-extra") op.extra = true;
    else if (a === "--ajuda" || a === "-h" || a === "--help") op.ajuda = true;
    else if (a === "--pdf" || a === "--png" || a === "--dados") {
      const v = argv[i + 1];
      if (!v || v.startsWith("--")) {
        erros.push("Falta o valor de " + a + ".");
        continue;
      }
      i++;
      if (a === "--dados") op.dados.push(v);
      else op[a.slice(2)] = v;
    } else erros.push("Opção desconhecida: " + a);
  }
  if (!op.ajuda) {
    if (!op.pdf && !op.png)
      erros.push("Indique pelo menos uma pasta: --pdf e/ou --png.");
    if (!op.dados.length)
      erros.push("Indique pelo menos um ficheiro de dados com --dados.");
  }
  return { op, erros };
}

// Lê os JSON de dados e devolve o conjunto de códigos
export function lerDados(ficheiros) {
  const codigos = new Set();
  const erros = [];
  for (const f of ficheiros) {
    let j;
    try {
      j = JSON.parse(fs.readFileSync(f, "utf8").replace(/^\uFEFF/, ""));
    } catch (e) {
      erros.push("Não consegui ler o ficheiro de dados " + f + ".");
      continue;
    }
    const lista = Array.isArray(j)
      ? j
      : j && Array.isArray(j.certificados)
        ? j.certificados
        : null;
    if (!lista) {
      erros.push("O ficheiro " + f + " não é uma lista de certificados.");
      continue;
    }
    for (const c of lista) {
      const cod = c && typeof c.codigo === "string" ? c.codigo.trim() : "";
      if (RE_CODIGO.test(cod.toUpperCase())) codigos.add(cod.toUpperCase());
    }
  }
  return { codigos, erros };
}

// Analisa uma pasta. Devolve { itens:[{codigo,tipo,caminho,nome,tamanho}], erros, avisos }
export function analisarPasta(pasta, tipo, codigosDados) {
  const itens = [];
  const erros = [];
  const avisos = [];
  let nomes;
  try {
    nomes = fs.readdirSync(pasta, { withFileTypes: true });
  } catch (e) {
    erros.push(
      "Não consegui abrir a pasta " + tipo.toUpperCase() + ": " + pasta,
    );
    return { itens, erros, avisos };
  }
  const vistos = new Map();
  for (const d of nomes) {
    if (!d.isFile()) continue;
    const nome = d.name;
    if (IGNORAR.includes(nome.toLowerCase())) continue;
    const ext = path.extname(nome).toLowerCase();
    if (ext !== "." + tipo) {
      erros.push(
        nome + ": extensão errada para a pasta " + tipo.toUpperCase() + ".",
      );
      continue;
    }
    const r = codigoDoNome(nome);
    if (r.erro) {
      erros.push(nome + ": " + r.erro);
      continue;
    }
    const caminho = path.join(pasta, nome);
    const st = fs.statSync(caminho);
    if (st.size === 0) {
      erros.push(nome + ": o ficheiro está vazio.");
      continue;
    }
    if (st.size > TAMANHO_MAX) {
      erros.push(nome + ": tem mais de 10 MB.");
      continue;
    }
    const fd = fs.openSync(caminho, "r");
    const cab = Buffer.alloc(8);
    fs.readSync(fd, cab, 0, 8, 0);
    fs.closeSync(fd);
    if (!cabecalhoValido(cab, tipo)) {
      erros.push(
        nome + ": o conteúdo não é um " + tipo.toUpperCase() + " verdadeiro.",
      );
      continue;
    }
    if (vistos.has(r.codigo)) {
      erros.push(
        r.codigo +
          ": código repetido em dois ficheiros (" +
          vistos.get(r.codigo) +
          " e " +
          nome +
          ").",
      );
      continue;
    }
    vistos.set(r.codigo, nome);
    if (!r.exacto)
      avisos.push(
        nome +
          ": o nome não é exactamente o código; vai ser enviado como " +
          r.codigo +
          ".",
      );
    const extra = !codigosDados.has(r.codigo);
    if (extra)
      avisos.push(
        nome +
          ": o código " +
          r.codigo +
          " não está em nenhum ficheiro de dados.",
      );
    itens.push({
      codigo: r.codigo,
      tipo,
      caminho,
      nome,
      tamanho: st.size,
      extra,
    });
  }
  // Um código repetido invalida também o primeiro ficheiro com esse código
  const repetidos = new Set(
    erros
      .map((e) => /^(CON-[A-Z0-9-]+): código repetido/.exec(e))
      .filter(Boolean)
      .map((m) => m[1]),
  );
  return {
    itens: itens.filter((i) => !repetidos.has(i.codigo)),
    erros,
    avisos,
  };
}

/* ==========================================================
   Envio
   ========================================================== */
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

function comTempo(ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return { signal: ctl.signal, fim: () => clearTimeout(t) };
}

export async function enviarUm(item, cred, fetchFn = fetch) {
  let ultimo = "";
  for (let n = 1; n <= TENTATIVAS; n++) {
    const params = parametros(
      item.codigo,
      item.tipo,
      Math.floor(Date.now() / 1000),
    );
    const fd = new FormData();
    for (const k of Object.keys(params)) fd.append(k, params[k]);
    fd.append("api_key", cred.chave);
    fd.append("signature", assinar(params, cred.segredo));
    const bytes = fs.readFileSync(item.caminho);
    fd.append(
      "file",
      new Blob([bytes], {
        type: item.tipo === "pdf" ? "application/pdf" : "image/png",
      }),
      item.codigo + "." + item.tipo,
    );
    const t = comTempo(ESPERA_MS);
    try {
      const r = await fetchFn(
        "https://api.cloudinary.com/v1_1/" + cred.cloud + "/image/upload",
        { method: "POST", body: fd, signal: t.signal },
      );
      t.fim();
      let j = {};
      try {
        j = await r.json();
      } catch (e) {
        j = {};
      }
      if (r.ok && j.public_id === params.public_id) return { ok: true };
      ultimo =
        (j && j.error && j.error.message) ||
        (r.ok ? "resposta inesperada" : "erro " + r.status);
      // Erros do pedido (assinatura, formato...) não melhoram ao repetir
      if (
        r.status >= 400 &&
        r.status < 500 &&
        r.status !== 408 &&
        r.status !== 429
      )
        break;
    } catch (e) {
      t.fim();
      ultimo = e && e.name === "AbortError" ? "tempo esgotado" : "sem ligação";
    }
    if (n < TENTATIVAS) await pausa(PAUSA_BASE_MS * n);
  }
  return { ok: false, razao: ultimo };
}

export async function verificarPublico(item, cloud, fetchFn = fetch) {
  const url = urlPublico(cloud, item.codigo, item.tipo);
  for (let n = 1; n <= 3; n++) {
    const t = comTempo(20000);
    try {
      const r = await fetchFn(url, {
        method: "HEAD",
        cache: "no-store",
        signal: t.signal,
      });
      t.fim();
      if (r.status === 200) return true;
    } catch (e) {
      t.fim();
    }
    if (n < 3) await pausa(PAUSA_BASE_MS * n);
  }
  return false;
}

async function emLotes(itens, fn) {
  const resultados = new Array(itens.length);
  let proximo = 0;
  async function trabalhador() {
    while (proximo < itens.length) {
      const i = proximo++;
      resultados[i] = await fn(itens[i], i);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(EM_PARALELO, itens.length) }, trabalhador),
  );
  return resultados;
}

/* ==========================================================
   Programa principal
   ========================================================== */
function ajuda() {
  console.log(
    [
      "Uso:",
      '  node worker/enviar-certificados.mjs --pdf "C:\\caminho\\pdf" --png "C:\\caminho\\png" --dados assets/certificados-ws7.json [--dados outro.json] [--enviar]',
      "",
      "  --pdf PASTA        pasta com os PDF exportados do Canva",
      "  --png PASTA        pasta com os PNG exportados do Canva",
      "  --dados FICHEIRO   JSON com a lista de certificados (pode repetir)",
      "  --enviar           envia de facto (sem isto é só uma simulação)",
      "  --incluir-extra    envia também ficheiros cujo código não está nos dados",
    ].join("\n"),
  );
}

function credenciais(env) {
  const chave = String(env.CLOUDINARY_API_KEY || "").trim();
  const segredo = String(env.CLOUDINARY_API_SECRET || "").trim();
  const cloud = String(env.CLOUDINARY_CLOUD_NAME || CLOUD_PADRAO).trim();
  return { chave, segredo, cloud };
}

function listar(titulo, linhas, max) {
  if (!linhas.length) return;
  console.log("\n" + titulo + " (" + linhas.length + "):");
  linhas.slice(0, max || linhas.length).forEach((l) => console.log("  - " + l));
  if (max && linhas.length > max)
    console.log("  ... e mais " + (linhas.length - max) + ".");
}

export async function principal(argv, env = process.env, fetchFn = fetch) {
  const { op, erros: errosArgs } = lerArgumentos(argv);
  if (op.ajuda) {
    ajuda();
    return 0;
  }
  if (errosArgs.length) {
    errosArgs.forEach((e) => console.error("Erro: " + e));
    ajuda();
    return 2;
  }

  const cred = credenciais(env);
  if (!/^[a-z0-9_-]+$/i.test(cred.cloud)) {
    console.error("Erro: CLOUDINARY_CLOUD_NAME inválido.");
    return 2;
  }
  if (op.enviar && (!cred.chave || !cred.segredo)) {
    console.error(
      [
        "Erro: faltam as credenciais do Cloudinary nas variáveis de ambiente.",
        "Defina-as só nesta janela do PowerShell (não ficam gravadas):",
        '  $env:CLOUDINARY_API_KEY = "cole-aqui-a-chave"',
        '  $env:CLOUDINARY_API_SECRET = "cole-aqui-o-segredo"',
        'Use a chave "script-certificados" (Cloudinary, Settings, API Keys).',
        "Nunca as escreva em ficheiros nem as envie a ninguém.",
      ].join("\n"),
    );
    return 2;
  }

  console.log(
    op.enviar
      ? "MODO ENVIO: os ficheiros válidos vão ser enviados para o Cloudinary (" +
          cred.cloud +
          ")."
      : "SIMULAÇÃO: nada é enviado. Para enviar, acrescente --enviar.",
  );

  const dados = lerDados(op.dados);
  const erros = [...dados.erros];
  const avisos = [];
  let itens = [];
  for (const tipo of ["pdf", "png"]) {
    if (!op[tipo]) continue;
    const r = analisarPasta(op[tipo], tipo, dados.codigos);
    itens = itens.concat(r.itens);
    erros.push(...r.erros);
    avisos.push(...r.avisos);
  }

  // Códigos dos dados sem ficheiro
  const emFalta = [];
  for (const tipo of ["pdf", "png"]) {
    if (!op[tipo]) continue;
    const tem = new Set(
      itens.filter((i) => i.tipo === tipo).map((i) => i.codigo),
    );
    for (const c of [...dados.codigos].sort())
      if (!tem.has(c)) emFalta.push(c + " (" + tipo.toUpperCase() + ")");
  }

  const extras = itens.filter((i) => i.extra);
  const aEnviar = itens.filter((i) => !i.extra || op.extra);

  console.log("\nCódigos nos dados: " + dados.codigos.size);
  console.log(
    "Ficheiros válidos: " +
      itens.length +
      " (PDF " +
      itens.filter((i) => i.tipo === "pdf").length +
      ", PNG " +
      itens.filter((i) => i.tipo === "png").length +
      ")",
  );
  if (extras.length && !op.extra)
    console.log(
      "Ficheiros a mais (código fora dos dados) que NÃO serão enviados: " +
        extras.length +
        " (use --incluir-extra para os enviar)",
    );
  listar("Erros", erros);
  listar("Avisos", avisos, 40);
  listar("Em falta", emFalta, 60);

  if (erros.length) {
    console.log(
      "\nHá erros. Corrija-os (nomes, extensões, ficheiros) e corra de novo." +
        (op.enviar ? " Nada foi enviado." : ""),
    );
    return 1;
  }

  if (!op.enviar) {
    console.log(
      "\nSimulação concluída: seriam enviados " +
        aEnviar.length +
        " ficheiros. Para enviar, corra o mesmo comando com --enviar.",
    );
    return 0;
  }

  // Envio
  let feitos = 0;
  const res = await emLotes(aEnviar, async (it) => {
    const r = await enviarUm(it, cred, fetchFn);
    feitos++;
    process.stdout.write(
      "\r  Enviados " + feitos + " de " + aEnviar.length + "   ",
    );
    return r;
  });
  process.stdout.write("\n");
  const falhas = [];
  const enviados = [];
  res.forEach((r, i) => {
    if (r.ok) enviados.push(aEnviar[i]);
    else falhas.push(aEnviar[i].nome + ": " + r.razao);
  });

  // Verificação final pelo endereço público
  console.log("A confirmar os endereços públicos…");
  const confirmados = await emLotes(enviados, (it) =>
    verificarPublico(it, cred.cloud, fetchFn),
  );
  const naoConfirmados = enviados
    .filter((_, i) => !confirmados[i])
    .map(
      (it) => it.nome + ": enviado, mas o endereço público não respondeu 200",
    );

  console.log("\n===== Relatório =====");
  console.log("Enviados: " + enviados.length);
  console.log("Falhados: " + falhas.length);
  console.log("Por confirmar (endereço público): " + naoConfirmados.length);
  console.log("Em falta: " + emFalta.length);
  console.log("Avisos: " + avisos.length);
  listar("Falharam", falhas);
  listar("Por confirmar", naoConfirmados);
  if (falhas.length || naoConfirmados.length) {
    console.log(
      "\nPode correr o mesmo comando outra vez: os que já estão bem são apenas substituídos.",
    );
    return 1;
  }
  return 0;
}

// Só corre quando chamado directamente (não quando importado nos testes)
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  principal(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    (e) => {
      console.error("Erro inesperado: " + (e && e.message ? e.message : e));
      process.exit(1);
    },
  );
}
