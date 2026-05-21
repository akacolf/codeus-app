import { memo, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Check, Copy } from 'lucide-react'
import { codeToHtml, type BundledLanguage } from 'shiki'
import { cn } from '@renderer/lib/utils'

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
          p: ({ children }) => <p className="mt-3 first:mt-0 whitespace-pre-wrap">{children}</p>,
          ul: ({ children }) => (
            <ul className="mt-3 list-disc space-y-1 pl-5 first:mt-0">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mt-3 list-decimal space-y-1 pl-5 first:mt-0">{children}</ol>
          ),
          li: ({ children }) => <li>{children}</li>,
          h1: ({ children }) => (
            <h1 className="mt-4 text-base font-semibold first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-4 text-base font-semibold first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-4 text-sm font-semibold first:mt-0">{children}</h3>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2 hover:text-foreground"
            >
              {children}
            </a>
          ),
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
          th: ({ children }) => <th className="px-2 py-1 text-left font-semibold">{children}</th>,
          td: ({ children }) => <td className="px-2 py-1">{children}</td>,
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
