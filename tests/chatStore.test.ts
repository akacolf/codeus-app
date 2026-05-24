import { beforeEach, describe, expect, it } from 'bun:test'
import type { Chat } from '../src/renderer/src/lib/chat'
import { useChatStore } from '../src/renderer/src/stores/chatStore'

function seedChat(overrides: Partial<Chat> = {}): Chat {
  return {
    id: overrides.id ?? 'chat-a',
    title: overrides.title ?? 'first chat',
    createdAt: overrides.createdAt ?? 1,
    updatedAt: overrides.updatedAt ?? 1,
    projectCwd: overrides.projectCwd,
    messages: overrides.messages ?? [],
    streamingMessageId: overrides.streamingMessageId,
    error: overrides.error
  }
}

beforeEach(() => {
  useChatStore.setState({
    chats: [],
    history: [{ type: 'home' }],
    index: 0,
    queued: {}
  })
})

describe('chatStore — navigation', () => {
  it('newChat lands the view on home', () => {
    useChatStore.setState({
      history: [{ type: 'home' }, { type: 'settings' }],
      index: 1
    })
    useChatStore.getState().newChat()
    const s = useChatStore.getState()
    expect(s.history[s.index].type).toBe('home')
  })

  it('back and forward walk the history stack', () => {
    useChatStore.setState({
      history: [{ type: 'home' }, { type: 'settings' }, { type: 'editor' }],
      index: 2
    })
    useChatStore.getState().back()
    expect(useChatStore.getState().index).toBe(1)
    useChatStore.getState().back()
    expect(useChatStore.getState().index).toBe(0)
    // Clamps at 0.
    useChatStore.getState().back()
    expect(useChatStore.getState().index).toBe(0)
    useChatStore.getState().forward()
    expect(useChatStore.getState().index).toBe(1)
  })

  it('editor opens and closes through history', () => {
    useChatStore.getState().openEditor()
    let s = useChatStore.getState()
    expect(s.history[s.index].type).toBe('editor')

    useChatStore.getState().closeEditor()
    s = useChatStore.getState()
    expect(s.history[s.index].type).toBe('home')
  })
})

describe('chatStore — CRUD', () => {
  it('renameChat trims and updates the title', () => {
    useChatStore.setState({ chats: [seedChat()] })
    useChatStore.getState().renameChat('chat-a', '   renamed   ')
    expect(useChatStore.getState().chats[0].title).toBe('renamed')
  })

  it('renameChat rejects empty titles', () => {
    useChatStore.setState({ chats: [seedChat({ title: 'keeper' })] })
    useChatStore.getState().renameChat('chat-a', '   ')
    expect(useChatStore.getState().chats[0].title).toBe('keeper')
  })

  it('deleteChat removes the chat and rewinds history when the active chat is gone', () => {
    useChatStore.setState({
      chats: [seedChat({ id: 'chat-a' }), seedChat({ id: 'chat-b', title: 'other' })],
      history: [{ type: 'home' }, { type: 'chat', chatId: 'chat-a' }],
      index: 1,
      queued: { 'chat-a': [{ id: 'q1', text: 'hi', settings: {} as never }] }
    })
    useChatStore.getState().deleteChat('chat-a')
    const s = useChatStore.getState()
    expect(s.chats.map((c) => c.id)).toEqual(['chat-b'])
    // History had its only chat entry stripped; it should fall back to home.
    expect(s.history.some((v) => v.type === 'chat' && v.chatId === 'chat-a')).toBe(false)
    // Queued messages for the deleted chat are cleared.
    expect(s.queued['chat-a']).toBeUndefined()
  })
})

describe('chatStore — clearAllChats', () => {
  it('wipes chats, history, and queued messages', () => {
    useChatStore.setState({
      chats: [seedChat({ id: 'a' }), seedChat({ id: 'b' })],
      history: [{ type: 'home' }, { type: 'chat', chatId: 'a' }, { type: 'chat', chatId: 'b' }],
      index: 2,
      queued: { a: [{ id: 'q', text: 'x', settings: {} as never }] }
    })
    useChatStore.getState().clearAllChats()
    const s = useChatStore.getState()
    expect(s.chats).toEqual([])
    expect(s.history).toEqual([{ type: 'home' }])
    expect(s.index).toBe(0)
    expect(s.queued).toEqual({})
  })
})
