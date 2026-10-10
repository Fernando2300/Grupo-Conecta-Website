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

  // ✅ Preenche as formas de pagamento e os links de contacto
  let metodoActual = null;
  let dadosFormulario = null;

  function actualizarWhatsapp() {
    let mensagem = "Olá, segue o meu comprovativo do Workshop";
    if (dadosFormulario) {
      mensagem += `\n\nNome: ${dadosFormulario.nome}\nNúmero: ${dadosFormulario.telefone}`;
    }
    if (metodoActual) {
      mensagem += `\nPago via: ${metodoActual.titulo || metodoActual.nome}`;
    }
    document.getElementById("link-whatsapp").href =
      `https://wa.me/${pagamento.whatsapp}?text=${encodeURIComponent(mensagem)}`;
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

    pagamentoSection.classList.remove("hidden");
    pagamentoSection.scrollIntoView({ behavior: "smooth" });
  }

  // ✅ Carrega os dados
  try {
    const dados = await SiteData.carregar();
    pagamento = dados.pagamento;
    workshop = SiteData.workshopPorId(dados, dados.workshopActivo);
    if (!workshop) throw new Error("Workshop activo não encontrado");
    mostrarWorkshop(workshop);
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
    const valor = parseInt(valorInput.value);
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

    if (isNaN(valor) || valor < pagamento.valorMinimo) {
      mostrarErroInline(
        document.getElementById("valor"),
        `A contribuição mínima é de ${pagamento.valorMinimo}kz.`,
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
        abrirPagamento({ nome, telefone });
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
