#!/bin/bash
echo "Test script running at $(date)" >> /tmp/stockbot-test.log
exec /opt/homebrew/bin/node -e "console.log('node test: ok')" >> /tmp/stockbot-test.log 2>&1
