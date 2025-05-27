"use server";

import { NextResponse } from "next/server";
import { OpenAI } from 'openai';
import fs from 'fs';
import fsp from 'fs/promises'; // For rm and other promise-based fs ops
import path from 'path';
import { ElevenLabsClient } from "elevenlabs";
import { spawn } from 'child_process'; // For ffmpeg
import { uploadFileToSupabase } from "@/utils/supabase-utils";
import { v4 as uuidv4 } from 'uuid';

// --- Constants ---
const AUDIO_CHUNK_MAX_LENGTH = 2800; // Max characters per chunk
const TEMP_AUDIO_SUBDIR = "temp-chunks"; // Subdirectory for temporary chunk files
const GENERATED_AUDIO_DIR_NAME = "generated-audio"; // Main directory for final audio
const MAX_CHUNK_GENERATION_ATTEMPTS = 3; // 1 initial try + 2 retries
const RETRY_DELAY_MS = 1500; // Delay between retry attempts

const SHOTSTACK_API_KEY = process.env.SHOTSTACK_API_KEY || 'ovtvkcufDaBDRJnsTLHkMB3eLG6ytwlRoUAPAHPq';

// --- Initialize Clients & Config ---
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const FISH_AUDIO_API_KEY = process.env.FISH_AUDIO_API_KEY || "4239d52824be4f088a406121777bb1ba";
const FISH_AUDIO_MODEL_DEFAULT = process.env.FISH_AUDIO_MODEL || "speech-1.6";

const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
const elevenlabs = elevenLabsApiKey ? new ElevenLabsClient({ apiKey: elevenLabsApiKey }) : null;
if (!elevenlabs && process.env.NODE_ENV === "development") { // Log warning only if key is expected
  console.warn("⚠️ ElevenLabs API key not found. ElevenLabs provider may not be available if selected.");
}

const MINIMAX_GROUP_ID = process.env.MINIMAX_GROUP_ID || "1905235425920819721";
const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY || "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJHcm91cE5hbWUiOiJMRcODTyBDVVJJT1NPIiwiVXNlck5hbWUiOiJMRcODTyBDVVJJT1NPIiwiQWNjb3VudCI6IiIsIlN1YmplY3RJRCI6IjE5MDUyMzU0MjU5MjkyMDgzMjkiLCJQaG9uZSI6IiIsIkdyb3VwSUQiOiIxOTA1MjM1NDI1OTIwODE5NzIxIiwiUGFnZU5hbWUiOiIiLCJNYWlsIjoiMTB0b3Bkb211bmRvQGdtYWlsLmNvbSIsIkNyZWF0ZVRpbWUiOiIyMDI1LTA0LTI5IDA1OjE5OjE3IiwiVG9rZW5UeXBlIjoxLCJpc3MiOiJtaW5pbWF4In0.Xxqk6EK5mA1PbIFHwJIftjLL9fXzIUoZapTbaRy-6LYtL1DuYJht-cVUZHHbWw3jiGFA5HJqhWC6K1CiT5PbTr76P381gme5HKJBhzU_g578sB43AoK4gm7mSWf-mmNcOKeBQF_WhVzmFcWb7YCRbED3Zx0c2p3lunshZOflz_9d-3iEC0199ia6v2ted8jA1NtKc21E7xfJxnwAYEjL-bGIz4b3D_i-MStZsJBxcvtFQ0l77KB1KIUMemBnrOhsEIsE088LOFNfazU0v9-DZTvwjplH8uSojo2P2IHlsdpUYnV0aVUj8ckIBHAStFRkH2Cf9hobMpU1n8QvStDlPA"; // Default/Fallback Minimax Key


// --- Helper Functions ---

/**
 * Ensures a directory exists.
 * @param dirPath The path to the directory.
 */
async function ensureDir(dirPath: string) {
  try {
    await fsp.mkdir(dirPath, { recursive: true });
  } catch (error: any) {
    if (error.code !== 'EEXIST') throw error; // Ignore if directory already exists
  }
}

/**
 * Chunks text into smaller pieces, respecting sentence boundaries where possible.
 * @param text The input text.
 * @param maxLength Maximum length of a chunk.
 * @returns An array of text chunks.
 */
function chunkText(text: string, maxLength: number = AUDIO_CHUNK_MAX_LENGTH): string[] {
  if (!text || text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let currentPosition = 0;

  while (currentPosition < text.length) {
    let chunkEnd = currentPosition + maxLength;
    if (chunkEnd >= text.length) {
      chunks.push(text.substring(currentPosition));
      break;
    }

    let splitPosition = -1;
    // Try to find a sentence end before maxLength
    const sentenceEndChars = /[.?!]\s+|[\n\r]+/g; // Also split by newlines as potential paragraph breaks
    let match;
    let lastMatchPosition = -1;
    
    const searchSubstr = text.substring(currentPosition, chunkEnd);
    while((match = sentenceEndChars.exec(searchSubstr)) !== null) {
        lastMatchPosition = currentPosition + match.index + match[0].length;
    }

    if (lastMatchPosition > currentPosition && lastMatchPosition <= chunkEnd) {
        splitPosition = lastMatchPosition;
    } else {
        // If no sentence end, try to find a space to split
        let spacePosition = text.lastIndexOf(' ', chunkEnd);
        if (spacePosition > currentPosition) {
            splitPosition = spacePosition + 1; // Include the space in the previous chunk or split after it
        } else {
            // Force split at maxLength if no suitable break found
            splitPosition = chunkEnd;
        }
    }
    chunks.push(text.substring(currentPosition, splitPosition).trim());
    currentPosition = splitPosition;
  }
  return chunks.filter(chunk => chunk.length > 0);
}


/**
 * Generates a single audio chunk using the specified TTS provider.
 * @param chunkIndex Index of the current chunk (for logging/filename).
 * @param textChunk The text to synthesize.
 * @param provider The TTS provider ("openai", "minimax", "fish-audio", "elevenlabs").
 * @param providerArgs Provider-specific arguments (voice IDs, models, etc.).
 * @param baseTempDir The base directory for temporary chunk files.
 * @returns Path to the generated audio chunk file.
 */
async function generateSingleAudioChunk(
  chunkIndex: number,
  textChunk: string,
  provider: string,
  providerArgs: any, // Contains voice, model, fishAudioVoiceId, etc.
  baseTempDir: string
): Promise<string> {
  console.log(`🔊 [Chunk ${chunkIndex}] Generating for provider: ${provider}, length: ${textChunk.length}`);
  const { voice, model, fishAudioVoiceId, fishAudioModel, elevenLabsVoiceId, elevenLabsModelId, languageCode } = providerArgs;
  
  const tempFileName = `${provider}-${voice.replace(/\\s+/g, '_')}-chunk${chunkIndex}-${Date.now()}.mp3`;
  const tempFilePath = path.join(baseTempDir, tempFileName);
  
  let audioBuffer: Buffer;

  try {
    switch (provider) {
      case "openai":
        const openaiSelectedVoice = voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | "ash" | "ballad" | "coral" | "sage";
        const openaiTTSModel = "tts-1"; 
        console.log(`🤖 [Chunk ${chunkIndex}] OpenAI: voice=${openaiSelectedVoice}, model=${openaiTTSModel}`);
        const mp3 = await openai.audio.speech.create({
          model: openaiTTSModel,
          voice: openaiSelectedVoice,
          input: textChunk,
        });
        audioBuffer = Buffer.from(await mp3.arrayBuffer());
        break;

      case "minimax":
        console.log(`🤖 [Chunk ${chunkIndex}] MiniMax: voice=${voice}, model=${model}`);
        const minimaxTTSModel = model || "speech-02-hd";
        console.log(`🤖 [Chunk ${chunkIndex}] MiniMax: voice=${voice}, model=${minimaxTTSModel}`);
        const minimaxResponse = await fetch(`https://api.minimaxi.chat/v1/t2a_v2?GroupId=${MINIMAX_GROUP_ID}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MINIMAX_API_KEY}` },
          body: JSON.stringify({
            model: minimaxTTSModel, text: textChunk, stream: false, subtitle_enable: false,
            voice_setting: { voice_id: voice, speed: 1, vol: 1, pitch: 0 },
            audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 }
          })
        });
        if (!minimaxResponse.ok) {
          let errorBody = '';
          try { errorBody = await minimaxResponse.text(); } catch (e) { /* ignore */ }
          throw new Error(`MiniMax API error [Chunk ${chunkIndex}]: ${minimaxResponse.status} ${minimaxResponse.statusText}. Body: ${errorBody}`);
      }
        const minimaxData = await minimaxResponse.json();
        if (!minimaxData.data?.audio) throw new Error(`No audio data from MiniMax [Chunk ${chunkIndex}]. Response: ${JSON.stringify(minimaxData)}`);
        const hexString = minimaxData.data.audio;
        const bytes = new Uint8Array(hexString.length / 2);
        for (let i = 0; i < hexString.length; i += 2) {
          bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
        }
        audioBuffer = Buffer.from(bytes);
        break;

      case "fish-audio":
        if (!fishAudioVoiceId) throw new Error(`Missing fishAudioVoiceId for Fish Audio [Chunk ${chunkIndex}]`);
        const fishModelToUse = fishAudioModel || FISH_AUDIO_MODEL_DEFAULT;
        console.log(`🐠 [Chunk ${chunkIndex}] Fish Audio: voiceId=${fishAudioVoiceId}, model=${fishModelToUse}`);
        const fishResponse = await fetch("https://api.fish.audio/v1/tts", {
          method: "POST",
          headers: { "Authorization": `Bearer ${FISH_AUDIO_API_KEY}`, "Content-Type": "application/json", "Model": fishModelToUse },
          body: JSON.stringify({
            text: textChunk, chunk_length: 200, format: "mp3", mp3_bitrate: 128,
            reference_id: fishAudioVoiceId, normalize: true, latency: "normal",
          })
        });
        if (!fishResponse.ok || !fishResponse.body) {
          let errorBody = '';
          try { errorBody = await fishResponse.text(); } catch (e) { /* ignore */ }
          throw new Error(`Fish Audio API error [Chunk ${chunkIndex}]: ${fishResponse.status} ${fishResponse.statusText}. Body: ${errorBody}`);
        }
        const fishReader = fishResponse.body.getReader();
        const fishChunks: Buffer[] = [];
        while (true) {
          const { done, value } = await fishReader.read();
          if (done) break;
          fishChunks.push(Buffer.from(value)); 
        }
        audioBuffer = Buffer.concat(fishChunks as any);
        break;

      case "elevenlabs":
        if (!elevenlabs) throw new Error("ElevenLabs client not initialized [Chunk ${chunkIndex}]");
        if (!elevenLabsVoiceId) throw new Error(`Missing elevenLabsVoiceId [Chunk ${chunkIndex}]`);
        const elModelId = elevenLabsModelId || "eleven_multilingual_v2";
        console.log(`🧪 [Chunk ${chunkIndex}] ElevenLabs: voiceId=${elevenLabsVoiceId}, modelId=${elModelId}${languageCode && elModelId === "eleven_flash_v2_5" ? `, language=${languageCode}` : ""}`);
        
        // Create the conversion parameters object
        const elConversionParams: any = {
          text: textChunk,
          model_id: elModelId,
          output_format: "mp3_44100_128"
        };
        
        // Only add language_code for eleven_flash_v2_5 model
        if (elModelId === "eleven_flash_v2_5" && languageCode) {
          elConversionParams.language_code = languageCode;
        }
        
        const elAudioStream = await elevenlabs.textToSpeech.convert(elevenLabsVoiceId, elConversionParams);
        const elStreamChunks: Uint8Array[] = [];
        for await (const streamChunk of elAudioStream) { elStreamChunks.push(streamChunk as Uint8Array); }
        const elConcatenatedUint8Array = new Uint8Array(elStreamChunks.reduce((acc, streamChunk) => acc + streamChunk.length, 0));
        let offset = 0;
        for (const streamChunk of elStreamChunks) { elConcatenatedUint8Array.set(streamChunk, offset); offset += streamChunk.length; }
        audioBuffer = Buffer.from(elConcatenatedUint8Array);
        break;
        
      default:
        throw new Error(`Unsupported provider: ${provider} [Chunk ${chunkIndex}]`);
    }

    await fsp.writeFile(tempFilePath, audioBuffer as any); 
    console.log(`💾 [Chunk ${chunkIndex}] Saved to: ${tempFilePath}`);
    return tempFilePath;

  } catch (error: any) {
    let detailedErrorMessage = error.message || 'Unknown error';
    
    // Attempt to extract more details from common error structures
    if (error.response && typeof error.response === 'object') { // e.g., Axios-style errors
        if (error.response.data) {
            detailedErrorMessage += ` | API Response Data: ${JSON.stringify(error.response.data).substring(0, 500)}`;
        }
        if (error.response.status) {
            detailedErrorMessage += ` | API Status: ${error.response.status}`;
        }
    } else if (error.error && typeof error.error === 'object') { // e.g., OpenAI SDK style
        detailedErrorMessage += ` | API Error Details: ${JSON.stringify(error.error).substring(0, 500)}`;
    } else if (error.body && provider === 'minimax' || provider === 'fish-audio') { // For our custom fetch errors where body is included in message
        // Already included in error.message from the throw statement, so no need to add more here unless further parsing is desired.
    }
     // For other generic errors, error.message is primary. Adding stack if available.

    console.error(`❌ Error in generateSingleAudioChunk for provider ${provider} [Chunk ${chunkIndex}]: ${detailedErrorMessage}`, error.stack ? `\nCall Stack: ${error.stack}` : '');
    
    try { if (fs.existsSync(tempFilePath)) await fsp.rm(tempFilePath); } catch (e) { console.warn(`🧹 Failed to cleanup temp file ${tempFilePath} after error:`, e); }
    throw error; 
  }
}


/**
 * Joins multiple MP3 audio chunk files into a single MP3 file using ffmpeg.
 * @param chunkFilePaths Array of paths to the MP3 chunk files.
 * @param finalOutputFileName Desired name for the final output file (e.g., "final-audio.mp3").
 * @param baseOutputDir Base directory for the final output file.
 * @returns Path to the final joined audio file.
 */
async function joinAudioChunks(
  chunkFilePaths: string[],
  finalOutputFileName: string,
  baseOutputDir: string
): Promise<string> {
  if (!chunkFilePaths || chunkFilePaths.length === 0) {
    throw new Error("No audio chunk file paths provided for joining.");
  }
  if (chunkFilePaths.length === 1) {
    // If there's only one chunk, just move/rename it
    const finalPath = path.join(baseOutputDir, finalOutputFileName);
    console.log(`📦 Only one chunk, moving ${chunkFilePaths[0]} to ${finalPath}`);
    try {
      await ensureDir(baseOutputDir);
      await fsp.rename(chunkFilePaths[0], finalPath);
      return finalPath;
    } catch (renameError) {
      console.error(`❌ Error moving single chunk file: ${renameError}`);
      throw renameError;
    }
  }

  console.log(`🎬 Joining ${chunkFilePaths.length} audio chunks into ${finalOutputFileName}...`);
  await ensureDir(baseOutputDir); // Ensure final output directory exists
  const finalOutputPath = path.join(baseOutputDir, finalOutputFileName);
  const listFileName = `ffmpeg-list-${uuidv4()}.txt`;
  // Place list file in the same temp directory as the first chunk
  const tempDirForList = path.dirname(chunkFilePaths[0]); 
  const listFilePath = path.join(tempDirForList, listFileName);

  // Create the file list for ffmpeg's concat demuxer
  // Ensure paths are absolute and properly escaped/formatted for ffmpeg list file
  const fileListContent = chunkFilePaths
    .map(filePath => `file '${path.resolve(filePath).replace(/\\/g, '/')}'`)
    .join('\n');

  try {
    await fsp.writeFile(listFilePath, fileListContent);
    console.log(`📄 Created ffmpeg file list: ${listFilePath}`);
    // Optional: Verify access immediately after writing, useful for debugging permissions
    // await fsp.access(listFilePath, fs.constants.R_OK);
    // console.log(`✅ Verified ffmpeg list file access: ${listFilePath}`);
  } catch (writeError) {
    console.error(`❌ Error writing ffmpeg list file: ${writeError}`);
    throw writeError;
  }

  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      '-f', 'concat',      // Use the concat demuxer
      '-safe', '0',        // Allow relative/absolute paths in list file
      '-i', listFilePath, // Input file list
      // '-c', 'copy',       // !! Using -c copy prevents changing bitrate. Remove this. !!
      '-b:a', '64k',       // Set audio bitrate to 64 kbps (LOWERED)
      '-ar', '44100',     // Optional: Standardize sample rate (e.g., 44.1kHz)
      '-ac', '1',          // Optional: Force mono channel
      '-y',                // Overwrite output file if it exists
      finalOutputPath      // Output file path
    ];

    console.log(`🚀 Running ffmpeg command: ffmpeg ${ffmpegArgs.join(' ')}`);
    const ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

    let ffmpegOutput = '';
    ffmpegProcess.stdout.on('data', (data) => { ffmpegOutput += data.toString(); });
    ffmpegProcess.stderr.on('data', (data) => { ffmpegOutput += data.toString(); });

    ffmpegProcess.on('close', async (code) => {
      console.log(`ffmpeg process exited with code ${code}`);
      // Log only the last few lines of output for brevity if it's long
      const MAX_LOG_LINES = 20;
      const outputLines = ffmpegOutput.split('\n');
      const relevantOutput = outputLines.slice(-MAX_LOG_LINES).join('\n');
      console.log(`ffmpeg output (last ${MAX_LOG_LINES} lines):\n${relevantOutput}`);

      // Cleanup the list file
      try {
        await fsp.rm(listFilePath);
        console.log(`🧹 Cleaned up ffmpeg list file: ${listFilePath}`);
      } catch (cleanupError) {
        console.warn(`⚠️ Could not clean up ffmpeg list file ${listFilePath}:`, cleanupError);
      }

      if (code === 0) {
        console.log(`✅ Audio chunks successfully joined into ${finalOutputPath}`);
        // Cleanup individual chunk files AFTER successful join
        console.log(`🧹 Cleaning up ${chunkFilePaths.length} individual chunk files...`);
        let cleanupFailures = 0;
        for (const chunkPath of chunkFilePaths) {
          try {
            await fsp.rm(chunkPath);
          } catch (chunkCleanupError) {
            cleanupFailures++;
            console.warn(`⚠️ Failed to clean up chunk file ${chunkPath}:`, chunkCleanupError);
          }
        }
        if (cleanupFailures > 0) {
           console.warn(`⚠️ Failed to clean up ${cleanupFailures} chunk files.`);
        }
        resolve(finalOutputPath);
      } else {
        console.error(`❌ ffmpeg failed with code ${code}.`);
        // Attempt cleanup of potentially failed output file
        try { 
            if (fs.existsSync(finalOutputPath)) {
                await fsp.rm(finalOutputPath); 
                console.log(`🧹 Cleaned up potentially incomplete output file: ${finalOutputPath}`);
            } 
        } catch (e) { 
            console.warn(`⚠️ Could not clean up failed output file ${finalOutputPath}:`, e);
        } 
        reject(new Error(`ffmpeg failed to join audio chunks. Code: ${code}`));
      }
    });

    ffmpegProcess.on('error', (err) => {
      console.error('❌ Failed to start ffmpeg process:', err);
      // Attempt cleanup of the list file on spawn error too
      fsp.rm(listFilePath).catch(cleanupError => {
        console.warn(`⚠️ Could not clean up ffmpeg list file ${listFilePath} after spawn error:`, cleanupError);
      });
      // Also try to cleanup output file if spawn fails early
      fsp.rm(finalOutputPath).catch(() => {}); 
      reject(err);
    });
  });
}

/**
 * Generates SRT subtitles from an audio file using Shotstack's ingest API
 * @param audioUrl URL of the audio file to generate subtitles from
 * @returns URL of the generated SRT file
 */
async function generateSubtitlesFromAudio(audioUrl: string): Promise<string> {
  console.log(`🔤 Generating subtitles for audio: ${audioUrl}`);
  
  // Step 1: Submit the request to generate transcription
  const ingestResponse = await fetch("https://api.shotstack.io/ingest/stage/sources", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": SHOTSTACK_API_KEY
    },
    body: JSON.stringify({
      url: audioUrl,
      outputs: {
        transcription: {
          format: "srt"
        }
      }
    })
  });

  if (!ingestResponse.ok) {
    const errorData = await ingestResponse.json();
    console.error("❌ Error submitting transcription request:", errorData);
    throw new Error(`Failed to submit transcription request: ${ingestResponse.status} ${ingestResponse.statusText}`);
  }

  const ingestData = await ingestResponse.json();
  console.log("📝 Transcription job submitted:", ingestData);
  
  if (!ingestData.data || !ingestData.data.id) {
    throw new Error("No job ID received from transcription request");
  }
  
  const jobId = ingestData.data.id;
  console.log(`🆔 Transcription job ID: ${jobId}`);
  
  // Step 2: Poll for completion
  let isComplete = false;
  let subtitlesUrl = null;
  let attempts = 0;
  const maxAttempts = 30; // Maximum 30 attempts (2.5 minutes at 5-second intervals)
  
  console.log("⏳ Waiting for transcription to complete...");
  
  while (!isComplete && attempts < maxAttempts) {
    attempts++;
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds between checks
    
    const statusResponse = await fetch(`https://api.shotstack.io/ingest/stage/sources/${jobId}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "x-api-key": SHOTSTACK_API_KEY
      }
    });
    
    if (!statusResponse.ok) {
      console.error(`❌ Error checking status (attempt ${attempts}):`, await statusResponse.text());
      continue;
    }
    
    const statusData = await statusResponse.json();
    console.log(`🔍 Status check ${attempts}:`, statusData.data.attributes.status);
    
    if (statusData.data.attributes.status === "ready" && 
        statusData.data.attributes.outputs.transcription.status === "ready") {
      isComplete = true;
      subtitlesUrl = statusData.data.attributes.outputs.transcription.url;
      console.log("✅ Transcription complete!");
      console.log(`🔗 Subtitles URL: ${subtitlesUrl}`);
    } else if (statusData.data.attributes.status === "failed" || 
               statusData.data.attributes.outputs.transcription.status === "failed") {
      throw new Error("Transcription job failed");
    }
  }
  
  if (!isComplete) {
    throw new Error(`Transcription not completed after ${maxAttempts} attempts`);
  }
  
  return subtitlesUrl;
}

/**
 * Downloads a subtitles file from URL and uploads it to Supabase
 * @param subtitlesUrl URL of the SRT file to download
 * @param userId User ID for Supabase path
 * @returns URL of the uploaded SRT file in Supabase
 */
async function downloadAndSaveSubtitles(subtitlesUrl: string, userId: string): Promise<string> {
  console.log(`📥 Downloading subtitles from: ${subtitlesUrl}`);
  
  try {
    // Download the subtitles file
    const response = await fetch(subtitlesUrl);
    if (!response.ok) {
      throw new Error(`Failed to download subtitles: ${response.status} ${response.statusText}`);
    }
    
    // Get the content as text
    const srtContent = await response.text();
    const srtBuffer = Buffer.from(srtContent);
    
    // Create a unique filename in Supabase
    const supabaseDestinationPath = `user_${userId}/subtitles/${uuidv4()}.srt`;
    
    // Upload to Supabase
    const uploadedUrl = await uploadFileToSupabase(
      srtBuffer,
      supabaseDestinationPath,
      'text/plain'
    );
    
    if (!uploadedUrl) {
      throw new Error("Failed to upload subtitles file to Supabase Storage");
    }
    
    console.log(`✅ Subtitles saved to Supabase: ${uploadedUrl}`);
    return uploadedUrl;
  } catch (error) {
    console.error(`❌ Error saving subtitles to Supabase:`, error);
    throw error;
  }
}

// --- Main POST Handler ---
export async function POST(request: Request) {
  const requestBody = await request.json();
  const { text, provider, voice, model, fishAudioVoiceId, fishAudioModel, elevenLabsVoiceId, elevenLabsModelId, languageCode, userId = "unknown_user", skipSubtitles = false } = requestBody;

  console.log("📥 Received audio generation request (chunking & retry enabled)");
  console.log(`🔍 Request details: provider=${provider}, voice=${voice}, userId=${userId}, text length=${text?.length || 0}, skipSubtitles=${skipSubtitles}`);
  // Log ElevenLabs specific details if applicable
  if (provider === "elevenlabs") {
    console.log(`🔊 ElevenLabs details: model=${elevenLabsModelId}${languageCode ? `, language=${languageCode}` : ""}`);
  }

  if (!text || !provider || !voice) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const baseTempDirRoot = path.join(process.cwd(), 'temp-audio-processing'); // Use a non-public temp dir
  const tempDirForRequest = path.join(baseTempDirRoot, `req-${uuidv4()}`);

  await ensureDir(tempDirForRequest);

  let finalAudioSupabaseUrl: string | null = null;
  const allGeneratedChunkPathsForCleanup: string[] = [];
  let audioDuration = 0; // Declare audioDuration here

  try {
    const textChunks = chunkText(text);
    console.log(`📝 Text split into ${textChunks.length} chunks.`);

    if (textChunks.length === 0) {
      return NextResponse.json({ error: "No text content to process after chunking." }, { status: 400 });
    }

    const providerSpecificArgs = { voice, model, fishAudioVoiceId, fishAudioModel, elevenLabsVoiceId, elevenLabsModelId, languageCode, provider };
    const successfulChunkPaths: (string | null)[] = new Array(textChunks.length).fill(null);
    let allChunksSucceeded = false;

    for (let attempt = 1; attempt <= MAX_CHUNK_GENERATION_ATTEMPTS; attempt++) {
      console.log(`🔄 Attempt ${attempt}/${MAX_CHUNK_GENERATION_ATTEMPTS} for generating audio chunks.`);
      
      const tasksForThisAttempt: { originalIndex: number; textChunk: string }[] = [];
      for (let i = 0; i < textChunks.length; i++) {
        if (successfulChunkPaths[i] === null) { // Only attempt chunks that haven't succeeded yet
          tasksForThisAttempt.push({ originalIndex: i, textChunk: textChunks[i] });
        }
      }

      if (tasksForThisAttempt.length === 0) {
        allChunksSucceeded = true;
        console.log("✅ All chunks generated successfully in previous attempts.");
        break; // All chunks done
      }

      console.log(`🌀 Generating ${tasksForThisAttempt.length} chunks in attempt ${attempt}...`);
      const chunkGenerationPromises = tasksForThisAttempt.map(task => 
        generateSingleAudioChunk(task.originalIndex, task.textChunk, provider, providerSpecificArgs, tempDirForRequest)
      );

      const results = await Promise.allSettled(chunkGenerationPromises);

      results.forEach((result, promiseIndex) => {
        const task = tasksForThisAttempt[promiseIndex]; // Get the original task for this promise
        if (result.status === 'fulfilled') {
          console.log(`✅ Chunk ${task.originalIndex} (Attempt ${attempt}) succeeded: ${result.value}`);
          successfulChunkPaths[task.originalIndex] = result.value;
          if (!allGeneratedChunkPathsForCleanup.includes(result.value)) {
            allGeneratedChunkPathsForCleanup.push(result.value);
          }
        } else {
          console.error(`❌ Chunk ${task.originalIndex} (Attempt ${attempt}) failed:`, result.reason);
          // The failed chunk's temporary file (if any) is handled by generateSingleAudioChunk's own error handling
        }
      });

      // Check if all chunks are now successful
      if (successfulChunkPaths.every(p => p !== null)) {
        allChunksSucceeded = true;
        console.log("✅ All chunks generated successfully after attempt ${attempt}.");
        break;
      }

      if (attempt < MAX_CHUNK_GENERATION_ATTEMPTS && tasksForThisAttempt.length > 0) {
        console.log(`⏱️ Waiting ${RETRY_DELAY_MS}ms before next attempt...`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }

    const finalGeneratedPaths = successfulChunkPaths.filter(p => p !== null) as string[];

    if (finalGeneratedPaths.length === 0) {
      throw new Error("All audio chunks failed to generate after all attempts.");
    }

    if (finalGeneratedPaths.length < textChunks.length) {
      console.warn(`⚠️ Only ${finalGeneratedPaths.length}/${textChunks.length} chunks generated successfully after all attempts. Proceeding with available chunks.`);
    }
    
    // Path for the final locally joined/moved file (still temporary)
    const localFinalFileName = `${provider}-${voice.replace(/\s+/g, '_ ')}-${uuidv4()}-final.mp3`;
    const localFinalFilePath = path.join(tempDirForRequest, localFinalFileName);

    let fileToUploadPath: string;

    if (finalGeneratedPaths.length > 1) {
       // Join chunks to a temporary final file
      fileToUploadPath = await joinAudioChunks(finalGeneratedPaths, localFinalFileName, tempDirForRequest);
    } else {
      // Move the single chunk to the temporary final file path
      const singleChunkPath = finalGeneratedPaths[0];
      await fsp.rename(singleChunkPath, localFinalFilePath);
      console.log(`🎵 Single chunk moved to temporary final location: ${localFinalFilePath}`);
      fileToUploadPath = localFinalFilePath;
      // Remove from cleanup list as it's handled by upload function's cleanup
       const movedFileIndex = allGeneratedChunkPathsForCleanup.indexOf(singleChunkPath);
       if (movedFileIndex > -1) {
         allGeneratedChunkPathsForCleanup.splice(movedFileIndex, 1);
       }
    }

    // --- Upload to Supabase --- 
    const supabaseDestinationPath = `user_${userId}/audio/${uuidv4()}.mp3`;
    finalAudioSupabaseUrl = await uploadFileToSupabase(fileToUploadPath, supabaseDestinationPath, 'audio/mpeg');

    if (!finalAudioSupabaseUrl) {
        throw new Error("Failed to upload the final audio file to Supabase Storage.");
    }
    
    // local final file (fileToUploadPath) should be automatically cleaned up by uploadFileToSupabase on success

    // TODO: Calculate duration properly if needed, estimation is very rough
    audioDuration = Math.ceil(text.length / 15); 

    // --- Add subtitle generation after successful audio generation ---
    let subtitlesUrl = null;
    let isSrtSaved = false;
    
    if (finalAudioSupabaseUrl && !skipSubtitles) {
      try {
        console.log("🔤 Starting subtitle generation for the generated audio");
        // Generate subtitles using Shotstack ingest API
        const shotstackSubtitlesUrl = await generateSubtitlesFromAudio(finalAudioSupabaseUrl);
        
        // Download and save the subtitles to Supabase
        subtitlesUrl = await downloadAndSaveSubtitles(shotstackSubtitlesUrl, userId);
        isSrtSaved = true;
        console.log(`✅ Subtitle generation complete: ${subtitlesUrl}`);
      } catch (subtitleError: any) {
        console.error("⚠️ Error generating subtitles:", subtitleError.message, subtitleError.stack);
        // Continue with audio generation result even if subtitles fail
        console.log("⚠️ Continuing with audio generation result despite subtitle error");
      }
    } else if (skipSubtitles) {
      console.log("⏭️ Skipping subtitle generation as requested (skipSubtitles=true)");
    }

    console.log(`✅ Audio generated and uploaded successfully.`);
    console.log(`📤 Sending response: audioUrl=${finalAudioSupabaseUrl}, subtitlesUrl=${subtitlesUrl}, estimated duration=${audioDuration}s${skipSubtitles ? ' (subtitles skipped)' : ''}`);
    return NextResponse.json({
      success: true,
      audioUrl: finalAudioSupabaseUrl,
      subtitlesUrl: skipSubtitles ? null : subtitlesUrl,
      subtitlesGenerated: skipSubtitles ? false : isSrtSaved,
      duration: audioDuration,
      provider,
      voice,
    });

  } catch (error: any) {
    console.error("❌ Error generating audio:", error.message, error.stack);
    // Cleanup remaining temp chunks (final file cleanup is handled within uploadFileToSupabase)
    console.log(`🧹 Cleaning up ${allGeneratedChunkPathsForCleanup.length} leftover temporary chunk files due to error...`);
    for (const tempFile of allGeneratedChunkPathsForCleanup) {
        try { 
          if(fs.existsSync(tempFile)) { 
            await fsp.rm(tempFile); 
            console.log(`🚮 Deleted temp file: ${tempFile}`);
          }
        } catch (e) { 
          console.warn(`🧹 Cleanup failed for temp chunk: ${tempFile}`, e); 
        }
    }
    return NextResponse.json(
      { error: `Failed to generate audio: ${error.message}` },
      { status: 500 }
    );
  } finally {
      // Optionally cleanup the request-specific temp directory
      try {
          if (fs.existsSync(tempDirForRequest)) {
              await fsp.rm(tempDirForRequest, { recursive: true, force: true });
              console.log(`🧹 Cleaned up request temp directory: ${tempDirForRequest}`);
          }
      } catch (e) {
          console.warn(`⚠️ Failed to cleanup request temp directory ${tempDirForRequest}:`, e);
      }
  }
} 