import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Button } from '@renderer/components/ui/button'
import { MODELS, PERMISSIONS, useSettings } from '@renderer/lib/settings'
import { cn } from '@renderer/lib/utils'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps): React.JSX.Element {
  const { settings, set } = useSettings()
  const [showKey, setShowKey] = useState(false)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Local-only — values persist in this app and never leave your machine.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <Section
            title="Anthropic API key"
            hint="Stored in localStorage. The agent loop will read this once it lands."
          >
            <div className="flex gap-2">
              <Input
                type={showKey ? 'text' : 'password'}
                value={settings.apiKey}
                onChange={(e) => set('apiKey', e.target.value)}
                placeholder="sk-ant-…"
                autoComplete="off"
                spellCheck={false}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={showKey ? 'Hide key' : 'Show key'}
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? <EyeOff /> : <Eye />}
              </Button>
            </div>
          </Section>

          <Section title="Default model">
            <ChipRow
              items={MODELS.map((m) => ({ id: m.id, label: m.label }))}
              selectedId={settings.model}
              onSelect={(id) => set('model', id as typeof settings.model)}
            />
          </Section>

          <Section title="Default permissions">
            <ChipRow
              items={PERMISSIONS.map((p) => ({ id: p.id, label: p.label }))}
              selectedId={settings.permission}
              onSelect={(id) => set('permission', id as typeof settings.permission)}
            />
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Section({
  title,
  hint,
  children
}: {
  title: string
  hint?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function ChipRow({
  items,
  selectedId,
  onSelect
}: {
  items: Array<{ id: string; label: string; hint?: string }>
  selectedId: string
  onSelect: (id: string) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => {
        const active = it.id === selectedId
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onSelect(it.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/8 hover:text-foreground',
              active && 'bg-white text-black hover:bg-white hover:text-black'
            )}
          >
            {it.hint && (
              <span className={cn('text-foreground', active && 'text-black/70')}>{it.hint}</span>
            )}
            <span>{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}
