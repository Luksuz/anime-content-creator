"use client";

import { useState, useEffect, useMemo } from "react";
import ScriptGenerator from "./components/script-generator";
import AudioGenerator from "./components/audio-generator";
import ImageGenerator from "./components/image-generator";
import VideoGenerator from "./components/video-generator";
import GoogleDriveComponent from "./components/google-drive-component";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Volume2, Image, Film, Database, Cloud } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { createClient } from '@/utils/supabase/client';
import { CreateVideoRequestBody, CreateVideoResponse } from "@/types/video-generation";
import VideoStatus, { VideoJob } from './components/video-status';
import Navbar from "@/components/navbar";

export interface ScriptSection {
  title: string;
  writingInstructions: string;
  image_generation_prompt: string;
}

// New interface for extracted scenes
export interface ExtractedScene {
  chunkIndex: number;
  originalText: string;
  imagePrompt: string;
  summary: string;
  error?: string;
}

export interface User {
  id: string;
  name: string;
}

import { useAuth } from "@/contexts/AuthContext";

// Audio and Video Processing Types (imported from centralized types)
interface AudioSegment {
  segmentIndex: number;
  audioUrl: string;
  duration: number; // in seconds, extracted using ffprobe
  text: string;
}

interface SegmentedAudioResult {
  finalAudioUrl: string;
  subtitlesUrl: string;
  audioSegments: AudioSegment[];
  totalDuration: number;
}

interface CutImage {
  url: string;
  startY: number;
  endY: number;
  height: number;
}

interface NarrationChunk {
  imageUrl: string;
  imageIndex: number;
  narration: string;
  startY: number;
  endY: number;
  height: number;
}

interface SegmentTiming {
  imageUrl: string;
  duration: number; // in seconds, from corresponding audio segment
}

interface ImageSegmentMapping {
  imageIndex: number;
  imageUrl: string;
  audioSegmentIndex: number;
  duration: number; // in seconds from ffprobe
  narrationText: string;
}

const GeneratorsPage = () => {
  const [activeTab, setActiveTab] = useState("image");
  
  const { user } = useAuth();
  
  const actualUserId = user?.id || "";

  // Script Generator State
  const [sharedScriptSections, setSharedScriptSections] = useState<ScriptSection[]>([]);
  const [sharedFullScriptMarkdown, setSharedFullScriptMarkdown] = useState<string>("");
  const [sharedFullScriptCleaned, setSharedFullScriptCleaned] = useState<string>("");

  // Audio Generator State - Lifted
  const [isGeneratingAudio, setIsGeneratingAudio] = useState<boolean>(false);
  const [generatedAudioUrl, setGeneratedAudioUrl] = useState<string | null>(null);
  const [audioGenerationError, setAudioGenerationError] = useState<string | null>(null);
  const [generatedSubtitlesUrl, setGeneratedSubtitlesUrl] = useState<string | null>(null);
  const [generateSubtitles, setGenerateSubtitles] = useState<boolean>(false);

  // Image Scraping State - New (replacing image generation)
  const [scrapedImages, setScrapedImages] = useState<CutImage[]>([]);
  
  // Narration State - New
  const [generatedNarrations, setGeneratedNarrations] = useState<NarrationChunk[]>([]);
  
  // Segmented Audio State - New
  const [segmentedAudioResult, setSegmentedAudioResult] = useState<SegmentedAudioResult | null>(null);
  
  // Thumbnail State - New
  const [generatedThumbnailUrl, setGeneratedThumbnailUrl] = useState<string | null>(null);

  // Video Generator State - New
  const [isGeneratingVideo, setIsGeneratingVideo] = useState<boolean>(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [videoGenerationError, setVideoGenerationError] = useState<string | null>(null);

  // State for video job statuses
  const [videoJobs, setVideoJobs] = useState<VideoJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState<boolean>(true);

  // Scene Extraction State - New
  const [isExtractingScenes, setIsExtractingScenes] = useState<boolean>(false);
  const [extractedScenes, setExtractedScenes] = useState<ExtractedScene[]>([]);
  const [sceneExtractionError, setSceneExtractionError] = useState<string | null>(null);
  const [numberOfScenesToExtract, setNumberOfScenesToExtract] = useState<number>(5); // Default to 5 scenes

  // Fetch existing jobs on component mount
  useEffect(() => {
    const fetchJobs = async () => {
      if (!actualUserId) return; // Don't fetch if no user selected

      setIsLoadingJobs(true);
      const supabase = createClient();
      
      const { data, error } = await supabase
        .from('video_records_rezu')
        .select('*')
        .eq('user_id', actualUserId) // Filter by actual user ID
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching video jobs:", error);
        setVideoGenerationError(`Failed to load jobs for user: ${error.message}`);
        setVideoJobs([]);
      } else if (data) {
        const fetchedJobs: VideoJob[] = data.map(job => ({
            ...job,
            createdAt: new Date(job.created_at),
            updatedAt: job.updated_at ? new Date(job.updated_at) : undefined,
            videoUrl: job.final_video_url
        }));
        setVideoJobs(fetchedJobs);
        console.log(`Fetched ${fetchedJobs.length} video jobs for user ${actualUserId}`);
        setVideoGenerationError(null); // Clear previous errors
      }
      setIsLoadingJobs(false);
    };

    fetchJobs();
    
    // If on video tab, set up polling for job updates
    const pollingInterval = activeTab === "video" ? 
      setInterval(() => {
        console.log(`⏱️ Polling: Running scheduled video jobs update (every 30s)`);
        fetchJobs();
      }, 30000) : null; // Poll every 30 seconds
    
    if (pollingInterval) {
      console.log(`🔄 Polling: Started polling for video jobs (${activeTab === "video" ? "active" : "inactive"} tab)`);
    } else {
      console.log(`⏹️ Polling: No polling activated (current tab: ${activeTab})`);
    }
    
    return () => {
      if (pollingInterval) {
        console.log(`⏹️ Polling: Stopping video jobs polling interval`);
        clearInterval(pollingInterval);
      }
    };
  }, [actualUserId, activeTab]); // Use actualUserId in dependencies

  const handleScriptSectionsUpdate = (sections: ScriptSection[]) => {
    setSharedScriptSections(sections);
  };

  const handleFullScriptUpdate = (data: { scriptWithMarkdown: string, scriptCleaned: string }) => {
    setSharedFullScriptMarkdown(data.scriptWithMarkdown);
    setSharedFullScriptCleaned(data.scriptCleaned);
  };

  // Handler for segmented audio generation
  const handleSegmentedAudioGenerated = (result: SegmentedAudioResult) => {
    console.log("Segmented audio result received in parent:", result);
    setSegmentedAudioResult(result);
  };

  // Create image-to-audio segment mappings with proper duration information
  const createImageSegmentMappings = useMemo((): ImageSegmentMapping[] => {
    if (!scrapedImages.length || !segmentedAudioResult?.audioSegments.length) {
      return [];
    }

    // Ensure we have the same number of images and audio segments
    const minLength = Math.min(scrapedImages.length, segmentedAudioResult.audioSegments.length);
    
    return scrapedImages.slice(0, minLength).map((image, index) => {
      const audioSegment = segmentedAudioResult.audioSegments[index];
      return {
        imageIndex: index,
        imageUrl: image.url,
        audioSegmentIndex: audioSegment.segmentIndex,
        duration: audioSegment.duration, // Duration from ffprobe
        narrationText: audioSegment.text
      };
    });
  }, [scrapedImages, segmentedAudioResult]);

  // Handler for audio generation
  const handleAudioGenerated = (url: string | null) => {
    console.log("Audio generated:", url);
    setGeneratedAudioUrl(url);
  };

  // Handler to update the lifted subtitles state
  const handleSubtitlesGenerated = (url: string | null) => {
    setGeneratedSubtitlesUrl(url);
  };

  // Handler for subtitles checkbox toggle
  const handleSubtitlesToggle = (enabled: boolean) => {
    setGenerateSubtitles(enabled);
  };

  // Handler for scraped images from image scraping component
  const handleScrapedImagesChange = (images: CutImage[]) => {
    console.log("Scraped images received in parent:", images);
    setScrapedImages(images);
  };

  // Handler for generated narrations from script generator
  const handleNarrationsGenerated = (narrations: NarrationChunk[]) => {
    console.log("Generated narrations received in parent:", narrations);
    setGeneratedNarrations(narrations);
    
    // Combine all narrations into a single script
    const combinedScript = narrations
      .map((chunk, index) => `Scene ${index + 1}: ${chunk.narration}`)
      .join('\n\n');
    
    // Update the script state
    handleFullScriptUpdate({
      scriptWithMarkdown: combinedScript,
      scriptCleaned: combinedScript
    });
  };

  // Handler for thumbnail generation
  const handleThumbnailGenerated = (thumbnailUrl: string) => {
    console.log("Thumbnail generated and ready for video:", thumbnailUrl);
    setGeneratedThumbnailUrl(thumbnailUrl);
    
    // Optionally switch to video tab when a thumbnail is ready
    if (activeTab === "image") {
      setActiveTab("video");
    }
  };

  const handleStartVideoCreation = async (selectedImageUrls: string[]) => {
    if (!actualUserId) { // Check if a user is selected
      setVideoGenerationError("Please select a user before creating a video.");
      return;
    }
    if (!selectedImageUrls || selectedImageUrls.length === 0) {
      setVideoGenerationError("No images selected for video creation.");
      return;
    }
    if (selectedImageUrls.length > 20) {
      setVideoGenerationError("Cannot create video with more than 20 images.");
      return;
    }
    if (!generatedAudioUrl) {
      setVideoGenerationError("Audio has not been generated or is missing.");
      setIsGeneratingVideo(false);
      return;
    }

    setIsGeneratingVideo(true);
    setGeneratedVideoUrl(null);
    setVideoGenerationError(null);
    
    try {
      const requestBody: CreateVideoRequestBody = {
        imageUrls: selectedImageUrls,
        audioUrl: generatedAudioUrl,
        subtitlesUrl: generatedSubtitlesUrl || undefined,
        userId: actualUserId,
        thumbnailUrl: generatedThumbnailUrl || undefined, // Include custom thumbnail if available
      };
      
      console.log(`Creating video with ${selectedImageUrls.length} images, audio, ${generatedSubtitlesUrl ? 'subtitles' : 'no subtitles'}, and ${generatedThumbnailUrl ? 'custom thumbnail' : 'default thumbnail'}.`);
      
      const response = await fetch('/api/create-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody), 
      });

      const data: CreateVideoResponse = await response.json();

      if (!response.ok || data.error) {
        setVideoGenerationError(data.details || data.error || "Failed to start video creation job.");
      } else if (data.video_id) {
        // Fetch jobs immediately to show pending job
        const supabase = createClient();
        const { data: newJobData } = await supabase
          .from('video_records_rezu')
          .select('*')
          .eq('id', data.video_id)
          .single();
          
        if (newJobData) {
          const newJob: VideoJob = {
            ...newJobData,
            id: newJobData.id,
            status: newJobData.status,
            createdAt: new Date(newJobData.created_at),
            updatedAt: newJobData.updated_at ? new Date(newJobData.updated_at) : undefined,
            videoUrl: newJobData.final_video_url,
            errorMessage: newJobData.error_message,
            user_id: newJobData.user_id,
          };
          
          // Add new job to the beginning of the list
          setVideoJobs(prevJobs => [newJob, ...prevJobs]);
        }
        
        setVideoGenerationError(null); // Clear previous errors
      } else {
        setVideoGenerationError("Video creation started but failed to get job ID.");
      }
    } catch (err: any) { 
      setVideoGenerationError(err.message || "An unexpected error occurred during video creation initiation.");
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // New handler for segmented video creation
  const handleStartSegmentedVideoCreation = async (data: { 
    imageUrls: string[], 
    audioUrl: string, 
    subtitlesUrl: string,
    segmentTimings: { imageUrl: string, duration: number }[]
  }) => {
    if (!actualUserId) {
      setVideoGenerationError("Please select a user before creating a video.");
      return;
    }

    // Use the enhanced image segment mappings for better accuracy
    const mappings = createImageSegmentMappings;
    if (mappings.length === 0) {
      setVideoGenerationError("No valid image-to-audio segment mappings found. Please ensure you have both scraped images and generated segmented audio.");
      return;
    }

    setIsGeneratingVideo(true);
    setGeneratedVideoUrl(null);
    setVideoGenerationError(null);
    
    try {
      console.log(`🎬 Starting segmented video creation with ${mappings.length} precisely timed scenes`);
      console.log(`📊 Image-to-Audio Duration Mappings (from ffprobe):`);
      mappings.forEach((mapping, index) => {
        console.log(`   Scene ${index + 1}: ${mapping.duration.toFixed(2)}s → Image ${mapping.imageIndex + 1} (${mapping.imageUrl.split('/').pop()})`);
        console.log(`      Narration: "${mapping.narrationText.substring(0, 60)}..."`);
      });
      console.log(`   Total duration: ${mappings.reduce((sum, m) => sum + m.duration, 0).toFixed(2)}s`);
      
      // Create segment timings from the mappings (with ffprobe-extracted durations)
      const enhancedSegmentTimings: SegmentTiming[] = mappings.map(mapping => ({
        imageUrl: mapping.imageUrl,
        duration: mapping.duration // Duration from ffprobe analysis
      }));

      console.log(`🚀 Sending request to create-segmented-video API...`);

      const response = await fetch('/api/create-segmented-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrls: mappings.map(m => m.imageUrl),
          audioUrl: data.audioUrl,
          subtitlesUrl: data.subtitlesUrl,
          segmentTimings: enhancedSegmentTimings,
          userId: actualUserId,
          thumbnailUrl: generatedThumbnailUrl || undefined,
        }), 
      });

      const responseData = await response.json();

      if (!response.ok || responseData.error) {
        setVideoGenerationError(responseData.details || responseData.error || "Failed to start segmented video creation job.");
      } else if (responseData.video_id) {
        // Fetch jobs immediately to show pending job
        const supabase = createClient();
        const { data: newJobData } = await supabase
          .from('video_records_rezu')
          .select('*')
          .eq('id', responseData.video_id)
          .single();
          
        if (newJobData) {
          const newJob: VideoJob = {
            ...newJobData,
            id: newJobData.id,
            status: newJobData.status,
            createdAt: new Date(newJobData.created_at),
            updatedAt: newJobData.updated_at ? new Date(newJobData.updated_at) : undefined,
            videoUrl: newJobData.final_video_url,
            errorMessage: newJobData.error_message,
            user_id: newJobData.user_id,
          };
          
          // Add new job to the beginning of the list
          setVideoJobs(prevJobs => [newJob, ...prevJobs]);
        }
        
        setVideoGenerationError(null); // Clear previous errors
        console.log(`✅ Segmented video creation started with ${mappings.length} scenes, total duration: ${mappings.reduce((sum, m) => sum + m.duration, 0).toFixed(2)}s`);
      } else {
        setVideoGenerationError("Segmented video creation started but failed to get job ID.");
      }
    } catch (err: any) { 
      setVideoGenerationError(err.message || "An unexpected error occurred during segmented video creation initiation.");
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  // We don't need handleUserChange anymore
  // Just remove it or update it to be a no-op if it's referenced elsewhere
  const handleUserChange = (userId: string) => {
    // No longer needed - do nothing
  };

  // New function to extract scenes from the script
  const handleExtractScenes = async (numScenes: number) => {
    if (!sharedFullScriptCleaned || sharedFullScriptCleaned.trim() === '') {
      setSceneExtractionError('No script available. Please generate a script first.');
      return;
    }

    setIsExtractingScenes(true);
    setSceneExtractionError(null);
    setExtractedScenes([]);

    try {
      const response = await fetch('/api/extract-scenes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script: sharedFullScriptCleaned,
          numberOfScenes: numScenes,
          userId: actualUserId || 'unknown_user'
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to extract scenes');
      }

      const data = await response.json();
      
      if (data.scenes && Array.isArray(data.scenes)) {
        setExtractedScenes(data.scenes);
        console.log(`Successfully extracted ${data.scenes.length} scenes`);
        
        // If we're on the script tab, automatically switch to image tab after extraction
        if (activeTab === "script") {
          setActiveTab("image");
        }
      } else {
        setSceneExtractionError('Received invalid response from scene extraction service');
      }
    } catch (err: any) {
      const errorMsg = err.message || 'An unexpected error occurred during scene extraction';
      console.error('Scene extraction error:', err);
      setSceneExtractionError(errorMsg);
    } finally {
      setIsExtractingScenes(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />

      <div className="container py-6 max-w-7xl flex-1">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">AI Content Generator</h1>
          <p className="text-muted-foreground">
            Create amazing content using AI. Scrape images, generate narration scripts, create audio, and produce videos with ease.
          </p>
        </div>
        
        <Tabs defaultValue="image" onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-5 mb-8">
            <TabsTrigger value="image" className="flex items-center gap-2">
              <Image size={18} />
              <span className="hidden sm:inline">Image Scraping</span>
            </TabsTrigger>
            <TabsTrigger value="script" className="flex items-center gap-2">
              <FileText size={18} />
              <span className="hidden sm:inline">Script</span>
            </TabsTrigger>
            <TabsTrigger value="audio" className="flex items-center gap-2">
              <Volume2 size={18} />
              <span className="hidden sm:inline">Audio</span>
            </TabsTrigger>
            <TabsTrigger value="video" className="flex items-center gap-2">
              <Film size={18} />
              <span className="hidden sm:inline">Video</span>
            </TabsTrigger>
            <TabsTrigger value="gdrive" className="flex items-center gap-2">
              <Database size={18} />
              <span className="hidden sm:inline">Google Drive</span>
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="image" className="mt-0">
            <ImageGenerator 
              onScrapedImagesChange={handleScrapedImagesChange}
            />
          </TabsContent>
          
          <TabsContent value="script" className="mt-0">
            <ScriptGenerator 
              onFullScriptChange={handleFullScriptUpdate}
              currentFullScript={sharedFullScriptMarkdown}
              scrapedImages={scrapedImages}
              onNarrationsGenerated={handleNarrationsGenerated}
              generatedNarrations={generatedNarrations}
              onScrapedImagesChange={handleScrapedImagesChange}
              userId={actualUserId}
            />
          </TabsContent>
          
          <TabsContent value="audio" className="mt-0">
            <AudioGenerator 
              initialText={sharedFullScriptCleaned}
              generatedAudioUrl={generatedAudioUrl}
              isGeneratingAudio={isGeneratingAudio}
              audioGenerationError={audioGenerationError}
              onAudioGenerated={handleAudioGenerated}
              onSubtitlesGenerated={handleSubtitlesGenerated}
              setIsGeneratingAudio={setIsGeneratingAudio}
              setAudioGenerationError={setAudioGenerationError}
              selectedUserId={actualUserId}
              generatedNarrations={generatedNarrations}
              onSegmentedAudioGenerated={handleSegmentedAudioGenerated}
              generateSubtitles={generateSubtitles}
              onSubtitlesToggle={handleSubtitlesToggle}
            />
          </TabsContent>
          
          <TabsContent value="video" className="mt-0">
            <VideoGenerator 
              availableImageSets={scrapedImages.map(img => ({
                originalPrompt: `Scraped image piece (Y: ${Math.round(img.startY)}-${Math.round(img.endY)})`,
                imageUrls: [img.url],
                imageData: []
              }))}
              isGeneratingVideo={isGeneratingVideo}
              generatedVideoUrl={generatedVideoUrl}
              videoGenerationError={videoGenerationError}
              onStartVideoCreation={handleStartVideoCreation}
              thumbnailUrl={generatedThumbnailUrl}
              scrapedImages={scrapedImages}
              segmentedAudioResult={segmentedAudioResult}
              onStartSegmentedVideoCreation={handleStartSegmentedVideoCreation}
            />
          </TabsContent>
          <TabsContent value="gdrive" className="mt-0">
            <Card>
              <CardHeader>
                <div className="flex items-center space-x-2">
                  <Cloud size={24} className="text-blue-500" />
                  <CardTitle>Google Drive</CardTitle>
                </div>
                <CardDescription>Select files or folders from your Google Drive.</CardDescription> 
              </CardHeader>
              <CardContent>
                <GoogleDriveComponent />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <VideoStatus jobs={videoJobs} isLoading={isLoadingJobs} />
        
        {/* Debug panel to show scraped images */}
        {scrapedImages.length > 0 && (
          <div className="mt-8 p-4 border rounded-lg bg-card shadow-sm">
            <h3 className="text-lg font-semibold mb-2">
              Scraped Images Available ({scrapedImages.length})
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              These cut image pieces are available for script generation and video creation.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {scrapedImages.map((image, index) => (
                <div key={index} className="border rounded-lg overflow-hidden">
                  <img
                    src={image.url}
                    alt={`Cut piece ${index + 1}`}
                    className="w-full h-24 object-cover"
                  />
                  <div className="p-2 text-xs">
                    <div>Piece {index + 1}</div>
                    <div className="text-muted-foreground">
                      {Math.round(image.height)}px
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Debug panel to show generated narrations */}
        {generatedNarrations.length > 0 && (
          <div className="mt-8 p-4 border rounded-lg bg-card shadow-sm">
            <h3 className="text-lg font-semibold mb-2">
              Generated Narrations ({generatedNarrations.length})
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              AI-generated narrations for each scraped image piece.
            </p>
            <div className="space-y-4">
              {generatedNarrations.map((narration, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex gap-4">
                    <img
                      src={narration.imageUrl}
                      alt={`Narration ${index + 1}`}
                      className="w-20 h-20 object-cover rounded"
                    />
                    <div className="flex-1">
                      <h4 className="font-medium mb-2">Scene {index + 1}</h4>
                      <p className="text-sm">{narration.narration}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Debug panel to show segmented audio results */}
        {segmentedAudioResult && (
          <div className="mt-8 p-4 border rounded-lg bg-card shadow-sm">
            <h3 className="text-lg font-semibold mb-2">
              Segmented Audio Results
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Final audio with {segmentedAudioResult.audioSegments.length} segments. Total duration: {segmentedAudioResult.totalDuration.toFixed(2)}s
            </p>
            
            {/* Image-to-Audio Segment Mappings */}
            {createImageSegmentMappings.length > 0 && (
              <div className="mb-6 p-3 bg-green-50 border border-green-200 rounded-lg">
                <h4 className="font-medium text-sm mb-3 text-green-800">
                  📊 Image-to-Audio Segment Mappings ({createImageSegmentMappings.length} scenes)
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-48 overflow-y-auto">
                  {createImageSegmentMappings.map((mapping: ImageSegmentMapping, index: number) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-white rounded border">
                      <img 
                        src={mapping.imageUrl} 
                        alt={`Scene ${mapping.imageIndex + 1}`}
                        className="w-12 h-8 object-cover rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">Scene {mapping.imageIndex + 1}</p>
                        <p className="text-xs text-green-600 font-medium">
                          ⏱️ {mapping.duration.toFixed(1)}s (ffprobe)
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          "{mapping.narrationText.substring(0, 30)}..."
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-green-700 mt-2">
                  Total video duration: {createImageSegmentMappings.reduce((sum, m) => sum + m.duration, 0).toFixed(2)}s
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="p-3 border rounded">
                <h4 className="font-medium text-sm mb-2">Final Audio</h4>
                <audio controls src={segmentedAudioResult.finalAudioUrl} className="w-full">
                  Your browser does not support the audio element.
                </audio>
                <p className="text-xs text-muted-foreground mt-1">
                  <a href={segmentedAudioResult.finalAudioUrl} target="_blank" rel="noopener noreferrer" className="underline">
                    Download Final Audio
                  </a>
                </p>
              </div>
              
              {segmentedAudioResult.subtitlesUrl && (
                <div className="p-3 border rounded">
                  <h4 className="font-medium text-sm mb-2">Subtitles</h4>
                  <p className="text-xs text-muted-foreground">
                    <a href={segmentedAudioResult.subtitlesUrl} target="_blank" rel="noopener noreferrer" className="underline">
                      Download Subtitles (.srt)
                    </a>
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GeneratorsPage;