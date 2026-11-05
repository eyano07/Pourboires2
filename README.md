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

## Fonctionnement

### Comptes
- **Import d'une liste** (sur le VPS) : `./control.sh import liste.csv <mot_de_passe_par_defaut>` — colonnes `identifiant;Noms;role`. Les comptes existants ne sont jamais modifiés ; chacun devra changer le mot de passe par défaut à sa première connexion. Ne mettez pas la liste du personnel dans le dépôt (il est public).
- Dans la page d'administration, l'**identifiant est généré à partir des noms** (premier et dernier mot, sans accents : « Grâce Mantekila » → `grace.mantekila`, numéro ajouté s'il est déjà pris), et reste modifiable.
- L'administrateur crée chaque compte avec ses **Noms** (affichés partout dans l'application), un **identifiant de connexion**, un type de compte et un mot de passe par défaut. Les noms se modifient ensuite depuis le menu « ⋮ » de chaque compte.

### Caisse en deux devises
- Chaque pourboire est saisi en **dollars ($)** ou en **francs congolais (FC, sans centimes)**. Les deux totaux sont tenus séparément et partagés séparément.

### Services du matin et du soir
- Le caissier du matin sélectionne les personnes qui partagent, saisit les pourboires, puis **vide la caisse** : chaque personne reçoit sa part dans chaque devise (unités restantes aux premiers par ordre alphabétique), le compteur et la sélection reviennent à zéro.
- Le caissier du soir fait de même ; après son vidage, la **journée est clôturée** (plus de saisie jusqu'à minuit). Variable facultative `SHIFTS` (défaut `Matin,Soir`).

### Qui voit quoi (filtré par le serveur)
| Compte | Ce qu'il voit |
|---|---|
| Caissier, administrateur | La caisse en cours et tous les partages du jour |
| Agent sélectionné pour le service en cours | La caisse en cours (totaux et saisies) |
| Agent non sélectionné | Aucun montant — seulement **son dernier gain** s'il en a un |

Après un vidage, chaque agent du partage voit **son gain en grand** à la place de la caisse. Ce gain reste affiché (même le lendemain) **jusqu'à ce qu'un caissier le sélectionne de nouveau**.

### Notifications
- Seules les personnes sélectionnées sont alertées à chaque nouveau pourboire ; au vidage, chacune reçoit sa part.
- **En direct sans interrogation** : chaque écran garde une seule connexion (Server-Sent Events) sur laquelle le serveur pousse les changements.
- **Sur téléphone, appli fermée** : Web Push, bouton « Activer ». Exige un site **HTTPS** (et, sur iPhone, l'ajout à l'écran d'accueil). Variable facultative `PUSH_CONTACT=mailto:vous@exemple.com`.

## Fichiers de données (`data/`)
- `users.json` : comptes `{ username, name, role, passwordHash, mustChangePassword }` (mot de passe haché).
- `tips.json` : journée en cours `{ date, entries: [{ id, username, amount, currency }], shareWith, closes }`, effacé à minuit.
- `earnings.json` : dernier gain de chaque agent `{ identifiant: { shift, date, amounts: { USD, CDF }, people } }`, effacé pour un agent dès qu'il est resélectionné.
- `vapid.json`, `push.json` : clés et abonnements des notifications (créés automatiquement). Remis à zéro automatiquement au changement de jour (fuseau Africa/Kinshasa).

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
Copiez `deploy/install-vps.sh` sur le VPS puis lancez `bash install-vps.sh` (variables : `PORT`, `APP_DIR`, `ADMIN_USER`, `ADMIN_PASSWORD`). Le dépôt est public : aucun jeton n'est nécessaire. Le script installe Node.js dans le dossier s'il manque, télécharge, construit, génère `data/` et `.env`, crée le premier admin et démarre. Relancez-le pour mettre à jour.

Voir [AUDIT.md](AUDIT.md) pour l'audit de sécurité et les risques restants.
