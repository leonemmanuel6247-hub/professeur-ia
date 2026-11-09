# Professeur IA

Application Android (APK) : un professeur de sciences qui lit tes PDF / photos de cours, enseigne chapitre par chapitre, propose des exercices et dessine des schemas dans la Zone Experience.

Cahier des charges v1.0 — interface en francais, donnees locales, cles API dans le coffre Android.

## Fonctions

- Bibliotheque de cours (PDF, images, photo camera)
- Ingestion : texte natif, vision, ou PDF Gemini
- Chat professeur avec streaming, citations de pages, bonus Hors cours
- Zone Experience (HTML/SVG/JS en WebView isolee)
- Exercices, indices, correction, maitrise et revision espacee
- Profils OpenAI-compatible et Gemini, rotation 429, compteur de tokens
- Theme clair / sombre, sauvegarde JSON, export Markdown

## Demarrer en local

```bash
npm install
npx expo start
```

## Compiler l'APK avec GitHub Actions

N'envoie jamais ton token GitHub dans le chat. Il appartient uniquement aux secrets du depot.

1. Cree un depot GitHub et pousse ce projet.
2. Depot > Settings > Secrets and variables > Actions, ajoute si tu veux un APK signe :

- `ANDROID_KEYSTORE_BASE64` — keystore encode en base64
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`

Sans ces secrets, Actions produit quand meme un APK (signature debug).

3. Onglet Actions > **Build APK** > Run workflow.
4. Telecharge l'artifact `professeur-ia-apk`.

Generer un keystore (sur ta machine) :

```bash
keytool -genkeypair -v -storetype PKCS12 -keystore professeur.keystore -alias professeur -keyalg RSA -keysize 2048 -validity 10000
base64 -w 0 professeur.keystore > keystore.b64
```

Colle le contenu de `keystore.b64` dans le secret `ANDROID_KEYSTORE_BASE64`.

## Premier usage

1. Installe l'APK (sources inconnues autorisees).
2. Reglages > Profils IA > ajoute Gemini ou OpenAI-compatible, colle ta cle, Tester la connexion.
3. Cours > Importer un PDF ou photographier une page.
4. Valide le plan, lance une lecon.

Les cles ne sont jamais ecrites dans le code ni dans les journaux.

## Structure

- `src/llm` — OpenAI-compatible + Gemini, interface commune
- `src/db` — SQLite local + FTS5
- `src/screens` — Cours, Chat, Experience, Progres, Reglages
- `src/experience` — WebView bac a sable + verification data-spec-id
- `.github/workflows/build-apk.yml` — compilation APK

Android 8.0 (API 26)+. Aucune telemetrie.
