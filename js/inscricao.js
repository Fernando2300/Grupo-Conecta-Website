document.addEventListener("DOMContentLoaded", function () {
  const form = document.getElementById("inscricao-form");
  const metodoRadios = document.getElementsByName("metodo");
  const emailField = document.getElementById("email-field");
  const valorInput = document.getElementById("valor");
  const pagamentoSection = document.getElementById("pagamento-section");
  const valorBtns = document.querySelectorAll(".valor-btn");
  const loading = document.getElementById("loading");


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

  /*
  function exibirErroGlobal(mensagem) {
    const erroGlobal = document.getElementById("erro-global");
    if (erroGlobal) {
      erroGlobal.textContent = mensagem;
      erroGlobal.classList.add("visivel");
      setTimeout(() => {
        erroGlobal.classList.remove("visivel");
      }, 6000); // esconde após 6s
    }
  }*/

  // ✅ Detectar dispositivo e ajustar link do email
  const emailLink = document.getElementById("link-email");
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  if (emailLink) {
    if (isMobile) {
      emailLink.href =
        "mailto:gconecta05angola@gmail.com?subject=Comprovativo%20de%20Pagamento";
    } else {
      emailLink.href =
        "https://mail.google.com/mail/?view=cm&fs=1&to=gconecta05angola@gmail.com&su=Comprovativo%20de%20Pagamento";
      emailLink.target = "_blank";
    }
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

    // ✅ Declare as variáveis logo no início
    const nome = document.getElementById("nome").value.trim();
    const telefone = document.getElementById("telefone").value.trim();
    const valor = parseInt(valorInput.value);
    const metodo = [...metodoRadios].find((r) => r.checked)?.value;
    const email = document.getElementById("email")?.value.trim();

    //Função Utilitária para Mensagem de erros

    function mostrarErroInline(input, mensagem) {
      // Remove erro anterior (se houver)
      const erroExistente = input.parentElement.querySelector(".mensagem-erro");
      if (erroExistente) erroExistente.remove();

      // Cria e insere a mensagem
      const erro = document.createElement("small");
      erro.classList.add("mensagem-erro");
      erro.textContent = mensagem;
      input.insertAdjacentElement("afterend", erro);

      // Adiciona a borda vermelha
      input.classList.add("input-erro");

      // Remove erro e borda após 4 segundos
      setTimeout(() => {
        erro.remove();
        input.classList.remove("input-erro");
      }, 4000);
    }

    // ✅ NOVO BLOCO: Validação personalizada em português

    if (!nome) {
      mostrarErroInline(
        document.getElementById("nome"),
        "Por favor, preencha o nome completo."
      );
      return;
    }

    if (!telefone) {
      mostrarErroInline(
        document.getElementById("telefone"),
        "Por favor, insira o número de telefone."
      );
      return;
    }

    if (isNaN(valor) || valor < 500) {
      mostrarErroInline(
        document.getElementById("valor"),
        "A contribuição mínima é de 500kz."
      );
      return;
    }

    if (metodo === "email" && (!email || !email.includes("@"))) {
      mostrarErroInline(
        document.getElementById("email"),
        "Por favor, insira um e-mail válido."
      );
      return;
    }

    // ✅ Se passou nas validações, mostrar spinner
    //loading.classList.remove("hidden");

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
        data_envio: new Date().toLocaleString("pt-BR"), // ou "pt-BR" se preferir
      },
    };

    try {
        /*Alt. Access - https://sheetdb.io/api/v1/muhp580eoo1cx?sheet=Sheet1 */
      const response = await fetch("https://sheetdb.io/api/v1/muhp580eoo1cx", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });


      //✅ Esconder spinner com fade-out
      loading.classList.remove("active");
      setTimeout(() => {
        loading.classList.add("hidden");
      }, 300);

      if (response.ok) {
        console.log("Dados enviados com sucesso.");
        pagamentoSection.classList.remove("hidden");
        pagamentoSection.scrollIntoView({ behavior: "smooth" });

    // 1. Captura o botão do WhatsApp
    const linkWhatsApp = document.getElementById("link-whatsapp");

    // 2. Monta o link com os dados do formulário
    const numeroWhatsApp = "244935269451"; // mantém o número do destino
    const mensagem = `Olá, segue o meu comprovativo do Workshop

    Nome: ${nome}
    Número: ${telefone}`; //Termina mensagem

    const urlWhatsApp = `https://wa.me/${numeroWhatsApp}?text=${encodeURIComponent(mensagem)}`;

    // 3. Atualiza o href do botão
    linkWhatsApp.href = urlWhatsApp;

      } else {
        //alert("Erro ao enviar. Tente novamente mais tarde.");
        exibirErroGlobal("Erro ao enviar. Tente novamente mais tarde.");
      }
    } catch (err) {
      console.error("Erro na requisição:", err);
      //alert("Erro na conexão. Verifique sua internet.");
      exibirErroGlobal("Erro na conexão. Verifique sua internet.");
    }
    /*
      // ✅ NOVO: Esconder o spinner após resposta
      loading.classList.add("hidden");

      if (response.ok) {
        console.log("Dados enviados com sucesso.");
        pagamentoSection.classList.remove("hidden");
        pagamentoSection.scrollIntoView({ behavior: "smooth" });
      } else {
        alert("Erro ao enviar. Tente novamente mais tarde.");
      }
    } catch (err) {
      console.error("Erro na requisição:", err);
      alert("Erro na conexão. Verifique sua internet.");
    }*/
  });

  // ✅ NOVO: Lida com todos os elementos com classe 'copiar-texto'
  document.querySelectorAll(".copiar-texto").forEach((item) => {
    item.addEventListener("click", async function () {
      const valor = this.dataset.valor;
      try {
        await navigator.clipboard.writeText(valor);
        const original = this.textContent;
        this.textContent = "[copiado]";
        setTimeout(() => {
          this.textContent = original;
        }, 1500); // volta para [copiar] depois de 1.5 segundos
      } catch (err) {
        console.error("Erro ao copiar:", err);
      }
    });
  });
});
