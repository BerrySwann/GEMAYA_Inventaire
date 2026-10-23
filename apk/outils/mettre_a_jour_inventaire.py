"""Remet l'inventaire embarque dans l'application a partir du fichier client.

    python3 outils/mettre_a_jour_inventaire.py "<fichier client.xlsx>"

Trois etapes, dans cet ordre :

1. conversion du fichier client en CSV (outils/inventaire_vers_csv.py), avec la
   numerotation des localisations dans l'ordre du fichier ;
2. marquage des lignes arrivees avec cette version : elles portent la date dans la
   colonne `ajout`, pour que l'application affiche le badge « nouveau » et que le
   CSV exporte distingue l'inventaire client de ce qui a ete ajoute ;
3. ajout des filtres qui manquent au fichier client (un G4 en amont et un F7 en
   aval par centrale de traitement d'air), car il ne les liste pas.

Le fichier produit remplace app/src/main/assets/inventaire-initial.csv.
"""
import csv
import pathlib
import re
import subprocess
import sys

RACINE = pathlib.Path(__file__).resolve().parents[1]
ASSETS = RACINE / "app/src/main/assets"
REFERENCE = RACINE / "outils/inventaire-precedent.csv"
SORTIE = ASSETS / "inventaire-initial.csv"

FILTRES = [
    ("LOCAL TECHNIQUE CTA NORD", "01"),
    ("LOCAL TECHNIQUE CTA NORD", "03"),
    ("LOCAL TECHNIQUE CTA NORD", "05"),
    ("LOCAL TECHNIQUE CTA SUD", "02"),
    ("LOCAL TECHNIQUE CTA SUD", "04"),
]


def norm(t):
    return re.sub(r"\s+", " ", str(t or "")).strip().lower()


def sans_numero(t):
    return re.sub(r"^\d{2} - ", "", str(t or "")).strip()


def lire(chemin):
    with open(chemin, encoding="utf-8-sig", newline="") as f:
        return list(csv.reader(f, delimiter=";"))


def ecrire(chemin, lignes):
    with open(chemin, "w", encoding="utf-8-sig", newline="") as f:
        csv.writer(f, delimiter=";").writerows(lignes)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    source = sys.argv[1]

    # 0. reference actuelle : sert a savoir quelles lignes sont nouvelles
    anciennes = lire(REFERENCE)
    e_anciennes = anciennes[0]
    i_s, i_l, i_e = (e_anciennes.index(x) for x in ("secteur", "localisation", "equipement"))
    connues = {(norm(sans_numero(l[i_s])), norm(sans_numero(l[i_l])), norm(l[i_e]))
               for l in anciennes[1:]}
    # les filtres ajoutes par nos soins ne doivent pas etre comptes comme « nouveaux »
    connues_filtres = {norm(l[i_e]) for l in anciennes[1:] if l[i_e].startswith("Filtre ")}

    # 1. conversion
    temporaire = RACINE / "outils/.inventaire-temporaire.csv"
    subprocess.run([sys.executable, str(RACINE / "outils/inventaire_vers_csv.py"), source, str(temporaire)],
                   check=True)
    lignes = lire(temporaire)
    entetes, corps = lignes[0], lignes[1:]
    i_ajout = entetes.index("ajout")

    # 2. marquage
    ajoutees = 0
    for l in corps:
        cle = (norm(sans_numero(l[entetes.index("secteur")])),
               norm(sans_numero(l[entetes.index("localisation")])),
               norm(l[entetes.index("equipement")]))
        if cle in connues or norm(l[entetes.index("equipement")]) in connues_filtres:
            l[i_ajout] = ""
        else:
            l[i_ajout] = "2026-10"
            ajoutees += 1

    # 3. filtres manquants
    deja = {norm(l[entetes.index("equipement")]) for l in corps}
    nouveaux_filtres = []
    for secteur, cta in FILTRES:
        for classe, etape in (("G4", "amont"), ("F7", "aval")):
            nom = "Filtre %s CTA %s (%s)" % (classe, cta, etape)
            if norm(nom) in deja:
                continue
            ligne = [""] * len(entetes)
            ligne[entetes.index("contrat")] = "PALAIS NIKAÏA"
            ligne[entetes.index("secteur")] = secteur
            ligne[entetes.index("localisation")] = "01 - Local technique R1"
            ligne[entetes.index("etage")] = "NIVEAU 0 / RDC"
            ligne[entetes.index("famille")] = "CVC"
            ligne[entetes.index("quantite")] = "1"
            ligne[entetes.index("equipement")] = nom
            ligne[entetes.index("commentaire")] = "Taille et classe a relever sur le cadre"
            ligne[i_ajout] = "2026-10"
            nouveaux_filtres.append(ligne)

    ecrire(SORTIE, [entetes] + corps + nouveaux_filtres)
    temporaire.unlink(missing_ok=True)

    print("lignes du fichier client :", len(corps))
    print("  marquees comme ajout   :", ajoutees)
    print("  filtres ajoutes        :", len(nouveaux_filtres))
    print("total embarque           :", len(corps) + len(nouveaux_filtres))


if __name__ == "__main__":
    main()
