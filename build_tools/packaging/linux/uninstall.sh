#!/bin/sh
# Remove the application only. Never remove prompt collections or user data.
set -eu
directory=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mode=${1:-auto}
case "$mode" in auto|--portable|--rpm|--deb) ;; *) echo 'Usage: uninstall.sh [--portable|--rpm|--deb]' >&2; exit 2 ;; esac
set --
if [ "$mode" = auto ] || [ "$mode" = --portable ]; then
  for file in "$directory"/Prombee "$directory"/Prombee-*-Linux-x86_64-Portable "$directory"/Prombee-[0-9]*; do
    [ -f "$file" ] && [ -x "$file" ] || continue
    name=${file##*/}
    case "$name" in
      Prombee|Prombee-*-Linux-x86_64-Portable) ;;
      Prombee-*) version=${name#Prombee-}; case "$version" in *[!0-9.]*|'') continue ;; esac ;;
      *) continue ;;
    esac
    duplicate=false
    for existing in "$@"; do [ "$file" != "$existing" ] || duplicate=true; done
    [ "$duplicate" = true ] || set -- "$@" "$file"
  done
fi
if [ "$#" -gt 0 ]; then
  printf 'Remove these Prombee portable programs? Prompt files and user data will be kept.\n'
  printf '  %s\n' "$@"
  printf 'Save your work and close Prombee first. Continue? [y/N] '
  read -r answer || exit 1
  case "$answer" in y|Y|yes|YES) ;; *) echo 'Cancelled.'; exit 0 ;; esac
  for file in "$@"; do rm -- "$file"; done
  echo 'Prombee removed. Prompt files and user data were kept.'
  exit 0
fi
if [ "$mode" = --portable ]; then
  echo 'Place this uninstaller beside the Prombee portable executable.' >&2; exit 1
fi
if [ "$mode" = auto ]; then
  if command -v rpm >/dev/null 2>&1 && rpm -q prombee >/dev/null 2>&1; then mode=--rpm
  elif command -v dpkg-query >/dev/null 2>&1 && [ "$(dpkg-query -W -f='${db:Status-Status}' prombee 2>/dev/null || true)" = installed ]; then mode=--deb
  else echo 'No installed Prombee package found.' >&2; exit 1
  fi
fi
case "$mode" in
  --rpm) manager=$(command -v dnf || command -v yum || true) ;;
  --deb) manager=$(command -v apt-get || true) ;;
esac
[ -n "$manager" ] || { echo 'The system package manager is unavailable.' >&2; exit 1; }
printf 'Save your work and close Prombee. Remove the application and keep all user data? [y/N] '
read -r answer || exit 1
case "$answer" in y|Y|yes|YES) ;; *) echo 'Cancelled.'; exit 0 ;; esac
if [ "$(id -u)" = 0 ]; then exec "$manager" -y remove prombee
elif command -v pkexec >/dev/null 2>&1; then exec pkexec "$manager" -y remove prombee
elif command -v sudo >/dev/null 2>&1; then exec sudo "$manager" -y remove prombee
else echo 'Administrator authorization is unavailable.' >&2; exit 1
fi
