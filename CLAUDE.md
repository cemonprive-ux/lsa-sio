# Règles du dépôt lsa-sio

## Notification de mise à jour (obligatoire)

Le site installé sur l'écran d'accueil affiche la bannière « Mise à jour disponible » quand `version.json` change
(logique dans `assets/app-nav.js`, comparaison avec la version mémorisée sur l'appareil).

À CHAQUE publication sur `main` qui modifie le site (pages HTML, `assets/`, `manifest.webmanifest`, icônes), Claude doit,
dans le même commit ou dans un commit juste après :

1. Mettre à jour `version.json` :
   - `version` : `AAAA-MM-JJ.N` (date du jour, Europe/Paris ; N = 1 puis +1 pour chaque publication du même jour).
     Toujours une valeur différente de la précédente, sinon la bannière ne s'affiche pas.
   - `note` : une phrase courte en français décrivant ce qui change pour les utilisateurs (pas de HTML).
2. Ne pas toucher à `version.json` pour un changement sans effet visible (README, CLAUDE.md, dossier `sio-server/`).

Ne jamais pousser une modification du site sans avoir changé `version`.
