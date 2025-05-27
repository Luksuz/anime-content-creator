import { NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";
import { ScriptSection } from "@/app/types";

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const { sectionIndex, currentSection, additionalPrompt, forbiddenWords, title, theme } = await request.json();
    
    if (!currentSection) {
      console.error("❌ Rejecting section regeneration due to missing section data");
      return NextResponse.json(
        { error: "Missing section data" },
        { status: 400 }
      );
    }

    // Check for title and theme
    if (!title || !theme) {
      console.error("❌ Rejecting section regeneration due to missing title or theme");
      return NextResponse.json(
        { error: "Missing title or theme" },
        { status: 400 }
      );
    }

    console.log(`🔄 API: Regenerating script outline section "${currentSection.title}"`);
    console.log(`📝 Additional prompt: ${additionalPrompt || "None"}`);
    console.log(`📄 Title: "${title}", Theme: "${theme}"`);
    console.log(`📊 Writing instructions length: ${currentSection.writingInstructions.split(/\s+/).length} words`);
    
    if (forbiddenWords) {
      console.log(`🚫 Forbidden words provided: ${forbiddenWords}`);
    }

    // Initialize the model
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-4o-mini",
      temperature: 0.85, // Slightly higher temperature for more creative regeneration
    });

    // Build forbidden words instruction if provided
    let forbiddenWordsInstruction = "";
    if (forbiddenWords && forbiddenWords.trim()) {
      const wordsList = forbiddenWords.split(',').map((word: string) => word.trim()).filter(Boolean);
      if (wordsList.length > 0) {
        forbiddenWordsInstruction = `The following words should be avoided in your response: ${wordsList.join(', ')}.`;
      }
    }

    console.log(`🤖 Invoking LLM for script section regeneration...`);

    // Create the prompt for the model
    const prompt = `
    As a professional script outline creator, I need you to regenerate and improve a section of a script outline based on the following details:

    SCRIPT TITLE: ${title}
    SCRIPT THEME: ${theme}

    ORIGINAL SECTION:
    Title: ${currentSection.title}
    Writing Instructions: ${currentSection.writingInstructions}
    Image Generation Prompt: ${currentSection.image_generation_prompt}

    ${additionalPrompt ? `SPECIFIC IMPROVEMENT INSTRUCTIONS: ${additionalPrompt}` : ''}
    ${forbiddenWordsInstruction}

    Please provide an improved version of this section with:
    
    1. A revised 'title' that better captures the essence of this section and makes it more intriguing.
    
    2. Detailed 'writingInstructions' (150-250 words) that explain what should happen in this section. Your improved instructions should:
       - Be more vivid and detailed
       - Include clearer plot developments 
       - Provide more engaging character interactions
       - Add stronger emotional and thematic elements
       - Use more descriptive language
       - Maintain any existing calls to action (CTAs) but integrate them more naturally
    
    3. An updated 'image_generation_prompt' (10-25 words) that creates a more compelling visual representation of the key scene for an AI image generator. This should be purely descriptive and avoid any taboo, sensitive, or controversial topics.

    If the specific improvement instructions request certain changes, prioritize those over these general guidelines.

    Your response should be formatted as a JSON object with the following structure:
    {
      "title": "Improved Section Title",
      "writingInstructions": "Enhanced detailed instructions...",
      "image_generation_prompt": "More vivid visual description for image generation"
    }
    `;

    // Generate the regenerated section
    const response = await model.invoke(prompt);
    
    // Parse the response - ensure we get a string
    let contentString = "";
    
    if (typeof response.content === 'string') {
      contentString = response.content;
    } else if (Array.isArray(response.content)) {
      contentString = response.content
        .map(item => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null && 'text' in item && typeof item.text === 'string') return item.text;
          return '';
        })
        .join('\n');
    }
    
    // Extract JSON from the response
    let parsedSection: ScriptSection;
    try {
      // Look for JSON pattern in the response
      const jsonMatch = contentString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedSection = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback if no JSON pattern found, create a simple object
        console.warn(`⚠️ Could not extract JSON from LLM response for section regeneration`);
        parsedSection = {
          title: currentSection.title,
          writingInstructions: contentString,
          image_generation_prompt: currentSection.image_generation_prompt,
        };
      }
    } catch (error) {
      console.error("❌ Error parsing regenerated section:", error);
      return NextResponse.json(
        { error: "Failed to parse regenerated section" },
        { status: 500 }
      );
    }

    // Validate the section has all required fields
    if (!parsedSection.title || !parsedSection.writingInstructions || !parsedSection.image_generation_prompt) {
      console.error("❌ Generated section is missing required fields");
      return NextResponse.json(
        { error: "Generated section is missing required fields" },
        { status: 500 }
      );
    }

    const processingTime = (Date.now() - startTime) / 1000;
    console.log(`✅ Successfully regenerated section "${parsedSection.title}" in ${processingTime.toFixed(2)}s`);
    console.log(`📊 Writing instructions: ${parsedSection.writingInstructions.substring(0, 50)}...`);
    console.log(`🖼️ Image prompt: ${parsedSection.image_generation_prompt}`);

    return NextResponse.json({ 
      updatedSection: parsedSection,
      processingTime
    });
  } catch (error) {
    const processingTime = (Date.now() - startTime) / 1000;
    console.error(`❌ Error regenerating section (${processingTime.toFixed(2)}s):`, error);
    return NextResponse.json(
      { error: "An error occurred while regenerating the section" },
      { status: 500 }
    );
  }
} 