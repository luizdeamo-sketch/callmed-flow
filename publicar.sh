#!/usr/bin/env bash
# Publica o CallMed Flow: carimba a versão nos <script> (força o navegador a baixar o JS novo) e envia ao GitHub Pages.
set -e
cd "$(dirname "$0")"
v=$(date +%Y%m%d%H%M%S)
sed -i -E "s#(src=\"(config|js/[a-z]+)\.js)(\?v=[0-9]+)?\"#\1?v=$v\"#g" index.html
git add -A
git -c user.name="Luiz Amo" -c user.email="luiz.amo@capacitycase.com.br" commit -q -m "${1:-Publicação}

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || true
git push -q
echo "versão $v publicada"
