const { z } = require("zod");
const { ChatOpenAI } = require("@langchain/openai");

const model = new ChatOpenAI({
  modelName: "gpt-4.1-mini",
});

async function generateVideoScript(transcription) {
  const ResponseFormatter = z.object({
    title: z.string().describe("The title of the video"),
    scripting: z.string().describe("The scripting details of the video"),
    emotional_tone: z
      .string()
      .describe("The emotional tone conveyed in the video"),
    structure: z.string().describe("The structural elements of the video"),
  });

  // Bind the schema to the model
  const modelWithStructure = model.withStructuredOutput(ResponseFormatter);
  // Invoke the model
  const structuredOutput = await modelWithStructure.invoke(transcription);
  // Get back the object
  console.log(structuredOutput);
  return structuredOutput;
}

// Export the function
module.exports = { generateVideoScript };
