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
        const response = await fetch("assets/certificados.json");
        const certificados = await response.json();

        const certificado = certificados.find(c => c.codigo === codigo);

        if (certificado) {
        resultado.style.display = "block";
        resultado.className = "resultado sucesso";
        resultado.innerHTML = `
            <h3>✅ Certificado Válido</h3>
            <p><strong>Nome:</strong> ${certificado.nome}</p>
            <p><strong>Workshop:</strong> ${certificado.workshop}</p>
            <p><strong>Orador:</strong> ${certificado.orador}</p>
            <p><strong>Data:</strong> ${certificado.data} (${certificado.duracao})</p>
            <p><strong>Plataforma:</strong> ${certificado.plataforma}</p>
            <p><strong>Código:</strong> ${certificado.codigo}</p>
            <p class="nota">
                Este certificado foi emitido pelo <strong>Grupo Conecta</strong> no âmbito do <strong>Kectil in Action</strong>.
            </p>
            <div class="logos">
                <img src="assets/icons/logoblue.svg" alt="Grupo Conecta" class="conecta">
                <img src="assets/icons/KectilinActionLogo.svg" alt="Kectil in Action" class="kectil">
            </div>
        `;
        } else {
        resultado.style.display = "block";
        resultado.className = "resultado erro";
        resultado.innerHTML = `<h3>❌ Certificado não encontrado</h3>
                                <p>O código <strong>${codigo}</strong> não consta na nossa base de dados.</p>`;
        }
    } catch (error) {
        console.error(error);
        resultado.style.display = "block";
        resultado.className = "resultado erro";
        resultado.innerHTML = "<p>⚠️ Erro ao verificar. Tente novamente mais tarde.</p>";
    }
    });
