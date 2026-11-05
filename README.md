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

## Déploiement sur un VPS (dossier unique `~/pourboires`)

Depuis votre ordinateur (Node 20+ requis aussi sur le VPS) :

```bash
deploy/deploy.sh utilisateur@adresse-du-vps 8087
```

ssh demande le mot de passe dans votre terminal (une seule fois). Le script construit l'application, envoie uniquement `.output`, `scripts/` et `control.sh` dans `~/pourboires`, génère `.env` (secret de session + port) et démarre l'application. Sur le VPS :

```bash
cd ~/pourboires
./control.sh user-add chef <mot_de_passe> admin   # premier administrateur
./control.sh status | stop | start | restart
```

Garanties : rien n'est écrit hors de `~/pourboires`, aucun paquet ni service système ni pare-feu touché, arrêt uniquement via le fichier PID, `data/` et `.env` jamais écrasés, démarrage refusé si le port est déjà pris. Utilisez un port ≥ 1024 (8086, 8087…) ; ouvrez-le vous-même dans le pare-feu si nécessaire.

### Installation directement sur le VPS (sans poste local)
Copiez `deploy/install-vps.sh` sur le VPS puis lancez `bash install-vps.sh` (variables : `PORT`, `APP_DIR`, `ADMIN_USER`, `ADMIN_PASSWORD`). Le script demande un jeton GitHub en lecture (dépôt privé), télécharge, construit, génère `data/` et `.env`, crée le premier admin et démarre. Relancez-le pour mettre à jour.
