/* ============================================================
   videos.js — secção "Workshops gravados"
   Lê os workshops de data/site.json (campo "video") e mostra
   miniaturas do YouTube. O player só é carregado ao clicar.

   Uso no HTML:
   <section class="videos-section" id="videos-section"
            data-videos-limite="3"></section>      (página inicial: 3 mais recentes)
   <section class="videos-section" id="videos-section"
            data-videos-limite="todos"></section>  (página workshops-gravados.html)
   ============================================================ */
(function () {
  // Extrai o ID de youtu.be/ID, watch?v=ID, /embed/ID e /shorts/ID
  function extrairId(url) {
    if (!url) return "";
    try {
      const u = new URL(url.trim());
      const host = u.hostname.replace(/^www\./, "");
      if (host === "youtu.be") return u.pathname.slice(1).split("/")[0];
      if (
        host.endsWith("youtube.com") ||
        host.endsWith("youtube-nocookie.com")
      ) {
        if (u.searchParams.get("v")) return u.searchParams.get("v");
        const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{6,})/);
        if (m) return m[1];
      }
    } catch (e) {}
    return "";
  }

  function criar(tag, classe, texto) {
    const el = document.createElement(tag);
    if (classe) el.className = classe;
    if (texto) el.textContent = texto;
    return el;
  }

  // Miniatura com botão de play; ao clicar, troca pelo player
  function criarPlayer(video) {
    const botao = criar("button", "video-thumb");
    botao.type = "button";
    botao.setAttribute("aria-label", "Reproduzir vídeo: " + video.tema);

    const img = criar("img", "video-thumb-img");
    img.alt = "";
    img.loading = "lazy";
    img.src = "https://img.youtube.com/vi/" + video.id + "/maxresdefault.jpg";
    // Se não existir a versão grande, o YouTube devolve uma imagem minúscula: usar hqdefault
    img.addEventListener("load", () => {
      if (img.naturalWidth <= 120 && !img.dataset.alt) {
        img.dataset.alt = "1";
        img.src = "https://img.youtube.com/vi/" + video.id + "/hqdefault.jpg";
      }
    });
    img.addEventListener("error", () => {
      if (!img.dataset.alt) {
        img.dataset.alt = "1";
        img.src = "https://img.youtube.com/vi/" + video.id + "/hqdefault.jpg";
      } else {
        botao.classList.add("sem-miniatura");
        img.remove();
      }
    });

    botao.append(img, criar("span", "video-play"));

    botao.addEventListener("click", () => {
      const iframe = document.createElement("iframe");
      iframe.className = "video-iframe";
      iframe.src =
        "https://www.youtube-nocookie.com/embed/" +
        video.id +
        "?autoplay=1&rel=0";
      iframe.title = video.tema;
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
      iframe.allowFullscreen = true;
      botao.replaceWith(iframe);
    });

    return botao;
  }

  function criarCartao(video) {
    const cartao = criar("article", "video-card");
    cartao.appendChild(criarPlayer(video));

    const corpo = criar("div", "video-card-body");
    corpo.appendChild(
      criar("span", "video-card-numero", "Workshop " + video.numero),
    );
    corpo.appendChild(criar("h3", "video-card-titulo", video.tema));
    corpo.appendChild(
      criar(
        "p",
        "video-card-info",
        video.orador + " · " + SiteData.formatarData(video.data),
      ),
    );
    cartao.appendChild(corpo);
    return cartao;
  }

  async function iniciar() {
    const secao = document.querySelector(".videos-section");
    if (!secao) return;

    let dados;
    try {
      dados = await SiteData.carregar();
    } catch (err) {
      console.error("Não foi possível carregar os vídeos:", err);
      secao.hidden = true;
      return;
    }

    // Só entram workshops com vídeo válido; mais recentes primeiro
    const todos = (dados.workshops || [])
      .map((w) => ({ ...w, id: extrairId(w.video) }))
      .filter((w) => w.id)
      .sort((a, b) => (b.data || "").localeCompare(a.data || ""));

    if (!todos.length) {
      secao.hidden = true;
      return;
    }

    const limiteAttr = secao.dataset.videosLimite;
    const limite =
      limiteAttr && limiteAttr !== "todos" ? Number(limiteAttr) : todos.length;
    const visiveis = todos.slice(0, limite);

    const recipiente = criar("div", "videos-container");
    recipiente.appendChild(criar("h2", "videos-title", "Workshops gravados"));
    recipiente.appendChild(
      criar(
        "p",
        "videos-subtitle",
        "Reveja as sessões anteriores e aprenda ao seu ritmo.",
      ),
    );

    const grelha = criar("div", "videos-grid");
    visiveis.forEach((v) => grelha.appendChild(criarCartao(v)));
    recipiente.appendChild(grelha);

    if (todos.length > visiveis.length) {
      const acoes = criar("div", "videos-actions");
      const link = criar("a", "videos-ver-todos", "Ver todos os vídeos");
      link.href = "workshops-gravados.html";
      acoes.appendChild(link);
      recipiente.appendChild(acoes);
    }

    secao.replaceChildren(recipiente);
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
