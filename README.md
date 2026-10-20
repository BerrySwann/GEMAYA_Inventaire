# GEMAYA - inventaire et etats des lieux

Application Android de releve d'equipements (inventaire et prise en charge) et
documents de conception. Depot prive.

## Reprendre le travail sur un autre poste

```bash
git clone https://github.com/BerrySwann/GEMAYA_Inventaire.git
cd GEMAYA_Inventaire
bash apk/outils/installer_chaine.sh   # Java 17, Gradle, SDK Android (sans sudo)
source ~/.gemaya-env
cd apk && python3 outils/construire_assets.py && gradle assembleRelease
```

L'APK sort dans `apk/app/build/outputs/apk/release/app-release.apk`.

## Ce que contient le depot

| Chemin | Contenu |
|---|---|
| `ARCHITECTURE_EDL_v2.md` | document de conception (pile technique, parcours, modele de donnees, chiffrage) |
| `architecture-edl-v2.html` | schema d'architecture |
| `maquettes-edl-v2.html` | maquette cliquable, deux onglets terrain et bureau |
| `apk/` | l'application Android : sources Java, page embarquee, script de fabrication |
| `apk/LISEZMOI.md` | installation sur le telephone, export CSV, identite de l'APK |

## Ce qui n'est volontairement pas dans le depot

- **La cle API** de lecture de plaque : elle est injectee au build depuis le
  poste (`~/.hermes/.env` ou `CLE_API_DEFAUT`), jamais versionnee. Sur un poste
  neuf, la saisir dans l'application ou l'exporter avant le build.
- **Le keystore** (`keystore/gemaya-edl.jks`) et ses mots de passe : ce sont eux
  qui permettent de signer les mises a jour. Sans eux, un autre poste peut
  compiler mais pas mettre a jour un telephone deja installe. A garder dans un
  coffre, pas dans un depot.
- Les APK et copies renommees `.xls` pour le transfert.

## Etat au dernier commit

Version 0.4 : base SQLite locale, photos reelles (appareil ou galerie), lecture
de plaque par service de vision avec confiance par champ, export CSV avec
partage mail, dix-huit familles d'equipements.
