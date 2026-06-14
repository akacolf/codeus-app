// Codeus credit proxy — OpenAI-compatible /v1/chat/completions endpoint.
//
// NOTE: production now lives in the `quantum-club-website` repo at
// `src/app/api/codeus/v1/chat/completions/route.ts`, deployed to Vercel and
// served at https://api.quantumclub.sh/v1. This workspace is retained for
// optional local dev against an isolated proxy; the website's `npm run dev`
// also serves the same route at http://localhost:3000/api/codeus/v1.
//
// The Electron client uses @ai-sdk/openai-compatible pointed at
// `${QC_PROXY_BASE_URL}/chat/completions`. This function forwards transparently
// to LLM Gateway (https://api.llmgateway.io) using LLM_GATEWAY_API_KEY. It can
// still fall back to Vercel AI Gateway when AI_GATEWAY_API_KEY is configured so
// existing free Vercel credits remain usable during migration.
//
// Setup:
//   1. cd proxy && bun install
//   2. cp .env.example .env.local — fill LLM_GATEWAY_API_KEY, or
//      AI_GATEWAY_API_KEY for the Vercel fallback, or leave QC_MOCK_UPSTREAM=true
//      to stream canned replies for free
//   3. bun run dev   (binds on :3000)
//   4. In Codeus: launch with QC_PROXY_BASE_URL=http://localhost:3000/v1

export const config = { runtime: 'edge' }

type UpstreamId = 'llm-gateway' | 'vercel-ai-gateway'

interface UpstreamConfig {
  id: UpstreamId
  name: string
  url: string
  apiKeyEnv: 'LLM_GATEWAY_API_KEY' | 'AI_GATEWAY_API_KEY'
  apiKey?: string
}

const UPSTREAMS: Record<UpstreamId, Omit<UpstreamConfig, 'apiKey'>> = {
  'llm-gateway': {
    id: 'llm-gateway',
    name: 'LLM Gateway',
    url: 'https://api.llmgateway.io/v1/chat/completions',
    apiKeyEnv: 'LLM_GATEWAY_API_KEY'
  },
  'vercel-ai-gateway': {
    id: 'vercel-ai-gateway',
    name: 'Vercel AI Gateway',
    url: 'https://ai-gateway.vercel.sh/v1/chat/completions',
    apiKeyEnv: 'AI_GATEWAY_API_KEY'
  }
}

const LLM_GATEWAY_MODEL_ALIASES: Record<string, string> = {
  'anthropic/claude-sonnet-4.6': 'claude-sonnet-4-6',
  'anthropic/claude-haiku-4.5': 'claude-haiku-4-5',
  'google/gemini-3-flash': 'gemini-3-flash-preview',
  'openai/gpt-5-mini': 'gpt-5-mini'
}

function jsonError(status: number, message: string, type = 'invalid_request_error'): Response {
  return new Response(JSON.stringify({ error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

const MOCK_REPLY =
  'Hi from the QC proxy mock upstream. The pipeline is wired end-to-end — your client sent OpenAI chat-completions, the proxy authorized the request, and this canned SSE stream is being parsed by @ai-sdk/openai-compatible in the main process. Flip QC_MOCK_UPSTREAM off and set LLM_GATEWAY_API_KEY to switch to real generation.'

function sseLine(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

function mockOpenAIStream(model: string): Response {
  const encoder = new TextEncoder()
  const words = MOCK_REPLY.split(/(\s+)/)
  const id = `chatcmpl-mock-${Math.random().toString(36).slice(2, 10)}`
  const created = Math.floor(Date.now() / 1000)

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (chunk: object): void => controller.enqueue(encoder.encode(sseLine(chunk)))
      const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

      // Role chunk first.
      send({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }]
      })

      for (const w of words) {
        send({
          id,
          object: 'chat.completion.chunk',
          created,
          model,
          choices: [{ index: 0, delta: { content: w }, finish_reason: null }]
        })
        await sleep(35)
      }

      send({
        id,
        object: 'chat.completion.chunk',
        created,
        model,
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
      })
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    }
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive'
    }
  })
}

function selectUpstream(): UpstreamConfig | Response {
  const explicit = process.env.QC_UPSTREAM_GATEWAY
  const llmGatewayKey = process.env.LLM_GATEWAY_API_KEY
  const vercelGatewayKey = process.env.AI_GATEWAY_API_KEY

  if (explicit && explicit !== 'auto') {
    if (explicit !== 'llm-gateway' && explicit !== 'vercel-ai-gateway') {
      return jsonError(
        500,
        'Invalid QC_UPSTREAM_GATEWAY; expected auto, llm-gateway, or vercel-ai-gateway',
        'api_error'
      )
    }
    const selected = UPSTREAMS[explicit]
    const apiKey = explicit === 'llm-gateway' ? llmGatewayKey : vercelGatewayKey
    if (!apiKey) return jsonError(500, `Proxy missing ${selected.apiKeyEnv}`, 'api_error')
    return { ...selected, apiKey }
  }

  if (llmGatewayKey) return { ...UPSTREAMS['llm-gateway'], apiKey: llmGatewayKey }
  if (vercelGatewayKey) return { ...UPSTREAMS['vercel-ai-gateway'], apiKey: vercelGatewayKey }

  return jsonError(500, 'Proxy missing LLM_GATEWAY_API_KEY or AI_GATEWAY_API_KEY', 'api_error')
}

async function upstreamBody(req: Request, upstream: UpstreamConfig): Promise<BodyInit | null> {
  if (upstream.id !== 'llm-gateway') return req.body
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) return req.body

  const body = (await req.json()) as { model?: unknown }
  if (typeof body.model === 'string') {
    body.model = LLM_GATEWAY_MODEL_ALIASES[body.model] ?? body.model
  }
  return JSON.stringify(body)
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed')

  // Shared-secret gate, mirrors the production proxy in quantum-club-website.
  const expected = process.env.QC_CLIENT_TOKEN
  if (expected) {
    const got = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    if (got !== expected) return jsonError(401, 'invalid or missing client token', 'auth_error')
  }

  if (process.env.QC_MOCK_UPSTREAM === 'true') {
    let model = 'qc-mock'
    try {
      const body = (await req.clone().json()) as { model?: string }
      if (body.model) model = body.model
    } catch {
      /* ignore — model only used to echo in the chunk */
    }
    return mockOpenAIStream(model)
  }

  const upstream = selectUpstream()
  if (upstream instanceof Response) return upstream

  const fwd = new Headers()
  const passthrough = ['content-type', 'accept']
  for (const name of passthrough) {
    const v = req.headers.get(name)
    if (v) fwd.set(name, v)
  }
  fwd.set('authorization', `Bearer ${upstream.apiKey}`)

  const res = await fetch(upstream.url, {
    method: 'POST',
    headers: fwd,
    body: await upstreamBody(req, upstream),
    // @ts-expect-error duplex is a valid RequestInit option for streaming bodies
    duplex: 'half',
    signal: req.signal
  })

  const out = new Headers(res.headers)
  out.delete('content-encoding')
  out.delete('content-length')
  out.set('x-qc-upstream', upstream.id)

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: out
  })
}
