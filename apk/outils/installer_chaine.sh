#!/usr/bin/env bash
# Installe la chaine de compilation Android sur un poste Linux neuf.
# Aucun droit administrateur : tout va dans le dossier personnel.
#
#   bash apk/outils/installer_chaine.sh
#
# Puis, pour fabriquer l'APK :
#   cd apk && python3 outils/construire_assets.py && ./gradlew assembleRelease
# (ou /home/$USER/tools/gradle-8.9/bin/gradle assembleRelease)

set -e
OUTILS="$HOME/tools"
SDK="$HOME/Android/Sdk"
mkdir -p "$OUTILS" "$SDK/cmdline-tools"

echo "1/4 Java 17"
if [ ! -d "$OUTILS/jdk-17.0.20.1+1" ]; then
  curl -L -o "$OUTILS/jdk17.tar.gz" \
    "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse"
  tar xzf "$OUTILS/jdk17.tar.gz" -C "$OUTILS"
  rm -f "$OUTILS/jdk17.tar.gz"
fi

echo "2/4 Gradle 8.9"
if [ ! -d "$OUTILS/gradle-8.9" ]; then
  curl -L -o "$OUTILS/gradle.zip" "https://services.gradle.org/distributions/gradle-8.9-bin.zip"
  unzip -q "$OUTILS/gradle.zip" -d "$OUTILS"
  rm -f "$OUTILS/gradle.zip"
fi

echo "3/4 outils du SDK Android"
if [ ! -d "$SDK/cmdline-tools/latest" ]; then
  curl -L -o "$OUTILS/cmdline-tools.zip" \
    "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  unzip -q "$OUTILS/cmdline-tools.zip" -d "$OUTILS"
  mv "$OUTILS/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -f "$OUTILS/cmdline-tools.zip"
fi

export JAVA_HOME="$OUTILS/jdk-17.0.20.1+1"
export ANDROID_HOME="$SDK"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

echo "4/4 plateforme 34 et build-tools 34"
yes | sdkmanager --sdk_root="$SDK" --licenses > /dev/null
sdkmanager --sdk_root="$SDK" "platform-tools" "platforms;android-34" "build-tools;34.0.0" > /dev/null

cat > "$HOME/.gemaya-env" <<EOF
export JAVA_HOME="$JAVA_HOME"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export PATH="\$JAVA_HOME/bin:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/cmdline-tools/latest/bin:$OUTILS/gradle-8.9/bin:\$PATH"
EOF

echo
echo "Chaine installee. Pour l'activer dans ce terminal :"
echo "  source ~/.gemaya-env"
echo
echo "La cle de lecture de plaque n'est PAS dans le depot. Sur un poste neuf,"
echo "la saisir dans l'application (Configuration > Intelligence artificielle),"
echo "ou l'exporter avant le build :  export CLE_API_DEFAUT=..."
