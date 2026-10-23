# A faire

Idees notees, pas encore developpees.

## Affichage des caracteristiques selon le materiel

Aujourd'hui les champs de la fiche dependent de la famille (CVC, ECL, CFO...). Il faudra
descendre plus fin : chaque type d'equipement devrait avoir sa propre liste de champs
visibles, et les colonnes du CSV suivre.

Exemples a trancher :

- un filtre : taille, classe, quantite. Pas de numero de serie, pas de gaz.
- un moteur : puissance, intensite, vitesse, cos phi. Pas de taille de filtre.
- un coffret : nombre de departs, calibre, intensite. Pas de debit.
- un BAES : ni puissance, ni taille, juste quantite et etat.

Le mecanisme existe deja a moitie (attribut `data-fam` sur les blocs de champs) : il
suffit de raffiner la cle de `famille` vers `famille + type d'equipement`.

Effet attendu : moins de champs vides dans l'export, et une fiche plus courte sur le
terrain.

## Autres points en attente

- fusion des doublons exacts de l'inventaire client (13 lignes dans NIKAIA)
- etat "Remplacement prevu" et etat "A remplacer" : deux boutons proches, a fusionner
  ou a differencier clairement
- numerotation des secteurs, si l'ordre de visite doit aussi y apparaitre
