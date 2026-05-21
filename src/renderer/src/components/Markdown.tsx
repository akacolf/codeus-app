import { Children, memo, useEffect, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { codeToHtml, type BundledLanguage } from 'shiki'
import { cn } from '@renderer/lib/utils'
import { useChatStore } from '@renderer/stores/chatStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'

// Source-file extensions we'll linkify in `path.ext:line` / `path.ext (line N)`
// citations. Restricted to code-shaped extensions so `node.js` or `v1.2` in
// prose don't get accidentally turned into broken links.
const CITATION_EXTS =
  'ts|tsx|js|jsx|mjs|cjs|json|md|mdx|css|scss|html|yml|yaml|toml|py|go|rs|sh|bash|zsh|sql|c|h|cpp|hpp|java|kt|swift|rb|php|vue|svelte'
const CITATION_RE = new RegExp(
  `(\\b[\\w./@\\-+]+?\\.(?:${CITATION_EXTS}))(?::(\\d+)|\\s*\\(\\s*line\\s+(\\d+)\\s*\\))`,
  'gi'
)

// Conservative allow-list: shiki ships small per-language grammars. Anything
// outside this set falls through to a plain mono block.
const SHIKI_LANGS = new Set<BundledLanguage>([
  'bash',
  'c',
  'cpp',
  'css',
  'diff',
  'go',
  'graphql',
  'html',
  'java',
  'javascript',
  'js',
  'json',
  'jsx',
  'kotlin',
  'lua',
  'markdown',
  'md',
  'php',
  'python',
  'py',
  'ruby',
  'rust',
  'rs',
  'scss',
  'shell',
  'sh',
  'sql',
  'swift',
  'tsx',
  'typescript',
  'ts',
  'yaml',
  'yml',
  'zsh'
] as BundledLanguage[])

function normalizeLang(raw: string | undefined): BundledLanguage | null {
  if (!raw) return null
  const lower = raw.toLowerCase().trim()
  return SHIKI_LANGS.has(lower as BundledLanguage) ? (lower as BundledLanguage) : null
}

export const Markdown = memo(function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="prose-tight">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mt-3 first:mt-0 whitespace-pre-wrap">{linkifyCitations(children)}</p>
          ),
          ul: ({ children }) => (
            <ul className="mt-3 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-3 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>
          ),
          li: ({ children }) => <li>{linkifyCitations(children)}</li>,
          h1: ({ children }) => (
            <h1 className="mt-4 text-base font-semibold first:mt-0">
              {linkifyCitations(children)}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 text-base font-semibold first:mt-0">
              {linkifyCitations(children)}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 text-sm font-semibold first:mt-0">{linkifyCitations(children)}</h3>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => {
            // Project file links open in the IDE editor (no underline). External
            // URLs fall through to the standard anchor styling.
            const fileRef = parseFileHref(href)
            if (fileRef) {
              return (
                <Citation path={fileRef.path} line={fileRef.line}>
                  {children}
                </Citation>
              )
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-2 hover:text-foreground"
              >
                {children}
              </a>
            )
          },
          blockquote: ({ children }) => (
            <blockquote className="mt-3 border-l-2 border-white/20 pl-3 text-foreground/70">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-0 border-t border-white/10" />,
          table: ({ children }) => (
            <div className="mt-3 overflow-x-auto">
              <table className="text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1 text-left font-semibold">{linkifyCitations(children)}</th>
          ),
          td: ({ children }) => <td className="px-2 py-1">{linkifyCitations(children)}</td>,
          code: ({ className, children, ...rest }) => {
            const match = /language-(\w+)/.exec(className ?? '')
            // react-markdown distinguishes block vs inline via the absence/presence
            // of `node.position` lines spanning multiple lines; here, presence of a
            // `language-*` class or a newline in content marks a block.
            const raw = String(children ?? '')
            const isBlock = !!match || raw.includes('\n')
            if (isBlock) {
              return <CodeBlock code={raw.replace(/\n$/, '')} lang={match?.[1] ?? ''} />
            }
            return (
              <code {...rest} className="rounded bg-white/10 px-1 py-0.5 font-mono text-[0.92em]">
                {children}
              </code>
            )
          }
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})

// Recognize an `<a href>` that points at a project file, with an optional line
// number expressed as `:42`, `#L42`, or `#42`. Returns null for external URLs,
// mailtos, anchors, or anything that doesn't carry a code-shaped extension.
const FILE_HREF_RE = new RegExp(
  `^\\.?\\.?/?([\\w./@\\-+]+?\\.(?:${CITATION_EXTS}))(?:[:#]L?(\\d+))?$`,
  'i'
)

function parseFileHref(href: string | undefined): { path: string; line: number } | null {
  if (!href) return null
  if (/^[a-z]+:\/\//i.test(href)) return null
  if (href.startsWith('mailto:') || href.startsWith('#')) return null
  const m = FILE_HREF_RE.exec(href.trim())
  if (!m) return null
  return { path: m[1], line: m[2] ? parseInt(m[2], 10) : 1 }
}

// Walk react-markdown children and turn citation strings into clickable spans.
// We only split string nodes; element nodes (e.g., `<code>`, `<strong>`) pass
// through untouched so inline formatting around a citation still renders.
function linkifyCitations(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child !== 'string') return child
    return tokenizeCitations(child)
  })
}

function tokenizeCitations(text: string): ReactNode {
  if (!CITATION_RE.test(text)) return text
  CITATION_RE.lastIndex = 0
  const out: ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = CITATION_RE.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const path = m[1]
    const line = parseInt(m[2] ?? m[3] ?? '1', 10)
    out.push(
      <Citation key={`${m.index}-${path}-${line}`} path={path} line={line}>
        {m[0]}
      </Citation>
    )
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

function Citation({
  path,
  line,
  children
}: {
  path: string
  line: number
  children: ReactNode
}): React.JSX.Element {
  const openEditor = useChatStore((s) => s.openEditor)
  const revealInEditor = useWorkspaceStore((s) => s.revealInEditor)
  return (
    <button
      type="button"
      onClick={() => {
        openEditor()
        void revealInEditor(path, line)
      }}
      className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.92em] text-foreground/95 transition-colors hover:bg-white/16"
    >
      {children}
    </button>
  )
}

function CodeBlock({ code, lang }: { code: string; lang: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const [html, setHtml] = useState<string | null>(null)
  const cancelled = useRef(false)
  const normalized = normalizeLang(lang)

  useEffect(() => {
    cancelled.current = false
    if (!normalized) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHtml(null)
      return (): void => {
        cancelled.current = true
      }
    }
    void codeToHtml(code, {
      lang: normalized,
      theme: 'github-dark-dimmed'
    })
      .then((out) => {
        if (!cancelled.current) setHtml(out)
      })
      .catch(() => {
        if (!cancelled.current) setHtml(null)
      })
    return (): void => {
      cancelled.current = true
    }
  }, [code, normalized])

  return (
    <div className="my-3 overflow-hidden rounded-xl bg-white/5">
      <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{lang || 'code'}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            })
          }}
          className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-white/8 hover:text-foreground"
          aria-label="Copy code"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      {html ? (
        <div
          className={cn(
            'shiki-host overflow-x-auto px-3 pt-1 pb-3 font-mono text-[12.5px] leading-relaxed'
          )}
          // shiki output is sanitized HTML it produced itself (no user HTML round-trip).
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto px-3 pt-1 pb-3 font-mono text-[12.5px] leading-relaxed text-foreground/95">
          <code>{code}</code>
        </pre>
      )}
    </div>
  )
}
