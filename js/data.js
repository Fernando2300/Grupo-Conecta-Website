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

  // Calcula os totais da campanha e as estatísticas a partir dos workshops
  function resumo(dados) {
    const campanha = dados.campanha || {};
    const ws = dados.workshops || [];
    const mulheres =
      Number((dados.estatisticas || {}).percentagemMulheres) || 0;

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
      mulheres,
      homens: 100 - mulheres,
    };
  }

  return {
    carregar,
    formatarData,
    formatarHorario,
    workshopPorId,
    formatarNumero,
    formatarKz,
    resumo,
  };
})();
