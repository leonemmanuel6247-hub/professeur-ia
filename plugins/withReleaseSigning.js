const { withAppBuildGradle } = require("expo/config-plugins");

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== "groovy") return cfg;
    let src = cfg.modResults.contents;
    if (src.includes("PROFESSEUR_UPLOAD_STORE_FILE")) return cfg;
    const block = `
def professeurKeystore = file("release.keystore")
android.applicationVariants.all { variant -> }
if (professeurKeystore.exists() && project.hasProperty("PROFESSEUR_UPLOAD_KEY_ALIAS")) {
    android.signingConfigs {
        release {
            storeFile professeurKeystore
            storePassword project.property("PROFESSEUR_UPLOAD_STORE_PASSWORD")
            keyAlias project.property("PROFESSEUR_UPLOAD_KEY_ALIAS")
            keyPassword project.property("PROFESSEUR_UPLOAD_KEY_PASSWORD")
        }
    }
    android.buildTypes.release.signingConfig android.signingConfigs.release
} else {
    android.buildTypes.release.signingConfig android.signingConfigs.debug
}
`;
    src = src.replace(/android\s*\{/, (m) => m);
    src += "\n" + block;
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = withReleaseSigning;
