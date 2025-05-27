import { NextResponse } from "next/server";
import { ElevenLabsClient } from "elevenlabs";

const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
let elevenlabs: ElevenLabsClient | null = null;

if (elevenLabsApiKey) {
  elevenlabs = new ElevenLabsClient({ apiKey: elevenLabsApiKey });
} else {
  console.warn("⚠️ ElevenLabs API key not found. Voice listing will not be available.");
}

export async function GET() {
  if (!elevenlabs) {
    return NextResponse.json(
      { error: "ElevenLabs client not initialized. Check API key." },
      { status: 500 }
    );
  }

  try {
    console.log("🗣️ Fetching ElevenLabs voices list...");
    const voicesResponse = await elevenlabs.voices.getAll();
    
    const simplifiedVoices = voicesResponse.voices.map(voice => ({
      id: voice.voice_id,
      name: voice.name,
      // You can include other properties like category or preview_url if needed
      // category: voice.category,
      // preview_url: voice.preview_url 
    }));

    console.log(`✅ Successfully fetched ${simplifiedVoices.length} voices from ElevenLabs.`);
    return NextResponse.json({ voices: simplifiedVoices });

  } catch (error) {
    console.error("❌ Error fetching ElevenLabs voices:", error);
    return NextResponse.json(
      { error: "Failed to fetch ElevenLabs voices" },
      { status: 500 }
    );
  }
} 