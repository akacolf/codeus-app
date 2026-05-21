import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { MODELS, PERMISSIONS, useSettings } from '@renderer/lib/settings'
import { cn } from '@renderer/lib/utils'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps): React.JSX.Element {
  const { settings, set } = useSettings()

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
          <Section title="Your name" hint="Used in the home greeting. Defaults to your OS user.">
            <Input
              value={settings.userName}
              placeholder="Display name"
              onChange={(e) => set('userName', e.target.value)}
              maxLength={40}
            />
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

          <Section title="Usage & billing">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Model calls are routed through Quantum Club’s proxy to Vercel AI Gateway. During the
              research preview, usage is on us — there is no user-facing billing and no API key to
              configure.
            </p>
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
