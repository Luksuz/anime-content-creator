import { NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredOutputParser } from "langchain/output_parsers";
import { scriptSectionsSchema } from "../../../../zodSchemas/scriptSection";
import { removeMarkdown } from "../../../lib/utils";
import { ScriptSection } from "@/app/types";

export async function POST(request: Request) {
  try {
    const { 
      title, 
      wordCount, 
      theme, 
      additionalPrompt, 
      inspirationalTranscript, 
      forbiddenWords 
    } = await request.json();
    
    if (!title || !wordCount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Initialize the model
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-4o-mini",
      temperature: 0.7,
    });

    // Create a parser based on our Zod schema
    const parser = StructuredOutputParser.fromZodSchema(scriptSectionsSchema);

    // Calculate the number of sections based on word count
    const numSections = Math.max(1, Math.floor(wordCount / 800));

    // Build additions to the prompt based on optional parameters
    let additionalInstructions = "";
    
    // Add transcript as inspiration if provided
    if (inspirationalTranscript && inspirationalTranscript.trim()) {
      additionalInstructions += `
    INSPIRATIONAL TRANSCRIPT:
    Use the following transcript as inspiration for the tone, style, and structure of your script:
    ${inspirationalTranscript.trim()}
    `;
    }
    
    // Add forbidden words if provided
    if (forbiddenWords && forbiddenWords.trim()) {
      const wordsList = forbiddenWords.split(',').map((word: string) => word.trim()).filter(Boolean);
      if (wordsList.length > 0) {
        additionalInstructions += `
    FORBIDDEN WORDS:
    The following words should be completely avoided in your script outline: ${wordsList.join(', ')}.
    `;
      }
    }
    
    // Add any additional custom instructions
    if (additionalPrompt && additionalPrompt.trim()) {
      additionalInstructions += `
    ADDITIONAL INSTRUCTIONS:
    ${additionalPrompt.trim()}
    `;
    }

    // Define batch size for processing
    const BATCH_SIZE = 40;
    const totalBatches = Math.ceil(numSections / BATCH_SIZE);
    let allSections: ScriptSection[] = [];
    
    console.log(`Generating ${numSections} sections in ${totalBatches} batch(es) of max ${BATCH_SIZE} each`);

    // Process sections in batches
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startSection = batchIndex * BATCH_SIZE;
      const endSection = Math.min((batchIndex + 1) * BATCH_SIZE, numSections);
      const batchSize = endSection - startSection;
      
      console.log(`Processing batch ${batchIndex + 1}/${totalBatches}: sections ${startSection + 1} to ${endSection}`);
      
      // Create context from previous sections if this isn't the first batch
      let contextInstructions = "";
      if (batchIndex > 0) {
        // Get the last 3 sections or fewer from the previous batch
        const contextSections = allSections.slice(-3);
        contextInstructions = `
    CONTEXT FROM PREVIOUS SECTIONS:
    Here are the last ${contextSections.length} sections that were already created to maintain continuity:
    ${contextSections.map((section, i) => 
      `Section ${startSection - contextSections.length + i + 1}: "${section.title}"
      Writing Instructions: ${section.writingInstructions.substring(0, 150)}...`
    ).join('\n\n')}

    Ensure that your new sections maintain narrative continuity with these previous sections.
    `;
      }

      // Create the prompt for the model
      const batchPrompt = `
    You are a professional script outline generator. Create a detailed script outline for ${batchSize} sections ${startSection + 1} to ${endSection} of a story with the following details:

    Title: ${title}
    Theme: ${theme || "No specific theme provided"}
    Total Story Word Count: Approximately ${wordCount} words (${numSections} total sections)
    ${additionalInstructions}
    ${contextInstructions}

    I need you to generate ${batchSize} story sections (specifically sections ${startSection + 1} to ${endSection} out of ${numSections} total).
    
    Each section must have:
    1.  A 'title' that captures the essence of that section.
    2.  Detailed 'writingInstructions' (150-250 words for main content sections) that explain what should happen in that section, including plot developments, character interactions, and thematic elements. These instructions are for the narrator.
    3.  An 'image_generation_prompt' (a concise phrase or sentence, around 10-25 words) that describes the key visual elements of the scene for an AI image generator. This prompt should be purely descriptive of the visuals, suitable for direct use in image generation, and must avoid any taboo, sensitive, or controversial topics.

    IMPORTANT GUIDELINES FOR WRITING INSTRUCTIONS:
    1. Do NOT include instructions for the narrator to begin with greetings like "Hi", "Hello", etc.
    2. Do NOT instruct the narrator to state or repeat the title or section names.
    3. Focus on the narrative flow and content rather than introductory elements.
    4. The narrator should begin directly with the story content, not with meta-references to the story itself.
    5. Ensure the story can flow naturally without headers, titles, or section markers.

    IMPORTANT INSTRUCTIONS FOR NARRATOR CALLS TO ACTION (CTAs):
    You MUST incorporate the following CTAs directly into the 'writingInstructions' of the appropriate sections. These CTAs are spoken by the narrator. Ensure these CTAs are integrated naturally within the narrative flow where specified.

    1.  **CTA 1 (After First Hook):** ${startSection <= 1 && endSection >= 2 ? "In the 'writingInstructions' for the FIRST SECTION, immediately after the initial hook (typically 15-20 seconds into the narration), include this EXACT text: \"Before we jump back in, tell us where you're tuning in from, and if this story touches you, make sure you're subscribed—because tomorrow, I've saved something extra special for you!\" This CTA must be included early in the first section, right after capturing the audience's attention." : "You do not need to include this CTA in this batch of sections."}
    
    2.  **CTA 2 (Mid-Script ~10 minutes / ~1500 words):** ${(wordCount >= 1500) && (startSection <= Math.floor(numSections/3) && endSection >= Math.floor(numSections/3)) ? "For scripts long enough to have a 10-minute mark (around 1500 words of story content), embed this CTA into the 'writingInstructions' of a suitable mid-point section: \"Preparing and narrating this story took us a lot of time, so if you are enjoying it, subscribe to our channel, it means a lot to us! Now back to the story.\"" : "You do not need to include this CTA in this batch of sections."}
    
    3.  **CTA 3 (Later-Script ~40 minutes):** ${(wordCount >= 6000) && (startSection <= Math.floor(2*numSections/3) && endSection >= Math.floor(2*numSections/3)) ? "For very long scripts that would reach a 40-minute mark, embed this CTA into the 'writingInstructions' of an appropriate later section: \"Enjoying the video so far? Don't forget to subscribe!\"" : "You do not need to include this CTA in this batch of sections."}
    
    4.  **CTA 4 (End of Script):** ${(endSection == numSections) ? "After the main story narrative is completely finished, the 'writingInstructions' for the very final section (or a new, short concluding section you create) MUST include: \"Up next, you've got two more standout stories right on your screen. If this one hit the mark, you won't want to pass these up. Just click and check them out! And don't forget to subscribe and turn on the notification bell, so you don't miss any upload from us!\"" : "You do not need to include this CTA in this batch of sections."}

    Adherence to CTA placement and inclusion in 'writingInstructions' is critical.
    Make all sections flow logically. Ensure all generated content, including CTAs and image prompts, is safe, respectful, and avoids controversial subjects.

    ${parser.getFormatInstructions()}
    `;

      // Generate the batch of sections
      const response = await model.invoke(batchPrompt);
      
      // Parse the response - ensure we get a string
      let contentString = "";
      
      if (typeof response.content === 'string') {
        contentString = response.content;
      } else if (Array.isArray(response.content)) {
        // Extract text from array of complex message contents
        contentString = response.content
          .map(item => {
            if (typeof item === 'string') return item;
            // Handle text content if it's a text content object
            if (typeof item === 'object' && item !== null && 'text' in item && typeof item.text === 'string') return item.text;
            return '';
          })
          .join('\n');
      }
          
      try {
        const parsedBatchResponse = await parser.parse(contentString);
        
        if (Array.isArray(parsedBatchResponse)) {
          console.log(`✅ Successfully generated ${parsedBatchResponse.length} sections for batch ${batchIndex + 1}`);
          allSections = [...allSections, ...parsedBatchResponse];
        } else {
          console.error(`❌ Parser returned non-array response for batch ${batchIndex + 1}:`, parsedBatchResponse);
          throw new Error("Parsing error: Expected array of sections");
        }
      } catch (parseError) {
        console.error(`❌ Failed to parse response for batch ${batchIndex + 1}:`, parseError);
        console.log("Raw content:", contentString.substring(0, 500) + "...");
        throw parseError;
      }
    }

    console.log(`✅ Successfully generated all ${allSections.length} sections`);
    return NextResponse.json({ sections: allSections });
  } catch (error) {
    console.error("Error generating script outline:", error);
    return NextResponse.json(
      { error: "An error occurred while generating the script outline", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
} 