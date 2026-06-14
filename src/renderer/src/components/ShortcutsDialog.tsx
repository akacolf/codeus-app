import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Kbd } from '@renderer/components/ui/kbd'
import { shortcutsForSubmitMode } from '@renderer/lib/shortcuts'
import { useSettings } from '@renderer/lib/settings'

interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps): React.JSX.Element {
  const { settings } = useSettings()
  const shortcuts = shortcutsForSubmitMode(settings.composerSubmitMode)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>The keys Codeus responds to today.</DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-px">
          {shortcuts.map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-lg py-2.5">
              <span className="text-sm text-foreground/85">{s.label}</span>
              <span className="flex items-center gap-0.5">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
