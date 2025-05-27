export type ImageProvider = "openai" | "minimax";

export interface GenerateImageRequestBody {
  provider: ImageProvider;
  prompt: string;
  numberOfImages?: number; // How many images to generate for this prompt
  outputFormat?: "url" | "b64_json"; // OpenAI supports URL directly
  // Minimax specific params can be added if needed, e.g. aspect_ratio
  minimaxAspectRatio?: "16:9" | "1:1" | "9:16"; // Example, based on rule
  userId?: string; // Added optional user ID
}

export interface GenerateImageResponse {
  imageUrls?: string[];
  imageData?: string[]; // for b64_json
  error?: string;
}

// Added GeneratedImageSet for use in frontend state
export interface GeneratedImageSet {
  originalPrompt: string;
  imageUrls: string[];
  imageData: string[]; 
  error?: string; // Add optional error property
} 