// Données initiales, écrites une seule fois par l'admin au premier lancement.

export const SEED_CMS = [
  { id: "LL", name: "Louis L'Etang" },
  { id: "JR", name: "Josselin Riou" },
  { id: "AP", name: "Alexandre Philippon" },
  { id: "GW", name: "Guillaume Wattier" },
  { id: "CC", name: "" },
  { id: "AB", name: "Aurélien Blaison" },
  { id: "TD", name: "Théo Dumoulin" },
];

const tiers = {
  1: ["Groupama", "FDJ United"],
  2: ["Districlos", "Wilier Triestina", "Julbo", "Miche", "Shimano", "Rukka"],
  3: ["BikeBotix", "Bioracer", "Continental", "Elite", "iGPSPORT", "L'Arbre Vert", "NST", "Pileje", "Prologo", "Technisom", "Winforce"],
  4: ["Compressport", "Cristaline", "JOLT", "Jura", "Méo", "Nature & Cie", "Panzani", "QM", "Ultrahuman"],
  5: ["Danielo", "GOWOD", "K-EDGE", "Poggio Solutions", "SKS", "Indiba"],
};
export const TIER_NAMES = {
  0: "Contexte",
  1: "Partenaires titres",
  2: "Partenaires officiels",
  3: "Fournisseurs officiels",
  4: "Fournisseurs",
  5: "Supporters",
};
const slug = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const SEED_LABELS = Object.entries(tiers).flatMap(([tier, names]) =>
  names.map((name) => ({ id: slug(name), name, tier: Number(tier) }))
);

const one = (name, date, teams) => ({ name, teams, start: date, end: date, grandTour: false, stages: [] });

export const SEED_RACES = [
  one("Europe U23 Route", "2026-10-02", ["Conti"]),
  one("Giro dell'Emilia", "2026-10-03", ["WT"]),
  one("Cholet Agglo Tour", "2026-10-03", ["WT"]),
  one("Piccolo Lombardia", "2026-10-03", ["Conti"]),
  one("Europe U19 Route", "2026-10-03", ["Juniors"]),
  one("Europe Route", "2026-10-04", ["WT"]),
  one("Tour de Vendée", "2026-10-04", ["WT"]),
  one("Coppa Agostoni", "2026-10-04", ["WT"]),
  one("Coppa Bernocchi", "2026-10-05", ["WT"]),
  one("Tre Valli Varesine", "2026-10-06", ["WT"]),
  one("Binche-Chimay-Binche", "2026-10-06", ["WT"]),
  one("Europe Relais mixte", "2026-10-06", ["WT"]),
  one("Europe U19 Relais mixte", "2026-10-06", ["Juniors"]),
  one("Europe CLM", "2026-10-07", ["WT"]),
  one("Europe U23 CLM", "2026-10-07", ["Conti"]),
  one("Europe U19 CLM", "2026-10-07", ["Juniors"]),
  one("Gran Piemonte", "2026-10-08", ["WT"]),
  one("Tour de Lombardie", "2026-10-10", ["WT"]),
  one("Paris-Tours", "2026-10-11", ["WT"]),
  one("Paris-Tours Espoirs", "2026-10-11", ["Conti"]),
  {
    name: "Tour of Guangxi",
    teams: ["WT"],
    start: "2026-10-13",
    end: "2026-10-18",
    grandTour: false,
    stages: [13, 14, 15, 16, 17, 18].map((d, i) => ({ date: `2026-10-${d}`, label: `Ét. ${i + 1}` })),
  },
  one("Giro del Veneto", "2026-10-14", ["WT"]),
  one("Veneto Gravel", "2026-10-16", ["WT"]),
  one("Chrono des Nations", "2026-10-18", ["WT", "Conti", "Juniors"]),
  one("Veneto Classic", "2026-10-18", ["WT"]),
];

// [JJ/MM, Nom]
export const SEED_BIRTHDAYS = [
  ["05/01", "Lefebvre"], ["06/01", "Pacher"], ["09/01", "Geniets"], ["18/01", "Bouyssou"], ["18/01", "Picard"],
  ["19/01", "Donnenwirth"], ["20/01", "Russo"], ["21/01", "R. Grégoire"], ["22/01", "Milan"], ["13/02", "B. Grégoire"],
  ["14/02", "Barthe"], ["25/02", "Alric-Thouvenin"], ["01/03", "Jacobs"], ["01/03", "Le Fur"], ["03/03", "Germani"],
  ["05/03", "Genter"], ["12/03", "Daumas"], ["29/03", "Tronchon"], ["14/04", "Clovis"], ["01/05", "Gruel"],
  ["06/05", "Kench"], ["14/05", "Blanc"], ["18/05", "Rochas"], ["30/05", "Paleni"], ["07/06", "Cushway"],
  ["09/06", "Martin-Guyonnet"], ["20/06", "Fontaine"], ["26/06", "Manion"], ["29/06", "Mortier"], ["12/07", "Madouas"],
  ["16/07", "Decomble"], ["02/08", "Berthet"], ["07/08", "Foucher"], ["10/08", "Cavagna"], ["13/08", "Rolland"],
  ["26/08", "Sagnier"], ["27/08", "Le Gac"], ["05/09", "Huens"], ["07/09", "Boulet"], ["17/09", "Molard"],
  ["19/09", "Ruesche"], ["10/10", "Gaudu"], ["12/10", "Dubois"], ["14/10", "Bower"], ["21/10", "Agnoletto"],
  ["27/10", "Loulergue"], ["08/11", "Braz Afonso"], ["10/11", "Costiou"], ["12/11", "LLon"], ["13/11", "Fahy"],
  ["21/12", "Roberts"], ["29/12", "Penhoët"],
].map(([dm, name]) => ({ day: dm, name }));

// Piges reprises du Google Sheet « Saison 2026 - VELOBS X GFC » (onglet Planning, colonnes CM / C / P / E)
export const SEED_PIGES = [
  ["2026-10-03", "premium", "JR"], ["2026-10-04", "premium", "JR"], ["2026-10-05", "premium", "AP"],
  ["2026-10-06", "premium", "LL"], ["2026-10-07", "classique", "LL"], ["2026-10-08", "premium", "LL"],
  ["2026-10-10", "premium", "LL"], ["2026-10-11", "premium", "LL"], ["2026-10-13", "premium", "JR"],
  ["2026-10-14", "premium", "LL"], ["2026-10-15", "premium", "JR"], ["2026-10-16", "premium", "JR"],
  ["2026-10-17", "premium", "JR"], ["2026-10-18", "classique", "JR"], ["2026-10-18", "premium", "LL"],
  // Jours sans C / P / E dans le Sheet = astreinte (heures à saisir après coup)
  ["2026-09-25", "classique", "AP"], ["2026-09-26", "classique", "LL"], ["2026-09-27", "premium", "LL"],
  ...astreintes(["2026-09-24", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-09", "2026-10-12"], ["2026-10-19", "2026-12-31"]),
].map(([date, type, cm]) => ({ date, type, cm }));

function astreintes(days, [from, to]) {
  const out = days.map((d) => [d, "astreinte", "AP"]);
  const d = new Date(from + "T12:00:00");
  const end = new Date(to + "T12:00:00");
  for (; d <= end; d.setDate(d.getDate() + 1)) {
    out.push([`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, "astreinte", "AP"]);
  }
  return out;
}

// Courses du 24 au 27/09/2026 (ajoutées après l'import initial)
export const SEED_RACES_EXTRA = [
  one("Mondial U23 (Loulergue, Roberts)", "2026-09-25", ["Conti"]),
  one("Paris-Chalette-Vierzon", "2026-09-26", ["Conti"]),
  one("Paris-Chauny", "2026-09-27", ["WT"]),
  one("Prix des Vendanges", "2026-09-27", ["Conti"]),
];
