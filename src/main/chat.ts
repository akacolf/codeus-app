import { ipcMain, type WebContents } from 'electron'
import { streamText, type ModelMessage } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'

interface StartParams {
  requestId: string
  apiKey: string
  model: string
  messages: ModelMessage[]
}

const MODEL_MAP: Record<string, string> = {
  'opus-4.7': 'claude-opus-4-7',
  'sonnet-4.6': 'claude-sonnet-4-6',
  'haiku-4.5': 'claude-haiku-4-5-20251001'
}

const inFlight = new Map<string, AbortController>()

function send(wc: WebContents, channel: string, payload: unknown): void {
  if (!wc.isDestroyed()) wc.send(channel, payload)
}

async function runStream(wc: WebContents, params: StartParams): Promise<void> {
  const { requestId, apiKey, model, messages } = params
  const controller = new AbortController()
  inFlight.set(requestId, controller)

  try {
    if (!apiKey) throw new Error('No API key — paste one in Settings.')
    const anthropic = createAnthropic({ apiKey })
    const modelId = MODEL_MAP[model] ?? MODEL_MAP['sonnet-4.6']

    const result = streamText({
      model: anthropic(modelId),
      messages,
      abortSignal: controller.signal
    })

    for await (const delta of result.textStream) {
      send(wc, 'chat:chunk', { requestId, delta })
    }
    send(wc, 'chat:done', { requestId })
  } catch (error) {
    const message =
      controller.signal.aborted ? 'cancelled' : (error as Error)?.message || 'Unknown error'
    send(wc, 'chat:error', { requestId, message })
  } finally {
    inFlight.delete(requestId)
  }
}

export function registerChatIpc(): void {
  ipcMain.on('chat:start', (event, params: StartParams) => {
    void runStream(event.sender, params)
  })

  ipcMain.on('chat:cancel', (_event, { requestId }: { requestId: string }) => {
    inFlight.get(requestId)?.abort()
  })
}
