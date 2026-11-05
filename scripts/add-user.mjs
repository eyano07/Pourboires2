// Usage : npm run user:add -- <nom> <mot_de_passe> <admin|caissier|lecteur> [--temp]
// --temp : l'utilisateur devra changer ce mot de passe à sa première connexion.
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { scryptSync, randomBytes } from 'node:crypto'

const args = process.argv.slice(2)
const temp = args.includes('--temp')
const [username, password, role] = args.filter(a => a !== '--temp')
if (!username || !password || !['admin', 'caissier', 'lecteur'].includes(role)) {
  console.error('Usage : npm run user:add -- <nom> <mot_de_passe> <admin|caissier|lecteur> [--temp]')
  process.exit(1)
}
if (password.length < 6) { console.error('Mot de passe : 6 caractères minimum.'); process.exit(1) }
if (!/^[A-Za-z0-9_.-]{2,30}$/.test(username)) { console.error('Nom invalide (2 à 30 caractères : lettres, chiffres, . _ -).'); process.exit(1) }

const dir = process.env.DATA_DIR || join(process.cwd(), 'data')
const file = join(dir, 'users.json')
let users = []
try { users = JSON.parse(await fs.readFile(file, 'utf8')) } catch {}
users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase())
const salt = randomBytes(16)
const hash = scryptSync(password, salt, 64)
users.push({ username, role, passwordHash: `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`, mustChangePassword: temp })
await fs.mkdir(dir, { recursive: true })
await fs.writeFile(file, JSON.stringify(users, null, 2), 'utf8')
console.log(`Compte « ${username} » (${role}) enregistré dans ${file}${temp ? ' — mot de passe à changer à la première connexion' : ''}`)
