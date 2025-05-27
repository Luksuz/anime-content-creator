"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useRef, useEffect } from "react";
import { Download, Scissors, Save, Trash2, Link, RotateCcw, Upload, X, FolderOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/contexts/AuthContext";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface CutImage {
  dataUrl: string;
  startY: number;
  endY: number;
  startX: number;
  endX: number;
  height: number;
  width: number;
  buffer: string;
}

interface SavedCutImage {
  url: string;
  startY: number;
  endY: number;
  startX: number;
  endX: number;
  height: number;
  width: number;
}

interface UploadedImage {
  file: File;
  dataUrl: string;
  name: string;
  size: number;
  width: number;
  height: number;
}

interface ImageScrapingProps {
  onScrapedImagesChange?: (images: SavedCutImage[]) => void;
}

type CuttingMode = 'vertical' | 'horizontal' | 'both';

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

  // Tab 2: Image Upload
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedUploadedImages, setSavedUploadedImages] = useState<SavedCutImage[]>([]);
  const [uploadedImagesSaved, setUploadedImagesSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // Tab 3: Image Cutting
  const [cuttingMode, setCuttingMode] = useState<CuttingMode>('vertical');
  const [cutPositions, setCutPositions] = useState<number[]>([]);
  const [xCutPositions, setXCutPositions] = useState<number[]>([]);
  const [imageHeight, setImageHeight] = useState<number>(0);
  const [imageWidth, setImageWidth] = useState<number>(0);
  const [isDragging, setIsDragging] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isCutting, setIsCutting] = useState(false);

  // Tab 4: Cut Images Management
  const [cutImages, setCutImages] = useState<CutImage[]>([]);
  const [savedCutImages, setSavedCutImages] = useState<SavedCutImage[]>([]);
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
    setXCutPositions([]);
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
      
      // Log additional info if available
      if (data.originalFirecrawlUrl) {
        console.log('Note: Using external Firecrawl URL due to download issues');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to take screenshot');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file upload
  const handleFileUpload = (files: FileList | null) => {
    if (!files) return;

    setUploadError(null);
    const newImages: UploadedImage[] = [];

    Array.from(files).forEach((file) => {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setUploadError(`${file.name} is not a valid image file`);
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setUploadError(`${file.name} is too large. Maximum size is 10MB`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        
        // Create an image element to get dimensions
        const img = new Image();
        img.onload = () => {
          const uploadedImage: UploadedImage = {
            file,
            dataUrl,
            name: file.name,
            size: file.size,
            width: img.width,
            height: img.height
          };
          
          setUploadedImages(prev => [...prev, uploadedImage]);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  };

  // Handle drag and drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  // Remove uploaded image
  const removeUploadedImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Clear all uploaded images
  const clearUploadedImages = () => {
    setUploadedImages([]);
    setUploadError(null);
    setUploadedImagesSaved(false);
    setSavedUploadedImages([]);
  };

  // Save uploaded images to system
  const handleSaveUploadedImages = async () => {
    if (uploadedImages.length === 0) {
      setUploadError("No images to save");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      // Convert uploaded images to the format expected by the save API
      const imagesToSave = uploadedImages.map((img, index) => ({
        dataUrl: img.dataUrl,
        startY: 0,
        endY: img.height,
        startX: 0,
        endX: img.width,
        height: img.height,
        width: img.width,
        buffer: img.dataUrl.split(',')[1] // Extract base64 data
      }));

      const response = await fetch('/api/save-cut-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cutImages: imagesToSave,
          userId: actualUserId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save uploaded images');
      }

      setSavedUploadedImages(data.savedImages);
      setUploadedImagesSaved(true);
      
      // Call parent callback with saved images
      if (onScrapedImagesChange) {
        onScrapedImagesChange(data.savedImages);
      }

      console.log(`Successfully saved ${data.totalSaved} uploaded images`);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to save uploaded images');
    } finally {
      setIsUploading(false);
    }
  };

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Handle image load to get dimensions
  const handleImageLoad = () => {
    if (imageRef.current) {
      setImageHeight(imageRef.current.naturalHeight);
      setImageWidth(imageRef.current.naturalWidth);
    }
  };

  // Handle mouse click on image to add cut positions
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const imageDisplayHeight = rect.height;
    const imageDisplayWidth = rect.width;

    if (cuttingMode === 'vertical' || cuttingMode === 'both') {
      const actualY = (clickY / imageDisplayHeight) * imageHeight;
      
      // Don't add cuts too close to existing ones (minimum 50px apart)
      const tooClose = cutPositions.some(pos => Math.abs(pos - actualY) < 50);
      if (!tooClose) {
        setCutPositions(prev => [...prev, actualY].sort((a, b) => a - b));
      }
    }

    if (cuttingMode === 'horizontal' || cuttingMode === 'both') {
      const actualX = (clickX / imageDisplayWidth) * imageWidth;
      
      // For horizontal cuts, we need exactly 2 cuts to extract the middle section
      if (xCutPositions.length >= 2) {
        setError("Exactly 2 horizontal cuts required. You already have 2 cuts. Clear existing cuts to reposition them.");
        return;
      }
      
      // Don't add cuts too close to existing ones (minimum 50px apart)
      const tooClose = xCutPositions.some(pos => Math.abs(pos - actualX) < 50);
      if (!tooClose) {
        const newXCuts = [...xCutPositions, actualX].sort((a, b) => a - b);
        setXCutPositions(newXCuts);
        setError(null); // Clear any previous error
        
        // Provide feedback about the cutting progress
        if (newXCuts.length === 1) {
          setError("1 of 2 horizontal cuts added. Add one more cut to define the middle section.");
        } else if (newXCuts.length === 2) {
          setError(null); // Clear the instruction message
        }
      }
    }
  };

  // Remove a Y-axis cut position
  const removeCutPosition = (index: number) => {
    setCutPositions(prev => prev.filter((_, i) => i !== index));
  };

  // Remove an X-axis cut position
  const removeXCutPosition = (index: number) => {
    setXCutPositions(prev => prev.filter((_, i) => i !== index));
    setError(null); // Clear error when removing cuts
  };

  // Clear all cut positions
  const clearCutPositions = () => {
    setCutPositions([]);
    setXCutPositions([]);
    setError(null);
  };

  // Handle cutting mode change
  const handleCuttingModeChange = (mode: CuttingMode) => {
    setCuttingMode(mode);
    // Clear cuts when switching modes to avoid confusion
    setCutPositions([]);
    setXCutPositions([]);
    setError(null);
  };

  // Handle cutting the image
  const handleCutImage = async () => {
    if (!screenshotUrl) {
      setError("No screenshot available");
      return;
    }

    const hasYCuts = cutPositions.length > 0;
    const hasXCuts = xCutPositions.length > 0;

    if (!hasYCuts && !hasXCuts) {
      setError("No cut positions available. Click on the image to add cut lines.");
      return;
    }

    // Validate X-axis cuts - must be exactly 2 if any are present
    if (hasXCuts && xCutPositions.length !== 2) {
      setError("Exactly 2 horizontal cuts are required to extract the middle section. Please add more cuts or switch to vertical cutting mode.");
      return;
    }

    // Validate cutting mode requirements
    if (cuttingMode === 'horizontal' && xCutPositions.length !== 2) {
      setError("Horizontal cutting mode requires exactly 2 cuts to extract the middle section.");
      return;
    }

    if (cuttingMode === 'both' && hasXCuts && xCutPositions.length !== 2) {
      setError("When using both cutting modes with horizontal cuts, exactly 2 horizontal cuts are required.");
      return;
    }

    setIsCutting(true);
    setError(null);
    setImagesSaved(false);
    setSavedCutImages([]); // Clear any previously saved images

    try {
      const response = await fetch('/api/cut-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageUrl: screenshotUrl,
          cutPositions: hasYCuts ? cutPositions : undefined,
          xCutPositions: hasXCuts ? xCutPositions : undefined,
          userId: actualUserId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to cut image');
      }

      setCutImages(data.cutImages);
      console.log(`Image cut into ${data.totalPieces} pieces (ready for preview)`);
    } catch (err: any) {
      setError(err.message || 'Failed to cut image');
    } finally {
      setIsCutting(false);
    }
  };

  // Save cut images (upload to Supabase and call parent callback)
  const handleSaveImages = async () => {
    if (cutImages.length === 0) {
      setError("No cut images to save");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/save-cut-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cutImages,
          userId: actualUserId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save cut images');
      }

      setSavedCutImages(data.savedImages);
      setImagesSaved(true);
      
      // Call parent callback with saved images
      if (onScrapedImagesChange) {
        onScrapedImagesChange(data.savedImages);
      }

      console.log(`Successfully saved ${data.totalSaved} cut images`);
    } catch (err: any) {
      setError(err.message || 'Failed to save cut images');
    } finally {
      setIsSaving(false);
    }
  };

  // Download individual image
  const downloadImage = (dataUrl: string, filename: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Clear everything
  const handleClearAll = () => {
    setUrl("");
    setScreenshotUrl(null);
    setCutPositions([]);
    setXCutPositions([]);
    setCutImages([]);
    setError(null);
    setImagesSaved(false);
    setCuttingMode('vertical');
    // Also clear uploaded images
    clearUploadedImages();
  };

  // Get total expected pieces
  const getExpectedPieces = () => {
    const yPieces = cutPositions.length + 1;
    
    if (cuttingMode === 'both' && cutPositions.length > 0 && xCutPositions.length === 2) {
      // Grid mode with middle section only: Y pieces × 1 (middle section)
      return yPieces;
    } else if (cuttingMode === 'horizontal' && xCutPositions.length === 2) {
      // Horizontal mode: only 1 piece (the middle section)
      return 1;
    } else if (cuttingMode === 'vertical' && cutPositions.length > 0) {
      // Vertical mode: normal Y pieces
      return yPieces;
    } else if (cuttingMode === 'horizontal' && xCutPositions.length < 2) {
      // Horizontal mode but not enough cuts yet
      return 0;
    }
    return 1;
  };

  return (
    <Tabs defaultValue="screenshot" className="space-y-8">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="screenshot">URL & Screenshot</TabsTrigger>
        <TabsTrigger value="upload">Upload Images</TabsTrigger>
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

      {/* Tab 2: Image Upload */}
      <TabsContent value="upload">
        <div className="w-full space-y-6 p-6 bg-card rounded-lg border shadow-sm">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Upload Your Images</h2>
            <p className="text-muted-foreground">
              Upload your own images to use in the system. Supports JPG, PNG, GIF, and WebP formats.
            </p>
          </div>

          <div className="space-y-4">
            {/* Upload Area */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                isDragOver 
                  ? 'border-primary bg-primary/5' 
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="p-4 bg-muted rounded-full">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-lg font-medium">Drop images here or click to browse</h3>
                  <p className="text-sm text-muted-foreground">
                    Supports JPG, PNG, GIF, WebP • Max 10MB per file
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2"
                >
                  <FolderOpen className="h-4 w-4" />
                  Browse Files
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />
              </div>
            </div>

            {uploadError && (
              <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md dark:bg-red-900 dark:text-red-300 dark:border-red-700">
                <p className="font-semibold">Error:</p>
                <p className="text-sm">{uploadError}</p>
              </div>
            )}

            {/* Uploaded Images Preview */}
            {uploadedImages.length > 0 && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Badge variant="outline">
                    {uploadedImages.length} image{uploadedImages.length !== 1 ? 's' : ''} uploaded
                  </Badge>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearUploadedImages}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Clear All
                    </Button>
                    <Button
                      onClick={handleSaveUploadedImages}
                      disabled={isUploading || uploadedImages.length === 0}
                      className={`flex items-center gap-2 ${(isUploading || uploadedImagesSaved) ? 'bg-green-600 hover:bg-green-700' : ''}`}
                    >
                      {isUploading ? (
                        <>
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Saving...</span>
                        </>
                      ) : uploadedImagesSaved ? (
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
                    {uploadedImages.map((image, index) => (
                      <div key={index} className="border rounded-lg overflow-hidden shadow-lg">
                        <div className="relative">
                          <img
                            src={image.dataUrl}
                            alt={image.name}
                            className="w-full h-48 object-cover"
                          />
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => removeUploadedImage(index)}
                            className="absolute top-2 right-2 h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="p-3 space-y-2">
                          <div className="space-y-1">
                            <h4 className="font-medium text-sm truncate" title={image.name}>
                              {image.name}
                            </h4>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>{image.width}×{image.height}px</span>
                              <span>{formatFileSize(image.size)}</span>
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => downloadImage(image.dataUrl, image.name)}
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

                {uploadedImagesSaved && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                    <div className="flex items-start">
                      <svg className="h-5 w-5 mr-2 text-green-600 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <div>
                        <p className="font-medium">Images saved to system!</p>
                        <p className="mt-1">All {savedUploadedImages.length} uploaded images have been saved to Supabase and are available for use in other parts of the application.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </TabsContent>

      {/* Tab 3: Image Cutting */}
      <TabsContent value="cutting">
        <div className="w-full space-y-6 p-6 bg-card rounded-lg border shadow-sm">
          <div className="space-y-2">
            <h2 className="text-2xl font-bold">Image Cutting</h2>
            <p className="text-muted-foreground">
              Choose your cutting mode and click on the image to add cut lines.
            </p>
          </div>

          {screenshotUrl && (
            <div className="space-y-4">
              {/* Cutting Mode Selector */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Cutting Mode</Label>
                <RadioGroup 
                  value={cuttingMode} 
                  onValueChange={(value: CuttingMode) => handleCuttingModeChange(value)}
                  className="flex flex-col space-y-2"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="vertical" id="vertical" />
                    <Label htmlFor="vertical" className="text-sm">
                      Vertical Cuts (Y-axis) - Split image horizontally into strips
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="horizontal" id="horizontal" />
                    <Label htmlFor="horizontal" className="text-sm">
                      Horizontal Cuts (X-axis) - Extract middle section only (requires exactly 2 cuts)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="both" id="both" />
                    <Label htmlFor="both" className="text-sm">
                      Both - Extract middle column sections using 2 horizontal + vertical cuts
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center gap-4 flex-wrap">
                  {(cuttingMode === 'vertical' || cuttingMode === 'both') && (
                    <Badge variant="outline">
                      {cutPositions.length} vertical cut{cutPositions.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                  {(cuttingMode === 'horizontal' || cuttingMode === 'both') && (
                    <Badge variant="outline">
                      {xCutPositions.length}/2 horizontal cut{xCutPositions.length !== 1 ? 's' : ''}
                    </Badge>
                  )}
                  <Badge variant="secondary">
                    Expected pieces: {getExpectedPieces()}
                  </Badge>
                  {imageHeight > 0 && imageWidth > 0 && (
                    <Badge variant="secondary">
                      {Math.round(imageWidth)}×{Math.round(imageHeight)}px
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={clearCutPositions}
                    disabled={cutPositions.length === 0 && xCutPositions.length === 0}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Clear Cuts
                  </Button>
                  <Button
                    onClick={handleCutImage}
                    disabled={(cutPositions.length === 0 && xCutPositions.length === 0) || isCutting}
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
                
                {/* Y-axis cut position indicators (horizontal lines) */}
                {(cuttingMode === 'vertical' || cuttingMode === 'both') && cutPositions.map((position, index) => {
                  const percentage = (position / imageHeight) * 100;
                  return (
                    <div
                      key={`y-${index}`}
                      className="absolute left-0 right-0 border-t-2 border-red-500 bg-red-500/20"
                      style={{ top: `${percentage}%` }}
                    >
                      <div className="absolute right-2 -top-3 bg-red-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                        Y: {Math.round(position)}px
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

                {/* X-axis cut position indicators (vertical lines) */}
                {(cuttingMode === 'horizontal' || cuttingMode === 'both') && xCutPositions.map((position, index) => {
                  const percentage = (position / imageWidth) * 100;
                  return (
                    <div
                      key={`x-${index}`}
                      className="absolute top-0 bottom-0 border-l-2 border-blue-500 bg-blue-500/20"
                      style={{ left: `${percentage}%` }}
                    >
                      <div className="absolute top-2 -left-3 bg-blue-500 text-white text-xs px-2 py-1 rounded flex items-center gap-1 transform -rotate-90 origin-left">
                        X: {Math.round(position)}px
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeXCutPosition(index);
                          }}
                          className="hover:bg-blue-600 rounded text-xs"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="text-sm text-muted-foreground space-y-1">
                <p>• <strong>Vertical cuts (red lines):</strong> Click to add horizontal cut lines that split the image into vertical strips</p>
                <p>• <strong>Horizontal cuts (blue lines):</strong> Click to add exactly 2 vertical cut lines - only the middle section between them will be extracted</p>
                <p>• <strong>Both modes:</strong> Extract middle column sections by combining 2 horizontal cuts with vertical cuts</p>
                <p>• Click the × on any cut line to remove it</p>
                {cuttingMode === 'horizontal' && (
                  <p className="text-amber-600">• <strong>Tip:</strong> Perfect for anime images - the left and right sections will be discarded, keeping only the middle content</p>
                )}
                {cuttingMode === 'both' && (
                  <p className="text-amber-600">• <strong>Tip:</strong> Creates horizontal strips from the middle column only, ideal for extracting clean anime panels</p>
                )}
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

      {/* Tab 4: Cut Images Management */}
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
                    disabled={isSaving || cutImages.length === 0}
                    className={`flex items-center gap-2 ${(isSaving || imagesSaved) ? 'bg-green-600 hover:bg-green-700' : ''}`}
                  >
                    {isSaving ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Saving...</span>
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
                        src={image.dataUrl}
                        alt={`Cut piece ${index + 1}`}
                        className="w-full h-48 object-cover"
                      />
                      <div className="p-3 space-y-2">
                        <div className="flex justify-between items-center">
                          <h4 className="font-medium">Piece {index + 1}</h4>
                          <Badge variant="secondary" className="text-xs">
                            {image.width}×{image.height}px
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground space-y-1">
                          <div>X: {Math.round(image.startX)} - {Math.round(image.endX)}</div>
                          <div>Y: {Math.round(image.startY)} - {Math.round(image.endY)}</div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadImage(image.dataUrl, `piece_${index + 1}.png`)}
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

              {imagesSaved && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-md text-sm text-green-800">
                  <div className="flex items-start">
                    <svg className="h-5 w-5 mr-2 text-green-600 mt-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <p className="font-medium">Images saved to system!</p>
                      <p className="mt-1">All {savedCutImages.length} cut pieces have been uploaded to Supabase and are available for use in other parts of the application.</p>
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