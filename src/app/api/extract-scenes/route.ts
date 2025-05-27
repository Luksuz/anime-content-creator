import { NextRequest, NextResponse } from 'next/server';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ExtractScenesRequestBody {
  script: string;
  numberOfScenes: number;
  userId?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ExtractScenesRequestBody;
    const { script, numberOfScenes, userId = "unknown_user" } = body;

    if (!script || typeof script !== 'string' || script.trim() === '') {
      return NextResponse.json({ error: 'Script is required' }, { status: 400 });
    }

    if (!numberOfScenes || numberOfScenes < 1 || numberOfScenes > 20) {
      return NextResponse.json({ 
        error: 'Number of scenes must be between 1 and 20' 
      }, { status: 400 });
    }

    console.log(`🎬 Extracting ${numberOfScenes} scenes from script for user ${userId}`);

    // Calculate chunk size based on script length and desired number of scenes
    const textLength = script.length;
    const chunkSize = Math.ceil(textLength / numberOfScenes);
    const chunkOverlap = Math.min(Math.floor(chunkSize * 0.1), 200); // 10% overlap, max 200 chars

    console.log(`Text length: ${textLength}, Chunk size: ${chunkSize}, Chunk overlap: ${chunkOverlap}`);

    // Create text splitter with calculated parameters
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ["\n\n", "\n", ". ", " ", ""],
    });

    // Split the text into chunks
    const chunks = await splitter.createDocuments([script]);

    // Limit to the requested number of scenes
    const limitedChunks = chunks.slice(0, numberOfScenes);
    
    console.log(`Created ${limitedChunks.length} chunks from script`);

    // Process each chunk to generate image prompts
    const scenePromises = limitedChunks.map(async (chunk, index) => {
      try {
        const chunkText = chunk.pageContent;
        
        // Generate image prompt for this chunk
        const promptResponse = await openai.chat.completions.create({
          model: "gpt-4.1-mini",
          messages: [
            {
              role: "system",
              content: "You are a visual scene designer converting story text into detailed image prompts."
            },
            {
              role: "user",
              content: `
Convert the following story chunk into a detailed image prompt for AI image generation.
Focus on the visual elements, setting, characters, actions, mood, and lighting.
Your response should ONLY be the prompt text, no explanations or formatting.

Story chunk:
${chunkText}
              `
            }
          ],
          temperature: 0.7,
          max_tokens: 300,
        });

        const promptText = promptResponse.choices[0]?.message.content?.trim() || 
          `A scene depicting: ${chunkText.substring(0, 100)}...`;

        return {
          chunkIndex: index,
          originalText: chunkText,
          imagePrompt: promptText,
          summary: `Scene ${index + 1}`,
        };
      } catch (error: any) {
        console.error(`Error generating prompt for chunk ${index + 1}:`, error);
        
        // Provide fallback data for failed chunk analysis
        return {
          chunkIndex: index,
          originalText: chunk.pageContent,
          imagePrompt: `A scene from the story, section ${index + 1}`,
          summary: `Scene ${index + 1}`,
          error: error.message || 'Unknown error'
        };
      }
    });

    const scenes = await Promise.all(scenePromises);
    
    console.log(`✅ Successfully extracted ${scenes.length} scenes with image prompts`);
    
    return NextResponse.json({ 
      scenes,
      totalScenes: scenes.length
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error in scene extraction:', error);
    return NextResponse.json({ 
      error: error.message || 'Failed to extract scenes from script' 
    }, { status: 500 });
  }
} 