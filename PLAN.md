# Plan — Pourboires chez Biso

## Objectif
Application web simple pour enregistrer les pourboires du jour d'un restaurant et les afficher dans la « caisse du jour ».

## Stack
- Vue 3 + Nuxt 3, interface avec Vuetify (module `vuetify-nuxt-module`)
- Pas de base de données : fichiers JSON uniquement
- Tests : Vitest

## Point d'architecture à valider
Un site 100 % statique (`nuxt generate`) ne peut pas écrire dans un fichier. Pour que les pourboires soient enregistrés dans un fichier JSON, il faut un petit serveur Node. On utilise donc les routes serveur intégrées de Nuxt (Nitro) : le front reste léger, et le serveur lit/écrit les fichiers JSON. Aucun service externe, aucune base de données.

## Comptes (trois rôles)
- `admin` : crée les utilisateurs avec un mot de passe par défaut, les réinitialise ou les supprime. Consulte la caisse sans pouvoir saisir.
- `caissier` : peut ajouter des pourboires (et supprimer ses propres saisies du jour).
- `lecteur` : consulte seulement la caisse du jour (total + liste), mise à jour automatique toutes les 10 s.

Les comptes sont dans `data/users.json` (mot de passe haché avec scrypt, jamais en clair). Le premier admin se crée par script : `npm run user:add -- <nom> <mot_de_passe> admin`. Un compte créé par l'admin porte `mustChangePassword: true` : tant que le mot de passe par défaut n'est pas remplacé, l'API refuse tout sauf le changement de mot de passe.

## Données
- `data/users.json` : `[{ username, role, passwordHash }]`
- `data/tips.json` : `{ date: "AAAA-MM-JJ", entries: [{ id, username, amount }] }` (uniquement l'utilisateur et le montant)
- Réinitialisation quotidienne : à chaque lecture ou écriture, si `date` n'est plus celle du jour (fuseau Africa/Kinshasa), le fichier est remis à zéro. Aucun historique conservé.

## API (routes serveur Nuxt)
- `POST /api/auth/password` : changer son mot de passe
- `GET/POST /api/users`, `DELETE /api/users/:nom`, `POST /api/users/:nom/reset` (admin)
- `POST /api/auth/login` / `POST /api/auth/logout` / `GET /api/auth/me` (cookie de session signé HMAC)
- `GET /api/tips` : total + entrées du jour (tous les rôles connectés)
- `POST /api/tips` : ajouter un montant (rôle `caissier` uniquement)
- `DELETE /api/tips/:id` : supprimer une saisie (caissier, ses propres saisies)

## Pages
- `/login` : connexion
- `/` : caisse du jour (total en grand, liste des saisies). Le caissier voit en plus le formulaire d'ajout.

## Tests
- Unitaires : réinitialisation quotidienne, ajout/suppression, calcul du total, validation des montants, hachage/vérification des mots de passe, cookie signé.
- Bout en bout de l'API : connexion, droits par rôle, ajout, lecture par un lecteur.

## Hypothèses (à amender)
- Devise : dollar ($), montants avec 2 décimales.
- « Ce qui reste » = total des pourboires du jour. Pas de retraits/distribution dans cette version.
- Un seul restaurant, une seule caisse par jour.
- Le secret de session vient de la variable `SESSION_SECRET`.

## Évolution : partage, vidage, notifications
- `shareWith` (personnes cochées pour le service en cours) et `closes` (un partage par service : Matin, Soir) dans `tips.json`, effacés au changement de jour. Après le dernier service, la journée est clôturée jusqu'à minuit.
- `PUT /api/tips/share`, `POST /api/tips/close`, `GET /api/staff` (caissier).
- `GET /api/events` : Server-Sent Events (état de la caisse, alertes ciblées, présence). Session revérifiée toutes les 25 s.
- `GET /api/push/key`, `POST /api/push/subscribe|unsubscribe` : Web Push (HTTPS requis côté navigateur).
