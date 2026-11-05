# Pourboires chez Biso

Application de gestion des pourboires du jour (Nuxt 3 + Vuetify), sans base de données : tout est stocké dans des fichiers JSON. Voir [PLAN.md](PLAN.md).

## Démarrage

```bash
npm install
npm run user:add -- caisse motdepasse1 caissier   # compte qui ajoute les pourboires
npm run user:add -- patron motdepasse2 lecteur    # compte qui consulte seulement
SESSION_SECRET="une-longue-phrase-secrete" npm run dev
```

Production : `npm run build` puis `SESSION_SECRET=... npm start` (ajouter `COOKIE_SECURE=true` derrière HTTPS).

## Fichiers de données (`data/`)
- `users.json` : comptes (mot de passe haché). Créé par `npm run user:add`.
- `tips.json` : pourboires du jour uniquement `{ date, entries: [{ id, username, amount, time }] }`. Remis à zéro automatiquement au changement de jour (fuseau Africa/Kinshasa).

Ces deux fichiers sont ignorés par Git. `DATA_DIR` permet de changer le dossier.

## Tests
```bash
npm run build && npm test
```
Les tests de bout en bout démarrent le serveur construit ; sans build ils sont ignorés.
