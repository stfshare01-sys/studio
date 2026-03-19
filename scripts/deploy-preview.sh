#!/bin/bash
set -e

CHANNEL_NAME=${1:-pre-produccion}
echo "🚀 Iniciando despliegue a Firebase Hosting Preview Channel: $CHANNEL_NAME..."

# Despliegue a Firebase Preview Channel
firebase hosting:channel:deploy "$CHANNEL_NAME"
echo "✅ Despliegue a preview completado."
