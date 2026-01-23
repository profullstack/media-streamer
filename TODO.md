# TODO

## Real-Time Multilingual Subtitles & Spoken Audio Translation

**PRD:** [docs/realtime-translation-prd.md](docs/realtime-translation-prd.md)

### Phase 1: Foundation
- [ ] Set up audio capture pipeline for WebRTC tracks
- [ ] Implement server-side audio ingest service
- [ ] Configure Whisper.cpp for self-hosted STT
- [ ] Create transcript segment data model

### Phase 2: Live Subtitles (English)
- [ ] Implement streaming STT integration
- [ ] Build subtitle renderer component
- [ ] Add speaker attribution to transcripts
- [ ] Implement partial/finalized transcript handling

### Phase 3: Translated Subtitles
- [ ] Integrate translation service (LLM-based)
- [ ] Implement translation caching per segment/language
- [ ] Add viewer language preference selection
- [ ] Display translated subtitles based on preference

### Phase 4: Spoken Audio Translation
- [ ] Set up TTS engine (Coqui/Piper)
- [ ] Implement text-to-speech for translated segments
- [ ] Create WebRTC audio track injection
- [ ] Add viewer audio mode controls (original/translated/both)

### Phase 5: Host Controls & Configuration
- [ ] Implement room-level caption enable/disable
- [ ] Add spoken translation toggle per room
- [ ] Create language restriction settings
- [ ] Add resource usage monitoring/warnings

### Phase 6: Optional Paid Engine Integrations
- [ ] Add Deepgram STT integration (optional)
- [ ] Add OpenAI STT integration (optional)
- [ ] Add ElevenLabs TTS integration (optional)
- [ ] Add DeepL translation integration (optional)

---

## Other TODOs

<!-- Add other project TODOs here -->
