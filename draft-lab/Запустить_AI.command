#!/bin/zsh
cd "${0:A:h}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
export DRAFT_PORT=8766
# Prefer the tested local runtime when this project is on the original workstation.
if [[ -x ../../ollama-runtime/ollama ]]; then
 export PATH="${PWD}/../../ollama-runtime:$PATH"
fi
if ! command -v node >/dev/null; then
 echo 'Нужен Node.js для существующего движка рекомендаций.';read;exit 1
fi
if ! curl --silent --fail --max-time 2 http://127.0.0.1:11434/api/tags >/dev/null; then
 echo 'Запускаю Ollama…'
 ollama serve > /tmp/draftlab-ollama.log 2>&1 &
 sleep 2
fi
if curl --silent --fail --max-time 2 http://127.0.0.1:8766/api/assistant/status >/dev/null; then
 open http://127.0.0.1:8766
 exit
fi
(sleep 2; open http://127.0.0.1:8766) &
python3 server.py
