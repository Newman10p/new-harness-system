#!/bin/bash
# Jarvis Harness Startup Script for Linux/macOS
# Place this script in a startup location, e.g., ~/.local/bin/ or /usr/local/bin/
# For auto-start on Linux, create a systemd unit or cron @reboot entry.
# For macOS, use a launchd plist.

cd "$(dirname "$0")"
npm start
