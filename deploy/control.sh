#!/usr/bin/env bash
# Pilote l'application. Fonctionne UNIQUEMENT dans son propre dossier (celui de ce script).
# Usage : ./control.sh start | stop | status | restart | user-add <nom> <mot_de_passe> <admin|caissier|lecteur> [--temp]
set -u
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR" || exit 1
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
    NODE_ENV=production HOST=0.0.0.0 PORT="$PORT" DATA_DIR="$DIR/data" \
      nohup node "$DIR/.output/server/index.mjs" >> "$DIR/app.log" 2>&1 &
    echo $! > "$PIDFILE"
    sleep 1
    if is_ours "$(current_pid)"; then echo "Démarrée sur le port $PORT (PID $(current_pid))."
    else echo "ERREUR : l'application s'est arrêtée. Voir $DIR/app.log" >&2; tail -n 15 "$DIR/app.log" >&2; exit 1; fi
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
  *) echo "Usage : $0 start|stop|status|restart|user-add <nom> <mot_de_passe> <role> [--temp]" >&2; exit 1 ;;
esac
