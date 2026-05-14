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

// OpenRouter slugs. Adjust if a model is renamed upstream — see
// https://openrouter.ai/models for the current list.
const MODEL_MAP: Record<string, string> = {
  'opus-4.7': 'anthropic/claude-opus-4.7',
  'sonnet-4.6': 'anthropic/claude-sonnet-4.6',
  'haiku-4.5': 'anthropic/claude-haiku-4.5'
}

const QC_PROXY_BASE_URL = process.env.QC_PROXY_BASE_URL || 'https://api.qccodium.com/v1'

const inFlight = new Map<string, AbortController>()

function send(wc: WebContents, channel: string, payload: unknown): void {
  if (!wc.isDestroyed()) wc.send(channel, payload)
}

async function runStream(wc: WebContents, params: StartParams): Promise<void> {
  const { requestId, model, messages } = params
  const controller = new AbortController()
  inFlight.set(requestId, controller)

  try {
    // The proxy authenticates the caller server-side and uses its own
    // OpenRouter key upstream. The client doesn't need a token — pass a
    // placeholder so @ai-sdk/openai-compatible doesn't throw on construction.
    const provider = createOpenAICompatible({
      name: 'qc',
      baseURL: QC_PROXY_BASE_URL,
      apiKey: 'qc-anonymous'
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
