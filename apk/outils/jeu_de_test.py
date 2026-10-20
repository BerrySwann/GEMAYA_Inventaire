"""Genere un jeu de donnees volumineux pour mesurer la tenue de l'application.

Produit un fichier SQL a injecter dans la base du telephone :

    python3 outils/jeu_de_test.py 5000 > /tmp/jeu.sql
    adb push /tmp/jeu.sql /data/local/tmp/jeu.sql
    adb shell "run-as fr.gemaya.edl sh -c 'cat /data/local/tmp/jeu.sql | sqlite3 databases/gemaya-edl.db'"

Les fiches sont reparties sur des secteurs, localisations et niveaux varies,
avec des valeurs de champs realistes : c'est la forme des donnees qui compte
pour la mesure, pas leur verite technique.
"""
import json
import random
import sys
from datetime import datetime, timedelta

FAMILLES = ["CVC", "ECL", "CFO", "SSI", "SAN", "CFA", "SUR", "GAZ"]
SECTEURS = ["Administration", "Loges", "Local technique SUD", "Hall", "Cuisine", "Parking"]
LOCALISATIONS = ["Bureau", "Accueil", "Local menage", "Placard technique", "Salle", "Reserve"]
NIVEAUX = ["NIVEAU 0 / RDC", "NIVEAU 1", "NIVEAU 2", "Sous-sol", "Toiture"]
ETATS = ["bon", "correct", "vetuste", "hors", "nonteste"]
URGENCES = ["", "", "", "A", "B", "C"]
MARQUES = ["Atlantic", "Carrier", "Daikin", "Legrand", "Schneider", "Zumtobel", "Siemens"]
DESIGNATIONS = ["Ventilo-convecteur", "Split", "Pompe a chaleur", "Dalle LED", "Armoire CFO",
                "Tableau divisionnaire", "Centrale incendie", "Detecteur optique", "Ballon ECS"]


def echapper(valeur):
    return str(valeur).replace("'", "''")


def main(nombre):
    graine = random.Random(20261020)
    base = datetime(2026, 9, 1)
    print("BEGIN TRANSACTION;")
    print("DELETE FROM fiches;")
    print("DELETE FROM secteurs; DELETE FROM localisations; DELETE FROM niveaux;")
    print("DELETE FROM equipements_catalogue;")
    for s in SECTEURS:
        print(f"INSERT INTO secteurs(libelle) VALUES ('{echapper(s)}');")
    for l in LOCALISATIONS:
        print(f"INSERT INTO localisations(libelle) VALUES ('{echapper(l)}');")
    for n in NIVEAUX:
        print(f"INSERT INTO niveaux(libelle) VALUES ('{echapper(n)}');")
    vus = set()
    for i in range(nombre):
        famille = graine.choice(FAMILLES)
        designation = graine.choice(DESIGNATIONS)
        if (famille, designation) not in vus:
            vus.add((famille, designation))
            print(f"INSERT INTO equipements_catalogue(famille, libelle) VALUES "
                  f"('{echapper(famille)}', '{echapper(designation)}');")
        valeurs = [""] * 17
        valeurs[0] = graine.choice(MARQUES)
        valeurs[1] = f"REF-{graine.randint(100, 9999)}"
        valeurs[2] = f"SN-{graine.randint(100000, 999999)}"
        valeurs[3] = f"{graine.randint(2, 40) / 2} kW"
        valeurs[6] = graine.choice(["R32", "R410A", "", ""])
        valeurs[14] = str(graine.randint(1, 6))
        valeurs[15] = str(graine.randint(2005, 2026))
        valeurs[16] = graine.choice(["", "", "Filtre encrasse", "Aucun acces"])
        jour = (base + timedelta(days=graine.randint(0, 45))).isoformat()
        ident = f"F{i:06d}"
        print("INSERT INTO fiches(id, contrat, visite, secteur, localisation, niveau, famille,"
              " designation, marque, quantite, etat, urgence, commentaire, valeurs, photos,"
              " fichiers, cree_le, modifie_le) VALUES ("
              f"'{ident}', 'PALAIS NIKAIA', 'INVENTAIRE', '{echapper(graine.choice(SECTEURS))}',"
              f" '{echapper(graine.choice(LOCALISATIONS))}', '{echapper(graine.choice(NIVEAUX))}',"
              f" '{famille}', '{echapper(designation)}', '{echapper(valeurs[0])}',"
              f" '{valeurs[14]}', '{graine.choice(ETATS)}', '{graine.choice(URGENCES)}', '',"
              f" '{echapper(json.dumps(valeurs))}', '{{}}', '{{}}', '{jour}', '{jour}');")
    print("COMMIT;")


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 5000)
