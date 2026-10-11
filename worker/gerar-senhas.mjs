/* ============================================================
   worker/gerar-senhas.mjs — corre no SEU computador (Node 18 ou superior).
   Não vai para o site publicado e não guarda nada em ficheiros.

   Uso (PowerShell, dentro da pasta do projecto):
     node worker/gerar-senhas.mjs

   Pede a senha de cada membro (não aparece no ecrã) e escreve:
     SENHAS          -> colar como segredo "SENHAS" no Worker
     SESSAO_SEGREDO  -> colar como segredo "SESSAO_SEGREDO" no Worker
   As senhas em si NUNCA são escritas; só o hash.

   Para mudar a senha de um só membro: corra o script, deixe os outros
   em branco (Enter) e junte a entrada nova ao JSON que já está no Worker.
   ============================================================ */
import { webcrypto as crypto } from "node:crypto";
import readline from "node:readline";

const MEMBROS = [
  "Salvador Fernando",
  "Félix Júnior",
  "Febe Jamba",
  "Sednilson Maquenha",
  "Ernesto Xavier",
];

// Mantenha igual ao PBKDF2_PADRAO do Worker (plano gratuito: 10 ms de CPU)
const IT = 10000;
const MIN_CARACTERES = 16;

const enc = new TextEncoder();
const b64 = (u8) => Buffer.from(u8).toString("base64");

function perguntarEscondido(texto) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl._writeToOutput = (t) => {
      // mostra a pergunta, mas não o que se escreve
      if (t.includes(texto)) process.stdout.write(t);
    };
    rl.question(texto, (r) => {
      rl.close();
      process.stdout.write("\n");
      resolve(r);
    });
  });
}

async function hashDe(senha) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const chave = await crypto.subtle.importKey(
    "raw",
    enc.encode(senha.normalize("NFKC")),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: IT },
    chave,
    256,
  );
  return { salt: b64(salt), hash: b64(new Uint8Array(bits)), it: IT };
}

const saida = {};
console.log(
  `Escreva uma frase-senha longa (pelo menos ${MIN_CARACTERES} caracteres) para cada membro.`,
);
console.log("Deixe em branco para saltar um membro.\n");

for (const nome of MEMBROS) {
  for (;;) {
    const s1 = await perguntarEscondido(`Senha de ${nome}: `);
    if (!s1) break;
    if (s1.length < MIN_CARACTERES) {
      console.log(`  Demasiado curta (${s1.length}). Use pelo menos ${MIN_CARACTERES}.`);
      continue;
    }
    const s2 = await perguntarEscondido(`  Repita a senha de ${nome}: `);
    if (s1 !== s2) {
      console.log("  Não coincidem. Tente de novo.");
      continue;
    }
    saida[nome] = await hashDe(s1);
    break;
  }
}

const segredo = b64(crypto.getRandomValues(new Uint8Array(48)));

console.log("\n==================== COPIAR PARA O WORKER ====================");
console.log("\nSegredo SENHAS (uma linha):\n");
console.log(JSON.stringify(saida));
console.log("\nSegredo SESSAO_SEGREDO:\n");
console.log(segredo);
console.log("\n==============================================================");
console.log("Apague este ecrã (limpar o histórico do terminal) depois de copiar.");
console.log("Se só gerou alguns membros, junte-os ao JSON que já está no Worker.");
