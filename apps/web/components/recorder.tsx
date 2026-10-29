'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { RequestError, type AudioSettings } from '@ordo/client';
import { api } from '../lib/workspace';
import { Dialog } from './dialog';
import { transcriptionFailure } from '../lib/transcription';
const MAX_BYTES = 20 * 1024 * 1024;
export function Recorder({
  onClose,
  onNote,
  onSettings,
  transcription,
  unavailableReason,
  provider,
  workspaceId = null,
  projectId = null,
}: {
  onClose: () => void;
  onNote: (id: string) => Promise<void>;
  /** Opens Settings in place of this dialog. */
  onSettings?: () => void;
  transcription: boolean;
  /** Why transcription can't run with the saved choice, in plain words. */
  unavailableReason?: string | null;
  provider: AudioSettings['provider'];
  /** Where a saved voice note lands; the Inbox when both are null. */
  workspaceId?: string | null;
  projectId?: string | null;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const parts = useRef<Blob[]>([]);
  const active = useRef(true);
  const discard = useRef(false);
  const request = useRef<AbortController | null>(null);
  // Keep the provider shown when this dialog opened, even if another tab changes settings.
  const [selectedProvider] = useState(provider);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [supported, setSupported] = useState(false);
  const [secure, setSecure] = useState(true);
  const [available, setAvailable] = useState(transcription);
  // Set when the server says recording again would fail the same way.
  const [blocked, setBlocked] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [transcribing, setTranscribing] = useState(false);
  useEffect(() => {
    active.current = true;
    setSecure(window.isSecureContext);
    setSupported(
      !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined',
    );
    return () => {
      active.current = false;
      discard.current = true;
      request.current?.abort();
      parts.current = [];
      if (recorder.current?.state !== 'inactive') recorder.current?.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(
      () => setSeconds((value) => value + 1),
      1000,
    );
    return () => clearInterval(timer);
  }, [recording]);
  function close() {
    if (
      (recording || starting || (text && !savedNote)) &&
      !window.confirm('Close and discard this unsaved recording or transcript?')
    )
      return;
    discard.current = true;
    parts.current = [];
    request.current?.abort();
    onClose();
  }
  async function transcribe(audio: Blob) {
    setBusy(true);
    setTranscribing(true);
    const control = new AbortController();
    request.current = control;
    try {
      const result = await api.transcribeAudio(
        audio,
        control.signal,
        selectedProvider,
      );
      if (active.current) setText(result.transcript);
    } catch (cause) {
      if (active.current) {
        const failure = transcriptionFailure(
          cause instanceof RequestError ? cause : null,
        );
        if (failure.blocked) setBlocked(true);
        setError(failure.message);
      }
    } finally {
      // No audio is retained for playback, retries, or later uploads.
      parts.current = [];
      if (active.current) {
        setBusy(false);
        setTranscribing(false);
      }
    }
  }
  async function start() {
    if (!available || blocked || !secure || !supported) return;
    if (
      text &&
      !savedNote &&
      !window.confirm('Discard the unsaved transcript and record again?')
    )
      return;
    setStarting(true);
    setError('');
    setText('');
    setSavedNote(null);
    setSeconds(0);
    discard.current = false;
    parts.current = [];
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current || discard.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/webm',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const next = new MediaRecorder(
        media,
        mimeType ? { mimeType } : undefined,
      );
      recorder.current = next;
      let size = 0;
      next.ondataavailable = (event) => {
        if (!event.data.size || discard.current || !active.current) return;
        size += event.data.size;
        if (size > MAX_BYTES) {
          discard.current = true;
          parts.current = [];
          if (active.current)
            setError(
              'Recording exceeded the limit and was discarded. Please record a shorter thought.',
            );
          if (next.state !== 'inactive') next.stop();
          return;
        }
        parts.current.push(event.data);
      };
      next.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        stream.current = null;
        recorder.current = null;
        if (active.current) {
          setRecording(false);
          setBusy(false);
        }
        if (!active.current || discard.current) {
          parts.current = [];
          return;
        }
        setRecording(false);
        const audio = new Blob(parts.current, {
          type: next.mimeType || parts.current[0]?.type || 'audio/webm',
        });
        parts.current = [];
        recorder.current = null;
        if (audio.size) void transcribe(audio);
        else setError('No audio was captured. Please record again.');
      };
      next.onerror = () => {
        discard.current = true;
        parts.current = [];
        media.getTracks().forEach((track) => track.stop());
        if (active.current) {
          setRecording(false);
          setError(
            'Recording stopped and the audio was discarded. Please try again.',
          );
        }
      };
      next.start(1000);
      setRecording(true);
    } catch (cause) {
      discard.current = true;
      parts.current = [];
      stream.current?.getTracks().forEach((track) => track.stop());
      if (active.current)
        setError(
          (cause as DOMException).name === 'NotAllowedError'
            ? 'Microphone access was declined. Allow it in browser settings to record.'
            : 'Could not start recording. Please try again.',
        );
    } finally {
      if (active.current) setStarting(false);
    }
  }
  async function saveNote() {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      let id = savedNote;
      if (!id) {
        const note = await api.createNote({
          title: 'Voice note',
          body: text,
          workspaceId,
          projectId,
        });
        id = note.id;
        if (active.current) setSavedNote(id);
      }
      if (active.current) await onNote(id);
    } catch (cause) {
      if (active.current) setError((cause as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <Dialog title="A thought, out loud." onClose={close}>
      <div className="recorder" aria-busy={busy}>
        {!available ? (
          <p className="muted">
            {unavailableReason || 'Voice transcription · Coming soon.'}
          </p>
        ) : !secure ? (
          <p className="muted">Recording needs a secure connection.</p>
        ) : (
          !supported && (
            <p className="muted">Recording isn’t supported in this browser.</p>
          )
        )}
        {recording ? (
          <div className="recording-live" role="status">
            <span />
            Recording · {Math.floor(seconds / 60)}:
            {String(seconds % 60).padStart(2, '0')}
            <button
              className="secondary"
              onClick={() => {
                setRecording(false);
                setBusy(true);
                recorder.current?.stop();
              }}
            >
              <Square size={14} />
              Stop and transcribe
            </button>
          </div>
        ) : (
          <div className="form-actions">
            <button
              className="primary"
              disabled={
                busy ||
                starting ||
                blocked ||
                !available ||
                !secure ||
                !supported
              }
              onClick={() => void start()}
            >
              <Mic size={15} />
              {starting
                ? 'Opening microphone…'
                : text
                  ? 'Record another'
                  : 'Start recording'}
            </button>
            {(!available || blocked) && onSettings && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() => {
                  discard.current = true;
                  parts.current = [];
                  request.current?.abort();
                  onSettings();
                }}
              >
                Open Settings
              </button>
            )}
          </div>
        )}
        {transcribing && (
          <p className="muted" role="status">
            Transcribing… Audio will be discarded.
          </p>
        )}
        {text && (
          <>
            <label>
              Transcript
              <textarea
                className="transcript-text"
                value={text}
                disabled={busy || !!savedNote}
                onChange={(event) => setText(event.target.value)}
              />
            </label>
            <button
              className="primary"
              disabled={busy || !text.trim()}
              onClick={() => void saveNote()}
            >
              {busy
                ? 'Saving…'
                : savedNote
                  ? 'Open saved note'
                  : 'Save transcript as note'}
            </button>
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="privacy-note">
          Audio is used only to transcribe and isn’t saved by Ordo. Only save
          the transcript if you want to keep it. Record only with everyone’s
          permission.
        </p>
      </div>
    </Dialog>
  );
}
