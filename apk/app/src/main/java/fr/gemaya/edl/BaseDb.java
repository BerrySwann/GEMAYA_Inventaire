package fr.gemaya.edl;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.util.Iterator;

/**
 * Base SQLite locale de l'application.
 *
 * Le schema reprend celui du document de conception pour ce que l'application
 * manipule aujourd'hui : listes de reference (contrats, secteurs, localisations,
 * niveaux, familles), catalogue d'equipements, fiches relevees, configuration.
 *
 * Les listes sont petites (quelques dizaines de valeurs) et les fiches se
 * comptent en centaines : chaque enregistrement reecrit les tables concernees
 * dans une seule transaction. Le modele definitif passera a des ecritures
 * incrementales, sans changer la forme des donnees.
 */
public class BaseDb extends SQLiteOpenHelper {

    private static final String NOM = "gemaya-edl.db";
    private static final int VERSION = 3;

    public BaseDb(Context contexte) {
        super(contexte, NOM, null, VERSION);
    }

    @Override
    public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE contrats(id INTEGER PRIMARY KEY, libelle TEXT NOT NULL)");
        db.execSQL("CREATE TABLE secteurs(id INTEGER PRIMARY KEY, libelle TEXT NOT NULL)");
        db.execSQL("CREATE TABLE localisations(id INTEGER PRIMARY KEY, libelle TEXT NOT NULL)");
        db.execSQL("CREATE TABLE niveaux(id INTEGER PRIMARY KEY, libelle TEXT NOT NULL)");
        db.execSQL("CREATE TABLE familles(id INTEGER PRIMARY KEY, libelle TEXT NOT NULL)");
        db.execSQL("CREATE TABLE equipements_catalogue(id INTEGER PRIMARY KEY, famille TEXT, libelle TEXT)");
        db.execSQL("CREATE TABLE fiches("
                + "id TEXT PRIMARY KEY, contrat TEXT, visite TEXT, secteur TEXT, localisation TEXT,"
                + "sous_localisation TEXT, niveau TEXT, famille TEXT, designation TEXT, marque TEXT, quantite TEXT,"
                + "etat TEXT, urgence TEXT, commentaire TEXT, valeurs TEXT, photos TEXT,"
                + "fichiers TEXT, cree_le TEXT, modifie_le TEXT)");
        db.execSQL("CREATE TABLE config(cle TEXT PRIMARY KEY, valeur TEXT)");
        db.execSQL("CREATE INDEX idx_fiches_secteur ON fiches(secteur, localisation, niveau)");
        db.execSQL("CREATE TABLE photos("
                + "id TEXT PRIMARY KEY, fiche_id TEXT NOT NULL, role TEXT, mime TEXT,"
                + "blob BLOB, octets INTEGER, sha256 TEXT, largeur INTEGER, hauteur INTEGER,"
                + "prise_le TEXT, vignette BLOB)");
        db.execSQL("CREATE INDEX idx_photos_fiche ON photos(fiche_id)");
    }

    @Override
    public void onUpgrade(SQLiteDatabase db, int ancienne, int nouvelle) {
        if (ancienne < 2) {
            /* les photos passent de fichiers a la base : une table de plus,
               les images deja prises restent sur le disque */
            db.execSQL("CREATE TABLE IF NOT EXISTS photos("
                    + "id TEXT PRIMARY KEY, fiche_id TEXT NOT NULL, role TEXT, mime TEXT,"
                    + "blob BLOB, octets INTEGER, sha256 TEXT, largeur INTEGER, hauteur INTEGER,"
                    + "prise_le TEXT, vignette BLOB)");
            db.execSQL("CREATE INDEX IF NOT EXISTS idx_photos_fiche ON photos(fiche_id)");
        }
        if (ancienne < 3) {
            /* la sous-localisation : une piece dans une piece (les sanitaires dans la loge) */
            try {
                db.execSQL("ALTER TABLE fiches ADD COLUMN sous_localisation TEXT");
            } catch (Exception ignore) {
                /* colonne deja presente */
            }
        }
    }

    /* ------------------------------------------------------------------ lecture */

    public synchronized String charger() {
        SQLiteDatabase db = getReadableDatabase();
        JSONObject racine = new JSONObject();
        try {
            racine.put("contrats", lireListe(db, "contrats"));
            racine.put("secteurs", lireListe(db, "secteurs"));
            racine.put("localisations", lireListe(db, "localisations"));
            racine.put("niveaux", lireListe(db, "niveaux"));
            racine.put("familles", lireListe(db, "familles"));
            racine.put("designations", lireCatalogue(db));
            racine.put("fiches", lireFiches(db));
            racine.put("config", lireConfig(db));
        } catch (JSONException e) {
            return null;
        }
        return racine.toString();
    }

    private JSONArray lireListe(SQLiteDatabase db, String table) throws JSONException {
        JSONArray liste = new JSONArray();
        Cursor c = db.rawQuery("SELECT libelle FROM " + table + " ORDER BY id", null);
        while (c.moveToNext()) {
            liste.put(c.getString(0));
        }
        c.close();
        return liste;
    }

    private JSONArray lireCatalogue(SQLiteDatabase db) throws JSONException {
        JSONArray liste = new JSONArray();
        Cursor c = db.rawQuery("SELECT famille, libelle FROM equipements_catalogue ORDER BY id", null);
        while (c.moveToNext()) {
            JSONObject o = new JSONObject();
            o.put("famille", c.getString(0));
            o.put("libelle", c.getString(1));
            liste.put(o);
        }
        c.close();
        return liste;
    }

    private JSONArray lireFiches(SQLiteDatabase db) throws JSONException {
        JSONArray liste = new JSONArray();
        /* les roles des photos, sans les images : la liste reste legere */
        JSONObject parFiche = new JSONObject();
        Cursor p = db.rawQuery("SELECT fiche_id, role FROM photos", null);
        while (p.moveToNext()) {
            String fiche = p.getString(0);
            JSONObject roles = parFiche.optJSONObject(fiche);
            if (roles == null) {
                roles = new JSONObject();
                parFiche.put(fiche, roles);
            }
            roles.put(p.getString(1), true);
        }
        p.close();

        Cursor c = db.rawQuery("SELECT id, contrat, visite, secteur, localisation, sous_localisation,"
                + " niveau, famille, designation, marque, quantite, etat, urgence, commentaire, valeurs,"
                + " cree_le, modifie_le FROM fiches ORDER BY cree_le", null);
        while (c.moveToNext()) {
            JSONObject o = new JSONObject();
            o.put("id", c.getString(0));
            o.put("contrat", texte(c, 1));
            o.put("visite", texte(c, 2));
            o.put("secteur", texte(c, 3));
            o.put("loc", texte(c, 4));
            o.put("sousloc", texte(c, 5));
            o.put("niveau", texte(c, 6));
            o.put("famille", texte(c, 7));
            o.put("designation", texte(c, 8));
            o.put("marque", texte(c, 9));
            o.put("quantite", texte(c, 10));
            o.put("etat", texte(c, 11));
            o.put("anomalie", texte(c, 12));
            o.put("commentaire", texte(c, 13));
            o.put("valeurs", jsonOuVide(texte(c, 14), new JSONArray()));
            o.put("photos", parFiche.optJSONObject(c.getString(0)) == null
                    ? new JSONObject() : parFiche.optJSONObject(c.getString(0)));
            o.put("cree_le", texte(c, 15));
            o.put("modifie_le", texte(c, 16));
            liste.put(o);
        }
        c.close();
        return liste;
    }

    private JSONObject lireConfig(SQLiteDatabase db) throws JSONException {
        JSONObject config = new JSONObject();
        Cursor c = db.rawQuery("SELECT cle, valeur FROM config", null);
        while (c.moveToNext()) {
            config.put(c.getString(0), c.getString(1));
        }
        c.close();
        return config;
    }

    private static String texte(Cursor c, int colonne) {
        return c.isNull(colonne) ? "" : c.getString(colonne);
    }

    private static Object jsonOuVide(String texte, Object vide) {
        if (texte == null || texte.isEmpty()) {
            return vide;
        }
        try {
            return texte.startsWith("[") ? new JSONArray(texte) : new JSONObject(texte);
        } catch (JSONException e) {
            return vide;
        }
    }

    /* ---------------------------------------------------------------- ecriture */

    public synchronized void sauver(String charge) throws JSONException {
        JSONObject racine = new JSONObject(charge);
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("contrats", null, null);
            db.delete("secteurs", null, null);
            db.delete("localisations", null, null);
            db.delete("niveaux", null, null);
            db.delete("familles", null, null);
            db.delete("equipements_catalogue", null, null);
            db.delete("fiches", null, null);

            insererListe(db, "contrats", racine.optJSONArray("contrats"));
            insererListe(db, "secteurs", racine.optJSONArray("secteurs"));
            insererListe(db, "localisations", racine.optJSONArray("localisations"));
            insererListe(db, "niveaux", racine.optJSONArray("niveaux"));
            insererListe(db, "familles", racine.optJSONArray("familles"));
            insererCatalogue(db, racine.optJSONArray("designations"));
            insererFiches(db, racine.optJSONArray("fiches"));

            JSONObject config = racine.optJSONObject("config");
            if (config != null) {
                db.delete("config", null, null);
                Iterator<String> cles = config.keys();
                while (cles.hasNext()) {
                    String cle = cles.next();
                    ContentValues v = new ContentValues();
                    v.put("cle", cle);
                    v.put("valeur", config.opt(cle) == null ? "" : String.valueOf(config.opt(cle)));
                    db.replace("config", null, v);
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    private void insererListe(SQLiteDatabase db, String table, JSONArray valeurs) {
        if (valeurs == null) {
            return;
        }
        for (int i = 0; i < valeurs.length(); i++) {
            String v = valeurs.optString(i, "");
            if (v.isEmpty()) {
                continue;
            }
            ContentValues cv = new ContentValues();
            cv.put("libelle", v);
            db.insert(table, null, cv);
        }
    }

    private void insererCatalogue(SQLiteDatabase db, JSONArray valeurs) {
        if (valeurs == null) {
            return;
        }
        for (int i = 0; i < valeurs.length(); i++) {
            JSONObject o = valeurs.optJSONObject(i);
            if (o == null) {
                continue;
            }
            ContentValues cv = new ContentValues();
            cv.put("famille", o.optString("famille", ""));
            cv.put("libelle", o.optString("libelle", ""));
            db.insert("equipements_catalogue", null, cv);
        }
    }

    private void insererFiches(SQLiteDatabase db, JSONArray fiches) {
        if (fiches == null) {
            return;
        }
        for (int i = 0; i < fiches.length(); i++) {
            JSONObject f = fiches.optJSONObject(i);
            if (f != null) {
                insererFiche(db, f, i);
            }
        }
    }

    /** Une seule fiche : c'est ce qui evite de reecrire toute la base a chaque enregistrement. */
    private void insererFiche(SQLiteDatabase db, JSONObject f, int rang) {
        ContentValues cv = new ContentValues();
        cv.put("id", f.optString("id", "F" + rang));
        cv.put("contrat", f.optString("contrat", ""));
        cv.put("visite", f.optString("visite", ""));
        cv.put("secteur", f.optString("secteur", ""));
        cv.put("localisation", f.optString("loc", ""));
        cv.put("sous_localisation", f.optString("sousloc", ""));
        cv.put("niveau", f.optString("niveau", ""));
        cv.put("famille", f.optString("famille", ""));
        cv.put("designation", f.optString("designation", ""));
        cv.put("marque", f.optString("marque", ""));
        cv.put("quantite", f.optString("quantite", ""));
        cv.put("etat", f.optString("etat", ""));
        cv.put("urgence", f.optString("anomalie", ""));
        cv.put("commentaire", f.optString("commentaire", ""));
        cv.put("valeurs", f.optJSONArray("valeurs") == null ? "[]" : f.optJSONArray("valeurs").toString());
        cv.put("photos", f.optJSONObject("photos") == null ? "{}" : f.optJSONObject("photos").toString());
        cv.put("fichiers", "{}");
        cv.put("cree_le", f.optString("cree_le", ""));
        cv.put("modifie_le", f.optString("modifie_le", ""));
        db.replace("fiches", null, cv);
    }

    public synchronized void sauverFiche(String json) throws JSONException {
        JSONObject f = new JSONObject(json);
        insererFiche(getWritableDatabase(), f, 0);
    }

    public synchronized void supprimerFiche(String id) {
        SQLiteDatabase db = getWritableDatabase();
        db.delete("fiches", "id = ?", new String[]{id});
        db.delete("photos", "fiche_id = ?", new String[]{id});
    }

    /** Les listes de reference seulement : elles pesent quelques dizaines de lignes. */
    public synchronized void sauverListes(String charge) throws JSONException {
        JSONObject racine = new JSONObject(charge);
        SQLiteDatabase db = getWritableDatabase();
        db.beginTransaction();
        try {
            db.delete("contrats", null, null);
            db.delete("secteurs", null, null);
            db.delete("localisations", null, null);
            db.delete("niveaux", null, null);
            db.delete("familles", null, null);
            db.delete("equipements_catalogue", null, null);
            insererListe(db, "contrats", racine.optJSONArray("contrats"));
            insererListe(db, "secteurs", racine.optJSONArray("secteurs"));
            insererListe(db, "localisations", racine.optJSONArray("localisations"));
            insererListe(db, "niveaux", racine.optJSONArray("niveaux"));
            insererListe(db, "familles", racine.optJSONArray("familles"));
            insererCatalogue(db, racine.optJSONArray("designations"));
            JSONObject config = racine.optJSONObject("config");
            if (config != null) {
                db.delete("config", null, null);
                Iterator<String> cles = config.keys();
                while (cles.hasNext()) {
                    String cle = cles.next();
                    ContentValues v = new ContentValues();
                    v.put("cle", cle);
                    v.put("valeur", config.opt(cle) == null ? "" : String.valueOf(config.opt(cle)));
                    db.replace("config", null, v);
                }
            }
            db.setTransactionSuccessful();
        } finally {
            db.endTransaction();
        }
    }

    /* ---------------------------------------------------------- photos en base */

    public synchronized void sauverPhoto(String json) throws JSONException {
        JSONObject o = new JSONObject(json);
        String fiche = o.optString("fiche_id", "");
        String role = o.optString("role", "plaque");
        ContentValues v = new ContentValues();
        v.put("id", fiche + "|" + role);
        v.put("fiche_id", fiche);
        v.put("role", role);
        v.put("mime", o.optString("mime", "image/jpeg"));
        v.put("blob", android.util.Base64.decode(o.optString("base64", ""), android.util.Base64.DEFAULT));
        v.put("octets", o.optLong("octets", 0));
        v.put("sha256", o.optString("sha256", ""));
        v.put("largeur", o.optInt("largeur", 0));
        v.put("hauteur", o.optInt("hauteur", 0));
        v.put("prise_le", o.optString("prise_le", ""));
        v.put("vignette", android.util.Base64.decode(o.optString("vignette", ""), android.util.Base64.DEFAULT));
        getWritableDatabase().replace("photos", null, v);
    }

    public synchronized String photosDeFiche(String ficheId) {
        JSONObject racine = new JSONObject();
        JSONObject photos = new JSONObject();
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT role, octets, largeur, hauteur, sha256, vignette FROM photos WHERE fiche_id = ?",
                new String[]{ficheId});
        while (c.moveToNext()) {
            try {
                JSONObject p = new JSONObject();
                p.put("octets", c.getLong(1));
                p.put("largeur", c.getInt(2));
                p.put("hauteur", c.getInt(3));
                p.put("sha256", c.isNull(4) ? "" : c.getString(4));
                byte[] vignette = c.isNull(5) ? null : c.getBlob(5);
                p.put("vignette", vignette == null ? "" :
                        "data:image/jpeg;base64," + android.util.Base64.encodeToString(vignette, android.util.Base64.NO_WRAP));
                photos.put(c.getString(0), p);
            } catch (JSONException ignore) {
                /* une photo illisible ne doit pas bloquer la fiche */
            }
        }
        c.close();
        try {
            racine.put("photos", photos);
            return racine.toString();
        } catch (JSONException e) {
            return "{\"photos\":{}}";
        }
    }

    public synchronized String lirePhoto(String ficheId, String role) {
        Cursor c = getReadableDatabase().rawQuery(
                "SELECT blob, mime FROM photos WHERE fiche_id = ? AND role = ?",
                new String[]{ficheId, role});
        String reponse = "{\"ok\":false}";
        if (c.moveToFirst()) {
            byte[] blob = c.getBlob(0);
            String mime = c.isNull(1) ? "image/jpeg" : c.getString(1);
            reponse = "{\"ok\":true,\"mime\":\"" + mime + "\",\"base64\":\""
                    + android.util.Base64.encodeToString(blob, android.util.Base64.NO_WRAP) + "\"}";
        }
        c.close();
        return reponse;
    }

    /* -------------------------------------------------------------------- info */

    public synchronized String info(Context contexte) {
        File fichier = contexte.getDatabasePath(NOM);
        int fiches = 0;
        int photos = 0;
        SQLiteDatabase db = getReadableDatabase();
        Cursor c = db.rawQuery("SELECT COUNT(*) FROM fiches", null);
        if (c.moveToFirst()) {
            fiches = c.getInt(0);
        }
        c.close();
        File dossier = new File(contexte.getFilesDir(), "photos");
        File[] liste = dossier.listFiles();
        if (liste != null) {
            photos = liste.length;
        }
        try {
            JSONObject o = new JSONObject();
            o.put("chemin", fichier.getAbsolutePath());
            o.put("octets", fichier.exists() ? fichier.length() : 0);
            o.put("fiches", fiches);
            o.put("photos", photos);
            return o.toString();
        } catch (JSONException e) {
            return "{}";
        }
    }
}
