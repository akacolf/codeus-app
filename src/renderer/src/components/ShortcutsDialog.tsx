import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Kbd } from '@renderer/components/ui/kbd'
import { SHORTCUTS } from '@renderer/lib/shortcuts'

interface ShortcutsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>The keys QC Codium responds to today.</DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col divide-y divide-white/5">
          {SHORTCUTS.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2.5">
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
