#!/usr/bin/env bash
# Installe / met à jour « Pourboires chez Biso » directement sur le VPS, dans UN SEUL dossier (~/pourboires).
# Télécharge le code, installe Node.js localement s'il manque, construit, génère data/ et .env, démarre.
# Rien n'est écrit en dehors du dossier de l'application ; aucun droit root nécessaire.
# Dépôt public : aucun jeton nécessaire.
# Variables facultatives : PORT (8087), APP_DIR, ADMIN_USER, ADMIN_PASSWORD
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/pourboires}"
PORT="${PORT:-8087}"
REPO_SLUG="${REPO_SLUG:-eyano07/Pourboires2}"
BRANCH="${BRANCH:-main}"
NODE_MAJOR=22
TARBALL_URL="${TARBALL_URL:-https://api.github.com/repos/$REPO_SLUG/tarball/$BRANCH}"

die() { echo "ERREUR : $*" >&2; rm -f "$APP_DIR/node.tgz" "$APP_DIR/node.sums" "$APP_DIR/code.tgz"; exit 1; }

# --- Garde-fous : on ne travaille que dans un sous-dossier du dossier personnel ---
case "$APP_DIR" in "$HOME"/?*) ;; *) die "APP_DIR doit être un sous-dossier de $HOME (reçu : $APP_DIR)";; esac
case "$APP_DIR" in *..*) die "APP_DIR ne doit pas contenir « .. »";; esac
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || die "PORT doit être entre 1024 et 65535 (ex. 8087)"
command -v curl >/dev/null || die "curl est absent du serveur (installez-le : apt install curl)."
command -v tar  >/dev/null || die "tar est absent du serveur."

if [ "$(id -u)" -eq 0 ]; then
  echo "ATTENTION : vous êtes root. L'application tournerait avec tous les droits sur le serveur."
  echo "            Il est conseillé d'utiliser un compte ordinaire. Ctrl+C pour annuler (10 s)…"
  sleep 10
fi

mkdir -p "$APP_DIR/data"
chmod 700 "$APP_DIR/data"
cd "$APP_DIR"

# --- Port : refuser s'il est pris par un autre programme (hors notre propre appli sur ce même port) ---
CURRENT_PORT=""
[ -f .env ] && CURRENT_PORT="$(sed -n 's/^PORT=//p' .env | head -n1)"
if ! { [ -x ./control.sh ] && ./control.sh status >/dev/null 2>&1 && [ "$CURRENT_PORT" = "$PORT" ]; }; then
  if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
    die "le port $PORT est déjà utilisé par un autre programme. Relancez avec un autre port : PORT=8088 bash install.sh"
  fi
fi

# --- 0. Node.js : utilisé s'il est présent (>= 20), sinon installé DANS le dossier de l'application ---
node_ok() { command -v node >/dev/null 2>&1 && command -v npm >/dev/null 2>&1 && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; }
[ -x "$APP_DIR/.node/bin/node" ] && export PATH="$APP_DIR/.node/bin:$PATH"
if node_ok && { [ "${NODE_LOCAL:-0}" != "1" ] || [ -x "$APP_DIR/.node/bin/node" ]; }; then
  echo "0/4 Node.js $(node -v) présent."
else
  echo "0/4 Node.js absent ou trop ancien : installation locale dans $APP_DIR/.node (aucun droit root requis)…"
  case "$(uname -m)" in x86_64|amd64) A=x64;; aarch64|arm64) A=arm64;; armv7l) A=armv7l;; *) die "architecture non supportée : $(uname -m)";; esac
  [ "$(uname -s)" = "Linux" ] || die "installation locale de Node.js prévue pour Linux uniquement."
  BASE="${NODE_DIST_URL:-https://nodejs.org/dist/latest-v$NODE_MAJOR.x}"
  curl -fsSL "$BASE/SHASUMS256.txt" -o node.sums || die "impossible de joindre nodejs.org."
  LINE="$(grep "node-v.*-linux-$A.tar.gz\$" node.sums | head -n1)" || true
  [ -n "$LINE" ] || die "archive Node.js introuvable pour $A."
  FILE="${LINE##* }"; SUM="${LINE%% *}"
  curl -fsSL "$BASE/$FILE" -o node.tgz || die "téléchargement de Node.js impossible."
  echo "$SUM  node.tgz" | sha256sum -c --status - || die "somme de contrôle de Node.js incorrecte."
  rm -rf .node && mkdir .node && tar xzf node.tgz -C .node --strip-components=1
  rm -f node.tgz node.sums
  export PATH="$APP_DIR/.node/bin:$PATH"
  node_ok || die "l'installation de Node.js a échoué."
  echo "   Node.js $(node -v) installé dans $APP_DIR/.node"
fi

# --- 1. Téléchargement du code ---
echo "1/4 Téléchargement du code…"
rm -rf "$APP_DIR/src" && mkdir "$APP_DIR/src"
curl -fsSL "$TARBALL_URL" -o code.tgz || die "téléchargement impossible (pas de connexion à GitHub ?)."
tar xzf code.tgz -C src --strip-components=1 && rm -f code.tgz
[ -f src/package.json ] || die "archive du dépôt inattendue."

# --- 2. Construction ---
echo "2/4 Installation des dépendances et construction (quelques minutes)…"
( cd "$APP_DIR/src" && npm ci --no-audit --no-fund --loglevel=error && npm run build >/dev/null ) || die "la construction a échoué."

# --- 3. Mise en place ---
echo "3/4 Mise en place…"
[ -x ./control.sh ] && ./control.sh stop || true
rm -rf ./.output ./scripts
mv src/.output ./.output
mv src/scripts ./scripts
cp src/deploy/control.sh ./control.sh && chmod +x ./control.sh
rm -rf ./src

if [ ! -f .env ]; then
  ( umask 077
    printf 'SESSION_SECRET=%s\nPORT=%s\n' "$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)" "$PORT" > .env )
  echo "   .env généré (secret de session aléatoire, port $PORT)."
else
  if grep -q '^PORT=' .env; then sed -i "s/^PORT=.*/PORT=$PORT/" .env; else echo "PORT=$PORT" >> .env; fi
  echo "   .env existant conservé (port $PORT)."
fi

# Premier administrateur si aucun compte n'existe encore
if [ ! -s data/users.json ]; then
  ADMIN_USER="${ADMIN_USER:-}"; ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
  if [ -z "$ADMIN_USER" ] && [ -t 0 ]; then
    read -rp "Nom du premier administrateur [admin] : " ADMIN_USER; ADMIN_USER="${ADMIN_USER:-admin}"
    while [ "${#ADMIN_PASSWORD}" -lt 6 ]; do
      read -rsp "Mot de passe (6 caractères minimum) : " ADMIN_PASSWORD; echo
    done
  fi
  if [ -n "$ADMIN_USER" ] && [ -n "$ADMIN_PASSWORD" ]; then
    ./control.sh user-add "$ADMIN_USER" "$ADMIN_PASSWORD" admin
  else
    echo "   Aucun compte créé : lancez ./control.sh user-add <nom> <mot_de_passe> admin"
  fi
fi

# --- 4. Démarrage ---
echo "4/4 Démarrage…"
./control.sh start
echo
echo "Terminé. Application dans $APP_DIR, port $PORT : http://<adresse-du-serveur>:$PORT"
echo "Commandes : cd $APP_DIR && ./control.sh status|stop|start|restart"
echo "Mise à jour : relancez ce même script (data/ et .env sont conservés)."
