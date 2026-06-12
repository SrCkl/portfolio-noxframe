const siteConfig = {
  whatsappNumber: "5519991389905",
  whatsappMessage: "Oi! Vi seu portfólio da NoxFrame Designs e queria fazer uma arte.",
  instagramUrl: "https://www.instagram.com/noxframe.design/",
  tiktokUrl: "https://www.tiktok.com/@noxframe.design"
};

const portfolioGrid = document.querySelector("#portfolioGrid");
const filtersContainer = document.querySelector("#filters");
const emptyMessage = document.querySelector("#emptyMessage");
const lightbox = document.querySelector("#lightbox");
const lightboxImage = document.querySelector("#lightboxImage");
const lightboxTitle = document.querySelector("#lightboxTitle");
const lightboxCategory = document.querySelector("#lightboxCategory");
const lightboxClose = document.querySelector(".lightbox-close");
const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".nav");

let portfolioItems = [];
let currentFilter = "todos";

function imagePath(path) {
  return path || "/assets/logo-noxframe.jpg";
}

function buildFilters() {
  const categories = new Map();

  portfolioItems.forEach((item) => {
    if (item.category && item.categoryLabel) {
      categories.set(item.category, item.categoryLabel);
    }
  });

  filtersContainer.innerHTML = "";
  filtersContainer.appendChild(createFilterButton("todos", "Tudo"));

  categories.forEach((label, value) => {
    filtersContainer.appendChild(createFilterButton(value, label));
  });
}

function createFilterButton(value, label) {
  const button = document.createElement("button");
  button.className = `filter-btn ${value === currentFilter ? "active" : ""}`.trim();
  button.type = "button";
  button.dataset.filter = value;
  button.textContent = label;

  button.addEventListener("click", () => {
    currentFilter = value;
    setActiveFilter(button);
    renderPortfolio(value);
  });

  return button;
}

function renderPortfolio(filter = "todos") {
  const items = filter === "todos"
    ? portfolioItems
    : portfolioItems.filter((item) => item.category === filter);

  portfolioGrid.innerHTML = "";
  emptyMessage.hidden = items.length > 0;

  items.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = `project-card ${item.size || ""}`.trim();
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Abrir projeto: ${item.title}`);
    card.style.animationDelay = `${index * 55}ms`;

    const img = document.createElement("img");
    img.src = imagePath(item.image);
    img.alt = item.title || "Arte do portfólio";
    img.loading = "lazy";

    const info = document.createElement("div");
    info.className = "project-info";

    const badge = document.createElement("span");
    badge.textContent = item.typeLabel || item.categoryLabel || "Arte";

    const title = document.createElement("h3");
    title.textContent = item.title || "Sem título";

    info.append(badge, title);
    card.append(img, info);

    card.addEventListener("click", () => openLightbox(item));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openLightbox(item);
      }
    });

    portfolioGrid.appendChild(card);
  });
}

function setActiveFilter(button) {
  document.querySelectorAll(".filter-btn").forEach((btn) => btn.classList.remove("active"));
  button.classList.add("active");
}

function openLightbox(item) {
  lightboxImage.src = imagePath(item.image);
  lightboxImage.alt = item.title || "Arte do portfólio";
  lightboxTitle.textContent = item.title || "Sem título";
  lightboxCategory.textContent = item.typeLabel || item.categoryLabel || "Arte";
  lightbox.classList.add("open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.classList.add("no-scroll");
}

function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
  document.body.classList.remove("no-scroll");
  lightboxImage.src = "";
}

function setupContactLinks() {
  const whatsappLink = document.querySelector("#whatsappLink");
  const instagramLink = document.querySelector("#instagramLink");
  const tiktokLink = document.querySelector("#tiktokLink");

  const cleanNumber = siteConfig.whatsappNumber.replace(/\D/g, "");
  const encodedMessage = encodeURIComponent(siteConfig.whatsappMessage);

  whatsappLink.href = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;
  instagramLink.href = siteConfig.instagramUrl;
  tiktokLink.href = siteConfig.tiktokUrl;
}

async function loadProjects() {
  try {
    const response = await fetch("/api/projects", { cache: "no-store" });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || "Não foi possível carregar o portfólio.");
    }

    portfolioItems = data.items || [];
    buildFilters();
    renderPortfolio(currentFilter);
  } catch (error) {
    portfolioGrid.innerHTML = "";
    emptyMessage.hidden = false;
    emptyMessage.textContent = "Não consegui carregar as artes agora. Tente atualizar a página.";
    console.error(error);
  }
}

lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && lightbox.classList.contains("open")) {
    closeLightbox();
  }
});

menuToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

nav.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    nav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  });
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("visible");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach((element) => revealObserver.observe(element));

document.querySelector("#currentYear").textContent = new Date().getFullYear();

setupContactLinks();
loadProjects();
