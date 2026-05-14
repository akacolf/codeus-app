// Bun's npm tarball extraction occasionally drops the +x bit on
// prebuilt binaries inside node_modules. node-pty ships a `spawn-helper`
// executable in prebuilds/{darwin-arm64,darwin-x64,...} that must be
// chmod 0755 or `posix_spawnp failed.` fires the first time we open a pty.
import { chmodSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const prebuildsDir = join(process.cwd(), 'node_modules', 'node-pty', 'prebuilds')

if (!existsSync(prebuildsDir)) process.exit(0)

for (const entry of readdirSync(prebuildsDir)) {
  const helper = join(prebuildsDir, entry, 'spawn-helper')
  if (!existsSync(helper)) continue
  const mode = statSync(helper).mode
  if ((mode & 0o111) !== 0o111) {
    chmodSync(helper, 0o755)
    console.log(`[fix-node-pty-perms] chmod +x ${helper}`)
  }
}
