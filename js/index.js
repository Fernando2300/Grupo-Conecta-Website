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
      text: "Programas educacionais inovadores que desenvolvem habilidades técnicas e socioemocionais.",
      bg: "#ffffff",
    },
    {
      icon: "assets/icons/consulting.svg",
      alt: "Consulting icons",
      title: "Consultoria",
      text: "Orientação personalizada para desenvolvimento de carreira com mentoria especializada.",
      bg: "#E6ECF0",
    },
    {
      icon: "assets/icons/impact.svg",
      alt: "impact icons",
      title: "Impacto",
      text: "Projetos que promovem inclusão, diversidade e transformação nas comunidades.",
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
      title: "Desenvolvimento Web Full Stack",
      description:
        "Aprenda a criar aplicações web completas, do front-end ao back-end, com as tecnologias mais demandadas pelo mercado.",
      image: "assets/images/workshop.jpg",
      buttonText:
        'Inscreva-se <img src="assets/icons/arrow.svg" alt="Right arrow icon" class="arrow-icon" />',
      link: "inscricao.html",
      status: "aberto",
    },
    {
      title: "Liderança e Gestão de Projetos",
      description:
        "Desenvolva habilidades essenciais para liderar equipes e gerenciar projetos com metodologias ágeis e tradicionais.",
      image: "assets/images/course-lead.png",
      //Change ButtonText and status:aberto or fechado to update Course Status
      buttonText: "Indisponível",
      //'Inscreva-se <img src="assets/icons/arrow.svg" alt="Right arrow icon" class="arrow-icon" />',
      status: "fechado",
    },
    {
      title: "Marketing Digital para Iniciantes",
      description:
        "Domine as principais ferramentas e estratégias de marketing digital para impulsionar sua carreira ou negócio.",
      image: "assets/images/course-marketing.png",
      buttonText: "Indisponível",
      //'Inscreva-se <img src="assets/icons/arrow.svg" alt="Right arrow icon" class="arrow-icon" />',
      status: "fechado",
    },
    {
      title: "Empreendedorismo Social",
      description:
        "Aprenda a criar e desenvolver negócios de impacto social que geram valor para a sociedade e sustentabilidade financeira.",
      image: "assets/images/course-social.png",
      buttonText: "Indisponível",
      // 'Inscreva-se <img src="assets/icons/arrow.svg" alt="Right arrow icon" class="arrow-icon" />',
      status: "fechado",
    },
  ];

  const courseContainer = document.getElementById("courses-container");
/*
  courses.forEach((course) => {
    const card = document.createElement("div");
    card.className = "course-card";

    card.innerHTML = `
    <img src="${course.image}" alt="${course.title}" class="course-image">
    <div class="course-content">
    <div class="card-left-line"></div>
      <h3 class="course-title">${course.title}</h3>
      <p class="course-description">${course.description}</p>
      <a href="${course.link}" class="course-button">${course.buttonText}</a>
    </div>
  `;

    courseContainer.appendChild(card);
  });*/

  courses.forEach((course) => {
    const card = document.createElement("div");
    card.className = "course-card";

    let buttonHTML = "";

    //Open-Closed System
    if (course.status === "aberto") {
      buttonHTML = `<a href="${course.link}" class="course-button open">${course.buttonText}</a>`;
    } else {
      buttonHTML = `<button class="course-button closed" onclick="mostrarAviso(this)">${course.buttonText}</button>`;
    }


    card.innerHTML = `
    <img src="${course.image}" alt="${course.title}" class="course-image">
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
      image: "assets/images/impact-education.png",
      icon: "assets/icons/icon-education.svg",
      altImage: "Stack of books with an apple",
      altIcon: "Education icon",
    },
    {
      title: "Ajuda às Comunidades",
      description:
        "Criando oportunidades e espaços inclusivos onde todos possam participar e contribuir ativamente.",
      image: "assets/images/impact-community.png",
      icon: "assets/icons/icon-community.svg",
      altImage: "People holding hands in a circle",
      altIcon: "Community icon",
    },
    {
      title: "Sustentabilidade Ambiental",
      description:
        "Construindo um futuro onde pessoas e planeta possam prosperar em harmonia e equilíbrio.",
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
  <img src="${item.image}" alt="${item.altImage}" class="impact-image">

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
