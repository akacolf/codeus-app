import { ipcMain, type WebContents } from 'electron'
import { streamText, type ModelMessage } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { z } from 'zod'

const StartParamsSchema = z.object({
  requestId: z.string().min(1),
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string()
      })
    )
    .min(1)
})

const CancelParamsSchema = z.object({ requestId: z.string().min(1) })

type StartParams = z.infer<typeof StartParamsSchema>

// Vercel AI Gateway model IDs (provider/model format). Adjust if a model is
// renamed upstream — see https://vercel.com/ai-gateway/models for the current list.
const MODEL_MAP: Record<string, string> = {
  'opus-4.7': 'anthropic/claude-opus-4.7',
  'sonnet-4.6': 'anthropic/claude-sonnet-4.6',
  'haiku-4.5': 'anthropic/claude-haiku-4.5'
}

// Production default points at the shared Quantum Club API host. Needs DNS +
// a Vercel alias on the `proxy/` deployment before it'll resolve. Local dev
// sets `QC_PROXY_BASE_URL=http://localhost:3000/v1`.
const QC_PROXY_BASE_URL = process.env.QC_PROXY_BASE_URL || 'https://api.quantumclub.sh/v1'

// Shared secret matched against `QC_CLIENT_TOKEN` on the proxy. Baked into
// the distributed app — not real security (a determined user can extract it
// from the asar bundle), but blocks anonymous abuse of the proxy URL. Rotate
// + reship when leaks are suspected. Real per-user auth replaces this later.
const QC_CLIENT_TOKEN =
  process.env.QC_CLIENT_TOKEN ||
  '08606d51e72936e8dc17d6dcd0481d2a5a0d97b0c825851b5189b2b95be91c06'

const inFlight = new Map<string, AbortController>()

function send(wc: WebContents, channel: string, payload: unknown): void {
  if (!wc.isDestroyed()) wc.send(channel, payload)
}

async function runStream(wc: WebContents, params: StartParams): Promise<void> {
  const { requestId, model, messages } = params
  const controller = new AbortController()
  inFlight.set(requestId, controller)

  try {
    // @ai-sdk/openai-compatible sends `apiKey` as the Authorization header,
    // which the proxy matches against QC_CLIENT_TOKEN before forwarding to
    // AI Gateway with its own key.
    const provider = createOpenAICompatible({
      name: 'qc',
      baseURL: QC_PROXY_BASE_URL,
      apiKey: QC_CLIENT_TOKEN
    })
    const modelId = MODEL_MAP[model] ?? MODEL_MAP['sonnet-4.6']

    const result = streamText({
      model: provider(modelId),
      messages: messages as ModelMessage[],
      abortSignal: controller.signal
    })

    for await (const delta of result.textStream) {
      send(wc, 'chat:chunk', { requestId, delta })
    }
    send(wc, 'chat:done', { requestId })
  } catch (error) {
    const message = controller.signal.aborted
      ? 'cancelled'
      : (error as Error)?.message || 'Unknown error'
    send(wc, 'chat:error', { requestId, message })
  } finally {
    inFlight.delete(requestId)
  }
}

export function registerChatIpc(): void {
  ipcMain.on('chat:start', (event, raw: unknown) => {
    const parsed = StartParamsSchema.safeParse(raw)
    if (!parsed.success) {
      const fallbackId =
        typeof raw === 'object' &&
        raw !== null &&
        'requestId' in raw &&
        typeof (raw as { requestId: unknown }).requestId === 'string'
          ? (raw as { requestId: string }).requestId
          : 'unknown'
      send(event.sender, 'chat:error', {
        requestId: fallbackId,
        message: `Invalid chat params: ${parsed.error.issues
          .map((i) => `${i.path.join('.')} ${i.message}`)
          .join('; ')}`
      })
      return
    }
    void runStream(event.sender, parsed.data)
  })

  ipcMain.on('chat:cancel', (_event, raw: unknown) => {
    const parsed = CancelParamsSchema.safeParse(raw)
    if (!parsed.success) return
    inFlight.get(parsed.data.requestId)?.abort()
  })
}
