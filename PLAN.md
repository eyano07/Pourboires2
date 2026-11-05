# Plan — Pourboires chez Biso

## Objectif
Application web simple pour enregistrer les pourboires du jour d'un restaurant et les afficher dans la « caisse du jour ».

## Stack
- Vue 3 + Nuxt 3, interface avec Vuetify (module `vuetify-nuxt-module`)
- Pas de base de données : fichiers JSON uniquement
- Tests : Vitest

## Point d'architecture à valider
Un site 100 % statique (`nuxt generate`) ne peut pas écrire dans un fichier. Pour que les pourboires soient enregistrés dans un fichier JSON, il faut un petit serveur Node. On utilise donc les routes serveur intégrées de Nuxt (Nitro) : le front reste léger, et le serveur lit/écrit les fichiers JSON. Aucun service externe, aucune base de données.

## Comptes (deux rôles)
- `caissier` : peut ajouter des pourboires (et supprimer ses propres saisies du jour).
- `lecteur` : consulte seulement la caisse du jour (total + liste), mise à jour automatique toutes les 10 s.

Les comptes sont dans `data/users.json` (mot de passe haché avec scrypt, jamais en clair). Un script crée un compte : `npm run user:add -- <nom> <mot_de_passe> <role>`.

## Données
- `data/users.json` : `[{ username, role, passwordHash }]`
- `data/tips.json` : `{ date: "AAAA-MM-JJ", entries: [{ id, username, amount, time }] }`
- Réinitialisation quotidienne : à chaque lecture ou écriture, si `date` n'est plus celle du jour (fuseau Africa/Kinshasa), le fichier est remis à zéro. Aucun historique conservé.

## API (routes serveur Nuxt)
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
