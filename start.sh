#!/bin/sh
# SafeGate: start the whole system (student app + security desk) with one command.
cd "$(dirname "$0")" && exec node server.js
