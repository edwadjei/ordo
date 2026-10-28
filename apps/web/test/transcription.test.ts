import test from 'node:test';
import assert from 'node:assert/strict';
import type { AudioSettings } from '@ordo/client';
import {
  defaultProvider,
  providerLabels,
  recorderDestination,
  settingsStatus,
  transcriptionFailure,
  unavailableReason,
} from '../lib/transcription.ts';

const settings = (changes: Partial<AudioSettings>): AudioSettings => ({
  provider: 'workers_ai',
  workersAiAvailable: true,
  hasApiKey: false,
  configured: true,
  ...changes,
});

test('Cloudflare is the default and both providers have plain names', () => {
  assert.equal(defaultProvider, 'workers_ai');
  assert.deepEqual(Object.keys(providerLabels).sort(), [
    'openai',
    'workers_ai',
  ]);
  assert.equal(providerLabels.workers_ai, 'Cloudflare (free, built in)');
  assert.equal(providerLabels.openai, 'OpenAI (your key)');
  assert.match(recorderDestination('workers_ai'), /stays within Cloudflare/);
  assert.match(recorderDestination('openai'), /sent to OpenAI/);
});

test('readiness explains what is missing for the selected provider', () => {
  assert.equal(unavailableReason(null), null);
  assert.equal(unavailableReason(settings({})), null);
  assert.equal(settingsStatus(settings({})), 'Voice transcription is ready.');
  const cloudflareOff = settings({
    workersAiAvailable: false,
    configured: false,
  });
  assert.match(
    unavailableReason(cloudflareOff)!,
    /isn't available on this server/,
  );
  assert.match(settingsStatus(cloudflareOff), /not ready/);
  const noKey = settings({ provider: 'openai', configured: false });
  assert.equal(
    unavailableReason(noKey),
    'Add your OpenAI key in Settings to transcribe.',
  );
  assert.match(settingsStatus(noKey), /Add your OpenAI key/);
});

const failure = (code: string, message: string) =>
  transcriptionFailure({ code, message });

test('specific server failures are shown in the server’s words', () => {
  const allowance =
    "Today's free transcription is used up; it resets at midnight UTC, or add an OpenAI key in Settings.";
  assert.deepEqual(failure('TRANSCRIPTION_ALLOWANCE_USED', allowance), {
    message: `${allowance} The audio was discarded.`,
    blocked: true,
  });
  for (const code of ['WORKERS_AI_UNAVAILABLE', 'FEATURE_UNAVAILABLE'])
    assert.equal(failure(code, 'Set it up.').blocked, true);
  for (const code of [
    'TRANSCRIPTION_BUSY',
    'PAYLOAD_TOO_LARGE',
    'TRANSCRIPTION_FAILED',
  ]) {
    const result = failure(code, 'Server words.');
    assert.equal(result.message, 'Server words. The audio was discarded.');
    assert.equal(result.blocked, false);
  }
});

test('changed settings and unknown failures keep fixed wording', () => {
  assert.match(
    failure('AUDIO_SETTINGS_CHANGED', 'ignored').message,
    /settings changed/,
  );
  const unknown = failure('INTERNAL', 'Provider said something raw.');
  assert.doesNotMatch(unknown.message, /raw/);
  assert.equal(unknown.blocked, false);
  assert.match(transcriptionFailure(null).message, /Could not transcribe/);
  assert.match(
    failure('TRANSCRIPTION_BUSY', ' ').message,
    /Could not transcribe/,
  );
});
