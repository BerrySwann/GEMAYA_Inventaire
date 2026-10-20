"""Fabrique l'index.html embarque dans l'APK a partir de la maquette.

La maquette est une page de presentation (deux onglets, un cadre de telephone
au centre). Dans l'APK il ne doit rester que l'ecran du telephone, en plein
ecran, sans reseau : les polices sont telechargees une fois dans assets/polices.

Usage : python3 outils/construire_assets.py
"""
import pathlib
import re
import json
import os
import sys

RACINE = pathlib.Path(__file__).resolve().parents[1]
MAQUETTE = RACINE.parent / "maquettes-edl-v2.html"
ASSETS = RACINE / "app/src/main/assets"
SORTIE = ASSETS / "index.html"

CSS_MOBILE = """
/* ---------- coquille mobile : la presentation bureau disparait ---------- */
html,body{width:100%;height:100%;overflow:hidden;background:#fff}
body{padding:0}
.page{max-width:none;margin:0}
.entete,.avis,.gauche,.note-bas,.chips,#panneau-bureau{display:none!important}
.etage{display:block;gap:0;flex-wrap:nowrap}
.telephone{width:100%;height:100dvh;padding:0;border-radius:0;background:#fff;
           box-shadow:none;flex:none}
.ecran{height:100dvh;border-radius:0;background:#fff}
.barre-etat{display:none!important}
.ecran-vue{height:100%}
.app-pied{padding-bottom:env(safe-area-inset-bottom)}

/* ---------- photos reelles et champs de la famille ---------- */
.photo-slot{position:relative;overflow:hidden}
.photo-slot img{width:100%;height:100%;object-fit:cover;border-radius:10px;display:block}
.photo-slot .etiquette{position:absolute;bottom:3px;left:4px;font-size:9px;color:#fff;
                       background:rgba(11,37,69,.7);padding:1px 5px;border-radius:4px}
.bloc-champ.de-la-famille{border-left:3px solid var(--bleu-500);padding-left:8px;margin-left:-8px}
.etat-ia.faible{background:var(--ambre-fond);color:var(--ambre);border:1px solid var(--ambre)}

/* ---------- correction proposee sous un champ ---------- */
.suggestion{font-size:12.5px;color:var(--bleu-700);background:var(--bleu-050);border:1px solid var(--bleu-100);
            border-radius:8px;padding:8px 10px;margin:-2px 0 10px;line-height:1.5}
.suggestion .lien{font:inherit;font-size:12.5px;font-weight:600;color:var(--bleu-700);background:var(--blanc);
                  border:1px solid var(--bleu-500);border-radius:6px;padding:4px 10px;margin-left:6px;cursor:pointer}
"""

SCRIPT_MOBILE = """
<script>
/* Retour materiel Android : on remonte dans le parcours au lieu de quitter. */
window.retour = function(){
  var vue = document.querySelector('.ecran-vue:not(.cache)');
  var id = vue ? vue.id : '';
  var precedent = {'e-fiche':'zones','e-champs':'fiche','e-photo':'fiche',
                   'e-envoi':'visites','e-config':'visites','e-zones':'visites'};
  var cible = precedent[id];
  if (cible && typeof ecran === 'function') { ecran(cible); return true; }
  return false;
};
</script>
"""


def cle_api():
    """La cle DeepSeek, lue au poste au moment du build, jamais ecrite dans le source."""
    env = pathlib.Path.home() / ".hermes/.env"
    if env.exists():
        for ligne in env.read_text(encoding="utf-8", errors="ignore").splitlines():
            if ligne.startswith("DEEPSEEK_API_KEY="):
                return ligne.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("CLE_API_DEFAUT", "")


def main():
    html = MAQUETTE.read_text(encoding="utf-8")
    polices = (ASSETS / "polices/polices.css").read_text(encoding="utf-8")

    # 1. les polices : en local, l'APK n'a pas le droit d'aller sur le reseau
    html, n_polices = re.subn(
        r'<link href="https://fonts\.googleapis\.com[^"]*" rel="stylesheet">',
        "<style>\n" + polices + "\n</style>", html)
    if n_polices != 1:
        raise SystemExit("lien de police introuvable dans la maquette")

    # 2. la coquille mobile, posee en dernier pour passer devant les regles existantes
    html = html.replace("</style>\n</head>",
                        "</style>\n<style>" + CSS_MOBILE + "</style>\n</head>", 1)

    # 3. le bouton retour
    html = html.replace("</body>", SCRIPT_MOBILE + "</body>", 1)

    # 3 ter. l'adresse de mise a jour, pour que « Verifier » marche sans configuration
    html = html.replace("</body>",
                        "<script>window.MAJ_URL_DEFAUT = "
                        + json.dumps("https://raw.githubusercontent.com/BerrySwann/gemaya-maj/main/update.json")
                        + ";</script>\n</body>", 1)

    # 3 bis. l'inventaire de depart, embarque pour la premiere ouverture
    graine = ASSETS / "inventaire-initial.csv"
    if graine.exists():
        concours = graine.read_text(encoding="utf-8-sig")
        html = html.replace("</body>",
                            "<script>window.INVENTAIRE_INITIAL = " + json.dumps(concours) + ";</script>\n</body>", 1)

    # 4. la couche application (base, photos, lecture de plaque), apres la maquette
    # --sans-cle : pour l'APK publie sur un hebergement public, la cle ne doit pas y etre
    cle = "" if "--sans-cle" in sys.argv else cle_api()
    if cle:
        html = html.replace("</body>",
                            "<script>window.CLE_DEFAUT = " + json.dumps(cle) + ";</script>\n</body>", 1)
    html = html.replace("</body>", '<script src="lexique.js"></script>\n<script src="app.js"></script>\n</body>', 1)

    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text(html, encoding="utf-8")

    restes = re.findall(r'(?:src|href)="(https?://[^"]+)"', html)
    print("ecrit       :", SORTIE)
    print("taille      :", len(html), "caracteres")
    print("url externes:", restes or "aucune")


if __name__ == "__main__":
    main()
