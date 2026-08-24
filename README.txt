Rando Radar v1.10.0

Fichiers à publier ensemble :
- index.html
- app.js
- styles.css
- sw.js
- manifest.webmanifest
- icon-192.png
- icon-512.png

Nouveau v1.10.0 — FICHES PARCOURS + PROFIL ALTIMÉTRIQUE
- Un clic sur un parcours de la liste ouvre sa fiche détaillée.
- Un clic directement sur un tracé de la carte ouvre la même fiche en superposition sur la carte.
- Informations : type d'activité, distance, temps estimé, D+, D-, altitude min/max, difficulté et terrain estimé.
- Profil altimétrique interactif : glisser sur la courbe affiche la distance et l'altitude correspondantes.
- Sur la carte, le curseur altimétrique déplace également un repère sur le point correspondant du parcours.
- Le parcours chargé dispose lui aussi d'un profil altimétrique.
- Pendant le suivi d'un GPX, la progression actuelle est reportée sur la courbe altimétrique.
- Les altitudes manquantes sont complétées via Open-Meteo lorsque le réseau est disponible.
- Les estimations de difficulté et de durée tiennent compte du profil Rando / Route / Gravel / VTT, du dénivelé et, lorsque disponible, du terrain OpenStreetMap.

Hors ligne (depuis v1.9.x) :
- Préparation manuelle autour d'un parcours ou de la position GPS.
- Préparation automatique au démarrage d'un parcours (3 km de marge) ou d'une activité libre (5 km autour du départ).
- Carte vectorielle locale OpenStreetMap stockée dans IndexedDB.
- Le GPS, la trace d'activité, le suivi GPX, la distance et la navigation vers un point restent utilisables sans réseau.
- Le radar et les nouvelles prévisions météo nécessitent toujours Internet.

Important :
Après publication, ouvre au moins une fois la v1.10.0 avec Internet afin que le service worker mette à jour les fichiers de l'application.

V1.10.1 : calcul D+/D- lissé (profil régulier + filtre médian/moyenne + seuil 8 m), distance conservée sur la géométrie complète.

V1.10.3 : correction altitude null->0, récupération relief forcée si absent, axe du profil basé sur la distance réelle du tracé complet.

V1.10.4 : routage hybride réactif — Rando/Route via routing.openstreetmap.de en priorité, Gravel/VTT via Valhalla, secours croisés, suppression de la ligne droite provisoire.

V1.10.5 : vélo route OSM immédiat + contrôle des surfaces OSM + correction Valhalla Road si nécessaire.

V1.10.6 : contrôle Vélo route strict — OSM immédiat, rejet des surfaces gravel/terre/non revêtues et des chemins non pavés, recalcul Valhalla Road, seconde vérification avant enregistrement.

V1.10.7 : vélo route fail-closed — contrôle plus dense, chemins/pistes uniquement si revêtus et explicitement autorisés aux vélos, aucun parcours au revêtement insuffisamment vérifié ne peut être enregistré.

V1.10.9 : contrôle Vélo route par nœuds/ways OSM exacts issus des annotations OSRM ; tracé provisoire pointillé jusqu'à validation ; contrôle Valhalla géométrique renforcé.
