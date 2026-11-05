// Usage : npm run user:add -- <nom> <mot_de_passe> <caissier|lecteur>
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { scryptSync, randomBytes } from 'node:crypto'

const [username, password, role] = process.argv.slice(2)
if (!username || !password || !['caissier', 'lecteur'].includes(role)) {
  console.error('Usage : npm run user:add -- <nom> <mot_de_passe> <caissier|lecteur>')
  process.exit(1)
}
if (password.length < 6) { console.error('Mot de passe : 6 caractères minimum.'); process.exit(1) }

const dir = process.env.DATA_DIR || join(process.cwd(), 'data')
const file = join(dir, 'users.json')
let users = []
try { users = JSON.parse(await fs.readFile(file, 'utf8')) } catch {}
users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase())
const salt = randomBytes(16)
const hash = scryptSync(password, salt, 64)
users.push({ username, role, passwordHash: `scrypt$${salt.toString('hex')}$${hash.toString('hex')}` })
await fs.mkdir(dir, { recursive: true })
await fs.writeFile(file, JSON.stringify(users, null, 2), 'utf8')
console.log(`Compte « ${username} » (${role}) enregistré dans ${file}`)
