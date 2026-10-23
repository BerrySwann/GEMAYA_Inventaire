package fr.gemaya.edl;

import android.webkit.JavascriptInterface;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Les ponts exposes a la page sous le nom window.Gemaya.
 *
 * Trois familles : la base SQLite (synchrone, elle est locale), la photo
 * (asynchrone, elle passe par l'appareil photo du telephone) et la lecture de
 * plaque (asynchrone, elle sort sur le reseau). Les deux dernieres rappellent
 * la page par window.photoRecue et window.lectureRecue.
 */
public class PontGemaya {

    private final MainActivity activite;
    private final BaseDb base;
    private final ExecutorService arrierePlan = Executors.newSingleThreadExecutor();

    PontGemaya(MainActivity activite, BaseDb base) {
        this.activite = activite;
        this.base = base;
    }

    @JavascriptInterface
    public String charger() {
        try {
            return base.charger();
        } catch (Exception e) {
            return null;
        }
    }

    @JavascriptInterface
    public String sauver(String charge) {
        try {
            base.sauver(charge);
            return "ok";
        } catch (Exception e) {
            return "erreur " + e.getMessage();
        }
    }

    @JavascriptInterface
    public String sauverListes(String charge) {
        try {
            base.sauverListes(charge);
            return "ok";
        } catch (Exception e) {
            return "erreur " + e.getMessage();
        }
    }

    @JavascriptInterface
    public String sauverFiche(String fiche) {
        try {
            base.sauverFiche(fiche);
            return "ok";
        } catch (Exception e) {
            return "erreur " + e.getMessage();
        }
    }

    @JavascriptInterface
    public String supprimerFiche(String id) {
        try {
            base.supprimerFiche(id);
            return "ok";
        } catch (Exception e) {
            return "erreur " + e.getMessage();
        }
    }

    @JavascriptInterface
    public String sauverPhoto(String photo) {
        try {
            base.sauverPhoto(photo);
            return "ok";
        } catch (Exception e) {
            return "erreur " + e.getMessage();
        }
    }

    @JavascriptInterface
    public String documents() {
        return base.listeDocuments();
    }

    @JavascriptInterface
    public String exporterDocument(String nom) {
        return activite.exporterDocument(nom);
    }

    @JavascriptInterface
    public String photosDeFiche(String ficheId) {
        return base.photosDeFiche(ficheId);
    }

    @JavascriptInterface
    public String lirePhoto(String ficheId, String role) {
        return base.lirePhoto(ficheId, role);
    }

    @JavascriptInterface
    public String info() {
        try {
            return base.info(activite);
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public String version() {
        try {
            android.content.pm.PackageInfo info =
                    activite.getPackageManager().getPackageInfo(activite.getPackageName(), 0);
            return new org.json.JSONObject()
                    .put("code", info.versionCode)
                    .put("nom", info.versionName)
                    .toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @JavascriptInterface
    public void photo(final String role) {
        activite.runOnUiThread(new Runnable() {
            @Override
            public void run() {
                activite.demanderPhoto(role);
            }
        });
    }

    @JavascriptInterface
    public void lecture(final String demande) {
        arrierePlan.execute(new Runnable() {
            @Override
            public void run() {
                String reponse = Modele.appeler(demande);
                activite.rappeler("lectureRecue", reponse);
            }
        });
    }

    @JavascriptInterface
    public void majVerifier(final String url) {
        arrierePlan.execute(new Runnable() {
            @Override
            public void run() {
                activite.rappeler("majVerifierRecue", MiseAJour.verifier(url));
            }
        });
    }

    @JavascriptInterface
    public void majTelecharger(final String url, final String nom) {
        arrierePlan.execute(new Runnable() {
            @Override
            public void run() {
                String reponse = MiseAJour.telecharger(activite, url, nom);
                activite.rappeler("majTelechargee", reponse);
            }
        });
    }

    @JavascriptInterface
    public void majInstaller(final String chemin) {
        arrierePlan.execute(new Runnable() {
            @Override
            public void run() {
                activite.rappeler("majInstallee", MiseAJour.installer(activite, chemin));
            }
        });
    }

    void fermer() {
        arrierePlan.shutdownNow();
    }
}
