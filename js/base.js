  const openMenuBtn = document.querySelector(".menu-btn");
  const closeMenuBtn = document.querySelector(".close-menu");
  const mobileNav = document.querySelector(".mobile-nav");

  openMenuBtn.addEventListener("click", () => {
    mobileNav.classList.add("open");
  });

  closeMenuBtn.addEventListener("click", () => {
    mobileNav.classList.remove("open");
  });