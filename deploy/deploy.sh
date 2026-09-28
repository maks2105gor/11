#!/usr/bin/env bash
# Выкладывает главное меню и Amazing Table в папку сайта на VPS.
# Запуск из корня репозитория на сервере:
#   sudo ./deploy/deploy.sh
# Папку можно поменять: sudo GAMES_ROOT=/srv/games ./deploy/deploy.sh
# Вместе с Карточным столом: sudo PLAY_ROOT=/папка/play ./deploy/deploy.sh
set -euo pipefail

ROOT="${GAMES_ROOT:-/var/www/games}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

# Копирует файлы во временную папку и одним переименованием подменяет старую версию,
# чтобы игроки никогда не получили наполовину обновлённый сайт.
publish() {
  local name="$1"; shift
  local tmp
  tmp="$(mktemp -d "$ROOT/.$name.XXXXXX")"
  cp -R "$@" "$tmp/"
  chmod -R a+rX "$tmp"
  rm -rf "$ROOT/.$name.old"
  if [ -d "$ROOT/$name" ]; then mv "$ROOT/$name" "$ROOT/.$name.old"; fi
  mv "$tmp" "$ROOT/$name"
  rm -rf "$ROOT/.$name.old"
  echo "  $ROOT/$name"
}

mkdir -p "$ROOT"
echo "Выкладываю в $ROOT:"
publish portal "$REPO"/portal/*
publish amazing-table \
  "$REPO/index.html" "$REPO/manifest.webmanifest" "$REPO/sw.js" "$REPO/icon.svg" \
  "$REPO/css" "$REPO/js"

# Карточный стол (play.myosincos.info) обновляется, только если указана его папка:
#   sudo PLAY_ROOT=/var/www/play ./deploy/deploy.sh
# Старый index.html сохраняется рядом как index.html.bak-ДАТА.
if [ -n "${PLAY_ROOT:-}" ]; then
  if [ -f "$PLAY_ROOT/index.html" ]; then
    cp "$PLAY_ROOT/index.html" "$PLAY_ROOT/index.html.bak-$(date +%Y%m%d-%H%M%S)"
  fi
  install -m 644 "$REPO/cards/index.html" "$PLAY_ROOT/index.html"
  echo "  $PLAY_ROOT/index.html (Карточный стол)"
fi

if command -v nginx >/dev/null 2>&1; then
  if nginx -t && systemctl reload nginx; then
    echo "nginx перезагружен"
  else
    echo "ВНИМАНИЕ: nginx не перезагружен. Проверьте конфиг: sudo nginx -t, затем sudo systemctl reload nginx" >&2
  fi
fi
echo "Готово."
