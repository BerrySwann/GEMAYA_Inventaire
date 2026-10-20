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
    public String info() {
        try {
            return base.info(activite);
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

    void fermer() {
        arrierePlan.shutdownNow();
    }
}
