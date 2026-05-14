// Local dev shim — boots the same Edge handler over Bun.serve so the proxy
// is runnable without `vercel dev` (which would prompt for project linking).
// On Vercel, this file is unused; the function is served from api/v1/chat/completions.ts.
import handler from './api/v1/chat/completions'

const PORT = Number(process.env.PORT ?? 3000)

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url)
    if (url.pathname === '/v1/chat/completions' || url.pathname === '/api/v1/chat/completions') {
      return handler(req)
    }
    if (url.pathname === '/healthz') return new Response('ok')
    return new Response('Not found', { status: 404 })
  }
})

console.log(`QC proxy listening on http://localhost:${server.port}/v1/chat/completions`)
