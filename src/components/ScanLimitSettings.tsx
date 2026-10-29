import { useI18n } from '../i18n'
import type { MessageKey } from '../i18n'
import { DEFAULT_SCAN_LIMITS, normalizeScanLimits, SCAN_LIMIT_RANGES } from '../lib/storage'
import type { ScanLimits } from '../types'

interface Props {
  limits: ScanLimits
  applied?: ScanLimits
  onChange: (limits: ScanLimits) => void
  onRescan: () => void
}

const GROUPS: { label: MessageKey; fields: (keyof ScanLimits)[] }[] = [
  { label: 'settings.scan.folder', fields: ['folderDepth', 'folderFiles'] },
  { label: 'settings.scan.vault', fields: ['vaultDepth', 'vaultFiles'] },
  { label: 'settings.scan.index', fields: ['noteBytes', 'totalBytes'] },
]

export default function ScanLimitSettings({ limits, applied, onChange, onRescan }: Props) {
  const { t } = useI18n()
  const changed = applied && Object.keys(limits).some((key) => limits[key as keyof ScanLimits] !== applied[key as keyof ScanLimits])
  return <div className="settings-section">
    <details>
      <summary>{t('settings.scan.title')}<small className="scan-summary">{t('settings.scan.summary', {
        folderDepth: limits.folderDepth, folderFiles: limits.folderFiles, vaultDepth: limits.vaultDepth,
        vaultFiles: limits.vaultFiles, note: limits.noteBytes / 1024, total: limits.totalBytes / 1024 / 1024,
      })}</small></summary>
      <div className="scale-presets">
        <button onClick={() => onChange({ ...DEFAULT_SCAN_LIMITS })}>{t('settings.scan.standard')}</button>
        <button onClick={() => onChange({ ...DEFAULT_SCAN_LIMITS, vaultFiles: 20000, noteBytes: 1024 * 1024, totalBytes: 256 * 1024 * 1024 })}>{t('settings.scan.large')}</button>
      </div>
      {GROUPS.map((group) => <div key={group.label}>
        <h3>{t(group.label)}</h3>
        <div className="two-column-fields">{group.fields.map((key) => {
          const divisor = key === 'noteBytes' ? 1024 : key === 'totalBytes' ? 1024 * 1024 : 1
          const [min, max] = SCAN_LIMIT_RANGES[key]
          return <label className="settings-field" key={key}>
            <span>{t(`settings.scan.${key}`)}</span>
            <input type="number" min={min / divisor} max={max / divisor} step="1" value={limits[key] / divisor} onChange={(event) => onChange(normalizeScanLimits({ ...limits, [key]: event.target.value === '' ? undefined : Number(event.target.value) * divisor }))} />
          </label>
        })}</div>
        <button className="reset-appearance" onClick={() => onChange({ ...limits, ...Object.fromEntries(group.fields.map((key) => [key, DEFAULT_SCAN_LIMITS[key]])) })}>{t('settings.shortcuts.reset')}</button>
      </div>)}
      <p>{t('settings.scan.hint')}</p>
    </details>
    {changed && <p role="status">{t('settings.scan.pending')}</p>}
    <button className="reset-appearance" disabled={!applied} onClick={onRescan}>{t('settings.scan.rescan')}</button>
  </div>
}
