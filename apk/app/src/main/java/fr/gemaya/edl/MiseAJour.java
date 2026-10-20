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
            String corps = lire(urlManifeste);
            JSONObject o = new JSONObject(corps);
            JSONObject reponse = new JSONObject();
            reponse.put("ok", true);
            reponse.put("versionCode", o.optInt("versionCode", 0));
            reponse.put("versionName", o.optString("versionName", ""));
            reponse.put("apk", o.optString("apk", ""));
            reponse.put("notes", o.optString("notes", ""));
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
            JSONObject r = new JSONObject();
            r.put("ok", true);
            r.put("chemin", fichier.getAbsolutePath());
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

    private static String lire(String adresse) throws Exception {
        HttpURLConnection lien = (HttpURLConnection) new URL(adresse).openConnection();
        lien.setConnectTimeout(15000);
        lien.setReadTimeout(20000);
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
