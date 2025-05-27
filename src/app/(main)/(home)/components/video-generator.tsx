"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Film, ImageOff, AlertCircle, Loader2, Video, ArrowDown, CheckCircle, Clock, Volume2 } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { GeneratedImageSet } from "@/types/image-generation";

// Interface for scraped and cut images
interface CutImage {
  url: string;
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

interface VideoGeneratorProps {
  availableImageSets: GeneratedImageSet[];
  isGeneratingVideo: boolean;
  generatedVideoUrl: string | null;
  videoGenerationError: string | null;
  onStartVideoCreation: (selectedImageUrls: string[]) => Promise<void>;
  thumbnailUrl?: string | null;
  // New props for segmented video creation
  scrapedImages?: CutImage[];
  segmentedAudioResult?: SegmentedAudioResult | null;
  onStartSegmentedVideoCreation?: (data: { 
    imageUrls: string[], 
    audioUrl: string, 
    subtitlesUrl: string,
    segmentTimings: { imageUrl: string, duration: number }[]
  }) => Promise<void>;
}

const VideoGenerator: React.FC<VideoGeneratorProps> = ({
  availableImageSets,
  isGeneratingVideo,
  generatedVideoUrl,
  videoGenerationError,
  onStartVideoCreation,
  thumbnailUrl,
  // New props
  scrapedImages = [],
  segmentedAudioResult,
  onStartSegmentedVideoCreation,
}) => {
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState<boolean>(false);
  const [videoCreationMode, setVideoCreationMode] = useState<'traditional' | 'segmented'>('traditional');

  const allImageUrls = useMemo(() => {
    return availableImageSets.flatMap(set => set.imageUrls || []);
  }, [availableImageSets]);

  // Check if segmented video creation is available
  const canCreateSegmentedVideo = useMemo(() => {
    return scrapedImages.length > 0 && 
           segmentedAudioResult && 
           segmentedAudioResult.audioSegments.length > 0 &&
           scrapedImages.length === segmentedAudioResult.audioSegments.length;
  }, [scrapedImages, segmentedAudioResult]);

  // Auto-select segmented mode if available
  useEffect(() => {
    if (canCreateSegmentedVideo) {
      setVideoCreationMode('segmented');
    }
  }, [canCreateSegmentedVideo]);

  const handleImageSelection = (imageUrl: string) => {
    setLocalError(null);
    setSelectedImageUrls(prevSelected => {
      if (prevSelected.includes(imageUrl)) {
        return prevSelected.filter(url => url !== imageUrl);
      } else {
        return [...prevSelected, imageUrl];
      }
    });
  };

  const handleConfirmAndCreateVideo = async () => {
    if (selectedImageUrls.length === 0) {
      setLocalError("Please select at least one image to create a video.");
      return;
    }
    setLocalError(null);
    setShowSuccessMessage(false);
    await onStartVideoCreation(selectedImageUrls);
    setShowSuccessMessage(true);
  };

  const handleCreateSegmentedVideo = async () => {
    if (!canCreateSegmentedVideo || !segmentedAudioResult || !onStartSegmentedVideoCreation) {
      setLocalError("Segmented video creation is not available. Please ensure you have scraped images and generated segmented audio.");
      return;
    }

    setLocalError(null);
    setShowSuccessMessage(false);

    try {
      // Create segment timings array
      const segmentTimings = scrapedImages.map((image, index) => ({
        imageUrl: image.url,
        duration: segmentedAudioResult.audioSegments[index]?.duration || 5 // fallback to 5 seconds
      }));

      await onStartSegmentedVideoCreation({
        imageUrls: scrapedImages.map(img => img.url),
        audioUrl: segmentedAudioResult.finalAudioUrl,
        subtitlesUrl: segmentedAudioResult.subtitlesUrl,
        segmentTimings
      });

      setShowSuccessMessage(true);
    } catch (error: any) {
      setLocalError(error.message || "Failed to create segmented video");
    }
  };

  useEffect(() => {
    setSelectedImageUrls(prevSelected => prevSelected.filter(url => allImageUrls.includes(url)));
  }, [allImageUrls]);

  // Hide success message after 10 seconds
  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessMessage]);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Film size={24} /> Video Generator
          </CardTitle>
          <CardDescription>
            Create videos from your images using traditional selection or synchronized timing with audio segments.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Video Creation Mode Selection */}
          {canCreateSegmentedVideo && (
            <div className="space-y-4">
              <Label className="text-lg font-semibold">Video Creation Mode</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div 
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    videoCreationMode === 'traditional' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/50'
                  }`}
                  onClick={() => setVideoCreationMode('traditional')}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Video size={20} />
                    <h3 className="font-medium">Traditional Video</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Select any images and create a video with fixed timing per image.
                  </p>
                </div>
                
                <div 
                  className={`p-4 border rounded-lg cursor-pointer transition-all ${
                    videoCreationMode === 'segmented' ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/50'
                  }`}
                  onClick={() => setVideoCreationMode('segmented')}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Volume2 size={20} />
                    <h3 className="font-medium">Synchronized Video</h3>
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">Recommended</span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use scraped images with precise audio timing. Each image displays for its narration duration.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Segmented Video Creation Section */}
          {videoCreationMode === 'segmented' && canCreateSegmentedVideo && segmentedAudioResult && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h3 className="font-medium text-green-800">Synchronized Video Ready</h3>
                </div>
                <p className="text-sm text-green-700 mb-3">
                  {scrapedImages.length} images will be synchronized with {segmentedAudioResult.audioSegments.length} audio segments.
                  Total duration: {formatTime(segmentedAudioResult.totalDuration)}
                </p>
                
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-green-800">Timing Preview:</h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-48 overflow-y-auto">
                    {scrapedImages.map((image, index) => (
                      <div key={index} className="flex items-center gap-2 p-2 bg-white rounded border">
                        <img 
                          src={image.url} 
                          alt={`Scene ${index + 1}`}
                          className="w-12 h-8 object-cover rounded"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">Scene {index + 1}</p>
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs text-muted-foreground">
                              {segmentedAudioResult.audioSegments[index]?.duration.toFixed(1) || '5.0'}s (ffprobe)
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleCreateSegmentedVideo}
                disabled={isGeneratingVideo}
                size="lg"
              >
                {isGeneratingVideo ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Synchronized Video...
                  </>
                ) : (
                  <>
                    <Volume2 className="mr-2 h-4 w-4" />
                    Create Synchronized Video ({scrapedImages.length} scenes)
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Traditional Video Creation Section */}
          {videoCreationMode === 'traditional' && (
            <>
              {thumbnailUrl && (
                <div className="space-y-4">
                  <div>
                    <Label className="text-lg font-semibold">Custom Video Thumbnail</Label>
                    <p className="text-sm text-muted-foreground mb-2">
                      This custom thumbnail will be used for your video.
                    </p>
                  </div>
                  <div className="border rounded-md p-2 flex justify-center">
                    <div className="relative w-1/2 aspect-video">
                      <img 
                        src={thumbnailUrl} 
                        alt="Custom Video Thumbnail"
                        className="object-cover w-full h-full rounded-md"
                      />
                      <div className="absolute bottom-2 right-2 bg-green-500 text-white px-2 py-1 rounded-md text-xs font-medium">
                        Thumbnail Ready
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-lg font-semibold">Select Images</Label>
                <p className="text-sm text-muted-foreground mb-4">
                  You have selected {selectedImageUrls.length} {selectedImageUrls.length === 1 ? 'image' : 'images'}.
                  {allImageUrls.length > 0 && (
                    <span className="ml-2">
                      {selectedImageUrls.length < allImageUrls.length && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setSelectedImageUrls([...allImageUrls])}
                          className="mr-2"
                        >
                          Select All
                        </Button>
                      )}
                      {selectedImageUrls.length > 0 && (
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => setSelectedImageUrls([])}
                        >
                          Unselect All
                        </Button>
                      )}
                    </span>
                  )}
                </p>
                {allImageUrls.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg text-muted-foreground">
                    <ImageOff size={48} className="mb-4" />
                    <p className="text-center">No images available to select.</p>
                    <p className="text-center text-sm">Please generate some images in the Image tab first.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 max-h-[600px] overflow-y-auto p-2 border rounded-md">
                    {allImageUrls.map((imageUrl, index) => (
                      <div
                        key={index}
                        onClick={() => handleImageSelection(imageUrl)}
                        className={`relative border-2 rounded-md overflow-hidden cursor-pointer transition-all duration-150 ease-in-out
                                    ${selectedImageUrls.includes(imageUrl) ? 'border-primary ring-2 ring-primary' : 'border-transparent hover:border-muted-foreground/50'}`}
                      >
                        <img
                          src={imageUrl}
                          alt={`Generated image ${index + 1}`}
                          className="aspect-video object-cover w-full h-full"
                        />
                        {selectedImageUrls.includes(imageUrl) && (
                          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor" className="w-4 h-4">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                className="w-full"
                onClick={handleConfirmAndCreateVideo}
                disabled={isGeneratingVideo || selectedImageUrls.length === 0}
              >
                {isGeneratingVideo ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Video...
                  </>
                ) : (
                  "Confirm and Create Video"
                )}
              </Button>
            </>
          )}

          {localError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Selection Error</AlertTitle>
              <AlertDescription>{localError}</AlertDescription>
            </Alert>
          )}

          {videoGenerationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Video Generation Error</AlertTitle>
              <AlertDescription>{videoGenerationError}</AlertDescription>
            </Alert>
          )}

          {showSuccessMessage && !isGeneratingVideo && !videoGenerationError && (
            <Alert variant="default" className="bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <AlertTitle>Video Creation Started</AlertTitle>
              <AlertDescription className="flex flex-col space-y-1">
                <p>Your video is being created. This may take a few minutes.</p>
                <p className="flex items-center text-sm">
                  <ArrowDown className="h-3 w-3 mr-1" /> Check the <span className="font-semibold mx-1">Video Status</span> section below for updates.
                </p>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default VideoGenerator; 