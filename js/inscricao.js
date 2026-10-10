document.addEventListener("DOMContentLoaded", async function () {
  const form = document.getElementById("inscricao-form");
  const metodoRadios = document.getElementsByName("metodo");
  const emailField = document.getElementById("email-field");
  const valorInput = document.getElementById("valor");
  const pagamentoSection = document.getElementById("pagamento-section");
  const valorBtns = document.querySelectorAll(".valor-btn");
  const loading = document.getElementById("loading");
  const btnInscricao = document.getElementById("btn-inscricao");

  // Dados vindos de data/site.json
  let pagamento = {
    entidade: "",
    referencia: "",
    whatsapp: "",
    email: "",
    valorMinimo: 500,
  };
  let workshop = null;
  let valorMinimo = 500; // 0 = workshop gratuito (contribuição opcional)

  // ✅ Inicializa intl-tel-input no campo telefone
  const inputTelefone = document.getElementById("telefone");
  const iti = window.intlTelInput(inputTelefone, {
    initialCountry: "ao",
    preferredCountries: ["ao", "br", "pt"],
    separateDialCode: true,
    utilsScript:
      "https://cdnjs.cloudflare.com/ajax/libs/intl-tel-input/18.2.1/js/utils.js",
  });

  // ✅ Exibe mensagem de erro no bloco abaixo do formulário
  function exibirErroGlobal(mensagem) {
    const erroGlobal = document.getElementById("erro-global");
    if (erroGlobal) {
      erroGlobal.textContent = mensagem;
      erroGlobal.classList.remove("hidden");
      erroGlobal.classList.add("visivel");
      setTimeout(() => {
        erroGlobal.classList.remove("visivel");
        erroGlobal.classList.add("hidden");
      }, 6000);
    }
  }

  // ✅ Preenche a página com os dados do workshop activo
  function mostrarWorkshop(w) {
    document.getElementById("ws-tema").textContent = w.tema;
    document.title = "Inscrições – " + w.tema;
    document.getElementById("ws-descricao").innerHTML = w.descricao || "";
    document.getElementById("ws-data").textContent =
      SiteData.formatarData(w.data) || "—";
    document.getElementById("ws-horario").textContent =
      SiteData.formatarHorario(w.horaInicio, w.horaFim) || "—";
    document.getElementById("ws-local").textContent = w.local || "—";

    // Imagem (se não houver, mostra um espaço reservado)
    const img = document.getElementById("ws-imagem");
    const vazia = document.getElementById("ws-imagem-vazia");
    if (w.imagem) {
      img.src = w.imagem;
      img.hidden = false;
      vazia.hidden = true;
    } else {
      img.hidden = true;
      vazia.hidden = false;
    }

    // Botão de inscrição: aberto ou encerrado
    if (w.inscricoes === "abertas") {
      btnInscricao.disabled = false;
      btnInscricao.textContent = "Confirmar Inscrição";
      btnInscricao.classList.add("is-open");
    } else {
      btnInscricao.disabled = true;
      btnInscricao.textContent = "Inscrições Encerradas";
      btnInscricao.classList.remove("is-open");
    }
  }

  // ✅ Adapta o campo do valor: workshop pago (mínimo obrigatório) ou gratuito (opcional)
  function configurarValor() {
    const gratuito = valorMinimo === 0;
    document.getElementById("valor-rotulo").textContent = gratuito
      ? "Quer contribuir? (opcional)"
      : `Valor a Contribuir (mínimo ${SiteData.formatarNumero(valorMinimo)} Kz)`;
    valorInput.placeholder = gratuito
      ? "Indique um valor, se desejar contribuir"
      : "Quanto deseja contribuir?";
    valorInput.min = gratuito ? 1 : valorMinimo;
    // Esconde os atalhos de valor que ficam abaixo do mínimo
    valorBtns.forEach((btn) => {
      btn.classList.toggle("hidden", Number(btn.dataset.value) < valorMinimo);
    });
  }

  // ✅ Preenche as formas de pagamento e os links de contacto
  let metodoActual = null;
  let dadosFormulario = null;

  // Texto da mensagem para a equipa (nome, número, workshop, valor, como receber o link)
  function textoMensagem(comprovativo) {
    const f = dadosFormulario || {};
    const linhas = [
      comprovativo
        ? "Olá, segue o meu comprovativo do Workshop."
        : "Olá, acabei de me inscrever no Workshop.",
    ];
    if (workshop)
      linhas.push("", `Workshop ${workshop.numero}: ${workshop.tema}`);
    if (f.nome) linhas.push(`Nome: ${f.nome}`);
    if (f.telefone) linhas.push(`Número: ${f.telefone}`);
    if (f.metodo === "email" && f.email) {
      linhas.push(`Receber o link por e-mail: ${f.email}`);
    } else if (f.metodo) {
      linhas.push("Receber o link por WhatsApp");
    }
    if (f.valor > 0) {
      linhas.push(`Contribuição: ${SiteData.formatarKz(f.valor)}`);
    } else if (valorMinimo === 0) {
      linhas.push("Contribuição: nenhuma (workshop gratuito)");
    }
    if (comprovativo && metodoActual) {
      linhas.push(`Pago via: ${metodoActual.titulo || metodoActual.nome}`);
    }
    return linhas.join("\n");
  }

  function linkWhatsapp(mensagem) {
    return `https://wa.me/${pagamento.whatsapp}?text=${encodeURIComponent(mensagem)}`;
  }

  function linkEmail(assunto, mensagem) {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const a = encodeURIComponent(assunto);
    const m = encodeURIComponent(mensagem);
    return isMobile
      ? `mailto:${pagamento.email}?subject=${a}&body=${m}`
      : `https://mail.google.com/mail/?view=cm&fs=1&to=${pagamento.email}&su=${a}&body=${m}`;
  }

  function actualizarWhatsapp() {
    // Secção de pagamento: comprovativo
    document.getElementById("link-whatsapp").href = linkWhatsapp(
      textoMensagem(true),
    );
    // Confirmação (sem pagamento): só os dados da inscrição
    const confWa = document.getElementById("conf-whatsapp");
    const confEmail = document.getElementById("conf-email");
    const msg = textoMensagem(false);
    if (confWa) confWa.href = linkWhatsapp(msg);
    if (confEmail) {
      confEmail.href = linkEmail("Inscrição no Workshop", msg);
      if (!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
        confEmail.target = "_blank";
        confEmail.rel = "noopener";
      }
    }
  }

  function mostrarPagamento(p) {
    const zona = document.getElementById("pg-metodos");
    zona.replaceChildren(
      Pagamento.criar(p.metodos, (metodo) => {
        metodoActual = metodo;
        actualizarWhatsapp();
      }),
    );

    const emailLink = document.getElementById("link-email");
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (emailLink) {
      if (isMobile) {
        emailLink.href = `mailto:${p.email}?subject=Comprovativo%20de%20Pagamento`;
      } else {
        emailLink.href = `https://mail.google.com/mail/?view=cm&fs=1&to=${p.email}&su=Comprovativo%20de%20Pagamento`;
        emailLink.target = "_blank";
      }
    }
  }

  // ✅ Abre a secção de pagamento depois de uma inscrição
  function abrirPagamento(formulario) {
    dadosFormulario = formulario;
    actualizarWhatsapp();

    const gratuito = valorMinimo === 0;

    // Workshop gratuito e sem contribuição: só confirma a inscrição
    if (gratuito && !formulario.valor) {
      const confirmacao = document.getElementById("confirmacao-section");
      confirmacao.classList.remove("hidden");
      confirmacao.scrollIntoView({ behavior: "smooth" });
      return;
    }

    // Com pagamento: o texto muda conforme seja obrigatório ou voluntário
    document.getElementById("pg-titulo").textContent = gratuito
      ? "Inscrição confirmada. Obrigado por contribuir!"
      : "Obrigado por se inscrever!";
    document.getElementById("pg-nota").textContent = gratuito
      ? "A sua contribuição é voluntária. Após efectuar o pagamento, envie o seu comprovativo clicando no botão abaixo."
      : "Após efectuar o pagamento, envie o seu comprovativo clicando no botão abaixo para confirmar a inscrição.";

    pagamentoSection.classList.remove("hidden");
    pagamentoSection.scrollIntoView({ behavior: "smooth" });
  }

  // ✅ Carrega os dados
  try {
    const dados = await SiteData.carregar();
    pagamento = dados.pagamento;
    workshop = SiteData.workshopPorId(dados, dados.workshopActivo);
    if (!workshop) throw new Error("Workshop activo não encontrado");
    valorMinimo = SiteData.valorMinimo(dados, workshop);
    mostrarWorkshop(workshop);
    configurarValor();
    mostrarPagamento(pagamento);
  } catch (err) {
    console.error(err);
    document.getElementById("ws-tema").textContent =
      "Não foi possível carregar o workshop";
    btnInscricao.textContent = "Indisponível";
    exibirErroGlobal("Erro ao carregar os dados. Recarregue a página.");
  }

  metodoRadios.forEach((radio) => {
    radio.addEventListener("change", function () {
      emailField.classList.toggle("hidden", this.value !== "email");
    });
  });

  valorBtns.forEach((btn) => {
    btn.addEventListener("click", function () {
      valorBtns.forEach((b) => b.classList.remove("selected"));
      this.classList.add("selected");
      valorInput.value = this.dataset.value;
    });
  });

  form.addEventListener("submit", async function (e) {
    e.preventDefault();

    // Segurança: não envia nada se as inscrições estiverem encerradas
    if (!workshop || workshop.inscricoes !== "abertas") return;

    const nome = document.getElementById("nome").value.trim();
    const telefone = iti.getNumber().trim(); // número completo com código do país
    const textoValor = valorInput.value.trim();
    const valor = textoValor === "" ? 0 : parseInt(textoValor, 10);
    const metodo = [...metodoRadios].find((r) => r.checked)?.value;
    const email = document.getElementById("email")?.value.trim();

    // Mensagem de erro junto ao campo
    function mostrarErroInline(input, mensagem) {
      const erroExistente = input.parentElement.querySelector(".mensagem-erro");
      if (erroExistente) erroExistente.remove();

      const erro = document.createElement("small");
      erro.classList.add("mensagem-erro");
      erro.textContent = mensagem;
      input.insertAdjacentElement("afterend", erro);
      input.classList.add("input-erro");

      setTimeout(() => {
        erro.remove();
        input.classList.remove("input-erro");
      }, 4000);
    }

    // ✅ Validação em português
    if (!nome) {
      mostrarErroInline(
        document.getElementById("nome"),
        "Por favor, preencha o nome completo.",
      );
      return;
    }

    if (!iti.isValidNumber()) {
      mostrarErroInline(
        document.getElementById("telefone"),
        "Por favor, insira um número de telefone válido.",
      );
      return;
    }

    if (valorMinimo === 0) {
      // Gratuito: pode ficar em branco, mas se escrever tem de ser válido
      if (textoValor !== "" && (isNaN(valor) || valor < 1)) {
        mostrarErroInline(
          document.getElementById("valor"),
          "Indique um valor válido, ou deixe o campo vazio para se inscrever sem contribuir.",
        );
        return;
      }
    } else if (isNaN(valor) || valor < valorMinimo) {
      mostrarErroInline(
        document.getElementById("valor"),
        `A contribuição mínima é de ${SiteData.formatarNumero(valorMinimo)} Kz.`,
      );
      return;
    }

    if (metodo === "email" && (!email || !email.includes("@"))) {
      mostrarErroInline(
        document.getElementById("email"),
        "Por favor, insira um e-mail válido.",
      );
      return;
    }

    // ✅ Mostrar spinner com fade-in
    loading.classList.add("active");
    loading.classList.remove("hidden");

    const payload = {
      data: {
        nome,
        telefone,
        valor,
        metodo,
        email,
        workshop: workshop.id,
        data_envio: new Date().toLocaleString("pt-BR"),
      },
    };

    try {
      const response = await fetch("https://sheetdb.io/api/v1/muhp580eoo1cx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // ✅ Esconder spinner com fade-out
      loading.classList.remove("active");
      setTimeout(() => {
        loading.classList.add("hidden");
      }, 300);

      if (response.ok) {
        abrirPagamento({ nome, telefone, valor, metodo, email });
      } else {
        exibirErroGlobal("Erro ao enviar. Tente novamente mais tarde.");
      }
    } catch (err) {
      console.error("Erro na requisição:", err);
      loading.classList.remove("active");
      loading.classList.add("hidden");
      exibirErroGlobal("Erro na conexão. Verifique sua internet.");
    }
  });
});
