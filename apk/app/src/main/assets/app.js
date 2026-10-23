/* =============================================================================
   Couche application de l'APK GEMAYA
   -----------------------------------------------------------------------------
   Ce fichier n'existe que dans l'application Android : la maquette HTML reste
   la maquette de revue, il ne s'y superpose pas dans le navigateur.
   Il apporte ce qui manque a une demonstration pour qu'elle serve vraiment :
     1. une base SQLite locale (pont natif), donc plus rien ne se perd ;
     2. la photo reelle, prise avec l'appareil ou importee du telephone ;
     3. la lecture de plaque par une API de vision, avec sa cle en configuration ;
     4. les corrections dictées : quantite conservee, champs tous visibles,
        retour en haut de la section apres creation d'un equipement.
   Les fonctions de la maquette sont surchargees ici, volontairement : le fichier
   de maquette reste lisible pour la revue, la logique d'application vit ici.
   ============================================================================= */

const PONT = window.Gemaya || null;          /* ponts natifs, absents au navigateur */
const LS = 'gemaya.edl.v1';

/* la taxonomie vit dans la maquette (maquettes-edl-v2.html) : un seul endroit */
/* Proposee par metier, a valider : codes courts, un libelle lisible. */


/* --------------------------------------------------------------- etat en memoire */
let configIA = {fournisseur: 'deepseek', modele: 'deepseek-chat', base: '', cle: (window.CLE_DEFAUT || ''), majUrl: (window.MAJ_URL_DEFAUT || ''), code: '1234', inventaireImporte: false};
let photosFiche = {plaque: null, ensemble: null, detail: null};   /* {chemin,dataUrl,sha256...} */
let idFiche = '';                                                 /* fiche en cours d'edition */

/* --------------------------------------------------------------------- stockage */
/* ce qui reste a ecrire : on ne reecrit plus toute la base a chaque geste */
let listesSales = false;
const fichesModifiees = new Set();
const photosAecrire = [];

function instantane() {
  return {
    contrats: contrats,
    secteurs: secteurs,
    localisations: localisations,
    niveaux: niveaux,
    familles: familles,
    designations: designations.map(d => ({famille: d.famille, libelle: d.libelle})),
    fiches: equipements,
    config: {
      contrat: contratChoisi,
      mode: modeVisite,
      ia: configIA,
      derniers: {secteur: dernierSecteur, localisation: derniereLoc, niveau: dernierNiveau}
    }
  };
}

/* les listes seules : quelques dizaines de lignes, pas les milliers de fiches */
function instantaneListes() {
  const tout = instantane();
  delete tout.fiches;
  return tout;
}

function sauvegarder() {
  try {
    if (!PONT || !PONT.sauverFiche) {
      localStorage.setItem(LS, JSON.stringify(instantane()));
      return;
    }
    if (listesSales) {
      PONT.sauverListes(JSON.stringify(instantaneListes()));
      listesSales = false;
    }
    photosAecrire.splice(0).forEach(p => PONT.sauverPhoto(JSON.stringify(p)));
    fichesModifiees.forEach(id => {
      const fiche = equipements.find(e => e.id === id);
      if (fiche) { PONT.sauverFiche(JSON.stringify(fiche)); }
      else { PONT.supprimerFiche(id); }
    });
    fichesModifiees.clear();
  } catch (e) {
    toast('Enregistrement impossible : ' + e);
  }
}

function chargerEtat() {
  let brut = null;
  try {
    if (PONT && PONT.charger) { brut = PONT.charger(); }
    else { brut = localStorage.getItem(LS); }
  } catch (e) { brut = null; }
  if (!brut) { return false; }
  let d;
  try { d = JSON.parse(brut); } catch (e) { return false; }

  if (Array.isArray(d.contrats) && d.contrats.length) { contrats = d.contrats; }
  if (Array.isArray(d.secteurs)) { secteurs = d.secteurs; }
  if (Array.isArray(d.localisations)) { localisations = d.localisations; }
  if (Array.isArray(d.niveaux)) { niveaux = d.niveaux; }
  if (Array.isArray(d.familles) && d.familles.length) { familles = d.familles; }
  if (Array.isArray(d.designations)) {
    designations.length = 0;
    d.designations.forEach(x => designations.push({famille: x.famille, libelle: x.libelle}));
  }
  if (Array.isArray(d.fiches)) {
    equipements.length = 0;
    d.fiches.forEach(f => equipements.push(f));
  }
  const c = d.config || {};
  if (c.contrat) { contratChoisi = c.contrat; }
  if (c.mode) { modeVisite = c.mode; }
  if (c.ia) { configIA = Object.assign({fournisseur: 'deepseek', modele: 'deepseek-chat', base: '', cle: '', majUrl: (window.MAJ_URL_DEFAUT || ''), code: '1234', inventaireImporte: false}, c.ia); }
  if (!configIA.cle && window.CLE_DEFAUT) { configIA.cle = window.CLE_DEFAUT; }
  if (!configIA.majUrl && window.MAJ_URL_DEFAUT) { configIA.majUrl = window.MAJ_URL_DEFAUT; }
  const der = c.derniers || {};
  dernierSecteur = der.secteur || dernierSecteur;
  derniereLoc = der.localisation || derniereLoc;
  dernierNiveau = der.niveau || dernierNiveau;
  return true;
}

/* ---------------------------------------------------------------- demarrage */
function demarrer() {
  const deja = chargerEtat();
  fichesModifiees.clear();
  photosAecrire.length = 0;
  listesSales = false;
  const selContrat = document.getElementById('select-contrat');
  if (selContrat) { remplirContrats(); }
  construireFamilles();
  construireSelects();
  construireDesignations();
  majArbre();
  majCompteurs();
  remplirConfigApp();
  if (deja) { toast('Donnees locales rechargees : ' + equipements.length + ' equipement(s)'); }

  /* premiere ouverture : l'inventaire de depart est deja dedans */
  /* base vide : l'inventaire livre reprend sa place, meme si un ancien
     enregistrement prétendait l'avoir deja importe */
  if (!equipements.length && window.INVENTAIRE_INITIAL) {
    window.importRecu(window.INVENTAIRE_INITIAL, true);
    configIA.inventaireImporte = true;
    listesSales = true;
    sauvegarder();
    toast(equipements.length + ' equipements de l\'inventaire initial charges');
  }
}

/* ----------------------------------------------------------------- familles */
function construireFamilles() {
  const ajoutees = TAXONOMIE.map(t => t[0]).filter(c => familles.indexOf(c) < 0);
  if (ajoutees.length) { familles = familles.concat(ajoutees); }
  const sel = document.getElementById('famille-nouvel-equipement');
  if (sel) {
    const garde = sel.value;
    sel.innerHTML = TAXONOMIE
      .filter(t => familles.indexOf(t[0]) >= 0)
      .map(t => '<option value="' + t[0] + '">' + t[0] + ' - ' + t[1] + '</option>')
      .join('');
    if (garde) { sel.value = garde; }
  }
  majAideFamille();
}

/* le rappel sous le selecteur : a quoi sert la famille choisie */
function majAideFamille() {
  const sel = document.getElementById('famille-nouvel-equipement');
  const aide = document.getElementById('aide-famille');
  if (!sel || !aide) { return; }
  const d = (typeof descriptionFamille === 'function') ? descriptionFamille(sel.value) : {libelle: '', exemples: ''};
  const prefixe = familleProposee ? 'Famille proposee d\'apres le nom - ' : '';
  aide.textContent = d.libelle ? prefixe + d.libelle + ' : ' + d.exemples : '';
}

/* ----------------------------------------------------------------- contrats */
function remplirContrats() {
  const sel = document.getElementById('select-contrat');
  if (!sel) { return; }
  sel.innerHTML = contrats.map(c => '<option value="' + c + '"' + (c === contratChoisi ? ' selected' : '') + '>' + c + '</option>').join('');
}

/* -------------------------------------------------------------- compteurs */
function majCompteurs() {
  const nbPhotos = equipements.reduce((t, e) =>
    t + (e.photos ? (e.photos.plaque ? 1 : 0) + (e.photos.ensemble ? 1 : 0) + (e.photos.detail ? 1 : 0) : 0), 0);
  const poser = (id, v) => { const el = document.getElementById(id); if (el) { el.textContent = v; } };
  poser('compteur-releves', equipements.length);
  poser('compteur-photos', nbPhotos);
  poser('compteur-poids', (nbPhotos * 0.45).toFixed(1) + ' Mo');
  const barre = document.getElementById('barre-avancement');
  if (barre) { barre.style.width = Math.min(100, equipements.length * 4) + '%'; }
}

/* ============================================================== les photos */

function prendrePhoto(role) {
  if (PONT && PONT.photo) {
    PONT.photo(role);                 /* le natif rappelle photoRecue() */
    return;
  }
  /* au navigateur : simple selecteur de fichier */
  const champ = document.createElement('input');
  champ.type = 'file';
  champ.accept = 'image/*';
  champ.onchange = () => {
    const fichier = champ.files && champ.files[0];
    if (!fichier) { return; }
    const lecteur = new FileReader();
    lecteur.onload = () => photoRecue(role, JSON.stringify({ok: true, dataUrl: lecteur.result, chemin: fichier.name}));
    lecteur.readAsDataURL(fichier);
  };
  champ.click();
}

/* Appelee par Java apres la prise de vue ou l'import. */
window.photoRecue = function (role, json) {
  let r;
  try { r = JSON.parse(json); } catch (e) { toast('Photo illisible'); return; }
  if (!r.ok) { toast(r.message || 'Photo annulee'); return; }
  /* l'image reste en memoire pour l'apercu ; c'est le binaire qui part en base */
  if (r.dataUrl) { r.base64 = r.dataUrl.substring(r.dataUrl.indexOf(',') + 1); }
  if (r.vignette) { r.vignetteB64 = r.vignette.substring(r.vignette.indexOf(',') + 1); }
  if (role === 'plaque') {
    photoPlaque = true;
    photosFiche.plaque = r;
  } else {
    photosAutres[role] = true;
    photosFiche[role] = r;
  }
  majSlots();
  const bouton = document.getElementById('bouton-lire');
  if (bouton) {
    bouton.disabled = !photoPlaque;
    bouton.style.opacity = photoPlaque ? '1' : '.45';
  }
  ecran('fiche');
  toast('Photo enregistree (' + Math.round((r.octets || 0) / 1024) + ' Ko)');
};

function majSlots() {
  const faire = (role, prise) => {
    const slot = document.getElementById('slot-' + role);
    if (!slot) { return; }
    const p = photosFiche[role];
    slot.className = prise ? 'photo-slot prise' : 'photo-slot';
    slot.innerHTML = prise && p && (p.dataUrl || p.vignette)
      ? '<img src="' + (p.dataUrl || p.vignette) + '" alt="' + role + '"><span class="etiquette">' + role + '</span>'
      : (prise ? '<span class="pict">&#10003;</span>' : '<span class="pict">&#43;</span>') + role;
  };
  faire('plaque', photoPlaque);
  faire('ensemble', photosAutres.ensemble);
  faire('detail', photosAutres.detail);
}

function photoPrise() { prendrePhoto('plaque'); }
function photoAutre(nom) { prendrePhoto(nom); }

/* ========================================================= lecture de plaque */

function lirePhoto() {
  if (!photoPlaque || !photosFiche.plaque) { toast("Prends d'abord la photo de la plaque"); return; }
  if (!configIA.cle) {
    toast('Renseigne la cle API dans Configuration, onglet Intelligence artificielle');
    ecran('config');
    return;
  }
  const bandeau = document.getElementById('bandeau-lecture');
  bandeau.classList.add('actif');
  bandeau.textContent = 'Lecture de la plaque en cours... (' + configIA.fournisseur + ' / ' + configIA.modele + ')';
  document.getElementById('bouton-lire').disabled = true;
  document.getElementById('resultat-lecture').classList.add('cache');

  const demande = {
    fournisseur: configIA.fournisseur,
    modele: configIA.modele,
    base: configIA.base,
    cle: configIA.cle,
    image: photosFiche.plaque.dataUrl,
    consigne: "Tu lis la plaque signaletique d'un equipement technique de batiment. " +
      "Reponds UNIQUEMENT par un objet JSON, sans texte autour, avec les cles : " +
      "marque, type, reference, numero_serie, gaz, puissance, debit, annee, " +
      "et confiance (objet avec les memes cles, valeur 0 a 100). " +
      "Si une information n'est pas lisible, mets une chaine vide et une confiance a 0."
  };

  if (PONT && PONT.lecture) {
    PONT.lecture(JSON.stringify(demande));       /* le natif rappelle lectureRecue() */
  } else {
    setTimeout(() => lectureRecue(JSON.stringify({ok: false, erreur: 'La lecture necessite l\'application Android.'})), 300);
  }
}

/* Appelee par Java avec la reponse brute du modele. */
window.lectureRecue = function (json) {
  const bandeau = document.getElementById('bandeau-lecture');
  const bouton = document.getElementById('bouton-lire');
  bandeau.classList.remove('actif');
  bouton.disabled = false;
  let r;
  try { r = JSON.parse(json); } catch (e) { toast('Reponse illisible'); return; }
  if (!r.ok) { toast(r.erreur || 'Lecture impossible'); return; }

  const donnees = extraireJSON(r.texte);
  if (!donnees) {
    toast('Le modele n\'a pas rendu un JSON exploitable');
    return;
  }
  appliquerLecture(donnees);
};

function extraireJSON(texte) {
  if (!texte) { return null; }
  const nettoye = String(texte).replace(/```json/gi, '').replace(/```/g, '').trim();
  const debut = nettoye.indexOf('{');
  const fin = nettoye.lastIndexOf('}');
  if (debut < 0 || fin <= debut) { return null; }
  try { return JSON.parse(nettoye.slice(debut, fin + 1)); } catch (e) { return null; }
}

function appliquerLecture(d) {
  const champs = document.querySelectorAll('#champs-dynamiques .saisie');
  const conf = d.confiance || {};
  const poser = (index, valeur, cle) => {
    if (valeur === undefined || valeur === null || valeur === '') { return; }
    if (!champs[index]) { return; }
    champs[index].value = valeur;
    const bloc = champs[index].closest('.bloc-champ');
    const badge = bloc ? bloc.querySelector('.etat-ia') : null;
    if (badge) {
      const note = conf[cle];
      badge.textContent = note ? 'IA ' + Math.round(note) + ' %' : 'IA';
      badge.classList.remove('cache');
      badge.classList.toggle('faible', note !== undefined && note < 60);
    }
  };
  poser(0, d.marque, 'marque');
  poser(1, d.reference, 'reference');
  poser(2, d.numero_serie, 'numero_serie');
  poser(3, d.puissance, 'puissance');
  poser(5, d.debit, 'debit');
  poser(6, d.gaz, 'gaz');
  poser(7, d.type, 'type');
  champs[15] && d.annee && (champs[15].value = d.annee);

  if (d.type) {
    const cle = ajouterDesignation(familleChoisie || 'DIVERS', d.type);
    construireDesignations();
    const sel = document.getElementById('select-designation');
    if (sel) { sel.value = cle; }
    familleChoisie = (familleChoisie || 'DIVERS');
    majBadgeEquipement();
  }
  document.getElementById('resultat-lecture').classList.remove('cache');
  document.querySelector('#resultat-lecture b').textContent = 'Informations proposees par la lecture.';
  appliquerType(true);
  toast('Lecture terminee : verifie chaque champ avant d\'enregistrer');
}

/* ===================================================== champs : tous visibles */
/* Consigne du 19/10 : a la creation d'un equipement, tous les champs de la fiche
   apparaissent, et la fiche se replace en haut de la section. */
function appliquerType(depuisLecture) {
  document.querySelectorAll('.bloc-champ').forEach(bloc => {
    const liste = (bloc.getAttribute('data-fam') || '').split(' ');
    const sienne = familleChoisie && liste.indexOf(familleChoisie) >= 0;
    bloc.style.display = '';
    bloc.classList.toggle('de-la-famille', !!sienne);
  });
  const aide = document.getElementById('aide-type');
  if (aide) {
    aide.textContent = familleChoisie
      ? 'Tous les champs sont affiches. Ceux de la famille ' + familleChoisie + ' sont encadres : renseigne ce que tu as, laisse vide le reste.'
      : 'Tous les champs sont affiches : choisis l equipement pour mettre en avant ceux de sa famille.';
  }
}

function hautDeSection() {
  const corps = document.querySelector('#e-fiche .app-corps');
  const cible = document.getElementById('champs-dynamiques');
  if (!corps) { return; }
  corps.scrollTop = cible ? cible.offsetTop - 12 : 0;
}

/* ----------------------------------------------------- creation d'equipement */
function creerEquipement() {
  const selFamille = document.getElementById('famille-nouvel-equipement');
  const famille = selFamille.value;
  const champ = document.getElementById('nom-nouvel-equipement');
  const nom = champ.value.trim();
  if (!nom) { toast('Saisis le nom du nouvel equipement'); return; }
  const nombre = (document.getElementById('nombre-nouvel-equipement').value || '').trim();
  const existait = designations.some(d => d.famille === famille && d.libelle.toLowerCase() === nom.toLowerCase());
  const cle = ajouterDesignation(famille, nom);
  champ.value = '';
  construireDesignations();
  document.getElementById('select-designation').value = cle;
  familleChoisie = famille;
  majBadgeEquipement();
  appliquerType(false);
  const quantite = document.getElementById('champ-quantite');
  if (quantite && nombre) { quantite.value = nombre; }
  document.getElementById('nombre-nouvel-equipement').value = '';
  majAideFamille();
  listesSales = true;
  sauvegarder();
  hautDeSection();                       /* on remonte au debut de la section */
  toast(existait ? nom + ' existait deja : il est pris en charge' : nom + ' pris en charge : renseigne ses champs');
}

/* --------------------------------------------------------------- enregistrer */
function enregistrerReleve() {
  const s = document.getElementById('sel-secteur').value;
  const n = document.getElementById('sel-niveau').value;
  const l = document.getElementById('sel-loc').value;
  if (!s || s === CREER) { toast("Cree ou choisis d'abord le secteur"); return; }
  if (!l || l === CREER) { toast("Cree ou choisis d'abord la localisation"); return; }
  if (!n || n === CREER) { toast("Cree ou choisis d'abord l'etage ou le niveau"); return; }
  const selEquipement = document.getElementById('select-designation');
  if (!selEquipement.value || selEquipement.value === CREER) {
    toast("Choisis l'equipement deja cree, ou cree-le avec le bouton Creer");
    return;
  }
  const designation = selEquipement.value.split('|')[1];
  if (!etatChoisi) { toast("Indique l'etat de l'equipement, en bas de la fiche"); return; }
  const blocAnomalie = document.querySelector('.anomalie[aria-pressed="true"]');
  if (etatChoisi === 'hors' && !blocAnomalie) {
    toast("Hors service : precise aussi le delai d'intervention (A ou B)");
    return;
  }

  const valeurs = [];
  document.querySelectorAll('#champs-dynamiques .saisie').forEach(c => valeurs.push(c.value));
  const maintenant = new Date().toISOString();
  const quantite = valeurs[INDEX_QUANTITE] || '';
  const ancienne = indexEdition >= 0 ? equipements[indexEdition] : null;

  const fiche = {
    id: ancienne && ancienne.id ? ancienne.id : 'F' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    secteur: s,
    niveau: n,
    loc: l,
    sousloc: (document.getElementById('champ-sousloc') || {}).value || '',
    famille: familleChoisie,
    designation: designation,
    etat: etatChoisi,
    anomalie: blocAnomalie ? blocAnomalie.getAttribute('data-niv') : '',
    marque: valeurs[0] || '',
    quantite: quantite,
    valeurs: valeurs,
    photoPlaque: photoPlaque,
    photos: {
      plaque: photoPlaque, ensemble: photosAutres.ensemble, detail: photosAutres.detail
    },
    fichiers: {},
    visite: modeVisite,
    contrat: contratChoisi,
    modifie_le: maintenant,
    cree_le: ancienne && ancienne.cree_le ? ancienne.cree_le : maintenant
  };

  /* les photos de cette fiche partent en base au meme moment */
  ['plaque', 'ensemble', 'detail'].forEach(role => {
    const p = photosFiche[role];
    if (!p || !p.base64) { return; }
    photosAecrire.push({
      fiche_id: fiche.id,
      role: role,
      base64: p.base64,
      mime: 'image/jpeg',
      octets: p.octets || 0,
      sha256: p.sha256 || '',
      largeur: p.largeur || 0,
      hauteur: p.hauteur || 0,
      prise_le: new Date().toISOString(),
      vignette: p.vignetteB64 || ''
    });
  });
  fichesModifiees.add(fiche.id);

  let message;
  if (indexEdition >= 0) {
    equipements[indexEdition] = fiche;
    message = 'Equipement modifie : ' + libelleEquipement(fiche);
  } else {
    equipements.push(fiche);
    message = 'Releve enregistre : ' + n + ' / ' + l + (quantite ? ' - quantite ' + quantite : '');
  }
  dernierSecteur = s;
  dernierNiveau = n;
  derniereLoc = l;
  indexEdition = -1;
  idFiche = '';
  photosFiche = {plaque: null, ensemble: null, detail: null};

  majCompteurs();
  majArbre();
  sauvegarder();
  ecran('zones');
  toast(message);
}

/* ------------------------------------------- reouverture : tout doit revenir */
function ouvreEquipement(i) {
  const e = equipements[i];
  if (!e) { return; }
  indexEdition = i;
  idFiche = e.id || '';
  construireSelects();
  document.getElementById('sel-secteur').value = e.secteur;
  document.getElementById('sel-niveau').value = e.niveau;
  document.getElementById('sel-loc').value = e.loc;
  const sousLoc = document.getElementById('champ-sousloc');
  if (sousLoc) { sousLoc.value = e.sousloc || ''; }
  majBadgesPaire();
  const cleEquipement = ajouterDesignation(e.famille || 'DIVERS', e.designation || '');
  construireDesignations();
  document.getElementById('select-designation').value = cleEquipement;
  familleChoisie = e.famille || '';
  majBadgeEquipement();
  appliquerType(false);
  document.querySelectorAll('#champs-dynamiques .saisie').forEach((c, k) => {
    c.value = (e.valeurs && e.valeurs[k] !== undefined) ? e.valeurs[k] : '';
  });
  const quantite = document.getElementById('champ-quantite');
  if (quantite) { quantite.value = e.quantite || (e.valeurs ? e.valeurs[INDEX_QUANTITE] || '' : ''); }

  photoPlaque = !!(e.photos && e.photos.plaque);
  photosAutres = {ensemble: !!(e.photos && e.photos.ensemble), detail: !!(e.photos && e.photos.detail)};
  photosFiche = {plaque: null, ensemble: null, detail: null};
  /* les images vivent en base : on ne charge que les vignettes de cette fiche */
  if (PONT && PONT.photosDeFiche && e.id) {
    try {
      const recu = JSON.parse(PONT.photosDeFiche(e.id));
      if (recu && recu.photos) {
        ['plaque', 'ensemble', 'detail'].forEach(role => {
          if (recu.photos[role]) { photosFiche[role] = recu.photos[role]; }
        });
      }
    } catch (err) { /* fiche sans photo : elle s'ouvre quand meme */ }
  }
  majSlots();

  const bouton = document.getElementById('bouton-lire');
  bouton.disabled = !photoPlaque;
  bouton.style.opacity = photoPlaque ? '1' : '.45';
  document.getElementById('bandeau-lecture').classList.remove('actif');
  document.getElementById('resultat-lecture').classList.add('cache');
  document.querySelectorAll('.etat-bouton').forEach(b => b.setAttribute('aria-pressed', 'false'));
  const boutonEtat = document.querySelector('.etat-bouton[data-etat="' + (e.etat || '') + '"]');
  if (boutonEtat) { boutonEtat.setAttribute('aria-pressed', 'true'); }
  etatChoisi = e.etat || '';
  majBadgeEtat();
  document.querySelectorAll('.anomalie').forEach(a => a.setAttribute('aria-pressed', a.getAttribute('data-niv') === e.anomalie ? 'true' : 'false'));
  document.getElementById('titre-fiche').textContent = "Modifier l'equipement";
  document.getElementById('bouton-enregistrer').textContent = 'Enregistrer les modifications';
  ecran('fiche');
  hautDeSection();
  toast('Equipement rouvert : corrige ce qu\'il faut puis enregistre');
}

/* ------------------------------------------------------- nouvel equipement */
function nouvelEquipement(niveau, secteur, localisation) {
  photoPlaque = false;
  photosAutres = {ensemble: false, detail: false};
  photosFiche = {plaque: null, ensemble: null, detail: null};
  majSlots();
  const bouton = document.getElementById('bouton-lire');
  bouton.disabled = true;
  bouton.style.opacity = '.45';
  document.querySelectorAll('#champs-dynamiques .saisie').forEach(c => { c.value = ''; });
  const sousLocNeuve = document.getElementById('champ-sousloc');
  if (sousLocNeuve) { sousLocNeuve.value = ''; }
  const nomNouvel = document.getElementById('nom-nouvel-equipement');
  if (nomNouvel) { nomNouvel.value = ''; }
  const nombreNouvel = document.getElementById('nombre-nouvel-equipement');
  if (nombreNouvel) { nombreNouvel.value = ''; }
  document.querySelectorAll('.etat-ia').forEach(b => { b.textContent = 'IA'; b.classList.add('cache'); });
  document.getElementById('resultat-lecture').classList.add('cache');
  document.getElementById('bandeau-lecture').classList.remove('actif');
  document.querySelectorAll('.anomalie').forEach(a => a.setAttribute('aria-pressed', 'false'));
  document.querySelectorAll('.etat-bouton').forEach(b => b.setAttribute('aria-pressed', 'false'));
  etatChoisi = '';
  majBadgeEtat();
  familleProposee = false;
  indexEdition = -1;
  idFiche = '';
  document.getElementById('titre-fiche').textContent = 'Nouvel equipement';
  document.getElementById('bouton-enregistrer').textContent = 'Enregistrer le releve';
  familleChoisie = '';
  construireDesignations();
  document.getElementById('select-designation').value = '';
  majBadgeEquipement();
  appliquerType(false);
  construireSelects();
  document.getElementById('sel-secteur').value = secteur || dernierSecteur || '';
  document.getElementById('sel-loc').value = localisation || derniereLoc || '';
  document.getElementById('sel-niveau').value = niveau || dernierNiveau || '';
  majBadgesPaire();
  ecran('fiche');
  hautDeSection();
}

/* =============================================== configuration : IA et donnees */
function remplirConfigApp() {
  const poser = (id, v) => { const el = document.getElementById(id); if (el) { el.value = v === undefined || v === null ? '' : v; } };
  poser('ia-fournisseur', configIA.fournisseur);
  poser('ia-modele', configIA.modele);
  poser('ia-base', configIA.base);
  poser('ia-cle', configIA.cle);
  poser('maj-url', configIA.majUrl || '');
  const etatMaj = document.getElementById('maj-etat');
  if (etatMaj) { etatMaj.textContent = 'Version installee : ' + versionInstallee().nom; }
  const etatCle = document.getElementById('etat-cle');
  if (etatCle) {
    etatCle.textContent = configIA.cle
      ? 'Cle presente (' + String(configIA.cle).slice(0, 6) + '...' + String(configIA.cle).slice(-4) + ', ' + String(configIA.cle).length + ' caracteres)'
      : 'Aucune cle : la lecture de plaque ne peut pas fonctionner';
  }
  chargerDocuments();
  const info = document.getElementById('info-donnees');
  if (info) {
    let texte = equipements.length + ' equipement(s) enregistre(s) sur ce telephone.';
    if (PONT && PONT.info) {
      try {
        const i = JSON.parse(PONT.info());
        texte = i.fiches + ' equipement(s), ' + i.photos + ' photo(s) - ' + i.chemin + ' (' + i.octets + ' octets)';
      } catch (e) { /* on garde le texte simple */ }
    }
    info.textContent = texte;
  }
}

function choisirFournisseur() {
  const f = document.getElementById('ia-fournisseur').value;
  const modeles = {
    gemini: 'gemini-2.5-flash',
    openai: 'gpt-4o-mini',
    mistral: 'pixtral-12b-2409',
    deepseek: 'deepseek-chat',
    autre: ''
  };
  const champ = document.getElementById('ia-modele');
  if (champ && modeles[f] !== undefined) { champ.value = modeles[f]; }
}

function enregistrerConfigApp() {
  const saisieCle = (document.getElementById('ia-cle').value || '').trim();
  configIA = Object.assign({}, configIA, {
    fournisseur: document.getElementById('ia-fournisseur').value,
    modele: document.getElementById('ia-modele').value.trim(),
    base: document.getElementById('ia-base').value.trim(),
    /* un champ laisse vide ne doit jamais effacer la cle deja en place */
    cle: saisieCle || configIA.cle
  });
  sauvegarder();
  remplirConfigApp();
  toast('Configuration enregistree sur ce telephone');
}

function testerLecture() {
  if (!configIA.cle) { toast("Renseigne d'abord la cle API"); return; }
  if (!photosFiche.plaque) { toast('Ouvre une fiche avec une photo de plaque pour tester'); return; }
  lirePhoto();
}

/* ---------------------------------------------------------- export CSV + mail */
function nomFichierCSV() {
  const jour = new Date().toISOString().slice(0, 10);
  const contrat = (contratChoisi || 'VISITE').replace(/[^A-Za-z0-9]+/g, '-');
  return 'EDL_GEMAYA_' + contrat + '_' + jour + '.csv';
}

function contenuCSV() {
  const contenu = inventaireCSV();
  const nbLignes = equipements.length;
  return {contenu: contenu, nbLignes: nbLignes, octets: contenu.length, nom: nomFichierCSV()};
}

function exporterCSV() {
  if (!equipements.length) {
    toast('Aucun equipement a exporter');
    return;
  }
  const f = contenuCSV();
  if (PONT && PONT.partager) {
    const reponse = PONT.partager(f.nom, f.contenu);
    if (reponse && reponse.indexOf('ok') === 0) {
      toast(f.nbLignes + ' equipement(s), ' + Math.round(f.octets / 1024) + ' Ko : choisis Mail');
    } else {
      toast('Export impossible : ' + reponse);
    }
    return;
  }
  telechargerDansNavigateur(f.contenu, f.nom);
}

function enregistrerCSV() {
  if (!equipements.length) {
    toast('Aucun equipement a exporter');
    return;
  }
  const f = contenuCSV();
  if (PONT && PONT.enregistrer) {
    const reponse = PONT.enregistrer(f.nom, f.contenu) || '';
    if (reponse.indexOf('ok|dialogue') === 0) {
      toast(f.nbLignes + ' equipement(s) : choisis le dossier');
    } else if (reponse.indexOf('ok|') === 0) {
      toast(f.nbLignes + ' equipement(s) ecrits dans ' + reponse.substring(3));
    } else {
      toast('Enregistrement impossible : ' + reponse);
    }
    return;
  }
  telechargerDansNavigateur(f.contenu, f.nom);
}

/* ------------------------------------------------------------- mise a jour */
function versionInstallee() {
  if (PONT && PONT.version) {
    try {
      const v = JSON.parse(PONT.version());
      return {code: v.code || 0, nom: v.nom || 'inconnue'};
    } catch (e) { /* on continue avec les valeurs par defaut */ }
  }
  return {code: 0, nom: 'inconnue'};
}

function enregistrerMajUrl() {
  configIA.majUrl = (document.getElementById('maj-url').value || '').trim();
  sauvegarder();
  remplirConfigApp();
  toast(configIA.majUrl ? 'Adresse enregistree' : 'Adresse effacee');
}

function verifierMAJ() {
  const url = (document.getElementById('maj-url').value || '').trim() || configIA.majUrl || '';
  if (!url) { toast("Renseigne l'adresse du fichier update.json"); return; }
  if (!PONT || !PONT.majVerifier) { toast('La mise a jour se fait dans l\'application Android'); return; }
  toast('Verification en cours...');
  PONT.majVerifier(url);
}

window.majVerifierRecue = function (json) {
  let r;
  try { r = JSON.parse(json); } catch (e) { toast('Reponse de mise a jour illisible'); return; }
  const actuelle = versionInstallee();
  if (!r.ok) {
    const etatErr = document.getElementById('maj-etat');
    if (etatErr) { etatErr.textContent = 'Echec de la verification : ' + (r.erreur || 'raison inconnue'); }
    toast(r.erreur || 'Verification impossible');
    return;
  }
  const etat = document.getElementById('maj-etat');
  if (etat) { etat.textContent = 'Version installee : ' + actuelle.nom + ' | derniere : ' + r.versionName; }
  if (r.versionCode <= actuelle.code) {
    toast('Deja a jour (' + actuelle.nom + ')');
    return;
  }
  const suite = confirm('Version ' + r.versionName + ' disponible (tu as ' + actuelle.nom + ').'
    + (r.notes ? '\n\n' + r.notes : '') + '\n\nTelecharger et installer ?');
  if (!suite) { return; }
  toast('Telechargement de la version ' + r.versionName + '...');
  PONT.majTelecharger(r.apk, 'gemaya-' + r.versionName + '.apk');
};

window.majTelechargee = function (json) {
  let r;
  try { r = JSON.parse(json); } catch (e) { toast('Telechargement illisible'); return; }
  if (!r.ok) {
    const etatErr = document.getElementById('maj-etat');
    if (etatErr) { etatErr.textContent = 'Echec du telechargement : ' + (r.erreur || 'raison inconnue'); }
    toast(r.erreur || 'Telechargement impossible');
    return;
  }
  toast('Telecharge (' + (Math.round(r.octets / 1024 / 102.4) / 10) + ' Mo), installation...');
  PONT.majInstaller(r.chemin);
};

window.majInstallee = function (json) {
  let r;
  try { r = JSON.parse(json); } catch (e) { return; }
  if (r && r.ok) { return; }
  toast((r && r.erreur) || 'Installation impossible');
};

function telechargerDansNavigateur(contenu, nom) {
  const blob = new Blob(['\ufeff' + contenu], {type: 'text/csv;charset=utf-8'});
  const lien = document.createElement('a');
  lien.href = URL.createObjectURL(blob);
  lien.download = nom;
  lien.click();
  toast('Fichier telecharge : ' + nom);
}

function viderDonnees() {
  if (!confirm('Effacer tous les equipements enregistres sur ce telephone ?')) { return; }
  equipements.length = 0;
  fichesModifiees.clear();
  photosAecrire.length = 0;
  majCompteurs();
  majArbre();
  listesSales = true;
  if (PONT && PONT.sauver) { PONT.sauver(JSON.stringify(instantane())); }
  else { sauvegarder(); }
  toast('Donnees effacees');
}

function afficherZone(secteur, localisation) {
  window.zonesOuvertes = window.zonesOuvertes || {};
  window.zonesOuvertes[secteur + '|' + localisation] = true;
  majArbre();
}

/* toute modification des listes doit partir en base, meme sans fiche en cours */
function surveillerListes() {
  ['renommerRef', 'supprimerRef', 'fusionnerRef', 'ajouterRef', 'creerSecteur', 'creerNiveau',
   'creerLoc', 'ajouterContrat', 'ajouterDesignation', 'construireFamilles'].forEach(nom => {
    const original = window[nom];
    if (typeof original !== 'function' || original._surveille) { return; }
    const enveloppe = function () {
      const resultat = original.apply(this, arguments);
      listesSales = true;
      sauvegarder();
      return resultat;
    };
    enveloppe._surveille = true;
    window[nom] = enveloppe;
    try { eval(nom + ' = enveloppe'); } catch (e) { /* portee locale : tant pis */ }
  });
}

/* le code qui protege l'ajout et la suppression d'un contrat.
   Modifiable sans reconstruire : config > la cle "code" en base. */
const CODE_CONTRATS = '1234';

function codeContrats() {
  return (configIA && configIA.code) ? String(configIA.code) : CODE_CONTRATS;
}

function demanderCodeContrats(action) {
  const saisi = window.prompt('Contrat : ' + action + '\nCode a 4 chiffres :', '');
  if (saisi === null) { return false; }
  if (String(saisi).trim() !== codeContrats()) {
    toast('Code refuse : le contrat n\'a pas ete modifie');
    return false;
  }
  return true;
}

/* ajouter ou supprimer un contrat demande le code ; le reste des listes est libre */
function protegerContrats() {
  const ajout = window.ajouterRef;
  if (typeof ajout === 'function' && !ajout._protege) {
    const enveloppe = function (cle) {
      if (cle === 'contrats' && !demanderCodeContrats('ajouter')) { return; }
      return ajout.apply(this, arguments);
    };
    enveloppe._protege = true;
    window.ajouterRef = enveloppe;
    try { eval('ajouterRef = enveloppe'); } catch (e) { /* portee globale atteinte par window */ }
  }
  const suppression = window.supprimerRef;
  if (typeof suppression === 'function' && !suppression._protege) {
    const enveloppe = function (cle) {
      if (cle === 'contrats' && !demanderCodeContrats('supprimer')) { return; }
      return suppression.apply(this, arguments);
    };
    enveloppe._protege = true;
    window.supprimerRef = enveloppe;
    try { eval('supprimerRef = enveloppe'); } catch (e) { /* idem */ }
  }
}


/* ------------------------------------------- correction et famille proposee */
let familleProposee = false;

const CHAMPS_A_CORRIGER = [
  {id: 'nom-nouvel-equipement', famille: true, connus: () => designations.map(d => d.libelle)},
  {id: 'nouveau-secteur', famille: false, connus: () => secteurs},
  {id: 'nouveau-loc', famille: false, connus: () => localisations},
  {id: 'nouveau-niveau', famille: false, connus: () => niveaux}
];

function brancherCorrections() {
  CHAMPS_A_CORRIGER.forEach(c => {
    const champ = document.getElementById(c.id);
    if (!champ || champ._branche) { return; }
    champ._branche = true;
    const boite = document.createElement('p');
    boite.className = 'suggestion cache';
    champ.insertAdjacentElement('afterend', boite);
    let minuteur = null;
    champ.addEventListener('input', () => {
      clearTimeout(minuteur);
      minuteur = setTimeout(() => examinerSaisie(champ, boite, c), 550);
    });
  });
}

function examinerSaisie(champ, boite, c) {
  const valeur = champ.value.trim();
  boite.classList.add('cache');
  boite.innerHTML = '';
  if (valeur.length < 4) { return; }

  /* 1. la famille, deduite du nom : "ventilo-convecteur" -> CVC */
  if (c.famille) {
    const famille = famillePour(valeur);
    const sel = document.getElementById('famille-nouvel-equipement');
    if (famille && sel && sel.value !== famille) {
      sel.value = famille;
      familleProposee = true;
      majAideFamille();
    }
  }

  /* 2. la faute de frappe, sur le dictionnaire du metier et les valeurs connues */
  const correction = correctionPour(valeur, c.connus ? c.connus() : []);
  if (correction && normaliser(correction.propose) !== normaliser(valeur)) {
    boite.innerHTML = 'Voulais-tu dire <b>' + correction.propose + '</b> ?'
      + ' <button class="lien" data-oui>Oui</button>'
      + ' <button class="lien" data-non>Non</button>';
    boite.classList.remove('cache');
    boite.querySelector('[data-oui]').onclick = () => {
      champ.value = correction.propose;
      boite.classList.add('cache');
      if (c.famille) { examinerSaisie(champ, boite, c); }
    };
    boite.querySelector('[data-non]').onclick = () => boite.classList.add('cache');
  }
}

function changerFamille() {
  familleProposee = false;
  majAideFamille();
}


/* Correspondance des familles des inventaires clients vers les notres.
   Regle du 20/10 : tout ce qui touche a la plomberie va dans SAN. */
const CORRESPONDANCE_FAMILLES = {
  'ELEC': 'CFO', 'ELECTRICITE': 'CFO', 'ELECTRIQUE': 'CFO', 'CFO': 'CFO',
  'ELC': 'ECL', 'ECLAIRAGE': 'ECL', 'ECL': 'ECL',
  'PB': 'SAN', 'PBL': 'SAN', 'PLOMBERIE': 'SAN', 'SANITAIRE': 'SAN', 'SAN': 'SAN',
  'AMENAGEMENT INTERIEUR': 'AGT', 'AMENAGEMENT': 'AGT', 'AGT': 'AGT',
  'A DEFINIR': 'DIVERS', 'DIVERS': 'DIVERS', 'DIVER': 'DIVERS',
  'CVC': 'CVC', 'SSI': 'SSI', 'GAZ': 'GAZ', 'CFA': 'CFA', 'SUR': 'SUR',
  'FRO': 'FRO', 'CUI': 'CUI', 'ASC': 'ASC', 'MEN': 'MEN', 'NET': 'NET',
  'EXT': 'EXT', 'SON': 'SON', 'SPO': 'SPO'
};

function familleNormalisee(brut) {
  const cle = normaliser(brut).toUpperCase();
  if (!cle) { return 'DIVERS'; }
  return CORRESPONDANCE_FAMILLES[cle] || cle;
}

/* ------------------------------------------------------------ import d'un inventaire */
/* Format attendu : CSV point-virgule, UTF-8, une ligne d'en-tete avec les noms de
   colonnes (contrat, secteur, sous-localisation, localisation, etage, famille,
   quantite, equipement, marque, modele, reference, numero de serie, puissance
   electrique, puissance thermique, debit, type, etat, urgence, commentaire). */

function importerInventaire() {
  if (PONT && PONT.choisirFichier) { PONT.choisirFichier(); return; }
  const champ = document.createElement('input');
  champ.type = 'file';
  champ.accept = '.csv,text/csv';
  champ.onchange = () => {
    const fichier = champ.files && champ.files[0];
    if (!fichier) { return; }
    const lecteur = new FileReader();
    lecteur.onload = () => window.importRecu(lecteur.result);
    lecteur.readAsText(fichier, 'utf-8');
  };
  champ.click();
}

function decouperCSV(ligne, separateur) {
  const sep = separateur || ';';
  const champs = [];
  let courant = '';
  let guillemets = false;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (guillemets) {
      if (c === '"') {
        if (ligne[i + 1] === '"') { courant += '"'; i++; } else { guillemets = false; }
      } else { courant += c; }
    } else if (c === '"') { guillemets = true; }
    else if (c === sep) { champs.push(courant); courant = ''; }
    else { courant += c; }
  }
  champs.push(courant);
  return champs;
}

function ajouterSiAbsent(liste, valeur) {
  if (valeur && liste.indexOf(valeur) < 0) { liste.push(valeur); }
}

window.importRecu = function (texte, silencieux) {
  if (!texte || texte.length < 10) { toast('Fichier vide ou illisible'); return; }
  const lignes = texte.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lignes.length < 2) { toast('Aucune ligne a importer'); return; }

  /* le point-virgule est notre format ; la virgule ne sert que pour un export anglo-saxon,
     mais une valeur peut contenir une virgule : on ne devine qu'une fois, sur l'en-tete */
  const separateur = lignes[0].indexOf(';') >= 0 ? ';' : ',';
  const entetes = decouperCSV(lignes[0], separateur).map(e => normaliser(e));
  const index = (nom) => entetes.indexOf(nom);
  const col = {
    contrat: index('contrat'), secteur: index('secteur'), sousloc: index('sous-localisation'),
    loc: index('localisation'), etage: index('etage'), famille: index('famille'),
    quantite: index('quantite'), equipement: index('equipement'), marque: index('marque'),
    modele: index('modele'), serie: index('numero de serie'),
    puissanceElectrique: index('puissance electrique'), puissanceThermique: index('puissance thermique'),
    puissanceWatts: index('puissance electrique en watts'),
    annee: (index('annee') >= 0 ? index('annee') : index('date de mise en service')),
    intensite: index('intensite'), vitesse: index('vitesse'), rpm: index('rpm'), ajout: index('ajout'),
    toursParMinute: index('tours par minute'),
    debit: index('debit'), type: index('type'), etat: index('etat'),
    urgence: index('urgence'), commentaire: index('commentaire')
  };
  if (col.equipement < 0) {
    toast("Colonne « equipement » absente : ce fichier n'est pas au bon format");
    return;
  }

  const maintenant = new Date().toISOString();
  let ajoutees = 0;
  let ignorees = 0;

  for (let n = 1; n < lignes.length; n++) {
    const champs = decouperCSV(lignes[n], separateur);
    const valeur = (i) => (i >= 0 && champs[i] !== undefined) ? String(champs[i]).trim() : '';
    const equipement = valeur(col.equipement);
    if (!equipement) { ignorees++; continue; }

    const contrat = valeur(col.contrat) || contratChoisi || 'CONTRAT';
    const secteur = valeur(col.secteur) || 'A DEFINIR';
    const sousloc = valeur(col.sousloc);
    const loc = valeur(col.loc) || 'A DEFINIR';
    const niveau = valeur(col.etage) || 'A DEFINIR';
    const famille = familleNormalisee(valeur(col.famille));
    const quantite = valeur(col.quantite);
    const etat = valeur(col.etat).toLowerCase();
    const urgence = valeur(col.urgence).toUpperCase();

    ajouterSiAbsent(contrats, contrat);
    ajouterSiAbsent(secteurs, secteur);
    ajouterSiAbsent(localisations, loc);
    ajouterSiAbsent(niveaux, niveau);
    ajouterSiAbsent(familles, famille);
    if (!designations.some(d => d.famille === famille && d.libelle.toLowerCase() === equipement.toLowerCase())) {
      designations.push({famille: famille, libelle: equipement});
    }

    const valeurs = new Array(17).fill('');
    valeurs[0] = valeur(col.marque);
    valeurs[1] = valeur(col.modele);
    valeurs[2] = valeur(col.serie);
    valeurs[3] = valeur(col.puissanceThermique);
    valeurs[4] = valeur(col.puissanceElectrique) || valeur(col.puissanceWatts);
    valeurs[5] = valeur(col.debit);
    valeurs[7] = valeur(col.type);
    valeurs[14] = quantite;
    valeurs[15] = valeur(col.annee);
    valeurs[17] = valeur(col.intensite);
    valeurs[18] = valeur(col.vitesse) || valeur(col.rpm) || valeur(col.toursParMinute);
    valeurs[16] = valeur(col.commentaire);

    equipements.push({
      id: 'I' + Date.now() + '-' + n,
      contrat: contrat,
      visite: modeVisite,
      secteur: secteur,
      loc: loc,
      sousloc: sousloc,
      niveau: niveau,
      famille: famille,
      designation: equipement,
      marque: valeur(col.marque),
      quantite: quantite,
      etat: etat,
      anomalie: ['A', 'B', 'C'].indexOf(urgence) >= 0 ? urgence : '',
      valeurs: valeurs,
      photos: {},
      fichiers: {},
      ajout: valeur(col.ajout),
      cree_le: maintenant,
      modifie_le: maintenant
    });
    ajoutees++;
  }

  fichesModifiees.clear();
  listesSales = true;
  if (PONT && PONT.sauver) { PONT.sauver(JSON.stringify(instantane())); }
  else { sauvegarder(); }
  construireSelects();
  construireDesignations();
  majCompteurs();
  majArbre();
  if (!silencieux) {
    toast(ajoutees + ' equipement(s) importe(s)' + (ignorees ? ', ' + ignorees + ' ligne(s) sans nom' : ''));
  }
};



/* ------------------------------------------------- la configuration demande le code */
let configAutorisee = false;

function ouvrirConfig() {
  if (configAutorisee) { ecran('config'); return; }
  const voile = document.getElementById('voile-code');
  const champ = document.getElementById('champ-code');
  if (!voile || !champ) { return; }
  champ.value = '';
  majPointsCode();
  if (!champ.dataset.pret) {
    champ.dataset.pret = 'oui';
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); validerCode(); }
    });
    champ.addEventListener('input', majPointsCode);
  }
  voile.classList.add('ouvert');
  setTimeout(() => { try { champ.focus(); } catch (e) {} }, 60);
}

/* Six points allumes en permanence : ni les chiffres ni leur nombre ne se devoilent. */
function majPointsCode() {
  document.querySelectorAll('#points-code i').forEach(point => point.classList.add('plein'));
}

function fermerCode() {
  const voile = document.getElementById('voile-code');
  if (voile) { voile.classList.remove('ouvert'); }
  const champ = document.getElementById('champ-code');
  if (champ) { champ.value = ''; }
}

function validerCode() {
  const champ = document.getElementById('champ-code');
  if (!champ) { return; }
  if (String(champ.value || '').trim() === codeContrats()) {
    configAutorisee = true;
    fermerCode();
    ecran('config');
    return;
  }
  champ.value = '';
  majPointsCode();
  toast('Code refuse');
}



/* Remet les 180 lignes de l'inventaire livre avec l'application. */
function chargerInventaireOrigine() {
  if (!window.INVENTAIRE_INITIAL) {
    toast("L'inventaire d'origine n'est pas dans cette version");
    return;
  }
  if (equipements.length && !window.confirm(equipements.length + " equipement(s) deja presents.\n\nAjouter les 180 lignes de l'inventaire d'origine ?")) {
    return;
  }
  window.importRecu(window.INVENTAIRE_INITIAL);
  configIA.inventaireImporte = true;
  listesSales = true;
  sauvegarder();
}

/* --------------------------------------------- fichiers ranges dans la base */
let documentsRanges = [];

function chargerDocuments() {
  const zone = document.getElementById('info-documents');
  if (!zone) { return; }
  if (!PONT || !PONT.documents) {
    zone.textContent = 'Fichiers ranges dans la base : indisponible sur cet appareil.';
    return;
  }
  try {
    documentsRanges = JSON.parse(PONT.documents() || '[]');
  } catch (e) {
    documentsRanges = [];
  }
  if (!documentsRanges.length) {
    zone.textContent = 'Fichiers ranges dans la base : aucun.';
    return;
  }
  zone.textContent = 'Fichiers ranges dans la base : ' + documentsRanges.map(d =>
    d.nom + ' (' + (Math.round(d.octets / 1024 * 10) / 10) + ' Ko)').join(', ');
}

function exporterFichierBase(nom) {
  if (!PONT || !PONT.exporterDocument) { toast('Export impossible sur cet appareil'); return; }
  const reponse = PONT.exporterDocument(nom) || '';
  if (reponse.indexOf('ok|') === 0) {
    toast('Fichier ecrit dans ' + reponse.substring(3));
  } else {
    toast('Export impossible : ' + reponse);
  }
}

function exporterDocumentPrincipal() {
  if (!documentsRanges.length) { toast('Aucun fichier range dans la base'); return; }
  exporterFichierBase(documentsRanges[0].nom);
}

/* ------------------------------------------------------------------ amorcage */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => { demarrer(); protegerContrats(); surveillerListes(); brancherCorrections(); }, 60);
});
