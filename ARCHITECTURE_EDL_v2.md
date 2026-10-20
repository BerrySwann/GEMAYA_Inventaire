# EDL v2 - simulation de refonte

Document de conception. Aucune ligne de code ecrite a ce stade : c'est le plan a valider avant de developper.

Hypotheses de depart (a corriger si faux) : 3 a 10 utilisateurs, 20 a 50 sites, 100 a 300 equipements par site, 3 photos par equipement, une visite par site et par an. Soit environ 10 000 a 45 000 photos par cycle complet.

---

## 1. Le principe directeur

**Un seul code source, deux cibles : un APK pour le terrain, un site web pour le bureau.**

- **Terrain** : application Android installee (fichier APK), sur telephone ou tablette. Saisie rapide, photos, fonctionne sans reseau.
- **Bureau** : site web sur ordinateur. Revue, correction, comparaison avec l'annee precedente, generation du rapport PDF.

La contrainte que tu poses (un APK) a une consequence qu'il faut assumer tout de suite : une application Android installee, ce n'est plus la meme chaine de fabrication qu'une page web. On peut malgre tout garder **un seul code source** pour l'APK et le site bureau, et c'est ce que je recommande. Voir section 3.

Regle de fond : **le terrain capture, le bureau valide**. Rien n'est ecrit automatiquement sans un humain qui confirme.

---

## 2. La pile technique recommandee

| Besoin | Choix | Pourquoi celui-la |
|---|---|---|
| Code commun | **SvelteKit 5 + TypeScript** | Un seul code pour l'APK et le site bureau. Compile en JavaScript minimal. |
| Enveloppe Android | **Capacitor** (Android Studio pour produire l'APK) | L'application web est emballee dans une vraie application Android : camera native, fichiers, base locale, APK signe. Un seul code a maintenir. |
| Styles | **Tailwind CSS 4** | Mise en page mobile et PC dans le meme code. |
| Composants | **shadcn-svelte** | Le code des composants est copie chez toi, pas une dependance externe. |
| Hors ligne | **SQLite sur le telephone** (plugin Capacitor) + file d'envoi | Saisie complete en sous-sol, sans reseau. Les photos et les champs sont stockes localement puis envoyes. |
| API | **Routes serveur SvelteKit** | Pas de service separe a maintenir au demarrage. |
| Base de donnees | **PostgreSQL 16** | Tu l'as deja (c'est Supabase). Portable partout. |
| Acces base | **Drizzle ORM + migrations versionnees** | Le SQL reste visible, les migrations sont dans le depot. |
| Photos | **Stockage objet compatible S3 (MinIO auto-heberge, ou Backblaze B2 / Cloudflare R2)** | Voir section 7 : c'est le point ou je ne suis pas ton idee initiale, et je m'explique. |
| Comptes | **Sessions serveur + cookies httpOnly**, comptes nominatifs | Simple, sans prestataire externe, revocable a distance. |
| PDF | **Gotenberg (Chromium sans interface)** | Tu ecris le gabarit en HTML/CSS, le PDF sort exactement comme l'apercu. |
| Hebergement | **Un VPS avec Docker Compose** (Caddy + application + PostgreSQL + MinIO + Gotenberg) | Tu possedes la machine, tu peux la deplacer, tu la sauvegardes. |
| Sauvegardes | `pg_dump` chiffre + copie des objets, vers ton NAS puis vers un site distant | Une sauvegarde jamais restauree n'est pas une sauvegarde : test de restauration tous les 6 mois. |
| Extraction IA | **Differee en phase 5, mais prevue des maintenant** | Voir section 8. |

---

## 3. L'APK : comment on le fabrique et comment on le distribue

### 3.1 La fabrication

Le code de l'application (SvelteKit) est compile, puis Capacitor l'enveloppe dans un projet Android qui produit un fichier `.apk` signe. Concretement :

1. `npm run build` produit l'application web.
2. `npx cap sync android` la copie dans le projet Android.
3. `./gradlew assembleRelease` produit l'APK signe, ou `bundleRelease` produit un `.aab` pour le Play Store.

Ce que Capacitor apporte et qui compte pour toi :

- **camera native** (meilleure qualite, acces aux capteurs, pas de limite d'envoi du navigateur) ;
- **fichiers et SQLite** : la visite entiere vit dans le telephone jusqu'a l'envoi ;
- **geolocalisation**, **partage**, **mode sombre**, **notifications** ;
- **mise a jour** : un APK installe ne se met pas a jour tout seul. Il faut soit republier sur le Play Store, soit integrer un controle de version qui previent l'utilisateur ("version 1.3 disponible, installer"). C'est un point a ne pas oublier des la phase 2.

### 3.2 Les alternatives, et pourquoi je ne les retiens pas

| Voie | Avantage | Ce qui bloque chez toi |
|---|---|---|
| **Kotlin natif** (Android Studio) | La meilleure experience mobile possible | Deux codes a maintenir : le mobile en Kotlin, le bureau en web. Double travail, double bug. |
| **Flutter** | Un seul code qui produit APK + Windows + web | Le bureau serait aussi en Flutter : les grands tableaux de saisie y sont moins agreables que dans un navigateur, et tu changes d'ecosysteme (Dart). Defendable, mais plus lourd. |
| **React Native / Expo** | Un code pour iOS et Android | On repart sur l'ecosysteme React et sa pile, et il faudrait quand meme un troisieme code pour le bureau. |
| **Capacitor (recommande)** | Un seul code pour l'APK et le bureau | Moins fluide qu'une application native sur les ecrans tres denses. Pour des formulaires et des photos, c'est sans consequence. |

### 3.3 La distribution, et le piege a eviter

- **Le keystore est le point critique.** L'APK est signe par une cle (fichier keystore + mot de passe). Si tu la perds, tu ne peux plus jamais mettre a jour l'application installee : les utilisateurs doivent desinstaller et reinstaller, en perdant les donnees locales non envoyees. Ce fichier se conserve en double, hors du poste de developpement, dans un coffre.
- **Distribution directe (point de depart recommande)** : l'APK est depose sur ton serveur, un lien le distribue. Gratuit, immediat, aucune demarche aupres de Google, et tu testes toi-meme sur ton telephone des la premiere version. Deux frictions : Android affiche un avertissement "source inconnue", et chaque mise a jour demande une manipulation.
- **Play Store, canal de test interne** : 25 dollars une fois, application non publique visible seulement par ta liste d'utilisateurs. Les mises a jour arrivent seules, plus d'avertissement systeme. C'est le choix le plus confortable si le projet vit plusieurs annees. Il impose une politique de confidentialite et un formulaire de securite des donnees : c'est du travail administratif, pas du developpement.
- **iPhone : hors perimetre, decide.** Toute l'equipe est sur Android et personne n'a d'iPhone pour tester. L'APK couvre donc la totalite du terrain, et TestFlight, les 99 dollars annuels et la version web degradee sortent du projet. Consequence a assumer : si un iPhone arrive un jour dans l'equipe, il faudra soit preter un Android, soit rouvrir ce chantier.

---

## 4. Le parcours terrain (application Android)

1. Premiere ouverture : connexion, puis session longue duree (on ne retape pas le mot de passe devant un coffret).
2. Choix client / site / prise en charge. **Rien n'est pre-charge** : la visite nait vide chez toi, puis se construit sur le terrain.
3. **On part de zero.** Il n'y a aucun inventaire preetabli, donc pas de "materiel attendu" a l'ecran. Le bouton "+ Nouvel equipement" ouvre une fiche vide depuis la zone ou l'on se trouve, et la visite se remplit equipement par equipement.
4. Photo d'abord : la plaque signaletique (obligatoire, c'est elle qui sert a la lecture), puis la vue d'ensemble et le detail quand c'est utile.
5. Bouton **Lire la photo** : la reconnaissance propose marque, modele, numero de serie, puissances, et propose aussi le type d'equipement. Chaque proposition arrive avec son score de confiance et doit etre acceptee, corrigee ou rejetee. Plaque absente ou illisible : on garde la photo et on saisit a la main, c'est exactement le meme formulaire.
6. **Le type d'equipement commande les champs affiches.** Une pompe a chaleur demande un fluide et des puissances, un luminaire demande une puissance unitaire et un nombre de points, une armoire demande un nombre de departs et un calibre. Les listes par famille restent a figer avec tes obligations de rapport D19 / Q19.
7. Anomalie A / B / C, qui fixe le delai d'intervention, **et etat du materiel**, qui decrit le constat : bon, correct, vetuste, hors service, non teste ou inaccessible, neuf ou recent, arret saisonnier, remplacement prevu. Les deux sont independants : un materiel vetuste n'est pas forcement une anomalie, et une anomalie peut toucher un materiel par ailleurs en bon etat. Regle retenue : "hors service" oblige a renseigner un delai. Le rapport en tire la liste des equipements a remplacer, qui est souvent la premiere page que le client lit. Commentaire a la dictee (reconnaissance vocale du systeme Android, gratuite).
8. **Sans reseau** : tout reste dans le telephone. Un bandeau indique "12 elements en attente d'envoi". L'envoi se declenche au retour du reseau, reprend apres coupure, et se poursuit en arriere-plan.
9. Photos compressees sur place (cote 1600 px, format WebP) : une visite tient dans quelques centaines de Mo au lieu de plusieurs Go.

**Secteur, localisation et etage : trois champs separes, rien par defaut.** Le technicien cree lui-meme le secteur ("+ Creer un secteur", par exemple Administration, Loges, Local technique SUD), la localisation ("+ Creer une localisation", par exemple Bureau, local menage, placard technique, accueil) et l'etage ("+ Creer un etage", par exemple NIVEAU 0 / RDC). Aucune liste n'est pre-remplie. Les trois dernieres valeurs utilisees sont reproposees automatiquement sur l'equipement suivant, ce qui evite de les recreer a chaque fiche. Pour revenir dans une zone deja visitee et continuer a la remplir, on la touche dans la liste de la visite : la fiche s'ouvre avec les trois champs deja remplis. Deux garde-fous indispensables : chaque selecteur propose toujours les valeurs existantes avant de proposer la creation (sinon tu obtiendras "RDC", "rez-de-chaussee" et "RDC " comme trois niveaux differents, exactement le probleme que montre ton fichier Excel), et le bureau garde un outil de fusion des doublons.

**Retrouver et modifier un equipement deja saisi.** Chaque equipement enregistre reste accessible de deux facons : une liste deroulante en haut de l'ecran de la visite, groupee par niveau et par localisation, et la liste sous chaque zone avec le bouton "+ Ajouter un equipement ici". Toucher une ligne rouvre la fiche complete de l'equipement (photos, champs, etat, anomalie) et l'enregistrement corrige la ligne au lieu d'en creer une deuxieme.

**Le bloc equipement : deux usages au meme endroit.** Sous le titre "Creation du nouvel equipement", la fiche presente d'abord la liste des equipements deja crees (groupes par famille : CVC, ECL, CFO, SSI, divers), puis les champs de creation (famille et nom), puis le bouton Creer. Les deux usages tiennent dans ce seul bloc : en **prise en charge** on cree l'equipement rencontre, en **inventaire** on resélectionne un equipement deja decrit pour une autre piece, en ne changeant que la quantite. C'est ce qui evite les "ventilo-convecteur", "VC" et "ventilo convecteur" qui ne se regroupent jamais dans les totaux. Meme logique et meme garde-fou que pour le secteur, la localisation et l'etage : on cherche dans la liste avant de creer.

Points d'attention : la batterie (compression immediate, pas de video), le gant qui tape a cote (boutons larges), le soleil (contraste fort), le local technique en sous-sol (hors ligne obligatoire, pas une option), et **la version Android minimale** des telephones utilises (a verifier avant de choisir : Capacitor exige aujourd'hui Android 7 et plus, largement couvert).

### 4.1 Le choix du contrat, et la configuration des listes

Une visite appartient a un **contrat** : c'est la premiere colonne de ton inventaire, et c'est ce qui rattache un releve au marche. Le contrat se choisit au demarrage de la visite, sur l'ecran des releves, et se gere dans la configuration comme les autres listes.

Un ecran **Configuration** separe, accessible depuis la barre du bas, range toutes les listes de l'application : contrats, secteurs, localisations, etages ou niveaux, lots (familles d'equipement) et equipements. Il ne sert qu'a cela, on n'y saisit aucun materiel. Pour chaque valeur, l'ecran affiche **le nombre d'equipements qui l'utilisent**, et trois gestes :

- **renommer** : la correction se propage aux equipements deja enregistres, aux listes derivees et aux listes de choix. C'est le geste a utiliser pour une faute de frappe ;
- **supprimer** : refuse si la valeur est utilisee, avec le nombre d'equipements concernes. Sinon, suppression immediate ;
- **fusionner** : quand deux valeurs se ressemblent a la casse et a la ponctuation pres (par exemple "loge 2/3" et "LOGE 2 / 3"), l'ecran les signale comme doublons et propose de les fusionner, ce qui repointe les equipements sur une seule valeur.

**Pourquoi cette regle plutot que la suppression libre.** Un secteur supprime alors qu'il porte vingt equipements les laisse orphelins, et personne ne s'en apercoit avant le rapport. Interdire la suppression d'une valeur utilisee, et n'autoriser que le renommage qui suit les equipements, transforme une correction dangereuse en correction sure. Le meme geste existe depuis la fiche, sur un petit bouton **corriger** pose a droite de chaque liste (secteur, localisation, etage, lot) : on ne quitte pas la saisie pour reparer une faute.

Ce qui est supprime est conserve dans le `journal` (qui, quand, quelle valeur, remplacee par quoi) : une valeur effacee par erreur reste retrouvable, y compris apres une fusion de doublons.

---

## 5. Les deux systemes : INVENTAIRE et PRISE EN CHARGE

Meme terrain, meme geste, meme base : ce sont **deux usages d'un seul outil**. La difference n'est pas dans la saisie, elle est dans **ce qu'on en sort** et dans la facon de relire les equipements.

| | INVENTAIRE | PRISE EN CHARGE |
|---|---|---|
| Point de depart | un site qu'on decouvre | un site connu, ou une ligne d'inventaire existante |
| Ce qu'on fait | on decrit chaque equipement rencontre | on constate l'etat de chaque equipement |
| Degre d'urgence | **saisi ici** (A, B, C) | repris de l'inventaire, **modifiable a la demande** |
| Sortie | un tableau, **une ligne par equipement** | une fiche **portrait par equipement**, photos et commentaire |
| Relecture | filtres, totaux, trous a combler | equipement par equipement, avec la comparaison annuelle |

On commence par **l'inventaire** : c'est lui qui installe les donnees (secteurs, localisations, equipements, photos). La prise en charge vient apres, et peut naitre de deux facons : une visite complete, ou **une ligne d'inventaire promue en prise en charge** depuis le bureau. C'est le point que tu as pose : le degre d'urgence vit dans l'inventaire, on peut le modifier en prise en charge, et on peut reprendre un equipement de l'inventaire pour en faire une prise en charge.

Ce qui reste commun, et c'est volontaire : la fiche d'equipement, les trois photos, la lecture de plaque, les etats du materiel, la hierarchie secteur / localisation / etage, le hors ligne. Il n'y a **qu'un seul ecran de saisie**, pas deux applications a maintenir.

Consequence sur la base : les deux systemes partagent les memes tables (`visites`, `lignes`, `photos`, `secteurs`, `localisations`, `niveaux`, `equipements_catalogue`). Une visite porte un **mode** (`inventaire` ou `prise_en_charge`), et une ligne de prise en charge peut garder le lien vers la ligne d'inventaire d'origine (`ligne_source_id`) : c'est ce lien qui permet d'ecrire "cet equipement vient de l'inventaire du 12/03" et de comparer d'une annee sur l'autre.

---

## 6. Les deux sorties : deux CSV, deux structures

A chaque fin de saisie, l'application produit un fichier **CSV** : separateur point-virgule, encodage UTF-8 avec BOM, donc Excel ouvre les accents correctement sans manipulation. Le fichier est **regenere a chaque equipement enregistre** : tu peux l'exporter a tout moment, il n'y a pas de "fin de visite" obligatoire.

**Pourquoi le CSV et pas directement un .xlsx** : un CSV s'ouvre dans Excel, LibreOffice, Google Sheets, se lit par un script, et ne depend d'aucun logiciel. Un `.xlsx` demande une bibliotheque (openpyxl, ExcelJS) a chaque generation. Si tu veux le `.xlsx` en plus du CSV, c'est peu de travail, mais le CSV est la base.

### 6.1 Inventaire : une ligne par equipement

Une ligne d'en-tete, puis une ligne par equipement. Colonnes :

`Secteur ; Localisation ; Etage ou niveau ; Famille ; Equipement ; Marque ; Modele / reference ; Numero de serie ; Quantite ; Annee ; Autres caracteristiques ; Etat du materiel ; Degre d'urgence ; Delai contractuel ; Commentaire ; Photos ; Releve le ; Releve par`

Les caracteristiques propres a chaque famille (puissances, debit, fluide, nombre de points, calibre...) sont regroupees dans la colonne **Autres caracteristiques**, sous la forme `Puissance thermique: 2,2 kW | Fluide frigorigene: R32`. C'est le compromis qui garde un tableau stable (les colonnes ne bougent jamais d'une ligne a l'autre, ce qui est indispensable pour filtrer, trier et faire des totaux) sans perdre d'information.

### 6.2 Prise en charge : une fiche portrait par equipement

Memes donnees, autre structure : **un bloc vertical par equipement**, separe par une ligne vide. Chaque bloc commence par un titre, puis une ligne par information :

```
PRISE EN CHARGE - FICHE EQUIPEMENT ; PC-001
Titre de l'equipement ; Ventilo-convecteur
Famille ; CVC
Secteur ; Administration
Localisation ; Accueil
Etage ou niveau ; NIVEAU 0 / RDC
Quantite ; 4
Marque ; Atlantic electronic
Modele / reference ; FCX 44
Numero de serie ; ATL-2001-04512
Photo 1 - plaque signaletique ; PALAIS-NIKAIA_Administration_Accueil_Ventilo-convecteur_plaque.jpg
Photo 2 - vue d'ensemble ; PALAIS-NIKAIA_Administration_Accueil_Ventilo-convecteur_ensemble.jpg
Photo 3 - detail ; PALAIS-NIKAIA_Administration_Accueil_Ventilo-convecteur_detail.jpg
Etat du materiel ; Vetuste
Commentaire ; Panneau lateral ouvert, filtre encrasse
Degre d'urgence ; B
Delai contractuel ; 1 mois
Releve le ; 07/10/2026
Releve par ; M. V.
```

Imprime tel quel, un bloc tient sur une page portrait : c'est la fiche d'intervention par equipement, et tu obtiens une liasse A4 avec un equipement par page.

### 6.3 Le point qu'il faut dire clairement

**Un CSV ne peut pas contenir d'images.** Il cite le nom des fichiers photo, et les images voyagent dans le meme dossier, ou dans un ZIP du site. Si tu veux la fiche portrait **avec les photos integrees**, c'est le **PDF** qu'il faut produire : le PDF est fait pour ca, et la pile technique le prevoit deja (rendu cote serveur). Le CSV reste la version donnees, ouvrable et retouchable dans Excel.

Le nom des photos est construit automatiquement : `SITE_Secteur_Localisation_Equipement_role.jpg`, ou role vaut plaque, ensemble ou detail. Deux equipements de meme nom dans deux locaux differents ne peuvent donc pas se confondre.

---

## 7. Les photos : stockage objet, pas dans la base

Tu voulais les photos dans la base. Techniquement c'est possible, PostgreSQL sait stocker des binaires. Je te le deconseille, pour trois raisons concretes :

1. **Le volume.** 45 000 photos a 3 Mo = environ 135 Go. Ta base devient un mammouth : chaque sauvegarde, chaque restauration, chaque migration transporte ces 135 Go. Une restauration qui prenait deux minutes en prend deux heures.
2. **Les performances.** La base doit decompresser et transferer des binaires a chaque consultation d'une fiche, alors qu'un stockage de fichiers sert les images directement, avec miniatures et mise en cache.
3. **La separation des responsabilites.** Une photo est un fichier immuable, une donnee est une information qui evolue. Les melanger rend les deux plus fragiles.

Le montage que je recommande :

- la photo est ecrite dans le stockage objet (MinIO chez toi, ou B2/R2 chez un hebergeur, sans frais de sortie) ;
- la base garde pour chaque photo : identifiant, chemin, empreinte SHA-256 (preuve d'integrite), dimensions, date de prise de vue, position GPS si disponible, auteur, miniature, et le lien avec la ligne d'inventaire ;
- l'acces aux images se fait par lien signe a duree limitee, jamais par URL publique.

Resultat : ta base reste petite et rapide (quelques centaines de Mo pour dix ans), et tes photos restent trouvees, tracees et restaurables.

Si tu veux vraiment un seul fichier, on peut produire une archive annuelle autoportante (base + photos). C'est un livrable, pas une architecture.

---

## 8. L'IA : le bouton existe des la phase 2, la reconnaissance se branche ensuite

Le geste que tu decris est simple : une photo de plaque, un bouton **Lire la photo**, des champs qui se remplissent. L'architecture doit porter ce bouton des la premiere version, meme si la lecture n'est pas encore active : le technicien appuie, voit un message clair, et saisit a la main. Brancher ensuite la reconnaissance ne touche ni le parcours, ni le modele de donnees.

Le besoin precis : a partir d'une photo de plaque signaletique, remplir marque, modele, numero de serie, annee, puissance, et proposer le type d'equipement. C'est realiste en 2026, avec deux familles d'outils.

| Voie | Comment | Cout | Remarque |
|---|---|---|---|
| OCR + modele vision auto-heberge | PaddleOCR pour le texte, Qwen2.5-VL pour la comprehension de la plaque | Electricite + une carte graphique (600 a 1500 euros une fois) | Aucune donnee ne sort de chez toi, cout marginal nul, mais c'est toi qui maintiens l'usine |
| API externe (Claude, GPT, Gemini) | Envoi de la photo, reponse structuree en JSON | Environ 0,01 a 0,05 euro par photo | Operationnel en trois jours, mais les photos de tes clients partent chez un tiers : point RGPD a traiter contractuellement |
| Sur le telephone | Modele embarque dans l'APK | Gratuit | Pas fiable aujourd'hui pour lire une plaque industrielle de travers |

**Ce qu'il faut prevoir des maintenant**, et c'est tout l'objet de cette section : la table des valeurs doit enregistrer, pour chaque champ (marque, type, numero de serie), quatre informations de plus que la valeur elle-meme :

- la **source** : humain, catalogue, ou IA ;
- le **score de confiance** ;
- le **modele et sa version** (pour pouvoir rejouer ou comparer plus tard) ;
- le **statut** : propose, valide, corrige, rejete, avec le lien vers la photo d'origine.

Ainsi, quand l'IA arrivera en phase 5, elle ecrira des propositions dans une file de validation, et **rien ne sera jamais ecrit silencieusement** dans l'inventaire. Le jour ou un client contestera une donnee, tu sauras exactement d'ou elle vient, qui l'a validee, et quelle photo la justifie.

Cette section coute presque rien a prevoir aujourd'hui, et coute une refonte complete a ajouter apres coup.

---

## 9. Le parcours bureau (PC)

1. Tableau de bord : visites recues, a valider, anomalies de niveau A, photos manquantes.
2. Revue ligne par ligne : photos en grand, champs releves, validation de la lecture de plaque en un clic (accepter / corriger / rejeter), et comparaison avec la prise en charge precedente du meme site, qui n'apparait qu'a partir de la deuxieme visite.
3. Edition complete des champs, reordonnancement, commentaires.
4. Apercu du rapport identique au PDF final, avec la synthese des etats et la liste des equipements a remplacer ; export PDF, export Excel pour les clients qui le demandent.
5. Journal d'audit : qui a modifie quoi et quand. Indispensable en cas de controle ou de litige.

---

## 10. Modele de donnees (esquisse)

```
utilisateurs        (id, nom, email, role, actif)
appareils           (id, utilisateur_id, modele, version_app, derniere_synchro)
clients             (id, nom, ville, reference)
contrats            (id, client_id, libelle, reference)       -- la premiere colonne de l'inventaire du client
sites               (id, client_id, nom, adresse, coordonnees)
secteurs            (id, site_id, libelle)                    -- crees a la volee : Administration, Loges...
niveaux             (id, site_id, libelle)                    -- crees a la volee : NIVEAU 0 / RDC, toiture...
localisations       (id, site_id, libelle)                    -- crees a la volee : Bureau, local menage...
                                                              -- un equipement porte les trois : secteur + localisation + etage
types_equipement    (id, famille, libelle)                    -- CVC, ECL, CFO, SSI, DIVERS
champs_modele       (id, type_id, code, libelle, unite, obligatoire, ordre)
                                                              -- quels champs pour quel type
equipements_catalogue (id, site_id, famille, libelle)         -- crees a la volee depuis le terrain,
                                                              -- reutilises dans toutes les pieces
catalogue           (id, marque, modele, puissance)           -- referentiel partage, alimente au fil de l'eau
visites             (id, site_id, contrat_id, date, auteur_id, mode, statut)
                                                              -- mode : inventaire, ou prise_en_charge
lignes              (id, visite_id, secteur_id, niveau_id, localisation_id, equipement_catalogue_id,
                     type_equipement_id, quantite, statut, anomalie, criticite, etat_materiel,
                     commentaire, ligne_source_id)
                                                              -- anomalie : le degre d'urgence A / B / C (48 h, 1 mois, 1 an)
                                                              -- ligne_source_id : quand une prise en charge reprend une ligne d'inventaire
exports             (id, visite_id, mode, chemin_csv, genere_le, nb_lignes)
                                                              -- un CSV par mode, regenere a chaque equipement enregistre
photos              (id, ligne_id, chemin_objet, sha256, largeur, hauteur,
                     horodatage, gps, auteur_id, miniature, statut_envoi)
champs              (id, ligne_id, nom, valeur, source, confiance,
                     modele_ia, photo_source_id, statut, valide_par, valide_le)
rapports            (id, visite_id, chemin_pdf, genere_le, version)
journal             (id, utilisateur_id, table, enregistrement_id, avant, apres, horodatage)
file_envoi          (id, appareil_id, type, charge_utile, tentatives, dernier_essai)
```

Quatre points de conception qui font la difference plus tard :

1. `niveaux` et `localisations` sont deux tables, pas du texte libre, et chacune est creee a la volee depuis le terrain. C'est ce qui permet de regrouper par niveau, de revenir completer une localisation deja commencee, de comparer deux visites et de retrouver un equipement dans dix ans. Le fichier Excel que tu m'as confie montre exactement le probleme inverse : "Loge 2 / 3", "loge 2/3" et "LOGE 2/3" y sont trois localisations differentes.
2. `champs` separe la valeur de sa provenance : c'est le point d'accroche de l'IA et de la tracabilite.
3. `types_equipement` et `champs_modele` portent le formulaire variable : c'est ce qui permet a la fiche de s'adapter au type d'equipement sans redevelopper l'application, et de rendre un champ obligatoire quand le rapport D19 l'exige.
4. `catalogue` evite de ressaisir "Atlantic electronic" de vingt facons differentes : le terrain choisit dans une liste, et propose une nouveaute quand elle n'existe pas.
5. `visites.mode` et `lignes.ligne_source_id` portent le double usage : le meme schema sert l'inventaire et la prise en charge, et le second garde la memoire du premier. Sans ce lien, impossible d'ecrire plus tard "cet equipement etait deja dans l'inventaire de mars" ni de calculer une comparaison honnete.
6. `anomalie` porte le degre d'urgence, et le journal (`journal`) garde qui l'a modifie, quand et de quelle valeur a quelle valeur : c'est ce qui permet de le changer en prise en charge a la demande du client sans perdre la trace de ce qui avait ete constate.
7. Les listes de reference ne sont pas des tables libres en ecriture : elles se corrigent par **renommage** (qui suit les equipements) et non par suppression, sauf si la valeur n'est utilisee nulle part. C'est cette regle qui empeche l'orphelin silencieux, et `journal` conserve la trace de chaque correction et de chaque fusion de doublons.

---

## 11. Decoupage et charge de travail

Estimations en jours de developpement, un seul developpeur, avec un vrai cycle de tests a chaque phase.

| Phase | Contenu | Jours | Livrable utilisable |
|---|---|---|---|
| 0 | Cadrage, maquettes, modele de donnees valide | 3 a 4 | Maquettes cliquables |
| 1 | Socle : base, comptes, clients, sites, localisations, catalogue | 5 a 8 | On saisit un site et son parc |
| 2 | Terrain : application, photos, SQLite hors ligne, synchronisation | 10 a 15 | On fait un EDL complet au telephone, en sous-sol |
| 2b | APK : projet Android, signature, keystore en coffre, mise a jour, distribution | 3 a 5 | Un APK installe sur les telephones de l'equipe |
| 3 | Bureau : revue, edition, comparaison annuelle, journal | 8 a 12 | On valide et corrige une visite |
| 4 | Rapports : gabarit, apercu, PDF, export Excel | 5 a 8 | Le rapport D19 / Q19 sort |
| 5 | IA : extraction des plaques, ecran de validation | 8 a 12 | Marque et numero de serie pre-remplis |
| 6 | Reprise des donnees existantes, recette, formation | 3 a 5 | L'ancien et le nouveau coexistent |

**Total : 45 a 69 jours.** Chez un prestataire a 400 - 700 euros par jour, cela situe le projet entre 18 000 et 48 000 euros. La fourchette est large parce que la phase 2 (le hors ligne) et la phase 2b (la chaine Android) sont celles qui derapent le plus souvent.

Deux strategies possibles :

- **Refonte complete** : le plus propre, le plus cher, on repart de zero sur l'interface.
- **Etapes utiles** : garder la base Supabase existante (du PostgreSQL, rien ne se perd) et reconstruire d'abord le terrain, puis le bureau. L'application actuelle continue de servir pendant ce temps.

Je recommande la seconde. Tes donnees sont le vrai patrimoine, l'interface est du consommable.

---

## 12. Le plan B a examiner avant de coder quoi que ce soit

Une plateforme de gestion de donnees auto-hebergee (Directus, NocoDB, Baserow) branchee sur ta base PostgreSQL existante fournit en une semaine : formulaires, listes filtrables, roles et droits, pieces jointes, historique des modifications, export Excel et PDF simple. Pour 90 pour cent de ton besoin, c'est trois a dix fois moins cher.

Ce qu'elle ne fait pas, et qui justifie un developpement : l'APK terrain hors ligne avec photos et dictee, la comparaison automatique avec l'inventaire precedent, et l'extraction IA des plaques. Ces trois fonctions-la sont ton metier.

La voie raisonnable : plateforme pour clients, sites, localisations et consultation ; developpement limite a l'APK terrain et a l'IA. Je chiffre cette variante si tu veux.

---

## 13. Decisions a prendre

1. **Terrain : Android uniquement - tranche.** L'APK couvre tout le terrain, iOS est hors perimetre. Reste a relever la version d'Android des telephones de l'equipe (reglages, a propos du telephone) pour fixer le minimum supporte.
2. **Hors ligne reel ou non** : besoin de saisir en sous-sol sans reseau ? Si oui, phase 2 complete. Si non, on gagne 5 a 8 jours.
3. **Distribution de l'APK** : lien direct (gratuit, mises a jour manuelles) ou Play Store canal interne (25 dollars, mises a jour automatiques, formulaire de confidentialite a remplir).
4. **Hebergement** : VPS chez toi (possession totale, un peu d'administration) ou services manages Supabase + Cloudflare (zero administration, dependance fournisseur).
5. **Photos** : stockage objet (ma recommandation) ou tout dans la base.
6. **IA** : auto-hebergee (donnees chez toi, investissement materiel) ou par API (immediat, cout par photo, RGPD a traiter).
7. **Reprise de l'existant** : recupere-t-on les donnees du Supabase actuel ? Cela suppose l'acces au projet, sinon les 14 clients et les EDL existants restent ou ils sont.
8. **Qui developpe** : prestataire a recruter, ou construction par etapes directement ici.

---

## Annexes a produire si tu valides

- Maquettes des ecrans terrain (Android) et bureau (PC), HTML cliquable.
- Script SQL de creation de la base, avec le modele de donnees ci-dessus.
- Gabarit du rapport PDF, repris de tes documents D19 / Q19 actuels.
- Chiffrage detaille de la variante "plateforme + APK sur mesure".
