import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCw } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { mark } from '@renderer/lib/perf'
import { cn } from '@renderer/lib/utils'

interface LazySurfaceBoundaryProps {
  name: string
  resetKey?: unknown
  className?: string
  children: ReactNode
}

interface LazySurfaceBoundaryState {
  error: Error | null
}

export class LazySurfaceBoundary extends Component<
  LazySurfaceBoundaryProps,
  LazySurfaceBoundaryState
> {
  state: LazySurfaceBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): LazySurfaceBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    mark(`surface:${this.props.name}:error`)
    console.error(`Failed to render ${this.props.name}.`, error, info)
  }

  componentDidUpdate(prevProps: LazySurfaceBoundaryProps): void {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <div
        className={cn(
          'flex h-full w-full items-center justify-center bg-background px-6 text-center',
          this.props.className
        )}
      >
        <div className="flex max-w-sm flex-col items-center gap-3 rounded-lg bg-card/95 px-5 py-4 shadow-2xl">
          <div className="text-sm font-medium text-foreground">
            {this.props.name} failed to load
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Reload QC Codeus to recover the latest app assets.
          </p>
          <Button size="sm" onClick={() => window.location.reload()} className="gap-1.5">
            <RotateCw className="size-3.5" />
            Reload
          </Button>
        </div>
      </div>
    )
  }
}
