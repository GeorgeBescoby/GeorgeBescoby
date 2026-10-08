#!/bin/bash
# Double-click this file to start the job search tool.
cd "$(dirname "$0")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "Python isn't installed yet."
  echo "Download it from https://www.python.org/downloads/ , install it, then double-click this file again."
  open "https://www.python.org/downloads/"
  read -p "Press Enter to close..."
  exit 1
fi

if [ ! -x .venv/bin/python ]; then
  echo "First-time setup (takes a minute)..."
  python3 -m venv .venv && .venv/bin/python -m pip install --quiet --upgrade pip \
    && .venv/bin/python -m pip install --quiet -r requirements.txt
  if [ $? -ne 0 ]; then
    rm -rf .venv
    echo "Setup failed - see the message above."
    read -p "Press Enter to close..."
    exit 1
  fi
fi

echo ""
echo "Job search is starting - your browser will open in a moment."
echo "Keep this window open while you use it. Close it when you're done."
echo ""
.venv/bin/python -m linkedin_jobs serve
