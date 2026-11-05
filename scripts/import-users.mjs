// Importe une liste de comptes depuis un fichier CSV (séparateur ; ou ,), sans jamais toucher aux comptes existants.
// Usage : node scripts/import-users.mjs <fichier.csv> <mot_de_passe_par_defaut>
// Colonnes : identifiant;Noms;role   (role = caissier | lecteur | admin)
// Chaque compte importé devra changer le mot de passe par défaut à sa première connexion.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { scryptSync, randomBytes } from 'node:crypto'

const [csvPath, password] = process.argv.slice(2)
if (!csvPath || !password) { console.error('Usage : import-users.mjs <fichier.csv> <mot_de_passe_par_defaut>'); process.exit(1) }
if (password.length < 6) { console.error('Mot de passe par défaut : 6 caractères minimum.'); process.exit(1) }

const dir = process.env.DATA_DIR || join(process.cwd(), 'data')
const file = join(dir, 'users.json')
let users = []
let raw = null
try { raw = await fs.readFile(file, 'utf8') } catch (e) { if (e.code !== 'ENOENT') throw e }
if (raw !== null) {
  try { users = JSON.parse(raw) } catch { users = null }
  if (!Array.isArray(users)) { console.error(`ERREUR : ${file} est illisible. Rien n'a été modifié.`); process.exit(1) }
}

const lines = (await fs.readFile(csvPath, 'utf8')).split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'))
const added = [], skipped = [], errors = []
for (const [i, line] of lines.entries()) {
  const [username, name, role] = line.split(/[;,]/).map(s => (s ?? '').trim())
  if (i === 0 && username.toLowerCase() === 'identifiant') continue // ligne d'en-tête
  if (!/^[A-Za-z0-9_.-]{2,30}$/.test(username ?? '')) { errors.push(`ligne ${i + 1} : identifiant invalide « ${username} »`); continue }
  const clean = (name ?? '').replace(/\s+/g, ' ').trim()
  if (clean.length < 2 || clean.length > 60 || /[<>]/.test(clean)) { errors.push(`ligne ${i + 1} : noms invalides`); continue }
  if (!['admin', 'caissier', 'lecteur'].includes(role)) { errors.push(`ligne ${i + 1} : rôle invalide « ${role} »`); continue }
  if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) { skipped.push(username); continue }
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64)
  users.push({ username, name: clean, role, passwordHash: `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`, mustChangePassword: true })
  added.push(`${clean} (${username}, ${role})`)
}
if (errors.length) { console.error('ERREUR — rien n\'a été importé :\n  ' + errors.join('\n  ')); process.exit(1) }

await fs.mkdir(dir, { recursive: true, mode: 0o700 })
const tmp = `${file}.${process.pid}.tmp`
await fs.writeFile(tmp, JSON.stringify(users, null, 2), { encoding: 'utf8', mode: 0o600 })
await fs.rename(tmp, file)
console.log(`${added.length} compte(s) créé(s) :`)
for (const a of added) console.log(`  + ${a}`)
if (skipped.length) console.log(`${skipped.length} déjà existant(s), non modifié(s) : ${skipped.join(', ')}`)
console.log('Chacun devra changer le mot de passe par défaut à sa première connexion.')
