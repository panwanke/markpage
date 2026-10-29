export type Authority = 'native-editor' | 'waiting-for-disk' | 'available'

/** Keep a closed native editor's last buffer until its disk write is confirmed. */
export function evaluateAuthority(openBuffers: readonly string[], disk: string, lastBuffer?: string): Authority {
  if (openBuffers.length) return 'native-editor'
  if (lastBuffer !== undefined && lastBuffer !== disk) return 'waiting-for-disk'
  return 'available'
}

/** Initial file assignment can precede native editor loading without an editor-change event. */
export class NativeBufferTracker {
  private latestEdit?: string
  private sampled?: string
  private uncertain = false

  observeEdit(value: string) {
    this.latestEdit = value
    this.uncertain = false
  }

  inspect(openBuffers: readonly string[], disk: string) {
    if (openBuffers.length && this.latestEdit === undefined) {
      this.uncertain = new Set(openBuffers).size > 1
      this.sampled = this.uncertain ? undefined : openBuffers[0]
    }
    const lastBuffer = this.latestEdit ?? this.sampled
    const authority = !openBuffers.length && this.uncertain
      ? 'waiting-for-disk'
      : evaluateAuthority(openBuffers, disk, lastBuffer)
    const diskMatchesObservedBuffer = !this.uncertain && (lastBuffer === undefined || disk === lastBuffer)
    if (authority === 'available') {
      this.latestEdit = this.sampled = undefined
      this.uncertain = false
    }
    return { authority, diskMatchesObservedBuffer, observedBufferLength: lastBuffer?.length ?? null }
  }
}

export const PROBE_MARKER = 'markpage-compat-probe-synthetic-v1'
export const PROBE_REVISION = 2
export const PROBE_FILE = 'Probe.md'
export const PROBE_VIEW = 'markpage-compat-probe'

export function assertProbeVault(marker: unknown) {
  if (marker !== PROBE_MARKER) throw new Error('This probe requires the generated synthetic vault.')
}
