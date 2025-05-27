import { NextResponse } from "next/server";
import { ChatOpenAI } from "@langchain/openai";

interface RegenerateSegmentRequest {
  segmentIndex: number;
  segmentContent: string;
  title: string;
  theme: string;
  additionalPrompt?: string;
  forbiddenWords?: string;
}

export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    const { 
      segmentIndex, 
      segmentContent, 
      title, 
      theme, 
      additionalPrompt, 
      forbiddenWords 
    } = await request.json() as RegenerateSegmentRequest;
    
    console.log(`🔄 API: Regenerating script segment ${segmentIndex + 1} for "${title}"`);
    console.log(`📝 Additional prompt: ${additionalPrompt || "None"}`);
    console.log(`📊 Segment length: ${segmentContent.split(/\s+/).length} words`);
    console.log(`🎨 Theme: ${theme}`);
    

    
    if (forbiddenWords) {
      console.log(`🚫 Forbidden words provided: ${forbiddenWords}`);
    }
    if (segmentIndex === undefined || !segmentContent || !title || !theme) {
      console.error("❌ Rejecting script segment regeneration due to missing required fields");
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log(`🔄 API: Regenerating script segment ${segmentIndex + 1} for "${title}"`);
    console.log(`📝 Additional prompt: ${additionalPrompt || "None"}`);
    console.log(`📊 Segment length: ${segmentContent.split(/\s+/).length} words`);
    
    if (forbiddenWords) {
      console.log(`🚫 Forbidden words provided: ${forbiddenWords}`);
    }

    // Initialize the model
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-4o-mini",
      temperature: 0.85, // Slightly higher temperature for more creative regeneration
    });

    // Build additional instructions based on optional parameters
    let additionalInstructions = "";
    
    if (additionalPrompt && additionalPrompt.trim()) {
      additionalInstructions += `
SPECIFIC REWRITING INSTRUCTIONS:
${additionalPrompt.trim()}
`;
    }
    
    // Add forbidden words if provided
    if (forbiddenWords && forbiddenWords.trim()) {
      const wordsList = forbiddenWords.split(',').map((word: string) => word.trim()).filter(Boolean);
      if (wordsList.length > 0) {
        additionalInstructions += `
FORBIDDEN WORDS:
The following words should be completely avoided in your script: ${wordsList.join(', ')}.
`;
      }
    }

    console.log(`🤖 Invoking LLM for script segment regeneration...`);
    
    // Create a prompt for regenerating this segment
    const prompt = `
You are a professional script writer with expertise in creating engaging, emotionally resonant content.
I need you to rewrite a specific segment of a script. Here's the context:

TITLE: ${title}
THEME: ${theme}
SEGMENT: ${segmentIndex + 1}
${additionalInstructions}

ORIGINAL CONTENT:
"""
${segmentContent}
"""

Please rewrite this segment with these guidelines:
1. Maintain the same general narrative flow and key story elements
2. Improve the pacing, dialogue, and descriptive language
3. Keep the tone and style consistent with the rest of the script
4. Make the content more engaging, vivid, and emotionally impactful
5. Add more sensory details and immersive elements where appropriate
6. If there are any dialogue or narrator lines that seem flat, make them more natural and compelling
7. Maintain approximately the same word count (around 500 words)

If the specific rewriting instructions provide conflicting guidance to these general guidelines, prioritize the specific instructions.

Your response should only include the rewritten segment. Do not include explanations, headers, or any text that isn't part of the actual script.
`;

    // Generate the regenerated segment
    const response = await model.invoke(prompt);
    
    // Parse the response - ensure we get a string
    let regeneratedContent = "";
    
    if (typeof response.content === 'string') {
      regeneratedContent = response.content;
    } else if (Array.isArray(response.content)) {
      regeneratedContent = response.content
        .map(item => {
          if (typeof item === 'string') return item;
          if (typeof item === 'object' && item !== null && 'text' in item && typeof item.text === 'string') return item.text;
          return '';
        })
        .join('\n');
    }
    
    // Clean up the response by removing any potential JSON formatting or code blocks
    regeneratedContent = regeneratedContent
      .replace(/```[a-z]*\n|```/g, '') // Remove code blocks
      .replace(/^\s*\{|\}\s*$/g, '')   // Remove enclosing curly braces if present
      .trim();
    
    // Validate the result
    if (!regeneratedContent || regeneratedContent.trim() === '') {
      console.error(`❌ Failed to generate content for segment ${segmentIndex + 1}`);
      return NextResponse.json(
        { error: "Failed to generate content" },
        { status: 500 }
      );
    }

    // Calculate word count for information
    const wordCount = regeneratedContent.split(/\s+/).filter(Boolean).length;
    const processingTime = (Date.now() - startTime) / 1000;
    
    console.log(`✅ Successfully regenerated segment ${segmentIndex + 1}: ${wordCount} words in ${processingTime.toFixed(2)}s`);

    return NextResponse.json({ 
      regeneratedContent,
      segmentIndex,
      wordCount,
      processingTime
    });
  } catch (error) {
    const processingTime = (Date.now() - startTime) / 1000;
    console.error(`❌ Error regenerating script segment (${processingTime.toFixed(2)}s):`, error);
    return NextResponse.json(
      { error: "An error occurred while regenerating the script segment" },
      { status: 500 }
    );
  }
} 