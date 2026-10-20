/* =============================================================================
   Lexique du metier : correction des fautes de frappe et proposition de famille.
   -----------------------------------------------------------------------------
   Deux usages, un seul dictionnaire :
     - famillePour(nom)      : "ventilo convecteur" -> CVC, "dalle led" -> ECL
     - corriger(mot)         : "cofret" -> "coffret", "disjoncteur" inchange
   Regle de conduite : on PROPOSE, on n'impose jamais. Une proposition refusee
   laisse la saisie telle quelle, et la valeur apprise entre dans le lexique.
   ============================================================================= */

/* mot cle (ou radical) -> famille. L'ordre n'importe pas : on cherche le
   radical le plus long d'abord, pour que "ventilo-convecteur" ne tombe pas sur
   "vent". */
const LEXIQUE_FAMILLES = [
  ['ventilo', 'CVC'], ['convecteur', 'CVC'], ['split', 'CVC'], ['clim', 'CVC'],
  ['chaudiere', 'CVC'], ['pompe a chaleur', 'CVC'], ['pac', 'CVC'], ['vmc', 'CVC'],
  ['radiateur', 'CVC'], ['ventilation', 'CVC'], ['extracteur', 'CVC'], ['gaine', 'CVC'],
  ['bruleur', 'GAZ'], ['compteur gaz', 'GAZ'], ['detendeur', 'GAZ'], ['chaufferie', 'GAZ'],
  ['dalle', 'ECL'], ['luminaire', 'ECL'], ['projecteur', 'ECL'], ['hublot', 'ECL'],
  ['spot', 'ECL'], ['reglette', 'ECL'], ['enseigne', 'ECL'], ['eclairage', 'ECL'],
  ['armoire', 'CFO'], ['tableau', 'CFO'], ['coffret', 'CFO'], ['disjoncteur', 'CFO'],
  ['interrupteur', 'CFO'], ['prise', 'CFO'], ['jeu de barres', 'CFO'], ['compteur', 'CFO'],
  ['centrale', 'SSI'], ['detecteur', 'SSI'], ['declencheur', 'SSI'], ['desenfumage', 'SSI'],
  ['extincteur', 'SSI'], ['ria', 'SSI'], ['sprinkler', 'SSI'],
  ['camera', 'SUR'], ['badge', 'SUR'], ['controle acces', 'SUR'], ['alarme', 'SUR'],
  ['wc', 'SAN'], ['lavabo', 'SAN'], ['robinet', 'SAN'], ['ballon', 'SAN'],
  ['pompe de relevage', 'SAN'], ['sanitaire', 'SAN'],
  ['chambre froide', 'FRO'], ['vitrine', 'FRO'], ['groupe froid', 'FRO'],
  ['four', 'CUI'], ['plaque', 'CUI'], ['hotte', 'CUI'], ['friteuse', 'CUI'],
  ['ascenseur', 'ASC'], ['monte-charge', 'ASC'], ['escalier mecanique', 'ASC'],
  ['porte', 'MEN'], ['fenetre', 'MEN'], ['serrure', 'MEN'], ['rideau', 'MEN'],
  ['mobilier', 'AGT'], ['cloison', 'AGT'], ['faux plafond', 'AGT'], ['peinture', 'AGT'],
  ['cablage', 'CFA'], ['reseau', 'CFA'], ['telephone', 'CFA'], ['interphonie', 'CFA'],
  ['baie', 'CFA'], ['fibre', 'CFA'], ['rj45', 'CFA']
];

/* vocabulaire courant du metier, pour la correction des fautes */
const LEXIQUE_MOTS = LEXIQUE_FAMILLES.map(p => p[0]).concat([
  'ventilo-convecteur', 'coffret', 'tableau divisionnaire', 'disjoncteur differentiel',
  'interrupteur', 'prise de courant', 'prise usb', 'eclairage de securite',
  'detecteur optique', 'declencheur manuel', 'rideau metallique', 'porte coupe-feu',
  'chambre froide', 'groupe froid', 'pompe de relevage', 'ballon eau chaude',
  'secteur', 'localisation', 'sanitaires', 'salle de bain', 'placard technique',
  'local menage', 'loge', 'administration', 'accueil', 'reserve', 'sous-sol', 'toiture'
]);

/* ---------------------------------------------------------------- utilitaires */

function normaliser(texte) {
  return String(texte || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** distance de Levenshtein, bornee : au dela de 3 on abandonne */
function distance(a, b) {
  if (a === b) { return 0; }
  if (Math.abs(a.length - b.length) > 3) { return 99; }
  const avant = new Array(b.length + 1);
  const courant = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) { avant[j] = j; }
  for (let i = 1; i <= a.length; i++) {
    courant[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      courant[j] = Math.min(courant[j - 1] + 1, avant[j] + 1, avant[j - 1] + cout);
    }
    for (let j = 0; j <= b.length; j++) { avant[j] = courant[j]; }
  }
  return avant[b.length];
}

/** le mot ressemble-t-il assez pour qu'on en parle ? */
function seuilPour(mot) {
  if (mot.length <= 4) { return 0; }      /* trop court : on ne propose rien */
  if (mot.length <= 6) { return 1; }
  return 2;
}

/* ------------------------------------------------------- proposition de famille */

function famillePour(nom) {
  const texte = normaliser(nom);
  if (!texte) { return null; }
  let meilleur = null;
  let longueur = 0;
  LEXIQUE_FAMILLES.forEach(([mot, famille]) => {
    if (mot.length > longueur && texte.indexOf(mot) >= 0) {
      meilleur = famille;
      longueur = mot.length;
    }
  });
  return meilleur;
}

/* --------------------------------------------------------------- correction */

/** rend {propose, mot, distance} ou null si rien de convaincant */
function correctionPour(saisie, connus) {
  const mot = normaliser(saisie);
  if (!mot || mot.length < 4) { return null; }
  const dictionnaire = (connus || []).concat(LEXIQUE_MOTS)
    .map(m => ({brut: m, normalise: normaliser(m)}))
    .filter(m => m.normalise);
  if (dictionnaire.some(m => m.normalise === mot)) { return null; }   /* deja bon */

  const seuil = seuilPour(mot);
  let meilleur = null;
  dictionnaire.forEach(m => {
    const d = distance(mot, m.normalise);
    if (d > 0 && d <= seuil && (!meilleur || d < meilleur.distance)) {
      meilleur = {propose: m.brut, distance: d};
    }
  });
  return meilleur;
}
