document.addEventListener("DOMContentLoaded", () => {
  // Mobile Menu

  /*Problema,Causa,Correcção:
1. Menu mobile não desliza / sobrepõe‑se	-> No CSS você usa a classe .mobile‑nav.active, mas no JS 
adiciona "open" (mobileNav.classList.add("open")). -> Troque “open” por “active” OU acrescente o seletor 
.mobile‑nav.open no CSS.*/



  //Value Proposition Section
  const valueItems = [
    {
      icon: "assets/icons/education.svg",
      alt: "Education icons",
      title: "Educação",
      text: "Programas que abrem portas: cursos que ensinam, workshops que conectam, experiências que transformam.",
      bg: "#ffffff",
    },
    {
      icon: "assets/icons/consulting.svg",
      alt: "Consulting icons",
      title: "Consultoria",
      text: "Fornecemos serviços de consultoria económica e financeira para impulsionar o desenvolvimento local.",
      bg: "#E6ECF0",
    },
    {
      icon: "assets/icons/impact.svg",
      alt: "impact icons",
      title: "Impacto Social",
      text: "Promovemos iniciativas que transformam comunidades através de projectos sustentáveis e inclusivos.",
      bg: "#ffffff",
    },
  ];

  const valueContainer = document.getElementById("valueCardsContainer");

  valueItems.forEach((item) => {
    const card = document.createElement("div");
    card.className = "value-card";
    card.style.backgroundColor = item.bg;

    card.innerHTML = `
    <img src="${item.icon}" alt="${item.alt}" class="value-icon" />
    <div class="vertical-line"></div>
    <div class="value-content">
      <h3 class="value-title">${item.title}</h3>
      <p class="value-text">${item.text}</p>
    </div>
  `;

    valueContainer.appendChild(card);
  });

  //Courses and Workshops Section
  const courses = [
    {
      title: "Presença Verbal - Técnicas de Oratória para Projectos com Propósito",
      description:
        "Participe deste workshop intensivo com Maria dos Santos e descubra como a oratória estratégica pode impulsionar <em>projetos com propósito</em>.",
      image: "assets/images/workshop.jpg",
      buttonText: "Indisponível",
        //'Inscreva-se <img src="assets/icons/arrow.svg" alt="Right arrow icon" class="arrow-icon" />',
      link: "inscricao.html",
      status: "fechado",
      type: "workshop", // ✅ NOVO
    },
    {
      title: "EViews para Análise Económica",
      description:
        "Domine o EViews e transforme dados económicos em insights poderosos para decisões e investigação.",
      image: "assets/images/course-eviews.jpg",
      //Change ButtonText and status:aberto or fechado to update Course Status
      buttonText: "Indisponível",
      //'Inscreva-se <img src="assets/icons/arrow.svg" alt="Right arrow icon" class="arrow-icon" />',
      status: "fechado",
      type: "curso",
    },
    {
      title: "LaTeX para Documentos Académicos",
      description:
        "Aprenda a criar monografias, teses, relatórios e artigos científicos com precisão e elegância usando LaTeX.",
      image: "assets/images/course-latex.jpg",
      buttonText: "Indisponível",
      //'Inscreva-se <img src="assets/icons/arrow.svg" alt="Right arrow icon" class="arrow-icon" />',
      status: "fechado",
      type: "curso",
    },
    {
      title: "Python para Economia e Finanças",
      description:
        "Introdução prática ao uso de Python para análise económica, séries temporais e visualização de dados.",
      image: "assets/images/course-python.jpg",
      buttonText: "Indisponível",
      // 'Inscreva-se <img src="assets/icons/arrow.svg" alt="Right arrow icon" class="arrow-icon" />',
      status: "fechado",
      type: "curso",
    },
  ];

  const courseContainer = document.getElementById("courses-container");

  courses.forEach((course) => {
    const card = document.createElement("div");
    card.className = "course-card";

    let buttonHTML = "";

    //Code for Badge
    let badgeHTML = "";
      if (course.type === "workshop") {
      badgeHTML = `<div class="badge badge-workshop">Workshop</div>`;
      } else if (course.type === "curso") {
      badgeHTML = `<div class="badge badge-curso">Curso</div>`;
    }


    //Open-Closed System
    if (course.status === "aberto") {
      buttonHTML = `<a href="${course.link}" class="course-button open">${course.buttonText}</a>`;
    } else {
      buttonHTML = `<button class="course-button closed" onclick="mostrarAviso(this)">${course.buttonText}</button>`;
    }


    //</img><img src="${course.image}" alt="${course.title}" class="course-image" loading="lazy">
    //card.innerHTML = `
    card.innerHTML = `
      ${badgeHTML}
      <img src="${course.image}" alt="${course.title}" class="course-image" loading="lazy">

    <div class="course-content">
      <div class="card-left-line"></div>
      <h3 class="course-title">${course.title}</h3>
      <p class="course-description">${course.description}</p>
      ${buttonHTML}
    </div>
  `;

    courseContainer.appendChild(card);
  });


  //Impact Section

  const impactData = [
    {
      title: "Jovens Impactados",
      description:
        "Promovendo acesso ao conhecimento e desenvolvimento de habilidades essenciais para o futuro.",
      image: "assets/images/impact-education.jpg",
      icon: "assets/icons/icon-education.svg",
      altImage: "Stack of books with an apple",
      altIcon: "Education icon",
    },
    {
      title: "Ajuda às Comunidades",
      description:
        "Levamos apoio directo a quem mais precisa, através de iniciativas sociais, programas comunitários e doações que conectam pessoas e causas.",
      image: "assets/images/impact-community.jpg",
      icon: "assets/icons/icon-community.svg",
      altImage: "People holding hands in a circle",
      altIcon: "Community icon",
    },
    {
      title: "Sustentabilidade Ambiental",
      description:
        "Cultivamos a consciência ecológica através de práticas simples e eficazes, como a preservação e ampliação de espaços verdes e a substituição de plásticos por alternativas sustentáveis.",
      image: "assets/images/impact-environment.png",
      icon: "assets/icons/icon-environment.svg",
      altImage: "Hands holding a small plant",
      altIcon: "Environment icon",
    },
  ];

  function renderImpactCards() {
    const container = document.getElementById("impact-cards-container");

    impactData.forEach((item) => {
      const card = document.createElement("div");
      card.classList.add("impact-card");

      card.innerHTML = `
  <img src="${item.image}" alt="${item.altImage}" class="impact-image" loading="lazy">

  <!-- Ícone visível apenas no mobile -->
  <div class="impact-icon impact-icon-mobile">
    <img src="${item.icon}" alt="${item.altIcon}">
  </div>

  <div class="impact-content">
    <!-- Título com ícone (somente desktop) -->
    <div class="impact-heading-container">
      <div class="impact-icon impact-icon-desktop">
        <img src="${item.icon}" alt="${item.altIcon}">
      </div>
      <h3 class="impact-heading">${item.title}</h3>
    </div>

    <p class="impact-text">${item.description}</p>
  </div>
`;


      container.appendChild(card);
    });
  }

  renderImpactCards();
}); // 🔚 Fecha o DOMContentLoaded aqui



// FORA do DOMContentLoaded
//Open-Closed System
function mostrarAviso(botao) {
  // Criar o aviso dinamicamente
  const aviso = document.createElement("div");
  aviso.className = "aviso-temporario";
  aviso.innerText = "Curso indisponível no momento. Novidades em breve!";

  // Posiciona o aviso próximo ao botão clicado
  const rect = botao.getBoundingClientRect();

  aviso.style.position = "absolute";
  aviso.style.left = `${rect.left + window.scrollX}px`;
  aviso.style.top = `${rect.top + window.scrollY - 40}px`; // aparece acima do botão
  aviso.style.zIndex = 1000;

  document.body.appendChild(aviso);

  // Remover o aviso após 3 segundos
  setTimeout(() => {
    aviso.remove();
  }, 3000);
}
