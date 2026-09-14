import fs from 'node:fs'
import path from 'node:path'

const configPath = path.resolve('.vercel/output/functions/__hono.func/.vc-config.json')
if (!fs.existsSync(configPath)) process.exit(0)

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
config.runtime = 'nodejs22.x'
fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
