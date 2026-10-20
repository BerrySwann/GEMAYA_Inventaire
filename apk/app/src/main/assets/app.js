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

/* ------------------------------------------------------------------ taxonomie */
/* Proposee par metier, a valider : codes courts, un libelle lisible. */
const TAXONOMIE = [
  ['CFO', 'Courants forts, distribution, armoires'],
  ['CFA', 'Courants faibles, VDI, reseaux'],
  ['CVC', 'Chauffage, ventilation, climatisation'],
  ['GAZ', 'Gaz, chaufferie, production de chaleur'],
  ['ECL', 'Eclairage interieur et exterieur'],
  ['SSI', 'Securite incendie, desenfumage'],
  ['SUR', 'Surete, controle d acces, videosurveillance'],
  ['SAN', 'Plomberie, sanitaires, eau chaude sanitaire'],
  ['FRO', 'Froid alimentaire et climatisation de confort'],
  ['CUI', 'Cuisine professionnelle'],
  ['ASC', 'Ascenseurs, monte-charges, escaliers mecaniques'],
  ['MEN', 'Menuiserie, serrurerie, fermetures'],
  ['AGT', 'Agencement, mobilier, revetements'],
  ['NET', 'Nettoyage, hygiene, consommables'],
  ['EXT', 'Espaces verts, voirie, exterieur'],
  ['SON', 'Sonorisation, affichage, audiovisuel'],
  ['SPO', 'Equipements sportifs et sceniques'],
  ['DIVERS', 'Divers, non classe']
];

/* --------------------------------------------------------------- etat en memoire */
let configIA = {fournisseur: 'deepseek', modele: 'deepseek-chat', base: '', cle: (window.CLE_DEFAUT || '')};
let photosFiche = {plaque: null, ensemble: null, detail: null};   /* {chemin,dataUrl,sha256...} */
let idFiche = '';                                                 /* fiche en cours d'edition */

/* --------------------------------------------------------------------- stockage */
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

function sauvegarder() {
  const charge = JSON.stringify(instantane());
  try {
    if (PONT && PONT.sauver) { PONT.sauver(charge); }
    else { localStorage.setItem(LS, charge); }
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
  if (c.ia) { configIA = Object.assign({fournisseur: 'deepseek', modele: 'deepseek-chat', base: '', cle: ''}, c.ia); }
  if (!configIA.cle && window.CLE_DEFAUT) { configIA.cle = window.CLE_DEFAUT; }
  const der = c.derniers || {};
  dernierSecteur = der.secteur || dernierSecteur;
  derniereLoc = der.localisation || derniereLoc;
  dernierNiveau = der.niveau || dernierNiveau;
  return true;
}

/* ---------------------------------------------------------------- demarrage */
function demarrer() {
  const deja = chargerEtat();
  const selContrat = document.getElementById('select-contrat');
  if (selContrat) { remplirContrats(); }
  construireFamilles();
  construireSelects();
  construireDesignations();
  majArbre();
  majCompteurs();
  remplirConfigApp();
  if (deja) { toast('Donnees locales rechargees : ' + equipements.length + ' equipement(s)'); }
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

  /* le fichier complet reste sur le disque : la base ne garde que le chemin,
     l'empreinte et la vignette, jamais le base64 de la photo entiere */
  const fichiers = {};
  ['plaque', 'ensemble', 'detail'].forEach(role => {
    const p = photosFiche[role];
    if (!p) { return; }
    fichiers[role] = {
      chemin: p.chemin || '',
      fichier: p.fichier || '',
      sha256: p.sha256 || '',
      octets: p.octets || 0,
      largeur: p.largeur || 0,
      hauteur: p.hauteur || 0,
      vignette: p.vignette || ''
    };
  });

  const fiche = {
    id: ancienne && ancienne.id ? ancienne.id : 'F' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    secteur: s,
    niveau: n,
    loc: l,
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
    fichiers: fichiers,
    visite: modeVisite,
    contrat: contratChoisi,
    modifie_le: maintenant,
    cree_le: ancienne && ancienne.cree_le ? ancienne.cree_le : maintenant
  };

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

  photoPlaque = !!e.photoPlaque;
  photosAutres = {ensemble: !!(e.photos && e.photos.ensemble), detail: !!(e.photos && e.photos.detail)};
  photosFiche = {plaque: null, ensemble: null, detail: null};
  if (e.fichiers) {
    ['plaque', 'ensemble', 'detail'].forEach(r => { photosFiche[r] = e.fichiers[r] || null; });
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
  configIA = {
    fournisseur: document.getElementById('ia-fournisseur').value,
    modele: document.getElementById('ia-modele').value.trim(),
    base: document.getElementById('ia-base').value.trim(),
    cle: document.getElementById('ia-cle').value.trim()
  };
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
function exporterCSV() {
  if (!equipements.length) {
    toast('Aucun equipement a exporter');
    return;
  }
  const contenu = inventaireCSV();
  const jour = new Date().toISOString().slice(0, 10);
  const contrat = (contratChoisi || 'VISITE').replace(/[^A-Za-z0-9]+/g, '-');
  const nom = 'EDL_GEMAYA_' + contrat + '_' + jour + '.csv';

  if (PONT && PONT.partager) {
    const reponse = PONT.partager(nom, contenu);
    if (reponse && reponse.indexOf('ok') === 0) {
      toast('Fichier pret : choisis Mail pour l\'envoyer');
    } else {
      toast('Export impossible : ' + reponse);
    }
    return;
  }

  /* au navigateur : telechargement direct */
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
  majCompteurs();
  majArbre();
  sauvegarder();
  toast('Donnees effacees');
}

/* ------------------------------------------------------------------ amorcage */
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(demarrer, 60);
});
