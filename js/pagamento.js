/* ============================================================
   pagamento.js — mostra as formas de pagamento (separadores).
   Os dados vêm de data/site.json, bloco "pagamento.metodos".
   Usado pelo pop-up "Contribuir" (contribuir.js) e pela secção
   de pagamento da página de inscrição (inscricao.js).

   Pagamento.criar(metodos, aoMudar) devolve o elemento a inserir
   na página. "aoMudar(metodo)" é chamada ao escolher um separador.
   ============================================================ */
const Pagamento = (() => {
  let contador = 0;

  function el(tag, classe, texto) {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto) e.textContent = texto;
    return e;
  }

  function criarCampo(campo) {
    const linha = el("div", "pg-campo");
    linha.appendChild(el("span", "pg-rotulo", campo.rotulo + ":"));
    linha.appendChild(el("strong", "pg-valor", campo.valor));

    const copiar = el("span", "pg-copiar", "[copiar]");
    copiar.setAttribute("role", "button");
    copiar.tabIndex = 0;
    copiar.setAttribute("aria-label", "Copiar " + campo.rotulo);
    const accao = async () => {
      try {
        await navigator.clipboard.writeText(campo.valor);
        copiar.textContent = "[copiado]";
        setTimeout(() => (copiar.textContent = "[copiar]"), 1500);
      } catch (err) {
        console.error("Erro ao copiar:", err);
      }
    };
    copiar.addEventListener("click", accao);
    copiar.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        accao();
      }
    });
    linha.appendChild(copiar);
    return linha;
  }

  function criar(metodos, aoMudar) {
    const raiz = el("div", "pg-metodos");
    const lista = (metodos || []).filter(
      (m) => m && m.activo !== false && (m.campos || []).length,
    );
    if (!lista.length) return raiz;

    const uid = ++contador;
    const separadores = el("div", "pg-tabs");
    separadores.setAttribute("role", "tablist");
    separadores.setAttribute("aria-label", "Forma de pagamento");

    const botoes = [];
    const paineis = [];

    lista.forEach((m, i) => {
      const botao = el("button", "pg-tab");
      botao.type = "button";
      botao.id = `pg-tab-${uid}-${i}`;
      botao.setAttribute("role", "tab");
      botao.setAttribute("aria-controls", `pg-painel-${uid}-${i}`);
      if (m.logo) {
        const img = el("img", "pg-tab-logo");
        img.src = m.logo;
        img.alt = "";
        botao.appendChild(img);
      }
      botao.appendChild(el("span", "pg-tab-nome", m.nome));
      separadores.appendChild(botao);
      botoes.push(botao);

      const painel = el("div", "pg-painel");
      painel.id = `pg-painel-${uid}-${i}`;
      painel.setAttribute("role", "tabpanel");
      painel.setAttribute("aria-labelledby", botao.id);
      painel.hidden = true;
      painel.appendChild(el("h4", "pg-titulo", m.titulo || m.nome));
      if (m.instrucao)
        painel.appendChild(el("div", "pg-instrucao", m.instrucao));
      m.campos.forEach((c) => painel.appendChild(criarCampo(c)));
      if (m.titular) {
        const t = el("div", "pg-campo");
        t.appendChild(el("span", "pg-rotulo", "Titular:"));
        t.appendChild(el("strong", "pg-valor", m.titular));
        painel.appendChild(t);
      }
      paineis.push(painel);
    });

    function seleccionar(i, foco) {
      botoes.forEach((b, j) => {
        const activo = i === j;
        b.setAttribute("aria-selected", activo ? "true" : "false");
        b.tabIndex = activo ? 0 : -1;
        b.classList.toggle("activo", activo);
        paineis[j].hidden = !activo;
      });
      if (foco) botoes[i].focus();
      if (typeof aoMudar === "function") aoMudar(lista[i]);
    }

    botoes.forEach((b, i) => {
      b.addEventListener("click", () => seleccionar(i));
      b.addEventListener("keydown", (e) => {
        let novo = null;
        if (e.key === "ArrowRight") novo = (i + 1) % botoes.length;
        else if (e.key === "ArrowLeft")
          novo = (i - 1 + botoes.length) % botoes.length;
        else if (e.key === "Home") novo = 0;
        else if (e.key === "End") novo = botoes.length - 1;
        if (novo !== null) {
          e.preventDefault();
          seleccionar(novo, true);
        }
      });
    });

    raiz.appendChild(separadores);
    paineis.forEach((p) => raiz.appendChild(p));
    seleccionar(0);
    return raiz;
  }

  return { criar };
})();
