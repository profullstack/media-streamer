/**
 * News TTS (Text-to-Speech) API Route
 *
 * Server-side endpoint that uses ElevenLabs to convert news summaries to audio.
 * Caches generated audio in Redis to avoid repeated API calls for same content.
 * Only available to users with premium/trial/family subscription tiers.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSubscriptionRepository } from '@/lib/subscription';
import { getNewsTTSCache, getAudioUrl } from '@/lib/news/tts-cache';

interface TTSRequest {
  url: string;
  text: string;
}

interface TTSResponse {
  success: boolean;
  audioUrl?: string;
  cached?: boolean;
  error?: string;
}

/**
 * ElevenLabs voice ID for British male voice
 * "Brian" - A British male voice, great for narration
 */
const ELEVENLABS_VOICE_ID = 'nPczCjzI2devNBz1zQrb'; // Brian

/**
 * ElevenLabs model ID
 * eleven_turbo_v2_5 - Fast, high-quality model
 */
const ELEVENLABS_MODEL_ID = 'eleven_turbo_v2_5';

export async function POST(
  request: NextRequest
): Promise<NextResponse<TTSResponse>> {
  console.log('[TTS] Request received');

  try {
    // Check authentication
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check subscription tier
    const subscriptionRepo = getSubscriptionRepository();
    const subscription = await subscriptionRepo.getSubscriptionStatus(user.id);

    if (!subscription || !subscription.is_active) {
      return NextResponse.json(
        { success: false, error: 'Premium subscription required' },
        { status: 403 }
      );
    }

    // Validate ElevenLabs API key
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsApiKey) {
      console.error('[TTS] ELEVENLABS_API_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'TTS service not configured' },
        { status: 500 }
      );
    }

    // Parse request body
    const body = (await request.json()) as TTSRequest;
    const { url, text } = body;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Article URL is required' },
        { status: 400 }
      );
    }

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Text content is required' },
        { status: 400 }
      );
    }

    // Check if audio already exists in Redis cache
    const ttsCache = getNewsTTSCache();
    const hasExisting = await ttsCache.has(url);

    if (hasExisting) {
      console.log('[TTS] Returning cached audio for:', url);
      return NextResponse.json({
        success: true,
        audioUrl: getAudioUrl(url),
        cached: true,
      });
    }

    // Validate text length (ElevenLabs has character limits)
    const maxTextLength = 5000;
    const truncatedText = text.length > maxTextLength
      ? text.substring(0, maxTextLength)
      : text;

    console.log('[TTS] Generating audio for:', url, 'text length:', truncatedText.length);

    // Call ElevenLabs API
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': elevenLabsApiKey,
        },
        body: JSON.stringify({
          text: truncatedText,
          model_id: ELEVENLABS_MODEL_ID,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TTS] ElevenLabs API error:', response.status, errorText);
      return NextResponse.json(
        { success: false, error: `TTS service error: ${response.status}` },
        { status: 503 }
      );
    }

    // Get audio data as buffer
    const audioArrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(audioArrayBuffer);

    console.log('[TTS] Audio generated, size:', audioBuffer.length, 'bytes');

    // Cache the audio in Redis
    const cached = await ttsCache.set(url, audioBuffer);
    if (!cached) {
      console.warn('[TTS] Failed to cache audio in Redis, but continuing...');
    }

    return NextResponse.json({
      success: true,
      audioUrl: getAudioUrl(url),
      cached: false,
    });
  } catch (error) {
    console.error('[TTS] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: `Failed to generate audio: ${errorMessage}` },
      { status: 500 }
    );
  }
}
