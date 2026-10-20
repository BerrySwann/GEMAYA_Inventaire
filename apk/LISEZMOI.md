# APK EDL GEMAYA - version 0.8

## Ce que c'est

L'application de terrain, telle qu'elle se comporte aujourd'hui, installee en
APK sur un telephone Android. Ce n'est plus une maquette : la saisie est
conservee dans une base locale, les photos sont reelles, la plaque est lue par
un service de vision.

Ce qui marche :

- les huit ecrans du parcours, le bouton retour Android ;
- **base SQLite locale** : un equipement cree, une quantite corrigee, une liste
  modifiee survivent a la fermeture de l'application ;
- **photos reelles, dans la base** : appareil photo du telephone ou import
  depuis la galerie, image reduite a 1600 px, empreinte SHA-256, binaire et
  vignette stockes dans la table `photos` ;
- **lecture de plaque** : appelle un service de vision (DeepSeek verifie,
  Gemini, OpenAI, Mistral ou compatible) et remplit marque, modele, reference,
  numero de serie, gaz, puissances, avec un pourcentage de confiance par champ ;
- **configuration** : contrat, secteurs, localisations, etages, familles,
  equipements, plus la cle API et l'adresse du service ;
- **export CSV** : deux boutons dans Configuration, l'un ouvre le partage
  Android (Mail, Drive), l'autre ouvre l'ecran "enregistrer sous" du telephone.
  Point-virgule, UTF-8 avec BOM, une ligne par equipement. La colonne
  **Sous-localisation** n'apparait que si au moins une fiche la remplit ;
- **mise a jour depuis le telephone** : Configuration > Mises a jour, une
  adresse de fichier `update.json`, l'application compare les versions,
  telecharge l'APK et lance l'installation ;
- **dix-huit familles** proposees, chacune avec son libelle court (CFO - Courant
  fort, CFA - Courant faible, SSI - Securite incendie...) et des exemples
  concrets affiches sous le selecteur et dans la configuration ;
- fiche de saisie : **tous les champs visibles**, ceux de la famille choisie
  encadres, et retour automatique en haut de la section apres creation.

Ce qui n'existe pas encore : aucune synchronisation avec un serveur, aucun
compte multi-utilisateur, aucun rapport PDF, aucune comparaison annuelle. Le
bureau n'est pas encore branche sur cette base.

## Installation sur le telephone

1. Envoyer `EDL-GEMAYA-0.2.apk` sur le telephone (cable USB, Drive, mail).
2. Toucher le fichier, accepter l'installation.
3. Si Android refuse, autoriser les applications inconnues pour l'application
   source (Fichiers, Chrome, Drive).
4. L'icone **EDL GEMAYA** (l'embleme du logotype) apparait dans la liste.

L'APK demande une seule autorisation : **INTERNET**, pour la lecture de plaque.
Sans reseau, tout le reste fonctionne : saisie, photos, base locale.

## La lecture de plaque

1. Ouvrir la fiche d'un equipement, toucher la case **plaque**.
2. Choisir *Prendre une photo* ou *Choisir dans le telephone*.
3. Toucher **Lire la photo (reconnaissance)**.
4. Chaque champ rempli porte un badge `IA 95 %` ; une confiance sous 60 pour
   cent s'affiche en ambre : a verifier sur la plaque.

La cle API se saisit une fois dans **Configuration > Intelligence artificielle**.
Elle reste sur le telephone, ne passe pas par la page web. Reglage par defaut :
DeepSeek, modele `deepseek-chat`, qui accepte les images et a ete essaye.

La cle est aussi **embarquee dans l'APK** au moment de la fabrication : elle est
lue dans `~/.hermes/.env` par `outils/construire_assets.py` et ecrite dans
`assets/index.html` (`window.CLE_DEFAUT`), jamais dans le code source. Consequence
a connaître : quiconque possede le fichier APK peut en extraire la cle. Garder
l'APK pour soi, et changer la cle si le fichier circule un jour.

## Les contrats, proteges par un code

Ajouter ou supprimer un contrat demande un code a 4 chiffres : **1234**.
Les autres listes (secteurs, localisations, etages, familles, equipements)
restent libres.

Le code est ecrit dans `assets/app.js` (constante `CODE_CONTRATS`), et une
valeur enregistree dans la configuration (`config.code`) le remplace si elle
existe. Pour le changer aujourd'hui : me le demander, ou modifier la constante
et reconstruire l'APK. Un champ dedie dans l'ecran Configuration reste a faire.

## Mettre a jour l'application depuis le telephone

1. Deposer sur un hebergement accessible deux fichiers : l'APK et un
   `update.json` de cette forme :
   ```json
   {"versionCode": 7, "versionName": "0.7",
    "apk": "https://.../EDL-GEMAYA-0.7.apk", "notes": "ce qui change"}
   ```
2. Dans l'application : Configuration > **Mises a jour**, coller l'adresse du
   `update.json`, *Enregistrer l'adresse*.
3. *Verifier et installer* : l'application compare sa version avec celle du
   fichier, propose le telechargement, puis Android installe l'APK.
4. La premiere fois, Android demande d'autoriser GEMAYA a installer des
   applications ; l'application ouvre elle-meme l'ecran de reglage.

Le `versionCode` doit augmenter a chaque build (7, 8, ...), sinon la mise a jour
n'est pas proposee.

## Exporter le releve et l'envoyer par mail

Configuration > **Donnees de ce telephone** > *Exporter en CSV (mail)*.

L'application ecrit `EDL_GEMAYA_<contrat>_<date>.csv` (point-virgule, UTF-8 avec
BOM, donc les accents sont corrects a l'ouverture dans Excel) et ouvre le
partage Android : toucher Mail, Drive ou Fichiers pour l'envoyer. Une ligne
d'en-tete, puis une ligne par equipement. Les photos ne sont pas dans le CSV :
il cite leur nom de fichier, les images restent sur le telephone.

## Mise a jour

Un APK installe ne se met pas a jour tout seul. Pour installer une nouvelle
version, il faut **le meme keystore** : voir ci-dessous.

## Le keystore : le point a ne jamais perdre

- fichier : `keystore/gemaya-edl.jks`
- alias : `gemaya`
- mots de passe : dans `keystore/keystore.properties`
- empreinte SHA-256 du certificat :
  `d4918237964c7a7c258c6e9b4c03d685736b137b28775db6de83e27fe79486d6`

Si ce fichier est perdu, plus aucune mise a jour de l'application ne sera
possible sur les telephones deja installes : il faudra desinstaller, et les
donnees locales seront perdues. Copier ces deux fichiers dans un coffre, hors
du poste de developpement.

La 0.1, la 0.2 et la 0.3 portent la meme signature : chaque version s'installe
par-dessus la precedente sans desinstallation, et les donnees restent.

## Reconstruire l'APK

```bash
export JAVA_HOME=/home/home/tools/jdk-17.0.20.1+1
export ANDROID_HOME=/home/home/Android/Sdk
cd "/home/home/Documents/SEMERU/EDL/apk"
python3 outils/construire_assets.py      # maquette + app.js -> app/src/main/assets/index.html
/home/home/tools/gradle-8.9/bin/gradle assembleRelease
cp app/build/outputs/apk/release/app-release.apk EDL-GEMAYA-0.3.apk
```

`construire_assets.py` reprend `../maquettes-edl-v2.html` : une correction de
maquette se fait dans ce fichier, puis on relance le script. Il remplace le lien
Google Fonts par les polices locales de `assets/polices`, retire la presentation
bureau, ajoute la fonction de retour Android et charge `assets/app.js`.

`assets/app.js` est la couche application : base, photos, lecture de plaque,
familles, comportement de la fiche. Le code Java est dans
`app/src/main/java/fr/gemaya/edl/` : `MainActivity` (WebView, appareil photo),
`PontGemaya` (ponts exposes a la page), `BaseDb` (SQLite), `Photos`
(redimensionnement), `Modele` (appel du service de vision).

Tests sur emulateur, avec l'APK de debug (la page est alors inspectable) :

```bash
adb shell am start -n fr.gemaya.edl/.MainActivity
PID=$(adb shell pidof fr.gemaya.edl)
adb forward tcp:9222 localabstract:webview_devtools_remote_$PID
node outils/cdp.mjs "JSON.stringify({fiches: equipements.length})"
adb shell run-as fr.gemaya.edl sqlite3 databases/gemaya-edl.db 'select * from fiches'
```

Chaine installee : JDK 17 (`/home/home/tools/jdk-17.0.20.1+1`), Gradle 8.9
(`/home/home/tools/gradle-8.9`), SDK Android 34 (`/home/home/Android/Sdk`),
build-tools 34.0.0.

## Identite de l'application

| | |
|---|---|
| Package | `fr.gemaya.edl` |
| Version | 0.8 (versionCode 8) |
| Android minimum | 7.0 (API 24) |
| Cible | Android 14 (API 34) |
| Taille | 2,4 Mo |
| Permissions | INTERNET et installer des applications (mise a jour) |
| Signature | certificat autosigne CN=GEMAYA, RSA 4096, 30 ans |

## Les donnees

Base : `databases/gemaya-edl.db`, tables `contrats`, `secteurs`,
`localisations`, `niveaux`, `familles`, `equipements_catalogue`, `fiches`,
`config`. Photos : `files/photos/*.jpg`, une par prise de vue.

L'enregistrement est **incremental** : une fiche modifiee n'ecrit que sa ligne,
les listes de reference ne sont reecrites que si elles changent, et une photo
n'ecrit que son propre binaire. Mesure sur l'emulateur a 20 000 fiches :
ouverture 1,4 s, affichage de la visite 40 ms, enregistrement 5 ms.

Poids : une photo de 1600 x 1200 fait 1,37 Mo en binaire. A trois photos de
400 Ko par equipement, comptez 1,2 Mo par fiche : 1 000 fiches = 1,2 Go,
5 000 = 6 Go, 40 000 = 48 Go. Le telephone doit avoir la place, et une
sauvegarde de la base emporte les images avec elle.

## Quand la vraie application arrivera

La coquille WebView sera remplacee par le code SvelteKit compile et emballe par
Capacitor, avec le **meme identifiant de package** et le **meme keystore** :
l'installation remplacera cette version sur les telephones, sans desinstallation.
