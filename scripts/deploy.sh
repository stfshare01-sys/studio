#!/bin/bash
set -e
echo "🚀 Iniciando despliegue a producción..."

# Añadir cambios, commit y push
git add .
git commit -m "Deploy a producción: $(date +'%Y-%m-%d %H:%M:%S')" || echo "No hay cambios nuevos para commit."
git push origin main

# Despliegue a Firebase
firebase deploy --only hosting,functions,firestore,storage
echo "✅ Despliegue completado."
