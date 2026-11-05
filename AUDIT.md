# Audit avant déploiement — 5 novembre 2026

Méthode : relecture du code, `npm audit`, `shellcheck`, 42 tests automatiques, parcours complet dans Chrome (admin → création de compte → première connexion → saisie → lecteur), tests d'attaque contre le serveur construit, installation sur un faux VPS.

## Corrigé
| Gravité | Problème | Correction |
|---|---|---|
| Haute | Un cookie volé restait valable 12 h après un changement ou une réinitialisation du mot de passe | Le jeton contient une empreinte du mot de passe : tout changement invalide les anciennes sessions (l'utilisateur qui change reçoit un nouveau cookie) |
| Haute | `user-add` effaçait tous les comptes si `users.json` était abîmé | Le script et le serveur refusent d'écrire à partir d'un fichier illisible |
| Moyenne | Mémoire du limiteur de tentatives sans limite (+58 Mo pour 3 000 essais) | Entrées expirées purgées, 5 000 max, nom limité à 30 caractères |
| Moyenne | Requêtes de 30 Mo acceptées | Corps limité à 16 Ko (413 au-delà) |
| Moyenne | `users.json`, `tips.json` lisibles par les autres comptes du VPS (644) | Fichiers en 600, dossier `data/` en 700 |
| Moyenne | Pas de protection contre l'intégration dans un cadre ni contre les requêtes d'une autre origine (les autres applis du VPS sur d'autres ports sont « même site ») | En-têtes `X-Frame-Options`, `CSP frame-ancestors`, `nosniff`, `Referrer-Policy` ; requêtes de modification refusées si l'origine diffère |
| Moyenne | Les montants de la veille restaient sur le disque jusqu'à la première visite | Vérification chaque minute : `tips.json` est vidé au changement de jour |
| Moyenne | Grand total affiché en petit (classes `text-h2`, `text-subtitle-1`, `text-caption` absentes de Vuetify 4) | Classes Vuetify 4 |
| Basse | Session expirée : la page de caisse cessait de se mettre à jour sans prévenir | Retour automatique à la connexion |
| Basse | Suppression d'un pourboire sans confirmation | Boîte de confirmation |
| Basse | `control.sh start` annonçait un succès après 1 s même si l'appli plantait ensuite | Attend que le port réponde (15 s max), sinon arrête et affiche le journal |
| Basse | Mise à jour vers un port occupé : l'appli actuelle était arrêtée puis ne redémarrait pas | Port vérifié avant toute action ; l'appli actuelle reste en marche |
| Basse | `app.log` grossit sans fin | Rotation à 5 Mo |
| Basse | Lancement en root sans avertissement | Avertissement + 10 s pour annuler |

## Vérifié sans problème
- Mots de passe hachés (scrypt + sel), comparaisons en temps constant, aucun secret dans l'historique Git (dépôt public).
- Droits par rôle côté serveur (pas seulement dans l'interface) ; rôle relu à chaque requête.
- Écritures JSON atomiques et sérialisées (25 ajouts simultanés sans perte).
- Script : rien n'est écrit hors de `~/pourboires` (contrôlé sur faux VPS), Node.js vérifié par somme SHA-256.

## Vulnérabilités npm (11, modérées/basses) — non exploitables ici
Toutes concernent des outils de construction (glob, minimatch, archiver…) absents du serveur de production, ou des fonctions Nuxt non utilisées (route rules, server islands, NuxtLink sans pages, serveur de développement). Correctif = passage à Nuxt 4 (changement majeur, recommandé plus tard).

## Risques restants (choix à faire)
1. **HTTP sans chiffrement** : mots de passe et cookies circulent en clair sur le réseau. Recommandé : nom de domaine + HTTPS (puis `COOKIE_SECURE=true`).
2. **Pas de redémarrage automatique** après un redémarrage du VPS ou un plantage : relancer `./control.sh start`. Une ligne `@reboot` dans la crontab de l'utilisateur le permettrait (hors du dossier, donc à votre initiative).
3. **Cookies partagés entre ports** : les navigateurs ne séparent pas les cookies par port ; les autres applications du même VPS reçoivent le cookie `biso_session` (protégé contre le JavaScript, pas contre leur serveur).
4. **Le script installe toujours la dernière version de `main`** : quiconque peut pousser sur le dépôt contrôle le code installé.
5. **Déconnexion** : le cookie est supprimé du navigateur mais une copie reste valable jusqu'à 12 h (sauf changement de mot de passe).
6. **Mémoire** : la construction demande environ 1 Go ; sur un très petit VPS, ajouter de la mémoire d'échange ou construire ailleurs (`deploy/deploy.sh`).

## Ajout du 5 novembre (partage, vidage, notifications) — vérifié
- Droits : seul le caissier coche, vide la caisse et voit la liste du personnel ; l'admin ne peut pas être coché.
- Partage au centime près sans perte (testé pour 1 à 13 personnes).
- Connexions en direct : limitées à 500, coupées si le compte est supprimé ou le mot de passe changé, aucune requête pendant l'inactivité (mesuré dans Chrome).
- Web Push testé de bout en bout avec un faux service de push HTTPS qui déchiffre les messages : seules les personnes cochées reçoivent ; appareils disparus (410) retirés ; abonnements en HTTPS uniquement ; fichiers en 600.
- Non testé : réception réelle sur un téléphone (impossible sans HTTPS ni accès aux services de push depuis l'environnement de test).
