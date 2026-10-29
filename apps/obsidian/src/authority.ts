export type Authority = 'available' | 'native-editor' | 'waiting-for-disk'

/** A native buffer remains authoritative until its final write is observed. */
export class NativeAuthority {
  private latest?: string
  private sampled?: string
  private uncertain = false

  observeEdit(markdown: string) { this.latest = markdown; this.uncertain = false }

  inspect(openBuffers: readonly string[], disk: string): Authority {
    if (openBuffers.length) {
      if (this.latest === undefined) {
        this.uncertain = new Set(openBuffers).size > 1
        this.sampled = this.uncertain ? undefined : openBuffers[0]
      }
      return 'native-editor'
    }
    if (this.uncertain || ((this.latest ?? this.sampled) !== undefined && (this.latest ?? this.sampled) !== disk)) return 'waiting-for-disk'
    this.latest = this.sampled = undefined
    this.uncertain = false
    return 'available'
  }
}
