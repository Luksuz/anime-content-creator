"use client";

import React, { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Volume2, Download, Play, Pause, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

// Interface for narration chunks
interface NarrationChunk {
  imageUrl: string;
  imageIndex: number;
  narration: string;
  startY: number;
  endY: number;
  height: number;
}

// Interface for audio segment result
interface AudioSegment {
  segmentIndex: number;
  audioUrl: string;
  duration: number;
  text: string;
}

// Interface for the complete segmented audio result
interface SegmentedAudioResult {
  finalAudioUrl: string;
  subtitlesUrl: string;
  audioSegments: AudioSegment[];
  totalDuration: number;
}

// Define props for AudioGenerator
interface AudioGeneratorProps {
  initialText?: string;
  generatedAudioUrl: string | null;
  isGeneratingAudio: boolean;
  audioGenerationError: string | null;
  onAudioGenerated: (url: string | null) => void;
  onSubtitlesGenerated: (url: string | null) => void;
  setIsGeneratingAudio: (isGenerating: boolean) => void;
  setAudioGenerationError: (error: string | null) => void;
  selectedUserId?: string;
  // New props for segmented audio
  generatedNarrations?: NarrationChunk[];
  onSegmentedAudioGenerated?: (data: SegmentedAudioResult) => void;
  // New prop for subtitles control
  generateSubtitles?: boolean;
  onSubtitlesToggle?: (enabled: boolean) => void;
}

// WellSaid Labs speaker options
const wellSaidSpeakers = [
  { id: 3, name: "Default Speaker" },
  { id: 1, name: "Speaker 1" },
  { id: 2, name: "Speaker 2" },
  { id: 4, name: "Speaker 4" },
  { id: 5, name: "Speaker 5" },
];

// WellSaid Labs speaker options organized by language and style
const wellSaidVoices = {
  english: {
    narration: [
      { id: 3, name: "Alana B.", accent: "United States", characteristics: "Clear, Crisp, Focused, Informative, Strong", models: ["caruso", "legacy"] },
      { id: 4, name: "Ramona J.", accent: "United States", characteristics: "Approachable, Casual, Friendly, Inviting, Youthful", models: ["caruso", "legacy"] },
      { id: 8, name: "Sofia H.", accent: "United States", characteristics: "Authoritative, Informative, Professorial, Smooth, Trustworthy", models: ["caruso", "legacy"] },
      { id: 10, name: "Vanessa N.", accent: "United States", characteristics: "Approachable, Clear, Friendly, Mature, Upbeat", models: ["caruso", "legacy"] },
      { id: 11, name: "Isabel V.", accent: "United States", characteristics: "Calm, Focused, Relaxed, Inviting, Velvety", models: ["caruso", "legacy"] },
      { id: 13, name: "Jeremy G.", accent: "United States", characteristics: "Casual, Familiar, Informative, Trustworthy, Youthful", models: ["caruso", "legacy"] },
      { id: 14, name: "Nicole L.", accent: "United States", characteristics: "Calm, Informative, Mature, Professorial, Warm", models: ["caruso", "legacy"] },
      { id: 15, name: "Paige L.", accent: "United States", characteristics: "Confident, Crisp, Informative, Professorial, Youthful", models: ["caruso", "legacy"] },
      { id: 16, name: "Tobin A.", accent: "United States", characteristics: "Calm, Charismatic, Informative, Laidback, Youthful", models: ["caruso", "legacy"] },
      { id: 18, name: "Tristan F.", accent: "United States", characteristics: "Charismatic, Energetic, Friendly, Lively, Upbeat", models: ["caruso", "legacy"] },
      { id: 19, name: "Patrick K.", accent: "United States", characteristics: "Authoritative, Energetic, Focused, Lively, Inviting", models: ["caruso", "legacy"] },
      { id: 27, name: "Joe F.", accent: "United States", characteristics: "Clear, Confident, Deep, Engaging, Professorial", models: ["caruso", "legacy"] },
      { id: 30, name: "Wade C.", accent: "United States", characteristics: "Confident, Energetic, Friendly, Sincere, Upbeat", models: ["caruso", "legacy"] },
      { id: 31, name: "Ava M.", accent: "United States", characteristics: "Calm, Inviting, Laidback, Smooth, Strong", models: ["caruso", "legacy"] },
      { id: 32, name: "Kai M.", accent: "United States", characteristics: "Crisp, Fast-paced, Informative, Sincere, Youthful", models: ["caruso", "legacy"] },
      { id: 33, name: "Jude D.", accent: "South Africa", characteristics: "Approachable, Calm, Comforting, Friendly, Informative", models: ["caruso", "legacy"] },
      { id: 35, name: "Chase J.", accent: "United States", characteristics: "Approachable, Clear, Crisp, Friendly, Youthful", models: ["caruso", "legacy"] },
      { id: 49, name: "Gia V.", accent: "United States", characteristics: "Clear, Deep, Focused, Informative, Strong", models: ["caruso", "legacy"] },
      { id: 50, name: "Antony A.", accent: "United States", characteristics: "Authoritative, Deep, Engaging, Mature, Trustworthy", models: ["caruso", "legacy"] },
      { id: 158, name: "Benedict M.", accent: "England", characteristics: "Authoritative, Deep, Engaging, Mature, Trustworthy", models: ["legacy"] },
      { id: 159, name: "Frankie P.", accent: "England", characteristics: "Confident, Warm, Authoritative, Professorial", models: ["legacy"] },
      { id: 160, name: "Lara G.", accent: "Australia", characteristics: "Engaging, Calm, Trustworthy, Casual", models: ["legacy"] },
      { id: 161, name: "Robert M.", accent: "Australia", characteristics: "Mature, Informative, Trustworthy", models: ["legacy"] },
      { id: 162, name: "Sonny G.", accent: "Australia", characteristics: "Deep, Gravitas, Confident, Charismatic", models: ["legacy"] },
      { id: 166, name: "Melissa V.", accent: "England", characteristics: "Youthful, Casual, Engaging, Familiar", models: ["legacy"] },
      { id: 169, name: "Jennie V.", accent: "United States", characteristics: "Casual, Approachable, Warm, Friendly, Sincere", models: ["caruso", "legacy"] },
    ],
    promo: [
      { id: 5, name: "Ramona J.", accent: "United States", characteristics: "Approachable, Casual, Friendly, Inviting, Youthful", models: ["caruso", "legacy"] },
      { id: 20, name: "Sofia H.", accent: "United States", characteristics: "Authoritative, Deep, Informative, Resonant, Strong", models: ["caruso", "legacy"] },
      { id: 21, name: "Damian P.", accent: "Canada", characteristics: "Energetic, Friendly, Inviting, Sincere, Trustworthy", models: ["caruso", "legacy"] },
      { id: 22, name: "Jodi P.", accent: "United States", characteristics: "Empathetic, Friendly, Mature, Sincere, Trustworthy", models: ["caruso", "legacy"] },
      { id: 23, name: "Lee M.", accent: "United States", characteristics: "Familiar, Friendly, Inviting, Sincere, Upbeat", models: ["caruso", "legacy"] },
      { id: 24, name: "Selene R.", accent: "United States", characteristics: "Authoritative, Clear, Inviting, Sincere, Warm", models: ["caruso", "legacy"] },
      { id: 26, name: "Wade C.", accent: "United States", characteristics: "Confident, Energetic, Friendly, Sincere, Upbeat", models: ["caruso", "legacy"] },
      { id: 28, name: "Joe F.", accent: "United States", characteristics: "Charismatic, Engaging, Deep, Gravitas, Trustworthy", models: ["caruso", "legacy"] },
      { id: 34, name: "Eric S.", accent: "Ireland", characteristics: "Casual, Energetic, Familiar, Lively, Upbeat", models: ["caruso", "legacy"] },
      { id: 37, name: "Steve B.", accent: "United States", characteristics: "Approachable, Deep, Engaging, Friendly, Trustworthy", models: ["caruso", "legacy"] },
      { id: 38, name: "Bella B.", accent: "United States", characteristics: "Energetic, Lively, Trustworthy, Upbeat, Youthful", models: ["caruso", "legacy"] },
      { id: 39, name: "Tilda C.", accent: "United States", characteristics: "Approachable, Familiar, Inviting, Upbeat, Youthful", models: ["caruso", "legacy"] },
      { id: 40, name: "Charlie Z.", accent: "Canada", characteristics: "Energetic, Familiar, Lively, Trustworthy, Youthful", models: ["caruso", "legacy"] },
      { id: 41, name: "Paul B.", accent: "United States", characteristics: "Authoritative, Deep, Energetic, Friendly, Upbeat", models: ["caruso", "legacy"] },
    ],
    conversational: [
      { id: 42, name: "Sofia H.", accent: "United States", characteristics: "Approachable, Charismatic, Engaging, Resonant, Warm", models: ["caruso", "legacy"] },
      { id: 43, name: "Ava M.", accent: "United States", characteristics: "Calm, Inviting, Laidback, Smooth, Strong", models: ["caruso", "legacy"] },
      { id: 44, name: "Kai M.", accent: "United States", characteristics: "Crisp, Fast-paced, Informative, Sincere, Youthful", models: ["caruso", "legacy"] },
      { id: 45, name: "Nicole L.", accent: "United States", characteristics: "Engaging, Familiar, Inviting, Trustworthy, Upbeat", models: ["caruso", "legacy"] },
      { id: 46, name: "Wade C.", accent: "United States", characteristics: "Approachable, Familiar, Laidback, Resonant, Witty", models: ["caruso", "legacy"] },
      { id: 47, name: "Patrick K.", accent: "United States", characteristics: "Calm, Inviting, Mature, Relaxed, Smooth", models: ["caruso", "legacy"] },
      { id: 48, name: "Vanessa N.", accent: "United States", characteristics: "Approachable, Confident, Familiar, Inviting, Warm", models: ["caruso", "legacy"] },
      { id: 132, name: "Fiona H.", accent: "England", characteristics: "Approachable, Energetic, Inviting, Smooth, Youthful", models: ["caruso", "legacy"] },
      { id: 133, name: "Ramona J.", accent: "United States", characteristics: "Familiar, Inviting, Slow-paced, Smooth, Confident", models: ["caruso", "legacy"] },
      { id: 135, name: "Donna W.", accent: "United States - Appalachia", characteristics: "Clear, Informative, Mature, Relaxed, Slow-paced", models: ["caruso", "legacy"] },
      { id: 136, name: "Terra G.", accent: "United States", characteristics: "Confident, Deep, Trustworthy, Wry, Youthful", models: ["caruso", "legacy"] },
      { id: 137, name: "Ben D.", accent: "South Africa", characteristics: "Casual, Friendly, Inviting, Relaxed, Witty", models: ["legacy"] },
      { id: 138, name: "Jeremy G.", accent: "United States", characteristics: "Clear, Deep, Inviting, Slow-paced, Trustworthy", models: ["caruso", "legacy"] },
      { id: 139, name: "Joe F.", accent: "United States", characteristics: "Confident, Deep, Fast-paced, Focused, Mature", models: ["caruso", "legacy"] },
      { id: 140, name: "Jude D.", accent: "South Africa", characteristics: "Confident, Focused, Informative, Mature, Sincere", models: ["caruso", "legacy"] },
      { id: 170, name: "Tosh M.", accent: "United States", characteristics: "Informative, Focused, Mature, Confident", models: ["caruso", "legacy"] },
    ],
    character: [
      { id: 29, name: "Garry J.", accent: "Canada", characteristics: "Casual, Inviting, Relaxed, Resonant, Wry", models: ["caruso", "legacy"] },
    ]
  },
  hindi: {
    narration: [
      { id: 164, name: "Rohini B.", accent: "Hindi", characteristics: "Warm, Mature, Trustworthy, Authoritative, Informative", models: ["legacy"] },
      { id: 167, name: "Spiti V.", accent: "Hindi", characteristics: "Inviting, Lively, Youthful, Bright", models: ["legacy"] },
      { id: 168, name: "Aakash K.", accent: "Hindi", characteristics: "Warm, Trustworthy, Informative, Deep", models: ["legacy"] },
    ],
    promo: [
      { id: 165, name: "Veer S.", accent: "Hindi", characteristics: "Approachable, Trustworthy, Warm, Engaging", models: ["legacy"] },
    ],
    conversational: [
      { id: 163, name: "Rachin K.", accent: "Hindi", characteristics: "Engaging, Confident, Relaxed", models: ["legacy"] },
    ]
  },
  spanish: {
    narration: [
      { id: 200, name: "Jessica V.", accent: "Mexico", characteristics: "Empathetic, Relaxed, Youthful, Upbeat, Crisp", models: ["legacy"] },
      { id: 201, name: "Jose E.", accent: "Mexico", characteristics: "Informative, Sincere, Authoritative, Trustworthy, Confident", models: ["legacy"] },
      { id: 202, name: "Hannah A.", accent: "Mexico", characteristics: "Energetic, Clear, Friendly, Confident, Upbeat", models: ["legacy"] },
      { id: 203, name: "Jimena S.", accent: "Mexico", characteristics: "Informative, Focused, Crisp, Professorial, Confident", models: ["legacy"] },
    ]
  },
  german: {
    narration: [
      { id: 400, name: "Anja D.", accent: "Germany", characteristics: "Professional, Clear", models: ["legacy"] },
      { id: 402, name: "Luka P.", accent: "Germany", characteristics: "Professional, Clear", models: ["legacy"] },
      { id: 403, name: "Jonas L.", accent: "Germany", characteristics: "Professional, Clear", models: ["legacy"] },
      { id: 405, name: "Eva B.", accent: "Germany", characteristics: "Professional, Clear", models: ["legacy"] },
    ]
  },
  french: {
    narration: [
      { id: 600, name: "Claire B.", accent: "Canada", characteristics: "Calm, Authoritative, Serious", models: ["legacy"] },
      { id: 601, name: "Joel F.", accent: "France", characteristics: "Confident, Upbeat", models: ["legacy"] },
      { id: 602, name: "Juliette W.", accent: "France", characteristics: "Friendly, Approachable", models: ["legacy"] },
      { id: 603, name: "Louis B.", accent: "Canada", characteristics: "Friendly, Charismatic, Cheerful", models: ["legacy"] },
      { id: 604, name: "Marco X.", accent: "France", characteristics: "Mature, Smooth, Deep, Dramatic, Gravelly", models: ["legacy"] },
      { id: 605, name: "Marie D.", accent: "Canada", characteristics: "Youthful, Casual, Deadpan", models: ["legacy"] },
      { id: 606, name: "Rehan X.", accent: "Canada", characteristics: "Youthful, Bright, Energetic, Lively", models: ["legacy"] },
    ]
  }
};

// Available models
const wellSaidModels = [
  { id: "caruso", name: "Caruso (Latest)", description: "Latest high-quality model with improved naturalness" },
  { id: "legacy", name: "Legacy", description: "Original stable model" }
];

// Helper function to get all voices as a flat array for easy selection
const getAllVoices = () => {
  const allVoices: Array<{
    id: number;
    name: string;
    accent: string;
    characteristics: string;
    language: string;
    style: string;
    models: string[];
  }> = [];
  
  Object.entries(wellSaidVoices).forEach(([language, styles]) => {
    Object.entries(styles).forEach(([style, voices]) => {
      voices.forEach(voice => {
        allVoices.push({
          ...voice,
          language: language.charAt(0).toUpperCase() + language.slice(1),
          style: style.charAt(0).toUpperCase() + style.slice(1)
        });
      });
    });
  });
  
  return allVoices.sort((a, b) => a.name.localeCompare(b.name));
};

const AudioGenerator: React.FC<AudioGeneratorProps> = ({
  initialText,
  generatedAudioUrl,
  isGeneratingAudio,
  audioGenerationError,
  onAudioGenerated,
  onSubtitlesGenerated,
  setIsGeneratingAudio,
  setAudioGenerationError,
  selectedUserId,
  generatedNarrations,
  onSegmentedAudioGenerated,
  generateSubtitles,
  onSubtitlesToggle,
}) => {
  const [textToConvert, setTextToConvert] = useState<string>(initialText || "");
  const [selectedSpeaker, setSelectedSpeaker] = useState<number>(3);
  const [selectedModel, setSelectedModel] = useState<string>("caruso");
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioInstanceRef = useRef<HTMLAudioElement | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // New state for chunked audio generation
  const [audioChunks, setAudioChunks] = useState<Array<{
    chunkIndex: number;
    audioUrl: string;
    text: string;
    status: 'pending' | 'generating' | 'completed' | 'error';
    error?: string;
  }>>([]);
  const [generationProgress, setGenerationProgress] = useState<{
    current: number;
    total: number;
    phase: 'chunks' | 'concatenating' | 'transcribing' | 'completed';
  }>({ current: 0, total: 0, phase: 'chunks' });
  const [transcriptionJobId, setTranscriptionJobId] = useState<string | null>(null);

  useEffect(() => {
    if (initialText) {
      setTextToConvert(initialText);
    }
  }, [initialText]);

  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  };

  const handleLoadedMetadata = () => {
    if (audioInstanceRef.current) {
      setAudioDuration(audioInstanceRef.current.duration);
    }
  };

  const handleTimeUpdate = () => {
    if (audioInstanceRef.current) {
      setCurrentTime(audioInstanceRef.current.currentTime);
    }
  };

  // Helper function to split text into chunks
  const splitTextIntoChunks = (text: string, maxChunkSize: number = 500): string[] => {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      if (currentChunk.length + trimmedSentence.length + 1 <= maxChunkSize) {
        currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk + '.');
        }
        currentChunk = trimmedSentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk + '.');
    }

    return chunks.length > 0 ? chunks : [text];
  };

  // Generate individual audio chunk
  const generateAudioChunk = async (text: string, chunkIndex: number): Promise<{
    chunkIndex: number;
    audioUrl: string;
    text: string;
  }> => {
    const response = await fetch("/api/generate-audio-chunk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: text,
        speaker_id: selectedSpeaker,
        model: selectedModel,
        chunkIndex: chunkIndex,
        userId: selectedUserId || 'unknown_user',
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || `Failed to generate audio chunk ${chunkIndex}`);
    }

    return {
      chunkIndex: data.chunkIndex,
      audioUrl: data.audioUrl,
      text: data.text,
    };
  };

  // Concatenate audio chunks and start transcription
  const concatenateAudioChunks = async (chunks: Array<{
    chunkIndex: number;
    audioUrl: string;
    text: string;
  }>): Promise<{
    finalAudioUrl: string;
    transcriptionJobId?: string;
  }> => {
    const response = await fetch("/api/concatenate-audio-chunks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audioChunks: chunks,
        userId: selectedUserId || 'unknown_user',
        generateSubtitles: generateSubtitles,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(data.error || "Failed to concatenate audio chunks");
    }

    return {
      finalAudioUrl: data.finalAudioUrl,
      transcriptionJobId: data.transcriptionJobId,
    };
  };

  // Poll transcription status
  const pollTranscriptionStatus = async (jobId: string): Promise<string | null> => {
    const response = await fetch("/api/poll-transcription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcriptionJobId: jobId,
        userId: selectedUserId || 'unknown_user',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to poll transcription status");
    }

    if (data.status === 'completed') {
      return data.subtitlesUrl;
    } else if (data.status === 'failed') {
      throw new Error(data.error || "Transcription failed");
    }

    return null; // Still processing
  };

  // Generate single audio file using chunked approach
  const handleGenerateAudio = async () => {
    if (!textToConvert.trim()) {
      setAudioGenerationError("Please enter text to convert to audio.");
      return;
    }

    setIsGeneratingAudio(true);
    setAudioGenerationError(null);
    onAudioGenerated(null);
    onSubtitlesGenerated(null);
    setTranscriptionJobId(null);

    try {
      console.log(`🎵 Starting chunked audio generation for text length: ${textToConvert.length}`);

      // Split text into chunks
      const textChunks = splitTextIntoChunks(textToConvert, 500);
      console.log(`📝 Split text into ${textChunks.length} chunks`);

      // Initialize progress and chunks state
      setGenerationProgress({ current: 0, total: textChunks.length, phase: 'chunks' });
      const initialChunks = textChunks.map((text, index) => ({
        chunkIndex: index,
        audioUrl: '',
        text: text,
        status: 'pending' as const,
      }));
      setAudioChunks(initialChunks);

      // Generate audio chunks in parallel (with concurrency limit)
      const concurrencyLimit = 3;
      const completedChunks: Array<{
        chunkIndex: number;
        audioUrl: string;
        text: string;
      }> = [];

      for (let i = 0; i < textChunks.length; i += concurrencyLimit) {
        const batch = textChunks.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(async (text, batchIndex) => {
          const chunkIndex = i + batchIndex;
          
          try {
            // Update chunk status to generating
            setAudioChunks(prev => prev.map(chunk => 
              chunk.chunkIndex === chunkIndex 
                ? { ...chunk, status: 'generating' }
                : chunk
            ));

            console.log(`🎵 Generating chunk ${chunkIndex + 1}/${textChunks.length}: "${text.substring(0, 50)}..."`);
            
            const result = await generateAudioChunk(text, chunkIndex);
            
            // Update chunk status to completed
            setAudioChunks(prev => prev.map(chunk => 
              chunk.chunkIndex === chunkIndex 
                ? { ...chunk, status: 'completed', audioUrl: result.audioUrl }
                : chunk
            ));

            setGenerationProgress(prev => ({ 
              ...prev, 
              current: prev.current + 1 
            }));

            return result;
          } catch (error: any) {
            console.error(`❌ Error generating chunk ${chunkIndex}:`, error);
            
            // Update chunk status to error
            setAudioChunks(prev => prev.map(chunk => 
              chunk.chunkIndex === chunkIndex 
                ? { ...chunk, status: 'error', error: error.message }
                : chunk
            ));

            throw error;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        completedChunks.push(...batchResults);
      }

      console.log(`✅ All ${completedChunks.length} audio chunks generated successfully`);

      // Concatenate audio chunks
      setGenerationProgress({ current: 0, total: 1, phase: 'concatenating' });
      console.log(`🔗 Concatenating ${completedChunks.length} audio chunks...`);

      const concatenationResult = await concatenateAudioChunks(completedChunks);
      
      console.log(`✅ Audio concatenation completed: ${concatenationResult.finalAudioUrl}`);
      onAudioGenerated(concatenationResult.finalAudioUrl);

      // Handle transcription if enabled
      if (generateSubtitles && concatenationResult.transcriptionJobId) {
        setTranscriptionJobId(concatenationResult.transcriptionJobId);
        setGenerationProgress({ current: 0, total: 1, phase: 'transcribing' });
        
        console.log(`🔤 Starting transcription polling for job: ${concatenationResult.transcriptionJobId}`);
        
        // Poll for transcription completion
        const pollInterval = setInterval(async () => {
          try {
            const subtitlesUrl = await pollTranscriptionStatus(concatenationResult.transcriptionJobId!);
            
            if (subtitlesUrl) {
              console.log(`✅ Transcription completed: ${subtitlesUrl}`);
              onSubtitlesGenerated(subtitlesUrl);
              setGenerationProgress({ current: 1, total: 1, phase: 'completed' });
              clearInterval(pollInterval);
            }
          } catch (error: any) {
            console.error(`❌ Transcription polling error:`, error);
            clearInterval(pollInterval);
            // Don't fail the whole process for transcription errors
          }
        }, 5000); // Poll every 5 seconds

        // Set a timeout to stop polling after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          console.warn(`⚠️ Transcription polling timeout after 5 minutes`);
        }, 300000);
      } else {
        setGenerationProgress({ current: 1, total: 1, phase: 'completed' });
      }

    } catch (err: any) {
      const errorMsg = err.message || 'An unexpected error occurred during audio generation';
      console.error('Chunked audio generation error:', err);
      setAudioGenerationError(errorMsg);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  // Generate segmented audio for multiple narrations using chunked approach
  const handleGenerateSegmentedAudio = async () => {
    if (!generatedNarrations || generatedNarrations.length === 0) {
      setAudioGenerationError("No narration segments available for audio generation.");
      return;
    }

    setIsGeneratingAudio(true);
    setAudioGenerationError(null);
    onAudioGenerated(null);
    onSubtitlesGenerated(null);
    setTranscriptionJobId(null);

    try {
      console.log(`🎵 Starting SEGMENTED chunked audio generation for ${generatedNarrations.length} segments`);

      // Initialize progress and chunks state
      setGenerationProgress({ current: 0, total: generatedNarrations.length, phase: 'chunks' });
      const initialChunks = generatedNarrations.map((narration, index) => ({
        chunkIndex: index,
        audioUrl: '',
        text: narration.narration,
        status: 'pending' as const,
      }));
      setAudioChunks(initialChunks);

      // Generate audio chunks for each narration
      const concurrencyLimit = 3;
      const completedChunks: Array<{
        chunkIndex: number;
        audioUrl: string;
        text: string;
      }> = [];

      for (let i = 0; i < generatedNarrations.length; i += concurrencyLimit) {
        const batch = generatedNarrations.slice(i, i + concurrencyLimit);
        const batchPromises = batch.map(async (narration, batchIndex) => {
          const chunkIndex = i + batchIndex;
          
          try {
            // Update chunk status to generating
            setAudioChunks(prev => prev.map(chunk => 
              chunk.chunkIndex === chunkIndex 
                ? { ...chunk, status: 'generating' }
                : chunk
            ));

            console.log(`🎵 Generating segment ${chunkIndex + 1}/${generatedNarrations.length}: "${narration.narration.substring(0, 50)}..."`);
            
            const result = await generateAudioChunk(narration.narration, chunkIndex);
            
            // Update chunk status to completed
            setAudioChunks(prev => prev.map(chunk => 
              chunk.chunkIndex === chunkIndex 
                ? { ...chunk, status: 'completed', audioUrl: result.audioUrl }
                : chunk
            ));

            setGenerationProgress(prev => ({ 
              ...prev, 
              current: prev.current + 1 
            }));

            return result;
          } catch (error: any) {
            console.error(`❌ Error generating segment ${chunkIndex}:`, error);
            
            // Update chunk status to error
            setAudioChunks(prev => prev.map(chunk => 
              chunk.chunkIndex === chunkIndex 
                ? { ...chunk, status: 'error', error: error.message }
                : chunk
            ));

            throw error;
          }
        });

        const batchResults = await Promise.all(batchPromises);
        completedChunks.push(...batchResults);
      }

      console.log(`✅ All ${completedChunks.length} segmented audio chunks generated successfully`);

      // Concatenate audio chunks
      setGenerationProgress({ current: 0, total: 1, phase: 'concatenating' });
      console.log(`🔗 Concatenating ${completedChunks.length} segmented audio chunks...`);

      const concatenationResult = await concatenateAudioChunks(completedChunks);
      
      console.log(`✅ Segmented audio concatenation completed: ${concatenationResult.finalAudioUrl}`);

      // Create segmented audio result
      const segmentedResult: SegmentedAudioResult = {
        finalAudioUrl: concatenationResult.finalAudioUrl,
        subtitlesUrl: '', // Will be set later if transcription completes
        audioSegments: completedChunks.map(chunk => ({
          segmentIndex: chunk.chunkIndex,
          audioUrl: chunk.audioUrl,
          text: chunk.text,
          duration: 0 // Will be calculated later if needed
        })),
        totalDuration: 0 // Will be calculated later if needed
      };

      onAudioGenerated(concatenationResult.finalAudioUrl);
      if (onSegmentedAudioGenerated) {
        onSegmentedAudioGenerated(segmentedResult);
      }

      // Handle transcription if enabled
      if (generateSubtitles && concatenationResult.transcriptionJobId) {
        setTranscriptionJobId(concatenationResult.transcriptionJobId);
        setGenerationProgress({ current: 0, total: 1, phase: 'transcribing' });
        
        console.log(`🔤 Starting transcription polling for segmented audio job: ${concatenationResult.transcriptionJobId}`);
        
        // Poll for transcription completion
        const pollInterval = setInterval(async () => {
          try {
            const subtitlesUrl = await pollTranscriptionStatus(concatenationResult.transcriptionJobId!);
            
            if (subtitlesUrl) {
              console.log(`✅ Segmented audio transcription completed: ${subtitlesUrl}`);
              onSubtitlesGenerated(subtitlesUrl);
              
              // Update the segmented result with subtitles
              const updatedResult = { ...segmentedResult, subtitlesUrl };
              if (onSegmentedAudioGenerated) {
                onSegmentedAudioGenerated(updatedResult);
              }
              
              setGenerationProgress({ current: 1, total: 1, phase: 'completed' });
              clearInterval(pollInterval);
            }
          } catch (error: any) {
            console.error(`❌ Segmented audio transcription polling error:`, error);
            clearInterval(pollInterval);
            // Don't fail the whole process for transcription errors
          }
        }, 5000); // Poll every 5 seconds

        // Set a timeout to stop polling after 5 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          console.warn(`⚠️ Segmented audio transcription polling timeout after 5 minutes`);
        }, 300000);
      } else {
        setGenerationProgress({ current: 1, total: 1, phase: 'completed' });
      }

    } catch (err: any) {
      const errorMsg = err.message || 'An unexpected error occurred during segmented audio generation';
      console.error('Segmented chunked audio generation error:', err);
      setAudioGenerationError(errorMsg);
    } finally {
      setIsGeneratingAudio(false);
    }
  };

  const handlePlayPause = () => {
    if (!audioInstanceRef.current || !generatedAudioUrl) return;

    if (isPlaying) {
      audioInstanceRef.current.pause();
      setIsPlaying(false);
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    } else {
      audioInstanceRef.current.play();
      setIsPlaying(true);
      progressIntervalRef.current = setInterval(() => {
        if (audioInstanceRef.current) {
          setCurrentTime(audioInstanceRef.current.currentTime);
        }
      }, 1000);
    }
  };

  const handleDownloadAudio = () => {
    if (generatedAudioUrl) {
      const link = document.createElement('a');
      link.href = generatedAudioUrl;
      link.download = `wellsaid-audio-${Date.now()}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Generate Audio with WellSaid Labs</CardTitle>
        <CardDescription>
          Convert your script text into high-quality speech using WellSaid Labs AI voices.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="text-to-convert">Text to Convert</Label>
          <Textarea
            id="text-to-convert"
            placeholder="Enter the text you want to convert to audio..."
            value={textToConvert}
            onChange={(e) => setTextToConvert(e.target.value)}
            rows={6}
            disabled={isGeneratingAudio}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="speaker-selection">Voice Speaker</Label>
          <select
            id="speaker-selection"
            value={selectedSpeaker}
            onChange={(e) => setSelectedSpeaker(Number(e.target.value))}
            disabled={isGeneratingAudio}
            className="w-full p-2 border rounded mt-1 bg-background text-foreground"
          >
            {getAllVoices().map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} ({voice.accent}) - {voice.style} - {voice.characteristics.split(', ').slice(0, 3).join(', ')}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="model-selection">Model</Label>
          <select
            id="model-selection"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={isGeneratingAudio}
            className="w-full p-2 border rounded mt-1 bg-background text-foreground"
          >
            {wellSaidModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </div>

        {/* Subtitles Generation Option */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="generate-subtitles"
            checked={generateSubtitles || false}
            onCheckedChange={(checked) => onSubtitlesToggle?.(checked as boolean)}
            disabled={isGeneratingAudio}
          />
          <Label htmlFor="generate-subtitles" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Generate subtitles using Shotstack transcription
          </Label>
        </div>

        {/* Single Audio Generation */}
        <div className="space-y-4">
          <Button 
            className="w-full flex items-center justify-center gap-2" 
            onClick={handleGenerateAudio}
            disabled={isGeneratingAudio || !textToConvert.trim()}
            size="lg"
          >
            {isGeneratingAudio ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Generating Audio...</span>
              </>
            ) : (
              <>
                <Volume2 className="h-5 w-5" />
                <span>Generate Audio</span>
              </>
            )}
          </Button>

          {/* Progress Display */}
          {isGeneratingAudio && generationProgress.total > 0 && (
            <div className="space-y-4 p-4 border rounded-lg bg-blue-50 dark:bg-blue-900/20">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {generationProgress.phase === 'chunks' && `Generating Audio Chunks`}
                    {generationProgress.phase === 'concatenating' && `Concatenating Audio`}
                    {generationProgress.phase === 'transcribing' && `Generating Subtitles`}
                    {generationProgress.phase === 'completed' && `Completed`}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {generationProgress.phase === 'chunks' && `${generationProgress.current}/${generationProgress.total} chunks`}
                    {generationProgress.phase === 'concatenating' && `Processing...`}
                    {generationProgress.phase === 'transcribing' && `Waiting for transcription...`}
                    {generationProgress.phase === 'completed' && `Done`}
                  </span>
                </div>
                
                {generationProgress.phase === 'chunks' && (
                  <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                      style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
                    ></div>
                  </div>
                )}

                {generationProgress.phase === 'transcribing' && transcriptionJobId && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Transcription Job ID: {transcriptionJobId}</span>
                  </div>
                )}
              </div>

              {/* Chunk Status Display */}
              {audioChunks.length > 0 && generationProgress.phase === 'chunks' && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Chunk Status:</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    {audioChunks.map((chunk) => (
                      <div key={chunk.chunkIndex} className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded border text-xs">
                        <div className="flex-shrink-0">
                          {chunk.status === 'pending' && <div className="w-2 h-2 bg-gray-400 rounded-full"></div>}
                          {chunk.status === 'generating' && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                          {chunk.status === 'completed' && <CheckCircle className="w-3 h-3 text-green-500" />}
                          {chunk.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="truncate">Chunk {chunk.chunkIndex + 1}: "{chunk.text.substring(0, 30)}..."</p>
                          {chunk.status === 'error' && chunk.error && (
                            <p className="text-red-500 truncate">{chunk.error}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Segmented Audio Generation */}
        {generatedNarrations && generatedNarrations.length > 0 && (
          <div className="space-y-4 border-t pt-6">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Segmented Audio Generation</h3>
              <p className="text-sm text-muted-foreground">
                Generate audio for {generatedNarrations.length} narration segments with synchronized timing.
              </p>
            </div>
            
            <Button 
              className="w-full flex items-center justify-center gap-2" 
              onClick={handleGenerateSegmentedAudio}
              disabled={isGeneratingAudio}
              variant="outline"
              size="lg"
            >
              {isGeneratingAudio ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Processing {generatedNarrations.length} Segments...</span>
                </>
              ) : (
                <>
                  <Volume2 className="h-5 w-5" />
                  <span>Generate Segmented Audio ({generatedNarrations.length} segments)</span>
                </>
              )}
            </Button>
          </div>
        )}

        {audioGenerationError && (
          <div className="flex items-center gap-2 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md dark:bg-red-900 dark:text-red-300 dark:border-red-700">
            <AlertCircle className="h-4 w-4" />
            <div>
              <p className="font-semibold">Error:</p>
              <p className="text-sm">{audioGenerationError}</p>
            </div>
          </div>
        )}

        {generatedAudioUrl && (
          <div className="space-y-4 p-4 bg-green-50 border border-green-200 rounded-md dark:bg-green-900/20 dark:border-green-800">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="font-semibold text-green-800 dark:text-green-200">Audio Generated Successfully!</span>
            </div>
            
            <div className="flex items-center gap-4">
              <Button
                onClick={handlePlayPause}
                variant="outline"
                size="sm"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              
              <Button
                onClick={handleDownloadAudio}
                variant="outline"
                size="sm"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              
              {audioDuration > 0 && (
                <span className="text-sm text-muted-foreground">
                  {formatTime(currentTime)} / {formatTime(audioDuration)}
                </span>
              )}
            </div>

            <audio
              ref={audioInstanceRef}
              src={generatedAudioUrl}
              onEnded={handleEnded}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              className="hidden"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AudioGenerator; 