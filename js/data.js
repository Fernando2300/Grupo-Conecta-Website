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

  return { carregar, formatarData, formatarHorario, workshopPorId };
})();
