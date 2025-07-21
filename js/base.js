const openMenuBtn = document.querySelector(".menu-btn");
const closeMenuBtn = document.querySelector(".close-menu");
const mobileNav = document.querySelector(".mobile-nav");
const header = document.querySelector(".header");

openMenuBtn.addEventListener("click", () => {
  mobileNav.classList.add("open");
  header.classList.add("menu-open");
});

closeMenuBtn.addEventListener("click", () => {
  mobileNav.classList.remove("open");
  header.classList.remove("menu-open");
});


// Para manter os links compatíveis em todas as páginas:
document.querySelectorAll('.mobile-nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    const href = link.getAttribute('href');

    if (href.startsWith('#')) {
      // Já está no index.html
      if (window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname === '') {
        // Fecha o menu
        document.querySelector('.mobile-nav').classList.remove('open');
        document.querySelector('.header').classList.remove('menu-open');
      } else {
        // Redireciona para index.html com o hash
        e.preventDefault();
        window.location.href = 'index.html' + href;
      }
    }
  });
});
