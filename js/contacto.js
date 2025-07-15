  const form = document.getElementById("form-contato");
  const popup = document.getElementById("popup-sucesso");

  form.addEventListener("submit", function (e) {
    e.preventDefault(); // Impede o envio tradicional

    const formData = new FormData(form);

    fetch("https://formsubmit.co/ajax/a24b7a5e3f57eb6b28a83fb07425b9a6", {
      method: "POST",
      body: formData,
      headers: {
        Accept: "application/json",
      },
    })
      .then((response) => {
        if (response.ok) {
          popup.classList.remove("hidden");
          form.reset();
          setTimeout(() => popup.classList.add("hidden"), 5000);
        } else {
          alert("Erro ao enviar. Tente novamente.");
        }
      })
      .catch(() => {
        alert("Erro de conexão. Verifique sua internet.");
      });
  });

