#!/usr/bin/env bash
# Pilote l'application. Fonctionne UNIQUEMENT dans son propre dossier (celui de ce script).
# Usage : ./control.sh start | stop | status | restart | user-add <identifiant> <mot_de_passe> <admin|caissier|lecteur> [--temp] [--name "Noms"]
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 1
[ -x "$DIR/.node/bin/node" ] && export PATH="$DIR/.node/bin:$PATH"   # Node installé localement par install-vps.sh
[ -f .env ] && set -a && . ./.env && set +a
PORT="${PORT:-8087}"
PIDFILE="$DIR/app.pid"

is_ours() { # le PID existe ET c'est bien notre application (jamais un autre programme)
  local pid="$1"
  [ -n "$pid" ] && [ -r "/proc/$pid/cmdline" ] && tr '\0' ' ' < "/proc/$pid/cmdline" | grep -qF "$DIR/.output/server/index.mjs"
}
current_pid() { [ -f "$PIDFILE" ] && cat "$PIDFILE" || true; }

case "${1:-}" in
  start)
    pid="$(current_pid)"
    if is_ours "$pid"; then echo "Déjà démarrée (PID $pid, port $PORT)."; exit 0; fi
    if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
      echo "ERREUR : le port $PORT est déjà utilisé par un autre programme. Je ne touche à rien." >&2
      echo "Choisissez un autre port : ./deploy/deploy.sh <utilisateur@serveur> <autre_port>" >&2
      exit 2
    fi
    # Journal : rotation simple au-delà de 5 Mo (un seul ancien fichier conservé).
    if [ -f "$DIR/app.log" ] && [ "$(wc -c < "$DIR/app.log")" -gt 5242880 ]; then mv -f "$DIR/app.log" "$DIR/app.log.1"; fi
    chmod 700 "$DIR/data" 2>/dev/null || true
    umask 077
    NODE_ENV=production HOST=0.0.0.0 PORT="$PORT" DATA_DIR="$DIR/data" \
      nohup node "$DIR/.output/server/index.mjs" >> "$DIR/app.log" 2>&1 &
    echo $! > "$PIDFILE"
    # Attendre que le serveur réponde réellement (15 s max).
    for _ in $(seq 1 30); do
      is_ours "$(current_pid)" || break
      if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then echo "Démarrée sur le port $PORT (PID $(current_pid))."; exit 0; fi
      sleep 0.5
    done
    echo "ERREUR : l'application ne répond pas. Voir $DIR/app.log" >&2; tail -n 15 "$DIR/app.log" >&2
    "$0" stop >/dev/null 2>&1; exit 1
    ;;
  stop)
    pid="$(current_pid)"
    if is_ours "$pid"; then
      kill "$pid"
      for _ in 1 2 3 4 5 6 7 8 9 10; do is_ours "$pid" || break; sleep 0.5; done
      echo "Arrêtée."
    else echo "Pas en cours d'exécution."; fi
    rm -f "$PIDFILE"
    ;;
  status)
    pid="$(current_pid)"
    if is_ours "$pid"; then echo "En marche (PID $pid, port $PORT)."; else echo "Arrêtée."; exit 3; fi
    ;;
  restart) "$0" stop; "$0" start ;;
  user-add) shift; DATA_DIR="$DIR/data" node "$DIR/scripts/add-user.mjs" "$@" ;;
  import) shift; DATA_DIR="$DIR/data" node "$DIR/scripts/import-users.mjs" "$@" ;;
  *) echo "Usage : $0 start|stop|status|restart|user-add <identifiant> <mot_de_passe> <role> [--temp] [--name \"Noms\"]|import <fichier.csv> <mot_de_passe_par_defaut>" >&2; exit 1 ;;
esac
