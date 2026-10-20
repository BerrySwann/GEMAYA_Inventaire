"""Convertit un inventaire Excel (mise en page client) en CSV importable par l'application.

    python3 outils/inventaire_vers_csv.py "<fichier.xlsx>" [sortie.csv]

Structure attendue, celle des inventaires du client : une ligne d'en-tete, des
lignes de bandeau (SECTEUR : / Localisation :), puis une ligne par equipement.
Seules les lignes qui portent un contrat en colonne 1 sont reprises.
"""
import csv
import sys
import unicodedata

import openpyxl

# colonnes du fichier client (index 1)
COL_CONTRAT = 1
COL_SECTEUR = 2
COL_NIVEAU = 3
COL_LOCALISATION = 5
COL_CATEGORIE = 6
COL_QUANTITE = 7
COL_EQUIPEMENT = 8
COL_DETAILS = 9
COL_MARQUE = 10
COL_MODELE = 11
COL_REFERENCE = 12
COL_SERIE = 13
COL_PUISSANCE_ELEC = 14
COL_PUISSANCE_THERM = 15
COL_DEBIT_AIR = 16
COL_DEBIT_EAU = 17
COL_OBSERVATION = 18
COL_TYPE_MATERIEL = 19

ENTETES = [
    "contrat", "secteur", "sous-localisation", "localisation", "etage",
    "famille", "quantite", "equipement", "marque", "modele", "reference",
    "numero de serie", "puissance electrique", "puissance thermique", "debit",
    "type", "etat", "urgence", "commentaire",
]


def texte(valeur):
    if valeur is None:
        return ""
    return str(valeur).strip().replace("\n", " ")


def lire(chemin):
    classeur = openpyxl.load_workbook(chemin, data_only=True)
    feuille = classeur[classeur.sheetnames[0]]
    lignes = []
    for r in range(1, feuille.max_row + 1):
        contrat = texte(feuille.cell(r, COL_CONTRAT).value)
        equipement = texte(feuille.cell(r, COL_EQUIPEMENT).value)
        if not contrat or not equipement:
            continue
        if contrat.upper().startswith("CONTRAT"):
            continue
        debit = texte(feuille.cell(r, COL_DEBIT_AIR).value) or texte(feuille.cell(r, COL_DEBIT_EAU).value)
        commentaire = texte(feuille.cell(r, COL_DETAILS).value) or texte(feuille.cell(r, COL_OBSERVATION).value)
        lignes.append([
            contrat,
            texte(feuille.cell(r, COL_SECTEUR).value),
            "",
            texte(feuille.cell(r, COL_LOCALISATION).value),
            texte(feuille.cell(r, COL_NIVEAU).value),
            texte(feuille.cell(r, COL_CATEGORIE).value),
            texte(feuille.cell(r, COL_QUANTITE).value),
            equipement,
            texte(feuille.cell(r, COL_MARQUE).value),
            texte(feuille.cell(r, COL_MODELE).value),
            texte(feuille.cell(r, COL_REFERENCE).value),
            texte(feuille.cell(r, COL_SERIE).value),
            texte(feuille.cell(r, COL_PUISSANCE_ELEC).value),
            texte(feuille.cell(r, COL_PUISSANCE_THERM).value),
            debit,
            texte(feuille.cell(r, COL_TYPE_MATERIEL).value),
            "", "", commentaire,
        ])
    return lignes


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    source = sys.argv[1]
    sortie = sys.argv[2] if len(sys.argv) > 2 else "inventaire.csv"
    lignes = lire(source)
    with open(sortie, "w", encoding="utf-8-sig", newline="") as f:
        ecrivain = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        ecrivain.writerow(ENTETES)
        ecrivain.writerows(lignes)

    familles = {}
    for l in lignes:
        familles[l[5]] = familles.get(l[5], 0) + 1
    secteurs = len({l[1] for l in lignes})
    localisations = len({(l[1], l[3]) for l in lignes})
    print(f"ecrit     : {sortie}")
    print(f"lignes    : {len(lignes)}")
    print(f"secteurs  : {secteurs}")
    print(f"pieces    : {localisations}")
    print(f"familles  : {dict(sorted(familles.items(), key=lambda x: -x[1]))}")


if __name__ == "__main__":
    main()
