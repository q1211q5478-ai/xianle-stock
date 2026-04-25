#!/bin/bash
cd /Users/a123/.openclaw/workspace/xianle-stock
export TELEGRAM_BOT_TOKEN="8646998739:AAEkF4NYn7xipfuvAJwbQ6xonP8tSU7jg1M"
export TELEGRAM_CHAT_ID="8614627016"
exec /opt/homebrew/bin/node stock-bot.js >> /tmp/stockbot.log 2>> /tmp/stockbot.error.log
