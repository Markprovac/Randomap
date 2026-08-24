Rando Radar v1.7.1

Rando Radar V1.4.2

Correction responsive smartphone :
- largeur réelle 100 % sur smartphone ;
- carte forcée à occuper toute la largeur disponible ;
- interface mobile activée jusqu'à 900 px de largeur logique ;
- tailles de textes et boutons adaptatives avec clamp() ;
- cartes réorganisées automatiquement selon la largeur ;
- navigation basse lisible sans zoom ;
- panneaux activité / planification agrandis ;
- recalcul de la taille Leaflet lors d'un redimensionnement ou changement d'orientation ;
- cache PWA v1.4.2.

Fonctions conservées : GPS, radar, météo, import/export GPX, création de parcours,
suivi d'activité, destination et carte plein écran.


V1.4.2 : correction du décalage horizontal apparaissant après le chargement des prévisions météo dynamiques.


V1.5.0 : ajout du bouton « Démarrer ce parcours » pour suivre un GPX importé/enregistré, avec distance restante, progression et écart au tracé.


V1.6.0 — profils du planificateur
- Randonnée : profil piéton.
- Vélo route : Valhalla bicycle_type Road, routes/surfaces adaptées privilégiées.
- Gravel : Valhalla bicycle_type Cross.
- VTT : Valhalla bicycle_type Mountain.
- Repli automatique vers le routeur OSM générique si Valhalla est indisponible.
- Le profil choisi est mémorisé avec les parcours créés localement.
