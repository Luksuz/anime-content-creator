import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import fsPromises from 'fs/promises'; // Renamed to avoid conflict
import { createReadStream, createWriteStream } from 'fs'; // For stream operations
import os from 'os';
import path from 'path';
import { uploadFileToSupabase } from "@/utils/supabase-utils";
import { reformatSrtContent } from '@/utils/srt-utils';
import { v4 as uuidv4 } from 'uuid';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

interface GenerateSubtitlesRequestBody {
    audioUrl: string;
    userId?: string;
}

// interface GenerateSubtitlesResponse { // Not explicitly used for return type inference here
//     subtitlesUrl?: string;
//     error?: string;
// }

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { audioUrl, userId = "unknown_user" } = body as GenerateSubtitlesRequestBody;

    if (!audioUrl) {
        return NextResponse.json({ error: 'Audio URL is required' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
        console.error("OpenAI API key is not configured.");
        return NextResponse.json({ error: 'OpenAI API key is not configured.' }, { status: 500 });
    }
    
    const tempDir = path.join(os.tmpdir(), 'audio_downloads_srt');
    await fsPromises.mkdir(tempDir, { recursive: true }); // Use fsPromises
    
    let extension = '.tmp';
    try {
        const urlPath = new URL(audioUrl).pathname;
        const ext = path.extname(urlPath);
        if (ext) extension = ext;
    } catch (e) {
        console.warn('Could not parse audio URL for extension, using .tmp: ' + audioUrl);
    }
    const tempFileName = uuidv4() + extension;
    const tempFilePath = path.join(tempDir, tempFileName);

    try {
        console.log("Downloading audio from: " + audioUrl + " to " + tempFilePath);
        const audioResponse = await fetch(audioUrl);
        if (!audioResponse.ok || !audioResponse.body) {
            throw new Error("Failed to download audio file: " + audioResponse.statusText);
        }
        
        // Stream download to temporary file
        const fileStream = createWriteStream(tempFilePath);
        // Using Readable.fromWeb a node v18 method, ensure compatibility or use alternative for older versions
        // For wider compatibility, manual piping is safer as done below.
        const reader = audioResponse.body.getReader();
        
        await new Promise<void>((resolve, reject) => { // Added void for Promise type
            fileStream.on('open', async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (value) fileStream.write(value);
                    }
                    fileStream.end();
                } catch (streamError) {
                    reject(streamError);
                }
            });
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
        });
        
        console.log("Audio downloaded successfully. Generating subtitles with Whisper...");

        const transcription = await openai.audio.transcriptions.create({
            file: createReadStream(tempFilePath),
            model: "whisper-1",
            response_format: "srt",
        });
        
        // The result from openai.audio.transcriptions.create when response_format is 'srt' 
        // is directly the SRT string, according to OpenAI docs for `srt` format.
        const rawSrt = transcription as unknown as string; 
        
        if (typeof rawSrt !== 'string' || rawSrt.trim() === '') {
            console.error("OpenAI Whisper did not return a valid non-empty SRT string.");
            throw new Error('Failed to generate valid SRT data from OpenAI.');
        }
        
        console.log("Raw SRT generated. Reformatting...");
        const reformattedSrt = reformatSrtContent(rawSrt);
        console.log("SRT reformatted. Uploading to Supabase...");

        const srtFileName = 'subtitles_' + Date.now() + '.srt';
        const destinationPath = 'user_' + userId + '/subtitles/' + srtFileName;
        
        const srtBuffer = Buffer.from(reformattedSrt, 'utf-8');

        const supabaseUrl = await uploadFileToSupabase(srtBuffer, destinationPath, 'text/srt');

        if (!supabaseUrl) {
            throw new Error("Failed to upload reformatted SRT to Supabase.");
        }

        console.log("✅ Subtitles generated and uploaded: " + supabaseUrl);
        return NextResponse.json({ subtitlesUrl: supabaseUrl });

    } catch (error: any) {
        console.error("Error generating subtitles: " + error.message + (error.stack ? " Stack: " + error.stack : ""));
        return NextResponse.json({ error: error.message || "Failed to generate subtitles" }, { status: 500 });
    } finally {
        try {
            await fsPromises.unlink(tempFilePath); // Use fsPromises
            console.log("Cleaned up temporary audio file: " + tempFilePath);
        } catch (cleanupError: any) {
            // ENOENT means file already deleted or never existed, which is fine.
            if (cleanupError.code !== 'ENOENT') {
                 console.warn("Failed to clean up temporary audio file " + tempFilePath + ": " + cleanupError.message);
            }
        }
    }
} 