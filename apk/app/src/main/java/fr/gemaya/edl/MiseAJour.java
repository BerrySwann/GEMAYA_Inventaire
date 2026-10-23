package fr.gemaya.edl;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Mise a jour de l'application depuis le telephone, sans passer par un mail.
 *
 * Le principe : une petite adresse (un fichier JSON) dit quelle est la derniere
 * version et ou se trouve son APK. L'application compare avec la sienne,
 * telecharge le fichier, puis lance l'installateur d'Android. Android demande
 * une fois l'autorisation "installer des applications inconnues" pour GEMAYA.
 *
 * Format attendu du fichier JSON :
 *   { "versionCode": 6, "versionName": "0.6", "apk": "https://.../EDL-GEMAYA-0.6.apk",
 *     "notes": "ce qui change" }
 */
final class MiseAJour {

    private MiseAJour() {
    }

    static String verifier(String urlManifeste) {
        try {
            /* GitHub garde ses fichiers 5 minutes en cache : ce parametre force
               une lecture fraiche, sinon l'application annonce une version perimee. */
            String adresse = urlManifeste;
            if (!adresse.contains("?")) {
                adresse = adresse + "?t=" + System.currentTimeMillis();
            }
            String corps = lire(adresse);
            JSONObject o = new JSONObject(corps);
            int code = o.optInt("versionCode", 0);
            String nom = o.optString("versionName", "");
            String apk = o.optString("apk", "");
            String notes = o.optString("notes", "");

            /* Le fichier update.json est servi par un cache de cinq minutes. Plutot que
               d'annoncer une version perimee, on demande directement a GitHub quelle est
               la derniere publication : l'API repond en quelques secondes. */
            try {
                JSONObject derniere = dernierePublication();
                if (derniere != null) {
                    String etiquette = derniere.optString("tag_name", "").replaceFirst("^v", "");
                    int codeApi = codeDeLEtiquette(etiquette);
                    String apkApi = premierePieceJointe(derniere);
                    if (codeApi > code && !apkApi.isEmpty()) {
                        code = codeApi;
                        nom = etiquette;
                        apk = apkApi;
                        notes = derniere.optString("body", "");
                    }
                }
            } catch (Exception ignore) {
                /* sans l'API on garde la reponse du fichier */
            }

            JSONObject reponse = new JSONObject();
            reponse.put("ok", true);
            reponse.put("versionCode", code);
            reponse.put("versionName", nom);
            reponse.put("apk", apk);
            reponse.put("notes", notes);
            return reponse.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"erreur\":\"" + echapper("Verification impossible : " + e.getMessage()) + "\"}";
        }
    }

    static String telecharger(Context contexte, String urlApk, String nom) {
        try {
            File dossier = new File(contexte.getCacheDir(), "maj");
            if (!dossier.exists() && !dossier.mkdirs()) {
                return "{\"ok\":false,\"erreur\":\"dossier impossible\"}";
            }
            String propre = (nom == null || nom.isEmpty()) ? "gemaya.apk" : nom.replaceAll("[^A-Za-z0-9._-]", "_");
            if (!propre.endsWith(".apk")) {
                propre = propre + ".apk";
            }
            File fichier = new File(dossier, propre);
            HttpURLConnection lien = (HttpURLConnection) new URL(urlApk).openConnection();
            lien.setConnectTimeout(20000);
            lien.setReadTimeout(120000);
            lien.setInstanceFollowRedirects(true);
            lien.setRequestProperty("Accept", "application/octet-stream");
            int code = lien.getResponseCode();
            if (code < 200 || code >= 300) {
                return "{\"ok\":false,\"erreur\":\"le serveur a repondu " + code + "\"}";
            }
            InputStream entree = lien.getInputStream();
            FileOutputStream sortie = new FileOutputStream(fichier);
            byte[] tampon = new byte[65536];
            long total = 0;
            int lus;
            while ((lus = entree.read(tampon)) > 0) {
                sortie.write(tampon, 0, lus);
                total += lus;
            }
            sortie.close();
            entree.close();
            lien.disconnect();
            /* une copie visible dans Telechargements/gemaya : si l'installation
               automatique echoue, l'utilisateur retrouve le fichier et le touche */
            copierVersTelechargements(contexte, propre, fichier);
            JSONObject r = new JSONObject();
            r.put("ok", true);
            r.put("chemin", fichier.getAbsolutePath());
            r.put("visible", "Telechargements/gemaya/" + propre);
            r.put("octets", total);
            return r.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"erreur\":\"" + echapper("Telechargement impossible : " + e.getMessage()) + "\"}";
        }
    }

    /** Lance l'installateur Android ; rend un message si l'autorisation manque. */
    static String installer(Context contexte, String chemin) {
        try {
            File fichier = new File(chemin);
            if (!fichier.exists()) {
                return "{\"ok\":false,\"erreur\":\"fichier absent\"}";
            }
            if (android.os.Build.VERSION.SDK_INT >= 26
                    && !contexte.getPackageManager().canRequestPackageInstalls()) {
                /* on emmene l'utilisateur sur l'ecran qui autorise GEMAYA a installer */
                Intent reglages = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + contexte.getPackageName()));
                reglages.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                contexte.startActivity(reglages);
                return "{\"ok\":false,\"autorisation\":true,"
                        + "\"erreur\":\"Autorise GEMAYA a installer des applications, puis relance la mise a jour\"}";
            }
            Uri uri = FileProvider.getUriForFile(contexte, contexte.getPackageName() + ".fichiers", fichier);
            Intent installation = new Intent(Intent.ACTION_VIEW);
            installation.setDataAndType(uri, "application/vnd.android.package-archive");
            installation.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            contexte.startActivity(installation);
            return "{\"ok\":true}";
        } catch (Exception e) {
            return "{\"ok\":false,\"erreur\":\"" + echapper("Installation impossible : " + e.getMessage()) + "\"}";
        }
    }

    /** Derniere publication du depot, lue par l'API GitHub (sans cache de fichier). */
    private static JSONObject dernierePublication() {
        try {
            String corps = lire("https://api.github.com/repos/BerrySwann/gemaya-maj/releases/latest");
            return new JSONObject(corps);
        } catch (Exception e) {
            return null;
        }
    }

    /** "0.42" devient 42 ; une etiquette illisible vaut 0. */
    private static int codeDeLEtiquette(String etiquette) {
        try {
            String[] morceaux = etiquette.split("\\.");
            if (morceaux.length == 1) {
                return Integer.parseInt(morceaux[0]);
            }
            return Integer.parseInt(morceaux[0]) * 100 + Integer.parseInt(morceaux[1]);
        } catch (Exception e) {
            return 0;
        }
    }

    /** Adresse du premier fichier joint de la publication. */
    private static String premierePieceJointe(JSONObject publication) {
        try {
            org.json.JSONArray fichiers = publication.optJSONArray("assets");
            if (fichiers == null || fichiers.length() == 0) {
                return "";
            }
            return fichiers.getJSONObject(0).optString("browser_download_url", "");
        } catch (Exception e) {
            return "";
        }
    }

    /**
     * Envoie un fichier texte dans le depot prive, pour controle depuis le poste de travail.
     * Ecrase le fichier s'il existe deja (il faut alors son empreinte sha).
     */
    static String pousser(String chemin, String contenu, String jeton) {
        try {
            String adresse = "https://api.github.com/repos/BerrySwann/gemaya-maj/contents/" + chemin;
            JSONObject charge = new JSONObject();
            charge.put("message", "Releve envoye depuis le telephone");
            charge.put("content", android.util.Base64.encodeToString(
                    contenu.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                    android.util.Base64.NO_WRAP));

            String sha = empreinte(adresse, jeton);
            if (sha != null && !sha.isEmpty()) {
                charge.put("sha", sha);
            }

            HttpURLConnection lien = (HttpURLConnection) new URL(adresse).openConnection();
            lien.setRequestMethod("PUT");
            lien.setConnectTimeout(20000);
            lien.setReadTimeout(30000);
            lien.setDoOutput(true);
            lien.setRequestProperty("Authorization", "Bearer " + jeton);
            lien.setRequestProperty("Accept", "application/vnd.github+json");
            lien.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            java.io.OutputStream sortie = lien.getOutputStream();
            sortie.write(charge.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            sortie.flush();
            sortie.close();

            int code = lien.getResponseCode();
            if (code < 200 || code >= 300) {
                return "{\"ok\":false,\"erreur\":\"le depot a refuse (" + code + ")\"}";
            }
            JSONObject r = new JSONObject();
            r.put("ok", true);
            r.put("chemin", chemin);
            return r.toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"erreur\":\"" + echapper("envoi impossible : " + e.getMessage()) + "\"}";
        }
    }

    /** Empreinte du fichier deja present, ou null s'il n'existe pas encore. */
    private static String empreinte(String adresse, String jeton) {
        try {
            HttpURLConnection lien = (HttpURLConnection) new URL(adresse).openConnection();
            lien.setConnectTimeout(15000);
            lien.setReadTimeout(15000);
            lien.setRequestProperty("Authorization", "Bearer " + jeton);
            lien.setRequestProperty("Accept", "application/vnd.github+json");
            if (lien.getResponseCode() != 200) {
                return null;
            }
            java.io.InputStream entree = lien.getInputStream();
            java.io.ByteArrayOutputStream tampon = new java.io.ByteArrayOutputStream();
            byte[] bloc = new byte[8192];
            int lus;
            while ((lus = entree.read(bloc)) > 0) {
                tampon.write(bloc, 0, lus);
            }
            entree.close();
            return new JSONObject(tampon.toString("UTF-8")).optString("sha", "");
        } catch (Exception e) {
            return null;
        }
    }

    /** Copie l'APK telecharge dans le dossier public Telechargements/gemaya. */
    private static void copierVersTelechargements(Context contexte, String nom, File source) {
        if (android.os.Build.VERSION.SDK_INT < 29) {
            return;      /* avant Android 10 il faut une autorisation de stockage */
        }
        try {
            android.content.ContentValues valeurs = new android.content.ContentValues();
            valeurs.put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, nom);
            valeurs.put(android.provider.MediaStore.MediaColumns.MIME_TYPE,
                    "application/vnd.android.package-archive");
            valeurs.put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH,
                    android.os.Environment.DIRECTORY_DOWNLOADS + "/gemaya");
            android.net.Uri cible = contexte.getContentResolver().insert(
                    android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, valeurs);
            if (cible == null) {
                return;
            }
            java.io.OutputStream sortie = contexte.getContentResolver().openOutputStream(cible);
            java.io.InputStream entree = new java.io.FileInputStream(source);
            byte[] tampon = new byte[65536];
            int lus;
            while ((lus = entree.read(tampon)) > 0) {
                sortie.write(tampon, 0, lus);
            }
            sortie.flush();
            sortie.close();
            entree.close();
        } catch (Exception ignore) {
            /* la copie visible est un secours : son echec ne bloque pas l'installation */
        }
    }

    private static String lire(String adresse) throws Exception {
        HttpURLConnection lien = (HttpURLConnection) new URL(adresse).openConnection();
        lien.setConnectTimeout(15000);
        lien.setReadTimeout(20000);
        lien.setRequestProperty("Cache-Control", "no-cache");
        lien.setRequestProperty("Pragma", "no-cache");
        lien.setInstanceFollowRedirects(true);
        int code = lien.getResponseCode();
        if (code < 200 || code >= 300) {
            throw new Exception("reponse " + code);
        }
        BufferedReader lecteur = new BufferedReader(new InputStreamReader(lien.getInputStream(), StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder();
        String ligne;
        while ((ligne = lecteur.readLine()) != null) {
            sb.append(ligne);
        }
        lecteur.close();
        lien.disconnect();
        return sb.toString();
    }

    private static String echapper(String texte) {
        return texte == null ? "" : texte.replace("\\", "\\\\").replace("\"", "'").replace("\n", " ");
    }
}
