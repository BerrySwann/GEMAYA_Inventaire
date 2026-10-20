package fr.gemaya.edl;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

/**
 * Coquille Android : une WebView plein ecran qui charge l'application embarquee.
 *
 * Elle apporte ce qu'une page seule ne peut pas faire :
 *  - une base SQLite locale, donc les saisies survivent a la fermeture ;
 *  - l'appareil photo du telephone et la galerie ;
 *  - l'appel au modele de vision, hors du JavaScript pour la cle et le CORS.
 *
 * Le bouton retour remonte le parcours avant de quitter (window.retour).
 */
public class MainActivity extends Activity {

    private static final int DEMANDE_PHOTO = 11;
    private static final int DEMANDE_GALERIE = 12;
    private static final int DEMANDE_ENREGISTRER = 13;

    private String contenuAEnregistrer = "";

    private WebView vue;
    private BaseDb base;
    private PontGemaya pont;
    private String roleEnCours = "plaque";
    private File fichierPrise;
    private Uri uriPrise;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        base = new BaseDb(this);
        pont = new PontGemaya(this, base);

        /* en debug seulement : permet d'inspecter la page depuis le poste de developpement */
        if ((getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        vue = new WebView(this);
        WebSettings reglages = vue.getSettings();
        reglages.setJavaScriptEnabled(true);
        reglages.setDomStorageEnabled(true);
        reglages.setAllowFileAccess(true);
        reglages.setSupportZoom(false);
        reglages.setBuiltInZoomControls(false);
        reglages.setTextZoom(100);
        vue.addJavascriptInterface(new PontPage(), "Gemaya");
        vue.setWebViewClient(new WebViewClient());
        /* sans ceci, les fenetres "confirm" du JavaScript n'apparaissent pas et
           repondent toujours non (suppression, mise a jour) */
        vue.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onJsConfirm(WebView webView, String url, String message, final JsResult resultat) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("Oui", (dialogue, bouton) -> resultat.confirm())
                        .setNegativeButton("Annuler", (dialogue, bouton) -> resultat.cancel())
                        .setOnCancelListener(dialogue -> resultat.cancel())
                        .show();
                return true;
            }

            @Override
            public boolean onJsAlert(WebView webView, String url, String message, final JsResult resultat) {
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setPositiveButton("OK", (dialogue, bouton) -> resultat.confirm())
                        .show();
                return true;
            }

            @Override
            public boolean onJsPrompt(WebView webView, String url, String message,
                                      String valeurParDefaut, final JsPromptResult resultat) {
                final android.widget.EditText champ = new android.widget.EditText(MainActivity.this);
                champ.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
                champ.setText(valeurParDefaut == null ? "" : valeurParDefaut);
                new AlertDialog.Builder(MainActivity.this)
                        .setMessage(message)
                        .setView(champ)
                        .setPositiveButton("Valider", (dialogue, bouton) -> resultat.confirm(champ.getText().toString()))
                        .setNegativeButton("Annuler", (dialogue, bouton) -> resultat.cancel())
                        .setOnCancelListener(dialogue -> resultat.cancel())
                        .show();
                return true;
            }
        });
        vue.setBackgroundColor(0xFFFFFFFF);
        vue.setOverScrollMode(View.OVER_SCROLL_NEVER);

        setContentView(vue);
        vue.loadUrl("file:///android_asset/index.html");
    }

    /** La page n'a acces qu'a ce que l'on veut bien lui donner : la base, la photo, le modele. */
    private class PontPage {
        @JavascriptInterface
        public String charger() {
            return pont.charger();
        }

        @JavascriptInterface
        public String sauver(String charge) {
            return pont.sauver(charge);
        }

        @JavascriptInterface
        public String sauverListes(String charge) {
            return pont.sauverListes(charge);
        }

        @JavascriptInterface
        public String sauverFiche(String fiche) {
            return pont.sauverFiche(fiche);
        }

        @JavascriptInterface
        public String supprimerFiche(String id) {
            return pont.supprimerFiche(id);
        }

        @JavascriptInterface
        public String sauverPhoto(String photo) {
            return pont.sauverPhoto(photo);
        }

        @JavascriptInterface
        public String photosDeFiche(String ficheId) {
            return pont.photosDeFiche(ficheId);
        }

        @JavascriptInterface
        public String lirePhoto(String ficheId, String role) {
            return pont.lirePhoto(ficheId, role);
        }

        @JavascriptInterface
        public String info() {
            return pont.info();
        }

        @JavascriptInterface
        public String version() {
            return pont.version();
        }

        @JavascriptInterface
        public void photo(String role) {
            pont.photo(role);
        }

        @JavascriptInterface
        public void lecture(String demande) {
            pont.lecture(demande);
        }

        @JavascriptInterface
        public void majVerifier(String url) {
            pont.majVerifier(url);
        }

        @JavascriptInterface
        public void majTelecharger(String url, String nom) {
            pont.majTelecharger(url, nom);
        }

        @JavascriptInterface
        public void majInstaller(String chemin) {
            pont.majInstaller(chemin);
        }

        @JavascriptInterface
        public String enregistrer(String nom, String contenu) {
            return MainActivity.this.enregistrerFichier(nom, contenu);
        }

        @JavascriptInterface
        public String partager(String nom, String contenu) {
            return MainActivity.this.partagerFichier(nom, contenu);
        }
    }

    /* --------------------------------------------------------- export par mail */

    /** Ouvre l'ecran "enregistrer sous" d'Android : le fichier va dans Documents ou Telechargements. */
    String enregistrerFichier(String nom, String contenu) {
        try {
            contenuAEnregistrer = contenu == null ? "" : contenu;
            String propre = (nom == null || nom.isEmpty()) ? "releve.csv" : nom.replaceAll("[^A-Za-z0-9._-]", "_");
            Intent demande = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            demande.addCategory(Intent.CATEGORY_OPENABLE);
            demande.setType("text/csv");
            demande.putExtra(Intent.EXTRA_TITLE, propre);
            final Intent choix = demande;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startActivityForResult(choix, DEMANDE_ENREGISTRER);
                }
            });
            return "ok";
        } catch (Exception e) {
            return "erreur " + e.getMessage();
        }
    }

    private void ecrireDans(Uri uri) {
        try {
            java.io.OutputStream sortie = getContentResolver().openOutputStream(uri);
            if (sortie == null) {
                Toast.makeText(this, "Fichier non ouvrable", Toast.LENGTH_LONG).show();
                return;
            }
            sortie.write(("\ufeff" + contenuAEnregistrer).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            sortie.flush();
            sortie.close();
            Toast.makeText(this, "Releve enregistre", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Ecriture impossible : " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    String partagerFichier(String nom, String contenu) {
        try {
            File dossier = new File(getCacheDir(), "export");
            if (!dossier.exists() && !dossier.mkdirs()) {
                return "erreur dossier";
            }
            String propre = (nom == null || nom.isEmpty()) ? "releve.csv" : nom.replaceAll("[^A-Za-z0-9._-]", "_");
            File fichier = new File(dossier, propre);
            FileOutputStream flux = new FileOutputStream(fichier);
            /* le BOM ouvre les accents correctement dans Excel */
            flux.write(("\ufeff" + (contenu == null ? "" : contenu)).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            flux.close();

            Uri uri = androidx.core.content.FileProvider.getUriForFile(
                    this, getPackageName() + ".fichiers", fichier);
            Intent envoi = new Intent(Intent.ACTION_SEND);
            envoi.setType("text/csv");
            envoi.putExtra(Intent.EXTRA_STREAM, uri);
            envoi.putExtra(Intent.EXTRA_SUBJECT, "Releve d'equipements - GEMAYA");
            envoi.putExtra(Intent.EXTRA_TEXT, "Releve exporte depuis l'application GEMAYA.");
            envoi.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            final Intent choix = Intent.createChooser(envoi, "Envoyer le releve");
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startActivity(choix);
                }
            });
            return "ok " + fichier.getAbsolutePath();
        } catch (Exception e) {
            return "erreur " + e;
        }
    }

    /* ------------------------------------------------------------- la photo */

    void demanderPhoto(String role) {
        roleEnCours = role;
        final CharSequence[] choix = {"Prendre une photo", "Choisir dans le telephone", "Annuler"};
        new AlertDialog.Builder(this)
                .setTitle("Photo " + role)
                .setItems(choix, (dialogue, position) -> {
                    if (position == 0) {
                        ouvrirAppareil();
                    } else if (position == 1) {
                        ouvrirGalerie();
                    }
                })
                .show();
    }

    private void ouvrirAppareil() {
        fichierPrise = Photos.nouveauFichier(this);
        uriPrise = androidx.core.content.FileProvider.getUriForFile(
                this, getPackageName() + ".fichiers", fichierPrise);
        Intent intention = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
        intention.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uriPrise);
        intention.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(intention, DEMANDE_PHOTO);
        } catch (Exception e) {
            Toast.makeText(this, "Aucun appareil photo disponible", Toast.LENGTH_SHORT).show();
            ouvrirGalerie();
        }
    }

    private void ouvrirGalerie() {
        Intent intention = new Intent(Intent.ACTION_GET_CONTENT);
        intention.setType("image/*");
        intention.addCategory(Intent.CATEGORY_OPENABLE);
        try {
            startActivityForResult(Intent.createChooser(intention, "Choisir une photo"), DEMANDE_GALERIE);
        } catch (Exception e) {
            Toast.makeText(this, "Aucun selecteur d'images", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    protected void onActivityResult(int demande, int resultat, Intent donnees) {
        super.onActivityResult(demande, resultat, donnees);
        if (demande == DEMANDE_ENREGISTRER) {
            if (resultat == RESULT_OK && donnees != null && donnees.getData() != null) {
                ecrireDans(donnees.getData());
            } else {
                Toast.makeText(this, "Enregistrement annule", Toast.LENGTH_SHORT).show();
            }
            return;
        }
        if (resultat != RESULT_OK) {
            rappelerPhoto("{\"ok\":false,\"message\":\"Photo annulee\"}");
            return;
        }
        File source = null;
        if (demande == DEMANDE_PHOTO) {
            source = fichierPrise;
        } else if (demande == DEMANDE_GALERIE && donnees != null && donnees.getData() != null) {
            source = copierDepuisGalerie(donnees.getData());
        }
        if (source == null || !source.exists()) {
            rappelerPhoto("{\"ok\":false,\"message\":\"Aucune photo recue\"}");
            return;
        }
        final File fichier = source;
        final String role = roleEnCours;
        new Thread(new Runnable() {
            @Override
            public void run() {
                final String json = Photos.traiter(MainActivity.this, fichier, role);
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        rappelerPhoto(json);
                    }
                });
            }
        }).start();
    }

    private File copierDepuisGalerie(Uri uri) {
        try {
            ContentResolver resolveur = getContentResolver();
            InputStream entree = resolveur.openInputStream(uri);
            if (entree == null) {
                return null;
            }
            File sortie = Photos.nouveauFichier(this);
            FileOutputStream flux = new FileOutputStream(sortie);
            byte[] tampon = new byte[8192];
            int lus;
            while ((lus = entree.read(tampon)) > 0) {
                flux.write(tampon, 0, lus);
            }
            flux.close();
            entree.close();
            return sortie;
        } catch (Exception e) {
            return null;
        }
    }

    /* ----------------------------------------------------- rappels vers la page */

    void rappeler(String fonction, String json) {
        final String appel = "window." + fonction + " ? window." + fonction + "(" + JSONObject.quote(json) + ") : null";
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (vue != null) {
                    vue.evaluateJavascript(appel, null);
                }
            }
        });
    }

    private void rappelerPhoto(String json) {
        final String role = roleEnCours;
        final String appel = "window.photoRecue ? window.photoRecue(" + JSONObject.quote(role) + ", "
                + JSONObject.quote(json) + ") : null";
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (vue != null) {
                    vue.evaluateJavascript(appel, null);
                }
            }
        });
    }

    /* ------------------------------------------------------------------ retour */

    private void quitter() {
        super.onBackPressed();
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        if (vue == null) {
            quitter();
            return;
        }
        vue.evaluateJavascript("window.retour ? window.retour() : false", valeur -> {
            if (valeur == null || "false".equals(valeur) || "null".equals(valeur)) {
                quitter();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (pont != null) {
            pont.fermer();
        }
        if (base != null) {
            base.close();
        }
        super.onDestroy();
    }
}
