# Pourboires chez Biso

Application de gestion des pourboires du jour (Nuxt 3 + Vuetify), sans base de données : tout est stocké dans des fichiers JSON. Voir [PLAN.md](PLAN.md).

## Démarrage

```bash
npm install
npm run user:add -- chef motdepasse0 admin        # premier administrateur (les autres comptes se créent dans l'app)
SESSION_SECRET="une-longue-phrase-secrete" npm run dev
```

Production : `npm run build` puis `SESSION_SECRET=... npm start` (ajouter `COOKIE_SECURE=true` derrière HTTPS).

## Types de compte
- **admin** : page « Utilisateurs » pour créer des comptes avec un mot de passe par défaut (modifiable ou généré), réinitialiser un mot de passe, supprimer un compte. Il consulte la caisse mais n'ajoute pas de pourboires.
- **caissier** : ajoute des pourboires (et supprime ses propres saisies).
- **lecteur** : consulte la caisse du jour.

À la première connexion (et après une réinitialisation), l'utilisateur est obligé de remplacer son mot de passe par défaut avant d'accéder au reste de l'application.

Option : `--temp` sur `npm run user:add` crée aussi un compte dont le mot de passe doit être changé à la première connexion.

## Fichiers de données (`data/`)
- `users.json` : comptes `{ username, role, passwordHash, mustChangePassword }` (mot de passe haché).
- `tips.json` : pourboires du jour uniquement `{ date, entries: [{ id, username, amount }] }` : seulement l'utilisateur et le montant (l'id sert à supprimer une saisie). Remis à zéro automatiquement au changement de jour (fuseau Africa/Kinshasa).

Ces deux fichiers sont ignorés par Git. `DATA_DIR` permet de changer le dossier.

## Tests
```bash
npm run build && npm test
```
Les tests de bout en bout démarrent le serveur construit ; sans build ils sont ignorés.
