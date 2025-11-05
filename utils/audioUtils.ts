
import type { Blob } from '@google/genai';

/**
 * Decodes a base64 string into a Uint8Array.
 * @param base64 The base64 encoded string.
 * @returns A Uint8Array containing the decoded binary data.
 */
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes raw PCM audio data into an AudioBuffer for playback.
 * The Gemini TTS API returns raw PCM data, not a standard audio file format.
 * This function converts that raw data into a playable buffer.
 * @param data The raw audio data as a Uint8Array.
 * @param ctx The AudioContext to use for creating the AudioBuffer.
 * @param sampleRate The sample rate of the audio (e.g., 24000 for Gemini TTS).
 * @param numChannels The number of audio channels (typically 1 for mono).
 * @returns A Promise that resolves to an AudioBuffer.
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Normalize the 16-bit PCM data to the -1.0 to 1.0 range.
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Encodes a Uint8Array into a base64 string.
 * @param bytes The Uint8Array to encode.
 * @returns A base64 encoded string.
 */
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Creates a Blob object for the live session from raw audio data.
 * @param data The raw audio data as a Float32Array.
 * @returns A Blob object with base64 encoded PCM data.
 */
export function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

/**
 * Plays a short audio clip from a base64 data URI.
 * This uses the browser's native decoding for standard audio formats.
 * @param ctx The AudioContext to use for playback.
 * @param base64Audio The base64 encoded audio data URI (e.g., 'data:audio/wav;base64,...').
 */
export async function playSfx(ctx: AudioContext, base64Audio: string): Promise<void> {
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
    const response = await fetch(base64Audio);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch (error) {
    console.error('Error playing SFX:', error);
  }
}
