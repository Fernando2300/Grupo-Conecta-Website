document.getElementById("verificar").addEventListener("click", async () => {
  const codigo = document.getElementById("codigo").value.trim().toUpperCase();
  const resultado = document.getElementById("resultado");

  if (!codigo) {
    resultado.style.display = "block";
    resultado.className = "resultado erro";
    resultado.innerHTML =
      "<p><i class='fa-solid fa-triangle-exclamation' aria-hidden='true'></i> Por favor, insira um código válido.</p>";
    return;
  }

  try {
    // Carregar todos os certificados
    const [participantes, oradores, moderadores, ws6] = await Promise.all([
      fetch("assets/certificados-participantes.json").then((r) => r.json()),
      fetch("assets/certificados-oradores.json").then((r) => r.json()),
      fetch("assets/certificados-moderadores.json").then((r) => r.json()),
      fetch("assets/certificados-ws6.json").then((r) => r.json()),
    ]);

    // Junta tudo numa única lista
    const certificados = [
      ...participantes,
      ...oradores,
      ...moderadores,
      ...ws6,
    ];

    // Procura pelo código
    const certificado = certificados.find((c) => c.codigo === codigo);

    if (certificado) {
      let detalhes = "";

      // ===== PARTICIPANTES =====
      if (codigo.startsWith("CON-WS")) {
        detalhes = `
          <p><strong>Workshop:</strong> ${certificado.workshop}</p>
          <p><strong>${certificado.rotulo_orador || "Orador"}:</strong> ${certificado.orador}</p>
          ${certificado.edicao ? `<p><strong>Edição:</strong> ${certificado.edicao}</p>` : ""}
          <p><strong>Data:</strong> ${certificado.data} (${certificado.duracao})</p>
          <p><strong>Plataforma:</strong> ${certificado.plataforma}</p>
        `;
      }

      // ===== ORADORES CONVIDADOS =====
      else if (codigo.startsWith("CON-GC")) {
        detalhes = `
          <p><strong>Função:</strong> ${certificado.funcao || "Orador Convidado"}</p>
          <p><strong>Tema:</strong> ${certificado.evento}</p>
          <p><strong>Edição:</strong> ${certificado.edicao}</p>
          <p><strong>Data:</strong> ${certificado.data}</p>
        `;
      }

      // ===== MODERADORES =====
      else if (codigo.startsWith("CON-MOD")) {
        detalhes = `
          <p><strong>Função:</strong> ${certificado.funcao}</p>
          <p><strong>Tema:</strong> ${certificado.evento}</p>
          <p><strong>Edição:</strong> ${certificado.edicao}</p>
          <p><strong>Data:</strong> ${certificado.data}</p>
        `;
      }

      resultado.style.display = "block";
      resultado.className = "resultado sucesso";

      // Certificados de 2025 (sem o campo "kectil") foram emitidos no âmbito do Kectil in Action.
      // Os novos levam "kectil": false e mostram só o Grupo Conecta.
      const noKectil = certificado.kectil !== false;
      const entidade = certificado.entidade_emissora || "Grupo Conecta";
      const nota = noKectil
        ? `Este certificado foi emitido pelo <strong>${entidade}</strong> no âmbito do <strong>Kectil in Action</strong>.`
        : `Este certificado foi emitido pelo <strong>${entidade}</strong>.`;
      const logoKectil = noKectil
        ? `<img src="assets/icons/KectilinActionLogo.svg" alt="Kectil in Action" class="kectil">`
        : "";

      resultado.innerHTML = `
          <h3><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Certificado Válido</h3>

        <p><strong>Nome:</strong> ${certificado.nome}</p>

        ${detalhes}

        <p><strong>Código:</strong> ${certificado.codigo}</p>

        <p class="nota">
          ${nota}
        </p>

        <div class="logos">
          <img src="assets/icons/logoblue.svg" alt="Grupo Conecta" class="conecta">
          ${logoKectil}
        </div>
      `;
    } else {
      resultado.style.display = "block";
      resultado.className = "resultado erro";
      resultado.innerHTML = `
        <h3><i class="fa-solid fa-circle-xmark" aria-hidden="true"></i> Certificado não encontrado</h3>
        <p>O código <strong>${codigo.replace(/[&<>"']/g, "")}</strong> não consta na nossa base de dados.</p>
      `;
    }
  } catch (error) {
    console.error(error);
    resultado.style.display = "block";
    resultado.className = "resultado erro";
    resultado.innerHTML =
      "<p><i class='fa-solid fa-triangle-exclamation' aria-hidden='true'></i> Erro ao verificar. Tente novamente mais tarde.</p>";
  }
});
