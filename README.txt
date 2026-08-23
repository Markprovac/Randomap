RANDO RADAR — V1.0
==================

Contenu :
- index.html
- styles.css
- app.js
- manifest.webmanifest
- sw.js
- icon-192.png / icon-512.png

Fonctions :
- Carte topographique OpenTopoMap + carte OpenStreetMap
- GPS en direct
- Import GPX, tracé, distance, D+/D-/point haut
- Radar pluie RainViewer animé sur les 2 dernières heures
- Météo locale Open-Meteo / modèles Météo-France
- Analyse météo en 6 points le long du GPX selon mode Rando ou Vélo
- Installation PWA sur Android via navigateur compatible

Installation GitHub Pages :
1. Copier tous les fichiers à la racine d'un dépôt ou d'un sous-dossier publié.
2. Activer GitHub Pages en HTTPS.
3. Ouvrir index.html depuis l'URL GitHub Pages.
4. Autoriser la localisation.
5. Utiliser l'option d'installation de l'application dans Chrome/Brave si proposée.

Note : la géolocalisation et le Service Worker nécessitent HTTPS (ou localhost).
La carte Garmin native n'est pas accessible dans une appli Web/mobile générique ; elle sera exploitée plus tard dans la version Connect IQ sur Garmin.
