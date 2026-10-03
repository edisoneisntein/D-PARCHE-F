#!/bin/zsh
# D-Parche Videos — arranca el servidor si no está y abre la app
PROJECT="/Users/edisonrodriguez/Documents/Copia de DPARCHE VIDEO GENERATOR 2/D-PARCHE-F"
if nc -z localhost 3000 2>/dev/null; then
  exit 0
fi
zsh -lc "cd \"$PROJECT\" && nohup npx tsx server.ts > /tmp/dparche-server.log 2>&1 & disown"
for i in {1..40}; do
  nc -z localhost 3000 2>/dev/null && exit 0
  sleep 1
done
exit 0
