"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useRef, useEffect } from "react";
import { Download, Scissors, Save, Trash2, Link } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";

interface CutImage {
  url: string;
  startY: number;
  endY: number;
  height: number;
}

interface ImageScrapingProps {
  onScrapedImagesChange?: (images: CutImage[]) => void;
}

const ImageScraping: React.FC<ImageScrapingProps> = ({
  onScrapedImagesChange
}) => {
  const { user } = useAuth();
  const actualUserId = user?.id || "unknown_user";

  // Tab 1: URL Input & Screenshot
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Tab 2: Image Cutting
  const [cutPositions, setCutPositions] = useState<number[]>([]);
  const [imageHeight, setImageHeight] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isCutting, setIsCutting] = useState(false);

  // Tab 3: Cut Images Management
  const [cutImages, setCutImages] = useState<CutImage[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [imagesSaved, setImagesSaved] = useState(false);

  // Handle URL screenshot
  const handleTakeScreenshot = async () => {
    if (!url.trim()) {
      setError("Please enter a valid URL");
      return;
    }

    setIsLoading(true);
    setError(null);
    setScreenshotUrl(null);
    setCutPositions([]);
    setCutImages([]);

    try {
      const response = await fetch('/api/image-scraping', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url.trim(),
          userId: actualUserId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to take screenshot');
      }

      setScreenshotUrl(data.screenshotUrl);
      console.log('Screenshot taken:', data.screenshotUrl);
    } catch (err: any) {
      setError(err.message || 'Failed to take screenshot');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle image load to get dimensions
  const handleImageLoad = () => {
    if (imageRef.current) {
      setImageHeight(imageRef.current.naturalHeight);
    }
  };

  // Handle mouse click on image to add cut positions
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const imageDisplayHeight = rect.height;
    const actualY = (clickY / imageDisplayHeight) * imageHeight;

    // Don't add cuts too close to existing ones (minimum 50px apart)
    const tooClose = cutPositions.some(pos => Math.abs(pos - actualY) < 50);
    if (tooClose) return;

    setCutPositions(prev => [...prev, actualY].sort((a, b) => a - b));
  };

  // Remove a cut position
  const removeCutPosition = (index: number) => {
    setCutPositions(prev => prev.filter((_, i) => i !== index));
  };

  // Clear all cut positions
  const clearCutPositions = () => {
    setCutPositions([]);
  };

  // Handle cutting the image
  const handleCutImage = async () => {
    if (!screenshotUrl || cutPositions.length === 0) {
      setError("No screenshot or cut positions available");
      return;
    }

    setIsCutting(true);
    setError(null);
    setImagesSaved(false);

    try {
      const response = await fetch('/api/cut-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: screenshotUrl,
          cutPositions,
          userId: actualUserId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cut image');
      }

      setCutImages(data.cutImages);
      console.log(`Image cut into ${data.totalPieces} pieces`);
    } catch (err: any) {
      setError(err.message || 'Failed to cut image');
    } finally {
      setIsCutting(false);
    }
  };

  // Save cut images (call parent callback)
  const handleSaveImages = () => {
    if (onScrapedImagesChange) {
      onScrapedImagesChange(cutImages);
    }
    setIsSaving(true);
    setImagesSaved(true);
    setTimeout(() => setIsSaving(false), 2000); // Visual feedback
  };

  // Download individual image
  const downloadImage = (url: string, filename: string) => {
    fetch(url)
      .then(response => response.blob())
      .then(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      })
      .catch(err => {
        console.error("Failed to download image:", err);
      });
  };

  // Clear everything
  const handleClearAll = () => {
    setUrl("");
    setScreenshotUrl(null);
    setCutPositions([]);
    setCutImages([]);
    setError(null);
    setImagesSaved(false);
  };

  return (
    <Tabs defaultValue="screenshot" className="space-y-8">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="screenshot">URL & Screenshot</TabsTrigger>
        <TabsTrigger value="cutting" disabled={!screenshotUrl}>
          Image Cutting
        </TabsTrigger>
        <TabsTrigger value="management" disabled={cutImages.length === 0}>
          Cut Images ({cutImages.length})
        </TabsTrigger>
      </TabsList>

      {/* Tab 1: URL Input & Screenshot */}
      <TabsContent value="screenshot">
        <div className="w-full space-y-6 p-6 bg-card rounded-lg border shadow-sm">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Web Screenshot</h2>
            <p className="text-muted-foreground">
              Enter a URL to take a full-page screenshot for image cutting.
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="url-input">Website URL</Label>
              <div className="flex gap-2">
                <Input
                  id="url-input"
                  type="url"
                  placeholder="https://example.com/manga-page"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isLoading}
                  className="flex-grow"
                />
                <Button
                  onClick={handleTakeScreenshot}
                  disabled={isLoading || !url.trim()}
                  className="flex items-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Taking Screenshot...</span>
                    </>
                  ) : (
                    <>
                      <Link className="h-4 w-4" />
                      <span>Take Screenshot</span>
                    </>
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                This will take a full-page screenshot of the provided URL. Perfect for manga, webtoons, or long-form content.
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md dark:bg-red-900 dark:text-red-300 dark:border-red-700">
                <p className="font-semibold">Error:</p>
                <p className="text-sm">{error}</p>
              </div>
            )}

            {screenshotUrl && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Screenshot Taken</h3>
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => downloadImage(screenshotUrl, 'screenshot.png')}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={handleClearAll}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear All
                    </Button>
                  </div>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <img
                    src={screenshotUrl}
                    alt="Website Screenshot"
                    className="w-full max-h-96 object-contain"
                  />
                </div>
                
                <div className="p-4 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 mr-2 text-green-600 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-medium">Screenshot successfully captured!</p>
                      <p className="mt-1">Go to the "Image Cutting" tab to select where to cut this image.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isLoading && !screenshotUrl && (
              <div className="h-64 flex flex-col items-center justify-center border rounded-lg bg-muted/50 text-center p-4">
                <div className="relative w-16 h-16">
                  <div className="absolute animate-ping w-full h-full rounded-full bg-primary/30"></div>
                  <div className="relative flex items-center justify-center w-full h-full rounded-full bg-primary/50">
                    <Link size={24} className="text-white" />
                  </div>
                </div>
                <p className="text-muted-foreground mt-4">Taking screenshot...</p>
                <p className="text-xs text-muted-foreground mt-2">This may take 30-60 seconds for complex pages</p>
              </div>
            )}
          </div>
        </div>
      </TabsContent>

      {/* Tab 2: Image Cutting */}
      <TabsContent value="cutting">
        <div className="w-full space-y-6 p-6 bg-card rounded-lg border shadow-sm">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Image Cutting</h2>
            <p className="text-muted-foreground">
              Click on the image to add cut lines. The image will be split at these positions.
            </p>
          </div>

          {screenshotUrl && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                  <Badge variant="outline">
                    {cutPositions.length} cut position{cutPositions.length !== 1 ? 's' : ''}
                  </Badge>
                  {imageHeight > 0 && (
                    <Badge variant="secondary">
                      Image height: {Math.round(imageHeight)}px
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={clearCutPositions}
                    disabled={cutPositions.length === 0}
                  >
                    Clear Cuts
                  </Button>
                  <Button
                    onClick={handleCutImage}
                    disabled={cutPositions.length === 0 || isCutting}
                    className="flex items-center gap-2"
                  >
                    {isCutting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Cutting...</span>
                      </>
                    ) : (
                      <>
                        <Scissors className="h-4 w-4" />
                        <span>Cut Image</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="relative border rounded-lg overflow-hidden">
                <img
                  ref={imageRef}
                  src={screenshotUrl}
                  alt="Screenshot for cutting"
                  className="w-full cursor-crosshair"
                  onClick={handleImageClick}
                  onLoad={handleImageLoad}
                />
                
                {/* Cut position indicators */}
                {cutPositions.map((position, index) => {
                  const percentage = (position / imageHeight) * 100;
                  return (
                    <div
                      key={index}
                      className="absolute left-0 right-0 border-t-2 border-red-500 bg-red-500/20"
                      style={{ top: `${percentage}%` }}
                    >
                      <div className="absolute right-2 -top-3 bg-red-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        {Math.round(position)}px
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCutPosition(index);
                          }}
                          className="hover:bg-red-600 rounded text-xs"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-sm text-muted-foreground">
                <p>• Click anywhere on the image to add a cut line</p>
                <p>• Cut lines will appear as red horizontal lines</p>
                <p>• Click the × on a cut line to remove it</p>
                <p>• The image will be split into {cutPositions.length + 1} piece{cutPositions.length !== 0 ? 's' : ''}</p>
              </div>

              {error && (
                <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md dark:bg-red-900 dark:text-red-300 dark:border-red-700">
                  <p className="font-semibold">Error:</p>
                  <p className="text-sm">{error}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </TabsContent>

      {/* Tab 3: Cut Images Management */}
      <TabsContent value="management">
        <div className="w-full space-y-6 p-6 bg-card rounded-lg border shadow-sm">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Cut Images</h2>
            <p className="text-muted-foreground">
              Manage your cut image pieces. Download individual pieces or save all to the system.
            </p>
          </div>

          {cutImages.length > 0 && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Badge variant="outline">
                  {cutImages.length} piece{cutImages.length !== 1 ? 's' : ''} cut
                </Badge>
                <div className="flex gap-2">
                  <Button
                    onClick={handleSaveImages}
                    disabled={isSaving}
                    className={`flex items-center gap-2 ${(isSaving || imagesSaved) ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  >
                    {isSaving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Saved!</span>
                      </>
                    ) : imagesSaved ? (
                      <>
                        <svg className="h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        <span>Saved!</span>
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        <span>Save to System</span>
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-96">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cutImages.map((image, index) => (
                    <div key={index} className="border rounded-lg overflow-hidden shadow-lg">
                      <img
                        src={image.url}
                        alt={`Cut piece ${index + 1}`}
                        className="w-full h-48 object-cover"
                      />
                      <div className="p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <h4 className="font-medium">Piece {index + 1}</h4>
                          <Badge variant="secondary" className="text-xs">
                            {image.height}px
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Y: {Math.round(image.startY)} - {Math.round(image.endY)}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadImage(image.url, `piece_${index + 1}.png`)}
                          className="w-full flex items-center gap-2"
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {isSaving && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 mr-2 text-green-600 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-medium">Images saved to system!</p>
                      <p className="mt-1">All {cutImages.length} cut pieces have been saved and are available for use in other parts of the application.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
};

export default ImageScraping; 