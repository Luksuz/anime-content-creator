// FILE LOCATION: /types/index.ts
// PURPOSE: TypeScript type definitions for the application

export interface YouTubeProcessingRequest {
  youtubeUrl: string;
}

export interface VideoAnalysis {
  title: string;
  scripting: string;
  emotional_tone: string;
  structure: string;
}

export interface ContentSuggestions {
  key_topics: string[];
  target_audience: string;
  content_type: string;
  improvement_suggestions: string[];
  hashtags: string[];
}

export interface KeyQuotes {
  quotes: string[];
  reasoning: string[];
}

export interface Summaries {
  short_summary: string;
  medium_summary: string;
  detailed_summary: string;
  bullet_points: string[];
}

export interface AIAnalysis {
  video_script: VideoAnalysis;
  content_suggestions: ContentSuggestions;
  key_quotes: KeyQuotes;
  summaries: Summaries;
  analysis_timestamp: string;
  transcription_length: number;
}

export interface ProcessingResult {
  youtube_url: string;
  audio_url: string;
  transcription: string;
  ai_analysis: AIAnalysis;
  processing_timestamp: string;
}

export interface APIResponse {
  success: boolean;
  data?: ProcessingResult;
  error?: string;
  timestamp?: string;
}

export interface ProcessingStep {
  key: string;
  label: string;
  description: string;
}

export interface SupabaseConfig {
  url: string;
  serviceKey: string;
  bucket: string;
}

export interface ShotstackConfig {
  apiKey: string;
  baseUrl: string;
}

export interface OpenAIConfig {
  apiKey: string;
  model: string;
}

// Utility types for error handling
export interface ProcessingError {
  step: string;
  message: string;
  timestamp: string;
}

export interface ValidationError {
  field: string;
  message: string;
}

// Audio and Video Processing Types
export interface AudioSegment {
  segmentIndex: number;
  audioUrl: string;
  duration: number; // in seconds, extracted using ffprobe
  text: string;
}

export interface SegmentedAudioResult {
  finalAudioUrl: string;
  subtitlesUrl: string;
  audioSegments: AudioSegment[];
  totalDuration: number;
}

export interface CutImage {
  url: string;
  startY: number;
  endY: number;
  height: number;
}

export interface NarrationChunk {
  imageUrl: string;
  imageIndex: number;
  narration: string;
  startY: number;
  endY: number;
  height: number;
}

export interface SegmentTiming {
  imageUrl: string;
  duration: number; // in seconds, from corresponding audio segment
}

export interface ImageSegmentMapping {
  imageIndex: number;
  imageUrl: string;
  audioSegmentIndex: number;
  duration: number; // in seconds from ffprobe
  narrationText: string;
} 