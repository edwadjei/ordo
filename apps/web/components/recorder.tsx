'use client';
import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Upload, RefreshCw } from 'lucide-react';
import { RequestError, type AudioCapture } from '@ordo/client';
import { api } from '../lib/workspace';
import { Dialog } from './dialog';
const MAX_BYTES = 20 * 1024 * 1024;
export function Recorder({
  onClose,
  onNote,
  transcription,
}: {
  onClose: () => void;
  onNote: (id: string) => Promise<void>;
  transcription: boolean;
}) {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const active = useRef(true);
  const request = useRef<AbortController | null>(null);
  const [recording, setRecording] = useState(false);
  const [starting, setStarting] = useState(false);
  const [audio, setAudio] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState<AudioCapture | null>(null);
  const [history, setHistory] = useState<AudioCapture[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [supported, setSupported] = useState(false);
  const [secure, setSecure] = useState(true);
  const [canTranscribe, setCanTranscribe] = useState(transcription);
  const [noteSaved, setNoteSaved] = useState(false);
  useEffect(() => {
    active.current = true;
    setSecure(window.isSecureContext);
    setSupported(
      !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined',
    );
    api
      .captures()
      .then((result) => {
        if (active.current) setHistory(result.captures);
      })
      .catch(() => {
        if (active.current)
          setError(
            'Could not load saved recordings. You can retry by reopening Record.',
          );
      });
    return () => {
      active.current = false;
      request.current?.abort();
      if (recorder.current?.state !== 'inactive') recorder.current?.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (!audio) {
      setUrl('');
      return;
    }
    const next = URL.createObjectURL(audio);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [audio]);
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
      (recording || starting || (audio && !saved)) &&
      !window.confirm('Close this recording? Unsaved audio will be discarded.')
    )
      return;
    onClose();
  }
  async function start() {
    setStarting(true);
    setError('');
    setSaved(null);
    setNoteSaved(false);
    setAudio(null);
    setSeconds(0);
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!active.current) {
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
      const parts: Blob[] = [];
      let size = 0;
      next.ondataavailable = (event) => {
        if (!event.data.size) return;
        size += event.data.size;
        if (size > MAX_BYTES) {
          if (active.current)
            setError(
              'Recording reached the 20 MB limit. Start a shorter recording.',
            );
          if (next.state !== 'inactive') next.stop();
          return;
        }
        parts.push(event.data);
      };
      next.onstop = () => {
        media.getTracks().forEach((track) => track.stop());
        if (!active.current) return;
        setRecording(false);
        if (size <= MAX_BYTES && parts.length)
          setAudio(new Blob(parts, { type: next.mimeType || parts[0].type }));
      };
      next.onerror = () => {
        media.getTracks().forEach((track) => track.stop());
        if (active.current) {
          setRecording(false);
          setError('Recording stopped unexpectedly. Try again.');
        }
      };
      next.start(1000);
      setRecording(true);
    } catch (cause) {
      stream.current?.getTracks().forEach((track) => track.stop());
      if (active.current)
        setError(
          (cause as DOMException).name === 'NotAllowedError'
            ? 'Microphone access was declined. Allow it in browser settings or upload audio.'
            : 'Could not start recording. Try uploading audio instead.',
        );
    } finally {
      if (active.current) setStarting(false);
    }
  }
  async function save() {
    if (!audio) return;
    setBusy(true);
    setError('');
    const control = new AbortController();
    request.current = control;
    try {
      const result = await api.createCapture(audio, control.signal);
      if (!active.current) return;
      setSaved(result);
      setHistory((items) => [
        result,
        ...items.filter((item) => item.id !== result.id),
      ]);
    } catch (cause) {
      if (active.current) setError((cause as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function transcribe() {
    if (!saved) return;
    setBusy(true);
    setError('');
    const control = new AbortController();
    request.current = control;
    try {
      const result = await api.transcribe(saved.id, control.signal);
      if (active.current) {
        setSaved(result);
        setHistory((items) =>
          items.map((item) => (item.id === result.id ? result : item)),
        );
      }
    } catch (cause) {
      if (active.current) {
        if (
          cause instanceof RequestError &&
          cause.code === 'FEATURE_UNAVAILABLE'
        )
          setCanTranscribe(false);
        else setError((cause as Error).message);
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function saveNote() {
    if (!saved?.transcript) return;
    setBusy(true);
    setError('');
    try {
      const note = await api.createNote({
        title: 'Voice note',
        body: saved.transcript,
      });
      if (active.current) {
        setNoteSaved(true);
        await onNote(note.id);
      }
    } catch (cause) {
      if (active.current) setError((cause as Error).message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return (
    <Dialog title="A thought, out loud." onClose={close}>
      <div className="recorder" aria-busy={busy}>
        {!secure ? (
          <p className="muted">
            Recording needs a secure connection. You can upload an audio file
            here.
          </p>
        ) : (
          !supported && (
            <p className="muted">
              Recording isn’t supported in this browser. Upload an audio file
              instead.
            </p>
          )
        )}
        {recording ? (
          <div className="recording-live" role="status">
            <span />
            Recording · {Math.floor(seconds / 60)}:
            {String(seconds % 60).padStart(2, '0')}
            <button
              className="secondary"
              onClick={() => recorder.current?.stop()}
            >
              <Square size={14} />
              Stop
            </button>
          </div>
        ) : (
          <div className="form-actions">
            {secure && supported && (
              <button
                className="primary"
                disabled={busy || starting}
                onClick={() => {
                  if (
                    audio &&
                    !saved &&
                    !window.confirm(
                      'Discard the unsaved recording and start again?',
                    )
                  )
                    return;
                  void start();
                }}
              >
                <Mic size={15} />
                {starting
                  ? 'Opening microphone…'
                  : audio || saved
                    ? 'Record another'
                    : 'Start recording'}
              </button>
            )}
            <label className="audio-upload secondary">
              <Upload size={14} />
              Choose audio
              <input
                type="file"
                accept="audio/webm,audio/mp4,audio/ogg,audio/wav,.m4a,.webm,.ogg,.wav"
                disabled={busy || starting}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  if (file.size > MAX_BYTES || !file.size) {
                    setError('Choose a non-empty audio file under 20 MB.');
                    return;
                  }
                  if (
                    audio &&
                    !saved &&
                    !window.confirm('Replace your unsaved recording?')
                  )
                    return;
                  // Some phone pickers omit the MIME type for m4a/wav files.
                  const extension = file.name.split('.').pop()?.toLowerCase();
                  const type =
                    file.type ||
                    (
                      {
                        m4a: 'audio/mp4',
                        wav: 'audio/wav',
                        ogg: 'audio/ogg',
                        webm: 'audio/webm',
                      } as Record<string, string>
                    )[extension || ''];
                  if (
                    !type ||
                    ![
                      'audio/webm',
                      'audio/mp4',
                      'audio/ogg',
                      'audio/wav',
                      'audio/x-wav',
                      'audio/x-m4a',
                    ].includes(type.split(';')[0])
                  ) {
                    setError('Choose a WebM, M4A, Ogg, or WAV audio file.');
                    return;
                  }
                  setAudio(
                    new Blob([file], {
                      type: type
                        .replace('audio/x-wav', 'audio/wav')
                        .replace('audio/x-m4a', 'audio/mp4'),
                    }),
                  );
                  setSaved(null);
                  setNoteSaved(false);
                  setError('');
                }}
              />
            </label>
          </div>
        )}
        {!recording && (url || saved) && (
          <audio
            className="recording-preview"
            controls
            src={url || api.captureAudioUrl(saved!.id)}
          />
        )}
        {audio && !saved && !recording && (
          <div className="form-actions">
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? 'Saving…' : 'Save recording'}
            </button>
            <span className="muted small">
              Not saved yet · {(audio.size / 1024 / 1024).toFixed(1)} MB
            </span>
          </div>
        )}
        {saved && !recording && (
          <>
            <p className="saved" role="status">
              Recording saved.
            </p>
            <button
              className="secondary"
              disabled={busy || !canTranscribe || !!saved.transcript}
              onClick={() => void transcribe()}
            >
              <RefreshCw size={14} />
              {busy
                ? 'Working…'
                : !canTranscribe
                  ? 'Transcription · Coming soon'
                  : saved.transcript
                    ? 'Transcribed'
                    : 'Transcribe recording'}
            </button>
            {saved.transcript && (
              <>
                <label>
                  Transcript
                  <textarea
                    className="transcript-text"
                    readOnly
                    value={saved.transcript}
                  />
                </label>
                <button
                  className="primary"
                  disabled={busy || noteSaved}
                  onClick={() => void saveNote()}
                >
                  {noteSaved ? 'Saved as note' : 'Save transcript as note'}
                </button>
              </>
            )}
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!!history.length && !recording && (
          <div className="recording-history">
            <h3>Saved recordings</h3>
            {history.map((item) => (
              <button
                className="secondary"
                key={item.id}
                disabled={busy}
                onClick={() => {
                  if (
                    audio &&
                    !saved &&
                    !window.confirm(
                      'Discard unsaved audio and open this recording?',
                    )
                  )
                    return;
                  setAudio(null);
                  setSaved(item);
                  setError('');
                  setNoteSaved(false);
                }}
              >
                {item.createdAt
                  ? new Date(item.createdAt).toLocaleString()
                  : 'Recording'}{' '}
                · {item.status}
              </button>
            ))}
          </div>
        )}
        <p className="privacy-note">
          Record only with everyone’s permission. Audio stays in your workspace;
          transcription sends the selected recording to the configured service.
        </p>
      </div>
    </Dialog>
  );
}
