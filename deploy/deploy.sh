#!/usr/bin/env bash
# Déploie l'application sur un VPS, dans UN SEUL dossier : ~/pourboires
# À lancer depuis votre ordinateur (le mot de passe SSH est demandé par ssh, dans votre terminal).
# Usage : deploy/deploy.sh <utilisateur@serveur> [port=8087]
#
# Garanties :
#  - tout est écrit dans ~/pourboires (rien d'autre n'est créé, modifié ou supprimé) ;
#  - aucun paquet installé, aucun service système, aucun pare-feu touché ;
#  - l'arrêt de l'application se fait uniquement via son fichier PID (jamais « pkill ») ;
#  - data/ (comptes et pourboires) et .env ne sont jamais écrasés.
set -euo pipefail

TARGET="${1:-}"
PORT="${2:-8087}"
APP_DIR="pourboires"   # relatif au dossier personnel (HOME) de l'utilisateur SSH
[ -n "$TARGET" ] || { echo "Usage : $0 <utilisateur@serveur> [port]" >&2; exit 1; }
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] || {
  echo "Port invalide : utilisez un port entre 1024 et 65535 (les ports < 1024, comme 86 ou 87, exigent root ; essayez 8086 ou 8087)." >&2; exit 1; }

cd "$(dirname "$0")/.."
echo "1/4 Construction de l'application (locale)…"
npm run build >/dev/null

# Une seule connexion SSH réutilisée : le mot de passe n'est demandé qu'une fois.
CTL="$(mktemp -u /tmp/biso-ssh-XXXXXX)"
SSH=(ssh -o ControlMaster=auto -o "ControlPath=$CTL" -o ControlPersist=120 "$TARGET")
trap 'ssh -o "ControlPath=$CTL" -O exit "$TARGET" >/dev/null 2>&1 || true' EXIT

echo "2/4 Connexion et vérifications sur le serveur…"
"${SSH[@]}" "set -e
command -v node >/dev/null || { echo 'ERREUR : Node.js absent sur le serveur (version 20 minimum). Rien n a été modifié.' >&2; exit 10; }
[ \"\$(node -p 'process.versions.node.split(\".\")[0]')\" -ge 20 ] || { echo 'ERREUR : Node.js 20 minimum requis.' >&2; exit 10; }
mkdir -p \"\$HOME/$APP_DIR/data\" \"\$HOME/$APP_DIR/release.new\"
echo \"Dossier de l'application : \$HOME/$APP_DIR\""

echo "3/4 Envoi des fichiers (dossier $APP_DIR uniquement)…"
tar czf - .output scripts/add-user.mjs deploy/control.sh | "${SSH[@]}" "set -e; cd \"\$HOME/$APP_DIR\" || exit 1; tar xzf - -C release.new"

echo "4/4 Activation…"
"${SSH[@]}" "set -e
cd \"\$HOME/$APP_DIR\" || exit 1
[ -x ./control.sh ] && ./control.sh stop || true
rm -rf ./.output ./scripts
mv release.new/.output ./.output
mv release.new/scripts ./scripts
mv release.new/deploy/control.sh ./control.sh
chmod +x ./control.sh
rm -rf ./release.new
if [ ! -f .env ]; then
  umask 077
  printf 'SESSION_SECRET=%s\nPORT=%s\n' \"\$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 48)\" '$PORT' > .env
else
  grep -q '^PORT=' .env && sed -i 's/^PORT=.*/PORT=$PORT/' .env || echo 'PORT=$PORT' >> .env
fi
./control.sh start
if [ ! -s data/users.json ]; then echo; echo 'Aucun compte pour l instant. Créez le premier administrateur :'; echo \"  cd ~/$APP_DIR && ./control.sh user-add chef <mot_de_passe> admin\"; fi"

echo
echo "Terminé. Ouvrez http://<adresse-du-serveur>:$PORT (si le port est bloqué, ouvrez-le dans votre pare-feu : je ne le fais pas)."
