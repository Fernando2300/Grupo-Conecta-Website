/* ============================================================
   data.js — carrega data/site.json e oferece funções de apoio.
   Todas as páginas que mostram dados editáveis usam este ficheiro.
   ============================================================ */
const SiteData = (() => {
  let promessa = null;

  // Vai buscar o JSON (o "?v=" evita que o browser use uma versão antiga)
  function carregar() {
    if (!promessa) {
      promessa = fetch("data/site.json?v=" + Date.now()).then((r) => {
        if (!r.ok) throw new Error("Não foi possível carregar data/site.json");
        return r.json();
      });
    }
    return promessa;
  }

  const MESES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  // "2025-09-21" -> "21 de Setembro, 2025"
  function formatarData(iso) {
    if (!iso) return "";
    const [a, m, d] = iso.split("-").map(Number);
    return `${d} de ${MESES[m - 1]}, ${a}`;
  }

  // "16:00", "17:45" -> "16h00 - 17h45"
  function formatarHorario(inicio, fim) {
    if (!inicio) return "";
    const f = (h) => h.replace(":", "h");
    return fim ? `${f(inicio)} - ${f(fim)}` : f(inicio);
  }

  // Procura um workshop pelo id
  function workshopPorId(dados, id) {
    return dados.workshops.find((w) => w.id === id);
  }

  // 73500 -> "73.500"
  function formatarNumero(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  // 73500 -> "73.500 Kz"
  function formatarKz(n) {
    return formatarNumero(n) + " Kz";
  }

  // Valor mínimo de contribuição de um workshop.
  // 0 = workshop gratuito (contribuição opcional).
  // Se o workshop não tiver "valorMinimo", usa o valor global de "pagamento".
  function valorMinimo(dados, w) {
    const proprio = w ? w.valorMinimo : undefined;
    if (proprio !== undefined && proprio !== null && proprio !== "") {
      const n = Number(proprio);
      if (!isNaN(n)) return Math.max(n, 0);
    }
    const global = Number((dados.pagamento || {}).valorMinimo);
    return isNaN(global) ? 500 : Math.max(global, 0);
  }

  // Estatísticas de género acumuladas (Passo 9).
  // Parte da base de 2025 (estatisticas.baseParticipacoes / baseMulheres) e soma
  // os workshops novos que tenham "mulheres" e "homens" preenchidos.
  // A percentagem global nunca é escrita à mão: calcula-se aqui.
  // Sem base no JSON, usa "percentagemMulheres" como alternativa.
  function numeroValido(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = Number(v);
    return isNaN(n) || n < 0 ? null : n;
  }

  function generoGlobal(dados) {
    const est = dados.estatisticas || {};
    const base = numeroValido(est.baseParticipacoes);
    const baseM = numeroValido(est.baseMulheres);

    // Alternativa: modelo antigo (percentagem fixa)
    if (base === null || baseM === null || base <= 0) {
      const m = Number(est.percentagemMulheres) || 0;
      return { mulheres: m, homens: 100 - m, totalBase: 0, totalNovos: 0 };
    }

    let totalM = baseM;
    let total = base;
    let novos = 0;
    (dados.workshops || []).forEach((w) => {
      const m = numeroValido(w.mulheres);
      const h = numeroValido(w.homens);
      if (m === null || h === null) return; // só conta se ambos estiverem preenchidos
      totalM += m;
      total += m + h;
      novos += m + h;
    });

    const pctM = total > 0 ? Math.round((totalM / total) * 100) : 0;
    return {
      mulheres: pctM,
      homens: 100 - pctM,
      totalBase: base,
      totalNovos: novos,
    };
  }

  // Calcula os totais da campanha e as estatísticas a partir dos workshops
  function resumo(dados) {
    const campanha = dados.campanha || {};
    const ws = dados.workshops || [];
    const genero = generoGlobal(dados);

    // Só conta o dinheiro dos workshops do lote activo, mais outros valores avulsos
    const arrecadado =
      ws
        .filter((w) => w.lote === campanha.loteActivo)
        .reduce((soma, w) => soma + (Number(w.arrecadado) || 0), 0) +
      (Number(campanha.outrosValores) || 0);

    const meta = Number(campanha.meta) || 0;
    const percentagem = meta > 0 ? Math.min((arrecadado / meta) * 100, 100) : 0;

    return {
      arrecadado,
      meta,
      percentagem,
      faltam: Math.max(meta - arrecadado, 0),
      participacoes: ws.reduce(
        (soma, w) => soma + (Number(w.participantes) || 0),
        0,
      ),
      workshopsRealizados: ws.filter((w) => Number(w.participantes) > 0).length,
      mulheres: genero.mulheres,
      homens: genero.homens,
    };
  }

  return {
    carregar,
    formatarData,
    formatarHorario,
    workshopPorId,
    formatarNumero,
    formatarKz,
    valorMinimo,
    resumo,
    generoGlobal,
  };
})();
