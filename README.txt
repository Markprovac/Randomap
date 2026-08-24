Rando Radar v1.9.1

Fichiers à publier ensemble :
- index.html
- app.js
- styles.css
- sw.js
- manifest.webmanifest
- icon-192.png
- icon-512.png

Nouveau v1.9.0 : CARTES HORS LIGNE
- Préparer une carte autour du parcours chargé ou de la position GPS.
- Choix d'une marge de 1, 3 ou 5 km.
- Téléchargement avant départ des routes, pistes, sentiers, cours d'eau et points utiles OpenStreetMap.
- Stockage local dans IndexedDB.
- Le parcours chargé et la dernière météo disponible sont inclus dans le paquet hors ligne.
- Bascule automatique sur une carte vectorielle locale lorsque le réseau disparaît.
- GPS, trace d'activité, suivi GPX, distance et navigation point restent utilisables sans réseau.
- Radar et nouvelles prévisions météo nécessitent toujours Internet.
- Leaflet est mis en cache par le service worker afin que l'application puisse démarrer hors connexion après une première installation/mise à jour en ligne.

Important :
Ouvre au moins une fois la v1.9.0 avec Internet après publication afin que le nouveau service worker mette en cache les fichiers nécessaires à l'utilisation hors ligne.


Nouveau v1.9.1 : préparation hors ligne automatique au démarrage d’un parcours (3 km de marge) ou d’une activité libre (5 km autour du départ). Le suivi démarre immédiatement pendant le téléchargement en arrière-plan.
