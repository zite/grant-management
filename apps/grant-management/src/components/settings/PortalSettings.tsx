import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Copy, ExternalLink, Globe, Pipette } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { saveSettings } from 'zitejs/api';
import { Markdown } from '@project/shared/ui/Markdown';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Textarea } from '@project/components/ui/textarea';
import { cn } from '@project/components/lib/utils';
import { copyText } from '../../lib/clipboard';
import { errorMessage } from '../../lib/errors';
import { qk } from '../../lib/queries';
import type { Bootstrap } from '../../lib/types';
import { useWorkspace } from '../../lib/workspace';
import { BRAND_SWATCHES, contrast, HEX_RE } from './constants';
import { Locked, SaveBar, SettingsCard, SettingsPageTitle, SettingsRow, SettingsSection, inputClass, normalizeUrl, useDraft } from './ui';

const plain = (md: string) => md.replace(/[#*_`>[\]()!-]/g, '').replace(/\s+/g, ' ').trim();

/**
 * The portal always renders light, so the preview does too — pinned colors
 * rather than theme tokens, even while the staff app itself is dark. The paper, ink
 * and serif here mirror the portal's own type and palette.
 */
const PORTAL_SERIF = "'Source Serif 4', ui-serif, Georgia, serif";
const PORTAL_SANS = "'Inter', ui-sans-serif, system-ui, sans-serif";

function PortalPreview({ brand, headline, intro, organization, logoUrl }: { brand: string; headline: string; intro: string; organization: string; logoUrl: string | null }) {
  const [broken, setBroken] = useState(false);
  const color = HEX_RE.test(brand) ? brand : '#1e5c48';
  const summary = plain(intro);
  return (
    <div className="overflow-hidden rounded-lg border shadow-xs" style={{ background: '#faf7f2', color: '#241f1c', borderColor: '#e3ded6', fontFamily: PORTAL_SANS }} aria-label="Portal preview">
      <div className="flex h-11 items-center gap-2 px-4" style={{ background: '#fffdfa', borderBottom: '1px solid #e3ded6' }}>
        {logoUrl && !broken ? (
          <img src={logoUrl} alt="" className="h-6 w-6 rounded object-contain" onError={() => setBroken(true)} />
        ) : (
          <span className="flex h-6 w-6 items-center justify-center rounded text-[10px] font-semibold" style={{ background: color, color: '#ffffff' }}>
            {organization.trim().charAt(0).toUpperCase() || 'M'}
          </span>
        )}
        <span className="truncate text-[13px] font-semibold" style={{ fontFamily: PORTAL_SERIF }}>{organization}</span>
        <span className="ml-auto inline-flex h-6 items-center rounded px-2 text-[11.5px] font-medium" style={{ background: '#241f1c', color: '#fffdfa' }}>Sign in</span>
      </div>
      <div style={{ background: '#fffdfa', borderBottom: '1px solid #e3ded6' }} className="px-5 py-5">
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: '#736b63' }}>{organization}</div>
        <div className="mt-1.5 text-[19px] font-semibold leading-tight" style={{ fontFamily: PORTAL_SERIF, letterSpacing: '-0.005em' }}>{headline || 'Apply for funding and opportunities'}</div>
        {summary && <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed" style={{ color: '#5e564e' }}>{summary}</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="inline-flex h-8 items-center rounded-md px-3 text-[13px] font-medium" style={{ background: color, color: '#ffffff' }}>
            See open programs
          </span>
          <span className="text-[13px] font-medium" style={{ color: '#5e564e' }}>How applying works</span>
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: '#8a8177' }}>Grant</div>
        <div className="mt-1 text-[15px] font-semibold leading-snug" style={{ fontFamily: PORTAL_SERIF }}>Community Arts Grants</div>
        <div className="mt-1.5 flex items-center gap-3 text-[12px]" style={{ color: '#5e564e' }}>
          <span>Up to $10,000</span>
          <span>Closes in 12 days</span>
          <span className="ml-auto font-medium" style={{ color }}>View and apply →</span>
        </div>
      </div>
    </div>
  );
}

function ContrastReadout({ color }: { color: string }) {
  if (!HEX_RE.test(color)) return null;
  const ratio = contrast(color);
  const pass = ratio >= 4.5;
  return (
    <div className={cn('flex items-start gap-2 rounded-md px-2.5 py-2 text-xs', pass ? 'bg-tone-success/[0.08] text-tone-success' : 'bg-tone-warning/[0.1] text-tone-warning')}>
      {pass ? <Check className="mt-px h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />}
      <span>
        <span className="font-semibold tabular-nums">{ratio.toFixed(1)}:1</span> against white
        {pass
          ? ratio >= 7 ? ' — passes AAA. Buttons and links read clearly.' : ' — passes AA. Buttons and links read clearly.'
          : ' — below the 4.5:1 minimum. White button text and links in this color will be hard to read; choose a darker shade.'}
      </span>
    </div>
  );
}

function PortalLinkCard() {
  const ws = useWorkspace();
  const url = ws.settings.portalUrl;
  return (
    <SettingsCard>
      <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border bg-subtle text-muted-foreground">
          <Globe className="h-4 w-4" />
        </span>
        {url ? (
          <>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">Your applicant portal</div>
              <div className="truncate text-[12.5px] text-muted-foreground">{url}</div>
            </div>
            <div className="flex shrink-0 gap-1.5">
              <Button size="sm" variant="outline" onClick={() => copyText(url, 'Copied portal link')}>
                <Copy /> Copy link
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={url} target="_blank" rel="noreferrer noopener">
                  <ExternalLink /> Open
                </a>
              </Button>
            </div>
          </>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium">No portal link yet</div>
            <div className="text-[12.5px] text-muted-foreground">Publish the Applicant Portal app to get its link. It appears here — and in every email to applicants — the first time the published portal opens.</div>
          </div>
        )}
      </div>
    </SettingsCard>
  );
}

export function PortalSettings() {
  const ws = useWorkspace();
  const qc = useQueryClient();
  const s = ws.settings;
  const { draft, set, reset, dirty, changed } = useDraft({
    portalHeadline: s.portalHeadline,
    portalIntro: s.portalIntro,
    brandColor: s.brandColor,
    privacyUrl: s.privacyUrl ?? '',
  });
  const [hexText, setHexText] = useState(s.brandColor);
  const [introTab, setIntroTab] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);

  // A color adopted from elsewhere (discard, a save in another tab) shows in the hex box too.
  useEffect(() => {
    if (draft.brandColor.toLowerCase() !== hexText.toLowerCase()) setHexText(draft.brandColor);
  }, [draft.brandColor]);

  const privacy = normalizeUrl(draft.privacyUrl);
  const errors = {
    portalHeadline: draft.portalHeadline.trim() ? null : 'The portal needs a headline',
    brandColor: HEX_RE.test(draft.brandColor) ? null : 'Use a six-digit hex color like #1E5C48',
    privacyUrl: privacy.error,
  };
  const invalid = Object.values(errors).some(Boolean);

  const pickColor = (hex: string) => {
    set({ brandColor: hex.toLowerCase() });
    setHexText(hex.toLowerCase());
  };

  const save = async () => {
    if (invalid || saving) return;
    setSaving(true);
    const patch: Parameters<typeof saveSettings>[0] = {};
    for (const key of changed) {
      if (key === 'privacyUrl') patch.privacyUrl = privacy.url || null;
      else if (key === 'portalHeadline') patch.portalHeadline = draft.portalHeadline.trim();
      else if (key === 'portalIntro') patch.portalIntro = draft.portalIntro;
      else if (key === 'brandColor') patch.brandColor = draft.brandColor;
    }
    try {
      const next = await saveSettings(patch);
      qc.setQueryData<Bootstrap>(qk.bootstrap, old => (old ? { ...old, settings: { ...old.settings, ...next } } : old));
      void qc.invalidateQueries({ queryKey: qk.bootstrap });
      setHexText(next.brandColor);
      toast.success('Portal settings saved');
    } catch (e) {
      toast.error(errorMessage(e, "Couldn't save the portal settings"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingsPageTitle title="Applicant portal" description="What applicants see when they arrive: your welcome, your color, and the link to share with them." />
      <SettingsSection title="Portal link">
        <PortalLinkCard />
      </SettingsSection>
      <Locked>
        <SettingsSection title="Welcome" description="The top of the portal’s home page, above your open programs.">
          <SettingsCard>
            <SettingsRow label="Headline" htmlFor="portal-headline" stacked>
              <Input id="portal-headline" value={draft.portalHeadline} maxLength={160} onChange={e => set({ portalHeadline: e.target.value })} className={inputClass} />
              {errors.portalHeadline && <p className="mt-1 text-xs text-tone-danger">{errors.portalHeadline}</p>}
            </SettingsRow>
            <SettingsRow
              label="Introduction"
              description="A few sentences on who you fund and how applying works. Markdown works: **bold**, links and lists."
              stacked
            >
              <div className="overflow-hidden rounded-md border border-input shadow-sm focus-within:ring-1 focus-within:ring-ring">
                <div className="flex h-8 items-center gap-0.5 border-b bg-subtle px-1.5" role="tablist">
                  {(['write', 'preview'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      role="tab"
                      aria-selected={introTab === t}
                      onClick={() => setIntroTab(t)}
                      className={cn('h-6 rounded px-2 text-xs transition-colors', introTab === t ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
                    >
                      {t === 'write' ? 'Write' : 'Preview'}
                    </button>
                  ))}
                  <span className="ml-auto pr-1 text-2xs tabular-nums text-muted-foreground">{draft.portalIntro.length}/4000</span>
                </div>
                {introTab === 'write' ? (
                  <Textarea
                    value={draft.portalIntro}
                    maxLength={4000}
                    rows={6}
                    aria-label="Portal introduction"
                    onChange={e => set({ portalIntro: e.target.value })}
                    className="min-h-[140px] resize-y rounded-none border-0 text-[13px] leading-relaxed shadow-none focus-visible:ring-0 md:text-[13px]"
                  />
                ) : (
                  <div className="min-h-[140px] px-3 py-2.5">
                    {draft.portalIntro.trim() ? <Markdown className="text-[13px]">{draft.portalIntro}</Markdown> : <p className="text-[13px] text-muted-foreground">Nothing to preview yet.</p>}
                  </div>
                )}
              </div>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>

        <SettingsSection title="Brand color" description="Used for buttons, links and highlights in the portal.">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <SettingsCard>
              <div className="space-y-3 p-4">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Brand color">
                  {BRAND_SWATCHES.map(c => {
                    const on = draft.brandColor.toLowerCase() === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={`Color ${c}`}
                        onClick={() => pickColor(c)}
                        className={cn('flex h-7 w-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', on && 'ring-2 ring-foreground/60')}
                        style={{ background: c }}
                      >
                        {on && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <label className="relative flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border" style={{ background: HEX_RE.test(draft.brandColor) ? draft.brandColor : undefined }}>
                    <Pipette className="h-3.5 w-3.5 text-white mix-blend-difference" />
                    <input type="color" value={HEX_RE.test(draft.brandColor) ? draft.brandColor : '#1e5c48'} onChange={e => pickColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label="Pick a custom color" />
                  </label>
                  <Input
                    value={hexText}
                    maxLength={7}
                    spellCheck={false}
                    aria-label="Hex color"
                    onChange={e => {
                      const v = e.target.value.trim();
                      const withHash = v.startsWith('#') ? v : `#${v}`;
                      setHexText(withHash);
                      set({ brandColor: withHash.toLowerCase() });
                    }}
                    className={cn(inputClass, 'w-28 font-mono uppercase')}
                  />
                  {errors.brandColor && <span className="text-xs text-tone-danger">{errors.brandColor}</span>}
                </div>
                <ContrastReadout color={draft.brandColor} />
              </div>
            </SettingsCard>
            <PortalPreview brand={draft.brandColor} headline={draft.portalHeadline} intro={draft.portalIntro} organization={s.organizationName} logoUrl={s.logoUrl} />
          </div>
        </SettingsSection>

        <SettingsSection title="Privacy">
          <SettingsCard>
            <SettingsRow label="Privacy policy" htmlFor="portal-privacy" description="Linked in the portal footer and wherever applicants share personal details.">
              <div className="w-full">
                <Input
                  id="portal-privacy"
                  value={draft.privacyUrl}
                  inputMode="url"
                  placeholder="example.org/privacy"
                  onChange={e => set({ privacyUrl: e.target.value })}
                  onBlur={() => privacy.url && !privacy.error && privacy.url !== draft.privacyUrl && set({ privacyUrl: privacy.url })}
                  className={inputClass}
                />
                {draft.privacyUrl.length > 4 && errors.privacyUrl && <p className="mt-1 text-xs text-tone-danger">{errors.privacyUrl}</p>}
              </div>
            </SettingsRow>
          </SettingsCard>
        </SettingsSection>
      </Locked>
      <SaveBar dirty={dirty} saving={saving} disabled={invalid} onSave={() => void save()} onDiscard={reset} />
    </>
  );
}
