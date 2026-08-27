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

V1.10.11 : contrôle Vélo route strict — OSM immédiat, rejet des surfaces gravel/terre/non revêtues et des chemins non pavés, recalcul Valhalla Road, seconde vérification avant enregistrement.

V1.10.11 : retour au comportement de validation Vélo route de la V1.10.6 (contrôle souple, pas de blocage systématique si le revêtement est non vérifiable).

V1.10.13 : panneau de suivi d'activité déplacé en bas de la carte et repliable. Mode compact par défaut avec activité/distance/temps/vitesse ; tap sur le panneau pour agrandir, chevron pour réduire. Le panneau radar est masqué pendant le suivi plein écran afin de ne pas chevaucher le bottom sheet.

V1.10.13 : persistance automatique de l’activité en cours. Un pull-to-refresh/rechargement restaure le chrono, la trace, le type d’activité, le GPX suivi, la progression et la destination, puis relance le GPS.

V1.10.14 : correction de la restauration du type d’activité. Après rechargement/pull-to-refresh, le sélecteur Randonnée / Vélo route / Gravel / VTT se resynchronise avec le mode réellement enregistré, y compris pendant une activité restaurée.

V1.10.16 : blocage du geste pull-to-refresh sur Carte, Activité, Parcours et Météo. Le rechargement par tirage vers le bas reste autorisé uniquement sur l’écran Infos où la version chargée est visible. Le bouton Actualiser du navigateur reste hors du contrôle de la PWA.


V1.10.21 — correction de régression carte/GPS
- Repart de la base PWA 1.10.17 pour le moteur GPS et le mode hors ligne.
- Le GPS démarre avant toute logique de boussole/rotation.
- Pendant une activité, chaque point GPS recentre la carte, indépendamment de la boussole.
- Rotation AUTO/Nord conservée mais facultative : si le plugin ne charge pas, la carte/GPS démarrent quand même.
- Boutons GPS/boussole/+/- regroupés à droite.
- Panneau activité et fiche parcours glissables vers le bas.
- Fiche parcours développée placée sous la colonne de contrôles pour éviter le chevauchement du bouton −.


V1.10.23 — GPS PWA point par point + reprise au premier plan
- GPS navigateur demandé en haute précision avec maximumAge=0 : chaque nouvelle position fournie par Chrome est utilisée immédiatement.
- Échantillonnage de trace rapproché du comportement APK : environ 2–3 m en vélo / 2 m à pied, ou un point après quelques secondes.
- Retour dans la PWA pendant une activité : compteur recalculé immédiatement, timer UI relancé et watchPosition redémarré.
- Message « Activité reprise · GPS relancé » restauré lors d’un vrai retour depuis l’arrière-plan.
- Protection contre les grandes lignes droites après suspension : un trou GPS >20 s et >30 m ouvre un nouveau segment au lieu de relier artificiellement les deux points.
- Les coupures sont conservées comme segments séparés dans l’export GPX.


V1.10.23 — correction terrain PWA
- suivi caméra GPS renforcé pendant activité, y compris avec rotation de carte
- trace rose mise à jour point par point et remise au premier plan
- timestamps GPS non monotones tolérés pour éviter une trace vide
- vérification réseau réelle avant activation du mode Carte hors ligne
- retour au premier plan : tentative automatique de réactivation de la carte en ligne
