#!/bin/bash
# TinyCompany Viewer launcher (macOS): double-click this file.
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:8000/") &
python3 -m http.server 8000 --directory viewer
