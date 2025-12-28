document.getElementById("verificar").addEventListener("click", async () => {
  const codigo = document.getElementById("codigo").value.trim();
  const resultado = document.getElementById("resultado");

  if (!codigo) {
    resultado.style.display = "block";
    resultado.className = "resultado erro";
    resultado.innerHTML = "<p>⚠️ Por favor, insira um código válido.</p>";
    return;
  }

  try {
    // 🔹 Carregar todos os certificados
    const [participantes, oradores, moderadores] = await Promise.all([
      fetch("assets/certificados-participantes.json").then(r => r.json()),
      fetch("assets/certificados-oradores.json").then(r => r.json()),
      fetch("assets/certificados-moderadores.json").then(r => r.json())
    ]);

    // 🔹 Junta tudo numa única lista
    const certificados = [...participantes, ...oradores, ...moderadores];

    // 🔹 Procura pelo código
    const certificado = certificados.find(c => c.codigo === codigo);

    if (certificado) {
      let detalhes = "";

      // ===== PARTICIPANTES =====
      if (codigo.startsWith("CON-WS")) {
        detalhes = `
          <p><strong>Workshop:</strong> ${certificado.workshop}</p>
          <p><strong>Orador:</strong> ${certificado.orador}</p>
          <p><strong>Data:</strong> ${certificado.data} (${certificado.duracao})</p>
          <p><strong>Plataforma:</strong> ${certificado.plataforma}</p>
        `;
      }

      // ===== ORADORES CONVIDADOS =====
      else if (codigo.startsWith("CON-GC")) {
        detalhes = `
          <p><strong>Função:</strong> Orador Convidado</p>
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
      resultado.innerHTML = `
        <h3>✅ Certificado Válido</h3>

        <p><strong>Nome:</strong> ${certificado.nome}</p>

        ${detalhes}

        <p><strong>Código:</strong> ${certificado.codigo}</p>

        <p class="nota">
          Este certificado foi emitido pelo <strong>${certificado.entidade_emissora || "Grupo Conecta"}</strong> no âmbito do <strong>Kectil in Action</strong>.
        </p>

        <div class="logos">
          <img src="assets/icons/logoblue.svg" alt="Grupo Conecta" class="conecta">
          <img src="assets/icons/KectilinActionLogo.svg" alt="Kectil in Action" class="kectil">
        </div>
      `;
    } else {
      resultado.style.display = "block";
      resultado.className = "resultado erro";
      resultado.innerHTML = `
        <h3>❌ Certificado não encontrado</h3>
        <p>O código <strong>${codigo}</strong> não consta na nossa base de dados.</p>
      `;
    }
  } catch (error) {
    console.error(error);
    resultado.style.display = "block";
    resultado.className = "resultado erro";
    resultado.innerHTML = "<p>⚠️ Erro ao verificar. Tente novamente mais tarde.</p>";
  }
});
