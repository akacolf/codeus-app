import { app } from 'electron'
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'

const QC_CLIENT_TOKEN =
  process.env.QC_CLIENT_TOKEN || '08606d51e72936e8dc17d6dcd0481d2a5a0d97b0c825851b5189b2b95be91c06'

// QC Codeus identity: a stable per-install UUID the proxy uses to key the
// balance/ledger rows. Stored in plain JSON inside userData — leaking it lets
// someone spend that account's balance, which is the same threat model as the
// API token before x402 landed. When Clerk + Stripe come online post-Atlas
// this gets upgraded to a real signed session.

const IdentityFileSchema = z.object({
  accountId: z.string().uuid(),
  createdAt: z.string()
})

type Identity = z.infer<typeof IdentityFileSchema>

let cached: Identity | null = null

function identityPath(): string {
  return join(app.getPath('userData'), 'identity.json')
}

function loadOrCreate(): Identity {
  if (cached) return cached
  try {
    const raw = readFileSync(identityPath(), 'utf8')
    const parsed = IdentityFileSchema.safeParse(JSON.parse(raw))
    if (parsed.success) {
      cached = parsed.data
      return cached
    }
  } catch {
    /* fall through to create */
  }
  const fresh: Identity = { accountId: randomUUID(), createdAt: new Date().toISOString() }
  try {
    writeFileSync(identityPath(), JSON.stringify(fresh, null, 2), 'utf8')
  } catch {
    // best-effort; in-memory id is still usable for this session
  }
  cached = fresh
  return fresh
}

export function getAccountId(): string {
  return loadOrCreate().accountId
}

export function getClientToken(): string {
  return QC_CLIENT_TOKEN
}

export function getAuthHeader(): Record<string, string> {
  return {
    Authorization: `Bearer ${getClientToken()}`,
    'X-QC-Account': getAccountId()
  }
}
