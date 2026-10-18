'use client';

/**
 * Translated audio for a playing VOD title (@profullstack/live-translate).
 * The video's own audio is tapped in the browser, heard and translated on the
 * server (/api/translate/*) and re-voiced a few seconds behind the picture;
 * the original is turned down, not muted, while the translation plays.
 * Each viewer runs their own pipeline, since every viewer is at their own
 * position in the title. Paid as nixamp.com is: free daily sessions, then
 * passes (./translation-pass.tsx).
 */

import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  AudioCapture,
  Interpreter,
  LiveVoicePlayer,
  type Caption,
  type VoiceChoice,
} from '@profullstack/live-translate/browser';

import { TranslationPassBuy, useTranslationPass } from './translation-pass';

const LANGUAGE_NAMES = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['en'], { type: 'language' })
  : null;
const languageName = (code: string): string => LANGUAGE_NAMES?.of(code) ?? code;
const DUCKED = 0.15;

interface Options { available: boolean; voices: VoiceChoice[]; languages: string[]; error?: string }

export function LiveTranslatePanel({ video }: { video: RefObject<HTMLVideoElement | null> }): React.ReactElement | null {
  const [options, setOptions] = useState<Options | null>(null);
  const [language, setLanguage] = useState('es');
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState('');
  const [caption, setCaption] = useState<Caption | null>(null);
  const [buying, setBuying] = useState(false);
  const pass = useTranslationPass();

  const languageRef = useRef(language);
  const audio = useRef<{ context: AudioContext; source: MediaElementAudioSourceNode; original: GainNode } | null>(null);
  const pipeline = useRef<{ capture: AudioCapture; interpreter: Interpreter; player: LiveVoicePlayer } | null>(null);
  // One voice-grant scope per playback session; grants are 90 s and per scope.
  const scope = useRef('');
  const grant = useRef<{ token: string; expires: number; remaining: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/translate/voices', { cache: 'no-store' })
      .then(async (res) => ({ ok: res.ok, body: (await res.json()) as Options }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        setOptions(ok ? body : { available: false, voices: [], languages: [], error: body.error });
      })
      .catch(() => !cancelled && setOptions({ available: false, voices: [], languages: [] }));
    return () => {
      cancelled = true;
    };
  }, []);

  const stop = useCallback((message = ''): void => {
    const running = pipeline.current;
    pipeline.current = null;
    running?.capture.stop();
    running?.interpreter.reset();
    running?.player.disable();
    if (audio.current) audio.current.original.gain.value = 1;
    setOn(false);
    setCaption(null);
    setStatus(message);
  }, []);

  const start = useCallback(async (): Promise<void> => {
    const element = video.current;
    if (!element || !options?.available) return;
    stop();
    scope.current ||= `vod-${crypto.randomUUID()}`;
    try {
      try {
        await pass.startSession(scope.current);
      } catch (error) {
        setBuying(true);
        throw error;
      }
      if (!audio.current) {
        // A media element can feed only one source node, ever: keep it for the element's life.
        const context = new AudioContext();
        const source = context.createMediaElementSource(element);
        const original = context.createGain();
        source.connect(original).connect(context.destination);
        audio.current = { context, source, original };
      }
      const { context, source, original } = audio.current;
      const player = new LiveVoicePlayer({
        audioContext: () => context,
        playing: () => !element.paused && !element.ended,
        volume: () => (element.muted ? 0 : element.volume),
        active: (active) => {
          original.gain.value = active ? DUCKED : 1;
        },
        status: setStatus,
        failed: () => stop(),
        authorization: async (signal, line) => {
          const held = grant.current;
          if (!held || held.expires < Date.now() + 20_000 || held.remaining < line.text.length) {
            const res = await fetch('/api/translate/grant', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ channel: scope.current }),
              signal,
            });
            const body = (await res.json()) as { token?: string; expires?: number; error?: string };
            if (!res.ok || !body.token || !body.expires) throw new Error(body.error || 'Translated audio is unavailable.');
            grant.current = { token: body.token, expires: body.expires, remaining: 2000 };
          }
          grant.current!.remaining -= line.text.length;
          return { 'x-voice-grant': grant.current!.token };
        },
      });
      const interpreter = new Interpreter({
        // The free-session and billing key travels with every hear and translate call.
        fetcher: (url, init) => {
          const headers = new Headers(init?.headers);
          headers.set('x-translation-session', scope.current);
          return fetch(url, { ...init, headers });
        },
        language: () => languageRef.current,
        speakers: () => true,
        voices: () => options.voices,
        channel: () => scope.current,
        paths: { speakers: '/api/translate/hear', translate: '/api/translate/text' },
        // Lecture-length sentences: wait a little longer before cutting a phrase.
        phrase: { gapMs: 800, pauseMs: 750, maxMs: 5000 },
        status: setStatus,
        failed: (message) => {
          stop(message);
          void pass.refresh();
        },
        lines: (lines) => {
          if (lines.length) setCaption(lines[lines.length - 1]!);
          player.pushBatch(lines.map((line) => ({
            line,
            lag: 0,
            url: '/api/translate/synthesize',
            init: {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                text: line.text,
                language: languageRef.current,
                channel: scope.current,
                speaker: line.speaker,
                voice: interpreter.tracker.speakers.get(line.speaker ?? '')?.voice ?? 'auto',
              }),
            },
          })));
        },
      });
      const capture = new AudioCapture((window) => {
        if (!element.paused) interpreter.push(window);
      });
      pipeline.current = { capture, interpreter, player };
      await player.enable();
      await capture.start(context, source, 2);
      setOn(true);
      setStatus('Listening… translated audio starts a few seconds behind the video.');
    } catch (error) {
      stop(error instanceof Error ? error.message : 'Translated audio could not start.');
    }
  }, [options, pass, stop, video]);

  // A seek or pause makes queued speech wrong for the picture: drop it and listen afresh.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const restart = (): void => {
      const running = pipeline.current;
      if (!running) return;
      running.interpreter.reset();
      running.player.reset();
    };
    element.addEventListener('seeking', restart);
    element.addEventListener('pause', restart);
    return () => {
      element.removeEventListener('seeking', restart);
      element.removeEventListener('pause', restart);
    };
  }, [video]);

  useEffect(() => () => {
    pipeline.current?.capture.stop();
    pipeline.current?.player.disable();
    void audio.current?.context.close();
  }, []);

  if (!options) return null;
  if (!options.available) {
    return options.error ? null : (
      <p className="bg-bg-secondary px-3 py-2 text-xs text-text-tertiary">Translated audio is not set up on this server.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-border bg-bg-secondary px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-text-primary">Translated audio</span>
        <select
          aria-label="Translate to"
          className="rounded-md border border-border bg-background px-2 py-1 text-text-primary"
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            languageRef.current = e.target.value;
            pipeline.current?.interpreter.reset();
            pipeline.current?.player.reset();
          }}
        >
          {options.languages
            .map((code) => ({ code, name: languageName(code) }))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(({ code, name }) => <option key={code} value={code}>{name}</option>)}
        </select>
        <button
          className={on
            ? 'rounded-md bg-bg-hover px-3 py-1 font-medium text-text-primary'
            : 'rounded-md bg-accent-primary px-3 py-1 font-semibold text-white hover:opacity-90'}
          onClick={() => (on ? stop() : void start())}
        >
          {on ? 'Stop' : 'Translate'}
        </button>
        <button className="text-accent-primary hover:underline" onClick={() => setBuying((open) => !open)}>
          {buying ? 'Hide passes' : 'Buy pass'}
        </button>
        {status ? <span className="min-w-0 text-text-tertiary">{status}</span> : null}
      </div>
      {pass.summary ? <p className="text-text-tertiary">{pass.summary}</p> : null}
      {buying || (pass.access && !pass.ready) ? <TranslationPassBuy pass={pass} /> : null}
      {on && caption ? (
        <p className="text-sm text-text-primary">
          {caption.text}
          {caption.original ? <span className="block text-xs text-text-tertiary">{caption.original}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
