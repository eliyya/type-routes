#!/bin/bash

CHANGELOG_FILE="CHANGELOG.md"
VERSION="$1"

if [[ -z "$VERSION" ]]; then
  echo "Usage: $0 <version>"
  exit 1
fi

awk -v ver="^# $VERSION" '
  $0 ~ ver {flag=1; next}
  /^# / && flag {flag=0}
  flag' "$CHANGELOG_FILE"
