import type { AudioSettings } from '@ordo/client';

type Provider = AudioSettings['provider'];

export const defaultProvider: Provider = 'workers_ai';

/**
 * Names shown in the Settings provider choice. The built-in option is named
 * for what it is, not for the vendor or its price; where it runs is a detail
 * line in Settings (`builtInDetail`), never the label.
 */
export const providerLabels: Record<Provider, string> = {
  workers_ai: 'Built-in transcription',
  openai: 'OpenAI (your key)',
};

/** Secondary line under the built-in choice in Settings. */
export const builtInDetail =
  'Included with Ordo, with nothing to set up. It runs on Ordo’s hosting provider, Cloudflare (Workers AI).';

/** Readiness line under the Settings form, for the saved choice. */
export function settingsStatus(settings: AudioSettings) {
  if (settings.configured) return 'Voice transcription is ready.';
  return settings.provider === 'openai'
    ? 'Add your OpenAI key and save it to turn on voice transcription.'
    : 'Voice transcription is not ready on this server yet.';
}

/** Why Record can't be used with the saved choice, or null when it can. */
export function unavailableReason(settings: AudioSettings | null) {
  if (!settings) return null;
  if (settings.configured) return null;
  return settings.provider === 'openai'
    ? 'Add your OpenAI key in Settings to transcribe.'
    : "Built-in transcription isn't available on this server. Add an OpenAI key in Settings to transcribe here.";
}

/**
 * Failure codes whose server message is written for people and is safe to
 * show as is. `blocked` means recording again will fail the same way until
 * Settings change (or, for the allowance, until midnight UTC).
 */
const specific: Record<string, { blocked: boolean }> = {
  TRANSCRIPTION_ALLOWANCE_USED: { blocked: true },
  WORKERS_AI_UNAVAILABLE: { blocked: true },
  FEATURE_UNAVAILABLE: { blocked: true },
  TRANSCRIPTION_BUSY: { blocked: false },
  PAYLOAD_TOO_LARGE: { blocked: false },
  TRANSCRIPTION_FAILED: { blocked: false },
};

export function transcriptionFailure(cause: unknown): {
  message: string;
  blocked: boolean;
} {
  const error = cause as { code?: unknown; message?: unknown } | null;
  const code = typeof error?.code === 'string' ? error.code : '';
  if (code === 'AUDIO_SETTINGS_CHANGED')
    return {
      message:
        'Your transcription settings changed. The audio was discarded. Check Settings and record again.',
      blocked: true,
    };
  const known = specific[code];
  if (known && typeof error?.message === 'string' && error.message.trim())
    return {
      message: `${error.message.trim()} The audio was discarded.`,
      blocked: known.blocked,
    };
  return {
    message:
      'Could not transcribe this recording. The audio has been discarded. Please record again.',
    blocked: false,
  };
}
