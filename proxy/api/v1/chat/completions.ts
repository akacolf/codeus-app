// QC Codeus credit proxy — OpenAI-compatible /v1/chat/completions endpoint.
//
// NOTE: production now lives in the `quantum-club-website` repo at
// `src/app/api/codeus/v1/chat/completions/route.ts`, deployed to Vercel and
// served at https://api.quantumclub.sh/v1. This workspace is retained for
// optional local dev against an isolated proxy; the website's `npm run dev`
// also serves the same route at http://localhost:3000/api/codeus/v1.
//
// The Electron client uses @ai-sdk/openai-compatible pointed at
// `${QC_PROXY_BASE_URL}/chat/completions`. This function forwards transparently
// to Vercel AI Gateway (https://ai-gateway.vercel.sh) using AI_GATEWAY_API_KEY.
// AI Gateway speaks OpenAI's chat-completions format, so no translation needed.
//
// Setup:
//   1. cd proxy && bun install
//   2. cp .env.example .env.local — fill AI_GATEWAY_API_KEY (or leave
//      QC_MOCK_UPSTREAM=true to stream canned replies for free)
//   3. bun run dev   (binds on :3000)
//   4. In QC Codeus: launch with QC_PROXY_BASE_URL=http://localhost:3000/v1

export const config = { runtime: 'edge' }

const AI_GATEWAY_UPSTREAM = 'https://ai-gateway.vercel.sh/v1/chat/completions'

function jsonError(status: number, message: string, type = 'invalid_request_error'): Response {
  return new Response(JSON.stringify({ error: { type, message } }), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

const MOCK_REPLY =
  'Hi from the QC proxy mock upstream. The pipeline is wired end-to-end — your client sent OpenAI chat-completions, the proxy authorized the request, and this canned SSE stream is being parsed by @ai-sdk/openai-compatible in the main process. Flip QC_MOCK_UPSTREAM off and set AI_GATEWAY_API_KEY to switch to real generation.'

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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonError(405, 'Method not allowed')

  // TODO: replace with real QC session lookup + credit metering. For now the
  // proxy is open in dev; gate before exposing to the public internet.

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

  const upstreamKey = process.env.AI_GATEWAY_API_KEY
  if (!upstreamKey) return jsonError(500, 'Proxy missing AI_GATEWAY_API_KEY', 'api_error')

  const fwd = new Headers()
  const passthrough = ['content-type', 'accept']
  for (const name of passthrough) {
    const v = req.headers.get(name)
    if (v) fwd.set(name, v)
  }
  fwd.set('authorization', `Bearer ${upstreamKey}`)

  const upstream = await fetch(AI_GATEWAY_UPSTREAM, {
    method: 'POST',
    headers: fwd,
    body: req.body,
    // @ts-expect-error duplex is a valid RequestInit option for streaming bodies
    duplex: 'half',
    signal: req.signal
  })

  const out = new Headers(upstream.headers)
  out.delete('content-encoding')
  out.delete('content-length')

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out
  })
}
