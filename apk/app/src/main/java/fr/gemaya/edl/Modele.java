package fr.gemaya.edl;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Appel du modele de vision qui lit la plaque signaletique.
 *
 * L'appel passe par Java, pas par la page : la cle ne circule pas dans le
 * JavaScript et il n'y a aucun probleme de CORS depuis une page embarquee.
 *
 * Trois familles d'API sont acceptees :
 *  - Gemini (Google AI Studio) : cle dans l'URL, image en inline_data ;
 *  - OpenAI, Mistral, DeepSeek et compatibles : /chat/completions, image en
 *    data URL dans un message.
 * DeepSeek ne prend pas d'image en entree : l'appel remonte alors l'erreur du
 * service telle quelle plutot que de faire semblant.
 */
final class Modele {

    private Modele() {
    }

    static String appeler(String demandeJson) {
        JSONObject reponse = new JSONObject();
        try {
            JSONObject demande = new JSONObject(demandeJson);
            String fournisseur = demande.optString("fournisseur", "gemini").toLowerCase();
            String modele = demande.optString("modele", "gemini-2.5-flash");
            String cle = demande.optString("cle", "");
            String base = demande.optString("base", "");
            String consigne = demande.optString("consigne", "Lis la plaque et rends un JSON.");
            String dataUrl = demande.optString("image", "");
            if (cle.isEmpty()) {
                return erreur("Aucune cle API renseignee");
            }
            if (dataUrl.isEmpty()) {
                return erreur("Aucune photo de plaque");
            }
            String base64 = dataUrl.startsWith("data:") ? dataUrl.substring(dataUrl.indexOf(',') + 1) : dataUrl;

            String url;
            String corps;
            if (fournisseur.equals("gemini")) {
                String racine = base.isEmpty() ? "https://generativelanguage.googleapis.com/v1beta" : base;
                url = racine + "/models/" + modele + ":generateContent?key=" + cle;
                JSONObject image = new JSONObject()
                        .put("mime_type", "image/jpeg")
                        .put("data", base64);
                JSONObject texte = new JSONObject().put("text", consigne);
                JSONObject partie = new JSONObject()
                        .put("parts", new JSONArray().put(texte).put(new JSONObject().put("inline_data", image)));
                corps = new JSONObject()
                        .put("contents", new JSONArray().put(partie))
                        .put("generationConfig", new JSONObject().put("temperature", 0).put("maxOutputTokens", 800))
                        .toString();
            } else {
                String racine = base;
                if (racine.isEmpty()) {
                    if (fournisseur.equals("openai")) {
                        racine = "https://api.openai.com/v1";
                    } else if (fournisseur.equals("mistral")) {
                        racine = "https://api.mistral.ai/v1";
                    } else if (fournisseur.equals("deepseek")) {
                        racine = "https://api.deepseek.com/v1";
                    } else {
                        racine = "https://api.openai.com/v1";
                    }
                }
                url = racine.replaceAll("/$", "") + "/chat/completions";
                JSONObject texte = new JSONObject().put("type", "text").put("text", consigne);
                JSONObject image = new JSONObject().put("type", "image_url")
                        .put("image_url", new JSONObject().put("url", dataUrl));
                JSONObject contenu = new JSONObject()
                        .put("role", "user")
                        .put("content", new JSONArray().put(texte).put(image));
                corps = new JSONObject()
                        .put("model", modele)
                        .put("messages", new JSONArray().put(contenu))
                        .put("temperature", 0)
                        .put("max_tokens", 800)
                        .toString();
            }

            String[] resultat = poster(url, corps, cle);
            int code = Integer.parseInt(resultat[0]);
            String texte = resultat[1];

            if (code < 200 || code >= 300) {
                String message = messageErreur(texte);
                return erreur("Le service a refuse (" + code + ") : " + message);
            }
            String contenu = extraire(texte, fournisseur);
            if (contenu == null) {
                return erreur("Reponse du service illisible");
            }
            reponse.put("ok", true).put("texte", contenu).put("fournisseur", fournisseur).put("modele", modele);
            return reponse.toString();
        } catch (Exception e) {
            return erreur("Lecture impossible : " + e.getClass().getSimpleName() + " " + e.getMessage());
        }
    }

    private static String erreur(String message) {
        try {
            return new JSONObject().put("ok", false).put("erreur", message).toString();
        } catch (Exception e) {
            return "{\"ok\":false,\"erreur\":\"Lecture impossible\"}";
        }
    }

    private static String[] poster(String url, String corps, String cle) throws Exception {
        HttpURLConnection lien = (HttpURLConnection) new URL(url).openConnection();
        lien.setRequestMethod("POST");
        lien.setConnectTimeout(20000);
        lien.setReadTimeout(90000);
        lien.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        lien.setRequestProperty("Authorization", "Bearer " + cle);
        lien.setDoOutput(true);
        OutputStream flux = lien.getOutputStream();
        flux.write(corps.getBytes(StandardCharsets.UTF_8));
        flux.close();
        int code = lien.getResponseCode();
        java.io.InputStream entree = code >= 400 ? lien.getErrorStream() : lien.getInputStream();
        StringBuilder sb = new StringBuilder();
        if (entree != null) {
            BufferedReader lecteur = new BufferedReader(new InputStreamReader(entree, StandardCharsets.UTF_8));
            String ligne;
            while ((ligne = lecteur.readLine()) != null) {
                sb.append(ligne);
            }
            lecteur.close();
        }
        lien.disconnect();
        return new String[]{String.valueOf(code), sb.toString()};
    }

    private static String extraire(String corps, String fournisseur) {
        try {
            JSONObject o = new JSONObject(corps);
            if (fournisseur.equals("gemini")) {
                JSONArray candidats = o.optJSONArray("candidates");
                if (candidats == null || candidats.length() == 0) {
                    return null;
                }
                JSONObject contenu = candidats.getJSONObject(0).optJSONObject("content");
                JSONArray parties = contenu == null ? null : contenu.optJSONArray("parts");
                if (parties == null || parties.length() == 0) {
                    return null;
                }
                return parties.getJSONObject(0).optString("text", null);
            }
            JSONArray choix = o.optJSONArray("choices");
            if (choix == null || choix.length() == 0) {
                return null;
            }
            JSONObject message = choix.getJSONObject(0).optJSONObject("message");
            return message == null ? null : message.optString("content", null);
        } catch (Exception e) {
            return null;
        }
    }

    private static String messageErreur(String corps) {
        try {
            JSONObject o = new JSONObject(corps);
            JSONObject e = o.optJSONObject("error");
            if (e != null) {
                return e.optString("message", corps);
            }
            return corps.length() > 300 ? corps.substring(0, 300) : corps;
        } catch (Exception ex) {
            return corps.length() > 300 ? corps.substring(0, 300) : corps;
        }
    }
}
