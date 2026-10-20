package fr.gemaya.edl;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Redimensionnement et rangement des photos prises sur le terrain.
 *
 * Une photo de telephone pese 3 a 5 Mo ; a 1600 px de cote et 85 pour cent de
 * qualite JPEG elle tombe sous les 400 Ko, ce qui permet de garder une visite
 * entiere dans le telephone sans saturer la memoire de l'appareil.
 */
final class Photos {

    private static final int COTE_MAX = 1600;
    private static final int QUALITE = 85;

    private Photos() {
    }

    static File nouveauFichier(android.content.Context contexte) {
        File dossier = new File(contexte.getCacheDir(), "prises");
        if (!dossier.exists() && !dossier.mkdirs()) {
            dossier = contexte.getCacheDir();
        }
        String nom = "prise-" + new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.FRANCE).format(new Date()) + ".jpg";
        return new File(dossier, nom);
    }

    /** Lit le fichier, redresse, reduit, ecrit dans filesDir/photos et rend le JSON attendu par la page. */
    static String traiter(android.content.Context contexte, File source, String role) {
        JSONObject reponse = new JSONObject();
        try {
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(source.getAbsolutePath(), options);
            int plusGrand = Math.max(options.outWidth, options.outHeight);
            int reduction = 1;
            while (plusGrand / reduction > COTE_MAX) {
                reduction *= 2;
            }
            options.inJustDecodeBounds = false;
            options.inSampleSize = reduction;
            Bitmap image = BitmapFactory.decodeFile(source.getAbsolutePath(), options);
            if (image == null) {
                reponse.put("ok", false).put("message", "Photo illisible");
                return reponse.toString();
            }
            image = redresser(image, source);

            File dossier = new File(contexte.getFilesDir(), "photos");
            if (!dossier.exists()) {
                dossier.mkdirs();
            }
            String nom = role + "-" + new SimpleDateFormat("yyyyMMdd-HHmmss", Locale.FRANCE).format(new Date()) + ".jpg";
            File sortie = new File(dossier, nom);
            ByteArrayOutputStream tampon = new ByteArrayOutputStream();
            image.compress(Bitmap.CompressFormat.JPEG, QUALITE, tampon);
            byte[] octets = tampon.toByteArray();
            FileOutputStream flux = new FileOutputStream(sortie);
            flux.write(octets);
            flux.close();

            reponse.put("ok", true);
            reponse.put("chemin", sortie.getAbsolutePath());
            reponse.put("fichier", nom);
            reponse.put("octets", octets.length);
            reponse.put("largeur", image.getWidth());
            reponse.put("hauteur", image.getHeight());
            reponse.put("sha256", empreinte(octets));
            reponse.put("dataUrl", "data:image/jpeg;base64," + Base64.encodeToString(octets, Base64.NO_WRAP));
            reponse.put("vignette", "data:image/jpeg;base64," + Base64.encodeToString( miniature(image), Base64.NO_WRAP));
            image.recycle();
            return reponse.toString();
        } catch (Exception e) {
            try {
                reponse.put("ok", false).put("message", "Photo non traitee : " + e.getMessage());
            } catch (Exception ignore) {
                return "{\"ok\":false,\"message\":\"Photo non traitee\"}";
            }
            return reponse.toString();
        }
    }

    /** Vignette de 320 px, seule image gardee dans la base : le fichier complet reste sur le disque. */
    private static byte[] miniature(Bitmap image) {
        int cote = Math.max(image.getWidth(), image.getHeight());
        float facteur = cote > 320 ? 320f / cote : 1f;
        Bitmap petite = Bitmap.createScaledBitmap(image,
                Math.max(1, Math.round(image.getWidth() * facteur)),
                Math.max(1, Math.round(image.getHeight() * facteur)), true);
        ByteArrayOutputStream tampon = new ByteArrayOutputStream();
        petite.compress(Bitmap.CompressFormat.JPEG, 70, tampon);
        if (petite != image) {
            petite.recycle();
        }
        return tampon.toByteArray();
    }

    private static Bitmap redresser(Bitmap image, File source) {
        try {
            InputStream flux = new java.io.FileInputStream(source);
            ExifInterface exif = new ExifInterface(flux);
            int orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL);
            flux.close();
            int degres = 0;
            if (orientation == ExifInterface.ORIENTATION_ROTATE_90) {
                degres = 90;
            } else if (orientation == ExifInterface.ORIENTATION_ROTATE_180) {
                degres = 180;
            } else if (orientation == ExifInterface.ORIENTATION_ROTATE_270) {
                degres = 270;
            }
            if (degres == 0) {
                return image;
            }
            Matrix matrice = new Matrix();
            matrice.postRotate(degres);
            Bitmap redressee = Bitmap.createBitmap(image, 0, 0, image.getWidth(), image.getHeight(), matrice, true);
            if (redressee != image) {
                image.recycle();
            }
            return redressee;
        } catch (Exception e) {
            return image;
        }
    }

    private static String empreinte(byte[] octets) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] h = digest.digest(octets);
        StringBuilder sb = new StringBuilder();
        for (byte b : h) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
