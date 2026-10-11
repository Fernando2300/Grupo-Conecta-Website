/* ============================================================
   sacolas.js — secção "Sacolas Eco Conecta"
   Uso no HTML:
     <section class="sacolas-section" data-sacolas="completa"></section>
     <section class="sacolas-section" data-sacolas="compacta"></section>
   Os números vêm de data/site.json (calculados em data.js).
   ============================================================ */
(function () {
  // Evita que texto vindo do JSON seja interpretado como HTML
  function esc(texto) {
    return String(texto == null ? "" : texto)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pct(n) {
    return String(Number(n.toFixed(1))).replace(".", ",");
  }

  function html(dados, variante) {
    const c = dados.campanha;
    const r = SiteData.resumo(dados);
    const completa = variante === "completa";
    const alcancada = r.meta > 0 && r.arrecadado >= r.meta;

    const legenda = alcancada
      ? "<strong>Meta alcançada!</strong> Obrigado a todos os que contribuíram."
      : `<strong>${pct(r.percentagem)}% alcançado</strong> · Faltam ${SiteData.formatarKz(r.faltam)}`;

    const progresso = `
      <div class="sacolas-progresso" style="grid-area: progresso">
        <p class="sacolas-lote">${esc(c.titulo)}</p>
        <div class="sacolas-valores">
          <div><span class="sacolas-rotulo">Arrecadado</span><strong>${SiteData.formatarKz(r.arrecadado)}</strong></div>
          <div class="sacolas-dir"><span class="sacolas-rotulo">Meta de produção</span><strong>${SiteData.formatarKz(r.meta)}</strong></div>
        </div>
        <div class="sacolas-barra" role="progressbar" aria-label="Progresso da angariação"
             aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(r.percentagem)}">
          <span style="width:${r.percentagem}%"></span>
        </div>
        <p class="sacolas-legenda">${legenda}</p>
      </div>`;

    const stats = `
      <ul class="sacolas-stats" style="grid-area: stats">
        <li><strong>${r.workshopsRealizados}</strong><span>Workshops realizados</span></li>
        <li><strong>${SiteData.formatarNumero(r.participacoes)}</strong><span>Participações</span></li>
        <li><strong>${r.mulheres}%</strong><span>Mulheres</span></li>
        <li><strong>${r.homens}%</strong><span>Homens</span></li>
      </ul>`;

    const confianca = c.linkPrestacaoContas
      ? ` <a href="${esc(c.linkPrestacaoContas)}" target="_blank" rel="noopener">Ver prestação de contas</a>`
      : "";

    // Botões: dependem da variante e do estado das inscrições
    const wActivo = SiteData.workshopPorId(dados, dados.workshopActivo);
    const inscricoesAbertas = !!wActivo && wActivo.inscricoes === "abertas";

    let botoes;
    if (!completa && inscricoesAbertas) {
      // Página de inscrição com inscrições abertas
      botoes = `
        <a class="sacolas-botao" href="#inscricao-form">Inscrever-me no workshop</a>
        <a class="sacolas-botao-sec" href="inscricao.html?contribuir=1" data-contribuir>Contribuir para as sacolas</a>`;
    } else if (!completa) {
      // Página de inscrição com inscrições encerradas
      botoes = `
        <a class="sacolas-botao" href="inscricao.html?contribuir=1" data-contribuir>Contribuir</a>
        <a class="sacolas-botao-sec" href="index.html#courses-section">Ver outros programas</a>`;
    } else {
      // Página inicial
      botoes = `<a class="sacolas-botao" href="inscricao.html?contribuir=1" data-contribuir>Contribuir</a>`;
    }

    const acoes = `
      <div class="sacolas-acoes" style="grid-area: acoes">
        <div class="sacolas-botoes">${botoes}</div>
        <p class="sacolas-confianca"><strong>Transparência gera confiança.</strong>
          Após cada workshop divulgamos os valores angariados.${confianca}</p>
      </div>`;

    const imagem = `
      <figure class="sacolas-media" style="grid-area: media">
        <img src="${esc(c.imagem)}" width="1200" height="675" loading="lazy"
             alt="Troque o plástico. Reutilize o futuro. Sacola reutilizável Eco Conecta">
      </figure>`;

    const texto = completa
      ? `
      <div class="sacolas-texto" style="grid-area: texto">
        <span class="sacolas-eyebrow">Sacolas Eco Conecta</span>
        <h2 class="sacolas-title">Conhecimento que gera impacto ambiental</h2>
        <p>Os Workshops Conecta promovem a aprendizagem e o desenvolvimento profissional e pessoal dos jovens angolanos, conectando-os a profissionais, académicos, empreendedores e outros agentes de mudança, preparando-os para os desafios do futuro.</p>
        <p>Mas o nosso compromisso vai além da formação. Os workshops servem também como meio de angariação de fundos, cujas contribuições são reinvestidas na substituição de sacos de plástico por sacolas reutilizáveis.</p>
        <p>Com a sua participação, transformamos conhecimento em acção e contribuímos para um futuro mais sustentável.</p>
        <p class="sacolas-lema">Pequenas acções consistentes criam mudança real.</p>
      </div>`
      : `
      <div class="sacolas-texto" style="grid-area: texto">
        <span class="sacolas-eyebrow">Sacolas Eco Conecta</span>
        <h2 class="sacolas-title">Conhecimento que gera impacto ambiental</h2>
        <p>As contribuições dos Workshops Conecta são destinadas à produção de sacolas reutilizáveis, transformando a aprendizagem em acção e contribuindo para um futuro mais sustentável.</p>
      </div>`;

    return `<div class="sacolas-container sacolas-${variante}">${imagem}${texto}${progresso}${stats}${acoes}</div>`;
  }

  async function iniciar() {
    const secoes = document.querySelectorAll("[data-sacolas]");
    if (!secoes.length) return;
    try {
      const dados = await SiteData.carregar();
      if (!dados.campanha) return;
      secoes.forEach((el) => {
        el.innerHTML = html(
          dados,
          el.dataset.sacolas === "compacta" ? "compacta" : "completa",
        );
      });
    } catch (err) {
      console.error("Não foi possível carregar a secção Sacolas:", err);
      secoes.forEach((el) => el.remove());
    }
  }

  document.addEventListener("DOMContentLoaded", iniciar);
})();
