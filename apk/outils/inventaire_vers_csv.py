"""Convertit un inventaire Excel (mise en page client) en CSV importable par l'application.

    python3 outils/inventaire_vers_csv.py "<fichier.xlsx>" [sortie.csv]

Structure attendue, celle des inventaires du client : une ligne d'en-tete, des
lignes de bandeau (SECTEUR : / Localisation :), puis une ligne par equipement.
Seules les lignes qui portent un contrat en colonne 1 sont reprises.
"""
import csv
import re
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
COL_PUISSANCE_WATTS = 30
COL_MISE_EN_SERVICE = 31
COL_NATURE = 20

ENTETES = [
    "contrat", "secteur", "sous-localisation", "localisation", "etage",
    "famille", "quantite", "equipement", "marque", "modele", "reference",
    "numero de serie", "puissance electrique", "puissance thermique", "debit",
    "type", "etat", "urgence", "commentaire", "annee", "intensite", "ajout",
]


def texte(valeur):
    if valeur is None:
        return ""
    return str(valeur).strip().replace("\n", " ")


def lire(chemin):
    classeur = openpyxl.load_workbook(chemin, data_only=True)
    feuille = classeur[classeur.sheetnames[0]]
    lignes = []
    # le fichier client pose le secteur et la localisation sur des lignes de bandeau,
    # puis les omet sur les lignes de detail : on garde le contexte en cours
    secteur_courant = ""
    localisation_courante = ""
    niveau_courant = ""
    for r in range(1, feuille.max_row + 1):
        premiere = texte(feuille.cell(r, COL_CONTRAT).value)
        if premiere.upper().startswith("SECTEUR"):
            secteur_courant = re.sub(r"(?i)^secteur\s*:\s*", "", premiere).strip()
            localisation_courante = ""
            continue
        if premiere.upper().startswith("LOCALISATION"):
            localisation_courante = re.sub(r"(?i)^localisation\s*:\s*", "", premiere).strip()
            continue
        contrat = premiere
        equipement = texte(feuille.cell(r, COL_EQUIPEMENT).value)
        if not equipement:
            # lignes de detail du client : le materiel est decrit en colonne 20
            equipement = texte(feuille.cell(r, COL_NATURE).value)
        if not contrat or not equipement:
            continue
        if contrat.upper().startswith("SECTEUR") or contrat.upper().startswith("LOCALISATION") \
                or contrat.upper().startswith("CONTRAT"):
            continue
        if contrat.upper().startswith("CONTRAT"):
            continue
        secteur = texte(feuille.cell(r, COL_SECTEUR).value) or secteur_courant
        localisation = texte(feuille.cell(r, COL_LOCALISATION).value) or localisation_courante
        niveau = texte(feuille.cell(r, COL_NIVEAU).value) or niveau_courant
        if texte(feuille.cell(r, COL_NIVEAU).value):
            niveau_courant = texte(feuille.cell(r, COL_NIVEAU).value)
        debit = texte(feuille.cell(r, COL_DEBIT_AIR).value) or texte(feuille.cell(r, COL_DEBIT_EAU).value)
        puissance = (texte(feuille.cell(r, COL_PUISSANCE_ELEC).value)
                     or texte(feuille.cell(r, COL_PUISSANCE_WATTS).value))
        annee = texte(feuille.cell(r, COL_MISE_EN_SERVICE).value)
        commentaire = texte(feuille.cell(r, COL_DETAILS).value) or texte(feuille.cell(r, COL_OBSERVATION).value)
        lignes.append([
            contrat,
            secteur,
            "",
            localisation,
            niveau,
            texte(feuille.cell(r, COL_CATEGORIE).value),
            texte(feuille.cell(r, COL_QUANTITE).value),
            equipement,
            texte(feuille.cell(r, COL_MARQUE).value),
            texte(feuille.cell(r, COL_MODELE).value),
            texte(feuille.cell(r, COL_REFERENCE).value),
            texte(feuille.cell(r, COL_SERIE).value),
            puissance,
            texte(feuille.cell(r, COL_PUISSANCE_THERM).value),
            debit,
            texte(feuille.cell(r, COL_TYPE_MATERIEL).value),
            "", "", commentaire, annee, "", "",
        ])
    return lignes


def numeroter_localisations(lignes):
    """Numérote les localisations 01, 02... dans l'ordre du fichier, secteur par secteur.

    Sans cela les listes se retrouvent dans l'ordre alphabétique, où « Acceuil »
    précède « Entrée » alors que le client visite l'entrée en premier.
    """
    rangs = {}
    ordre = {}
    for ligne in lignes:
        localisation = ligne[3]
        if not localisation:
            continue
        secteur = ligne[1]
        cle = (secteur, localisation)
        if cle not in rangs:
            ordre[secteur] = ordre.get(secteur, 0) + 1
            rangs[cle] = ordre[secteur]
        ligne[3] = "%02d - %s" % (rangs[cle], localisation)
    return lignes


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(2)
    source = sys.argv[1]
    sortie = sys.argv[2] if len(sys.argv) > 2 else "inventaire.csv"
    lignes = numeroter_localisations(lire(source))
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
