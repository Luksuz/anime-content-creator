"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Eye, Loader2, Download, Check, Edit3, RefreshCw } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Interface for scraped and cut images
interface CutImage {
  url: string;
  startY: number;
  endY: number;
  height: number;
}

// Interface for generated narration chunks
interface NarrationChunk {
  imageUrl: string;
  imageIndex: number;
  narration: string;
  startY: number;
  endY: number;
  height: number;
}

// Interface for script segments
interface ScriptSegment {
  id: string;
  content: string;
  wordCount: number;
  isEditing: boolean;
  editPrompt: string;
}

interface ScriptGeneratorProps {
  onFullScriptChange?: (data: { scriptWithMarkdown: string, scriptCleaned: string }) => void;
  currentFullScript?: string;
  scrapedImages?: CutImage[];
  onNarrationsGenerated?: (narrations: NarrationChunk[]) => void;
  generatedNarrations?: NarrationChunk[];
  onScrapedImagesChange?: (images: CutImage[]) => void;
  userId?: string;
  onApprove?: () => void;
}

const DEFAULT_PROMPTS = {
  main: `You are an expert narrator adapting manga panels into immersive audio-style scripts. For the image I'll provide, extract only meaningful dialogue and narration from speech bubbles and narration boxes. 

Extract in the order of right to left, top to bottom.

Then, transform the content into a smooth, natural-sounding narration, as if you're telling a story in real time.

If the panel includes actions or emotions (even without dialogue), briefly describe what's happening in a cinematic or dramatic tone.

Ignore sound effects, background text, and Japanese characters.

Do not include any symbols like quotation marks, asterisks, hyphens, brackets, or markdown.

Respond with only the final narration in plain text, suitable for voiceover — with clear flow and natural pacing. Add subtle emotional cues or tone hints if useful, but keep it brief. Don't over-explain or become robotic. Keep it human and engaging.

Final narration cannot have sound effects, laughs, onomatopoeia, groans, or coughs from text boxes, instead briefly describe what's happening.

Final narration cannot read words that are not in text boxes or read words that are not behind white boxes.
`,
  segment: "Revise this segment of the script to improve clarity, engagement, and flow while maintaining consistency with the overall narrative."
};

const ScriptGenerator: React.FC<ScriptGeneratorProps> = ({ 
  onFullScriptChange, 
  currentFullScript = "",
  scrapedImages = [],
  onNarrationsGenerated,
  generatedNarrations = [],
  onScrapedImagesChange,
  userId = 'unknown_user',
  onApprove
}) => {
  // Main generation state
  const [title, setTitle] = useState("");
  const [mainPrompt, setMainPrompt] = useState(DEFAULT_PROMPTS.main);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  
  // Script segments state
  const [scriptSegments, setScriptSegments] = useState<ScriptSegment[]>([]);
  const [totalWordCount, setTotalWordCount] = useState(0);
  const [isApproved, setIsApproved] = useState(false);
  
  // Segment editing state
  const [editingSegments, setEditingSegments] = useState<Set<string>>(new Set());
  
  // Load saved data from localStorage
  useEffect(() => {
    const savedTitle = localStorage.getItem('scriptGenerator.title');
    const savedMainPrompt = localStorage.getItem('scriptGenerator.mainPrompt');
    
    if (savedTitle) setTitle(savedTitle);
    if (savedMainPrompt) setMainPrompt(savedMainPrompt);
  }, []);
  
  // Save data to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('scriptGenerator.title', title);
    localStorage.setItem('scriptGenerator.mainPrompt', mainPrompt);
  }, [title, mainPrompt]);

  // Update segments when full script changes (only if not already set from narrations)
  useEffect(() => {
    if (currentFullScript && scriptSegments.length === 0) {
      const segments = createScriptSegments(currentFullScript);
      setScriptSegments(segments);
      
      const totalWords = segments.reduce((sum, segment) => sum + segment.wordCount, 0);
      setTotalWordCount(totalWords);
    } else if (!currentFullScript) {
      setScriptSegments([]);
      setTotalWordCount(0);
    }
  }, [currentFullScript]);

  // Create script segments (500 words each)
  const createScriptSegments = (script: string): ScriptSegment[] => {
    const words = script.split(/\s+/);
    const segments: ScriptSegment[] = [];
    const wordsPerSegment = 500;
    
    for (let i = 0; i < words.length; i += wordsPerSegment) {
      const segmentWords = words.slice(i, i + wordsPerSegment);
      const segmentContent = segmentWords.join(' ');
      
      segments.push({
        id: `segment-${segments.length + 1}`,
        content: segmentContent,
        wordCount: segmentWords.length,
        isEditing: false,
        editPrompt: DEFAULT_PROMPTS.segment
      });
    }
    
    return segments;
  };

  // Handle main script generation
  const handleGenerateScript = async () => {
    if (!scrapedImages || scrapedImages.length === 0) {
      setGenerationError('No images available for script generation. Please provide images first.');
      return;
    }

    if (!title.trim()) {
      setGenerationError('Please enter a title for your script.');
      return;
    }

    setIsGenerating(true);
    setGenerationError(null);
    setIsApproved(false);

    try {
      console.log(`Generating script for "${title}" with ${scrapedImages.length} images`);
      
      const response = await fetch('/api/analyze-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images: scrapedImages,
          prompt: mainPrompt,
          userId: userId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to generate script');
      }

      const data = await response.json();

      if (data.narrations && Array.isArray(data.narrations)) {
        console.log(`✅ Script generated successfully with ${data.narrations.length} narrations`);
        
        // Create segments directly from narrations (one segment per narration)
        const segments: ScriptSegment[] = data.narrations.map((narration: any, index: number) => ({
          id: `segment-${index + 1}`,
          content: narration.narration,
          wordCount: narration.narration.split(/\s+/).length,
          isEditing: false,
          editPrompt: DEFAULT_PROMPTS.segment
        }));
        
        // Set segments directly instead of relying on createScriptSegments
        setScriptSegments(segments);
        
        // Calculate total word count
        const totalWords = segments.reduce((sum, segment) => sum + segment.wordCount, 0);
        setTotalWordCount(totalWords);
        
        // Combine all narrations into a single script for parent component
        const fullScript = data.narrations.map((narration: any, index: number) => 
          `${narration.narration}`
        ).join('\n\n');
        
        // Update the full script
        if (onFullScriptChange) {
          onFullScriptChange({
            scriptWithMarkdown: fullScript,
            scriptCleaned: fullScript.replace(/[#*_~`]/g, '')
          });
        }

        // Pass narrations to parent
        if (onNarrationsGenerated) {
          onNarrationsGenerated(data.narrations);
        }
      } else {
        throw new Error('Invalid response format from script generation service');
      }

    } catch (err: any) {
      const errorMsg = err.message || 'An unexpected error occurred during script generation';
      console.error('Script generation error:', err);
      setGenerationError(errorMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle segment editing
  const handleEditSegment = async (segmentId: string, editPrompt: string) => {
    const segment = scriptSegments.find(s => s.id === segmentId);
    if (!segment) return;

    setEditingSegments(prev => new Set(prev).add(segmentId));

    try {
      const response = await fetch('/api/edit-script-segment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          segmentContent: segment.content,
          editPrompt: editPrompt,
          title: title,
          userId: userId
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to edit segment');
      }

      const data = await response.json();

      if (data.editedContent) {
        // Update the segment
        const updatedSegments = scriptSegments.map(s => 
          s.id === segmentId 
            ? { 
                ...s, 
                content: data.editedContent,
                wordCount: data.editedContent.split(/\s+/).length
              }
            : s
        );
        
        setScriptSegments(updatedSegments);
        
        // Update the full script
        const fullScript = updatedSegments.map(s => s.content).join('\n\n');
        if (onFullScriptChange) {
          onFullScriptChange({
            scriptWithMarkdown: fullScript,
            scriptCleaned: fullScript.replace(/[#*_~`]/g, '')
          });
        }
        
        // Recalculate total word count
        const totalWords = updatedSegments.reduce((sum, seg) => sum + seg.wordCount, 0);
        setTotalWordCount(totalWords);
      }

    } catch (err: any) {
      console.error('Segment editing error:', err);
      setGenerationError(`Failed to edit segment: ${err.message}`);
    } finally {
      setEditingSegments(prev => {
        const newSet = new Set(prev);
        newSet.delete(segmentId);
        return newSet;
      });
    }
  };

  // Update segment edit prompt
  const updateSegmentPrompt = (segmentId: string, prompt: string) => {
    setScriptSegments(prev => prev.map(segment => 
      segment.id === segmentId 
        ? { ...segment, editPrompt: prompt }
        : segment
    ));
  };

  // Apply prompt to all segments
  const applyPromptToAllSegments = (prompt: string) => {
    setScriptSegments(prev => prev.map(segment => ({
      ...segment,
      editPrompt: prompt
    })));
  };

  // Download script
  const downloadScript = () => {
    const fullScript = scriptSegments.map(s => s.content).join('\n\n');
    const blob = new Blob([`# ${title}\n\n${fullScript}`], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_script.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Approve script
  const handleApprove = () => {
    setIsApproved(true);
    if (onApprove) {
      onApprove();
    }
  };

  return (
    <div className="space-y-8">
      <Tabs defaultValue="generate" className="space-y-8">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="generate">Generate Script</TabsTrigger>
          <TabsTrigger value="review" disabled={scriptSegments.length === 0}>
            Review & Edit ({scriptSegments.length} segments)
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Script Generation */}
        <TabsContent value="generate">
          <div className="w-full space-y-6 p-6 bg-card rounded-lg border shadow-sm">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Script Generation</h2>
              <p className="text-muted-foreground">
                Create a script based on your extracted images with customizable prompts.
              </p>
            </div>

            <div className="space-y-6">
              {/* Title Input */}
              <div className="space-y-2">
                <Label htmlFor="script-title">Script Title</Label>
                <Input
                  id="script-title"
                  placeholder="Enter the title for your script/video"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={isGenerating}
                  className="text-lg font-medium"
                />
              </div>

              {/* Main Prompt */}
              <div className="space-y-2">
                <Label htmlFor="main-prompt">Generation Prompt</Label>
                <Textarea
                  id="main-prompt"
                  placeholder="Customize how the AI should generate your script..."
                  value={mainPrompt}
                  onChange={(e) => setMainPrompt(e.target.value)}
                  disabled={isGenerating}
                  className="min-h-[120px]"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMainPrompt(DEFAULT_PROMPTS.main)}
                    disabled={isGenerating}
                  >
                    Reset to Default
                  </Button>
                </div>
              </div>

              {/* Images Preview */}
              {scrapedImages.length > 0 && (
                <div className="space-y-4">
                  <Label>Source Images ({scrapedImages.length})</Label>
                  <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {scrapedImages.slice(0, 8).map((image, index) => (
                      <div key={index} className="border rounded overflow-hidden">
                        <img
                          src={image.url}
                          alt={`Image ${index + 1}`}
                          className="w-full h-16 object-cover"
                        />
                      </div>
                    ))}
                    {scrapedImages.length > 8 && (
                      <div className="border rounded flex items-center justify-center h-16 bg-muted">
                        <span className="text-xs text-muted-foreground">
                          +{scrapedImages.length - 8} more
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Generate Button */}
              <Button 
                className="w-full flex items-center justify-center gap-2" 
                onClick={handleGenerateScript}
                disabled={isGenerating || !title.trim() || scrapedImages.length === 0}
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Generating Script...</span>
                  </>
                ) : (
                  <>
                    <Eye className="h-5 w-5" />
                    <span>Generate Script from {scrapedImages.length} Images</span>
                  </>
                )}
              </Button>

              {generationError && (
                <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-md dark:bg-red-900 dark:text-red-300 dark:border-red-700">
                  <p className="font-semibold">Error:</p>
                  <p className="text-sm">{generationError}</p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Script Review & Editing */}
        <TabsContent value="review">
          <div className="w-full space-y-6">
            {/* Header with actions */}
            <div className="flex justify-between items-center p-6 bg-card rounded-lg border shadow-sm">
              <div>
                <h2 className="text-2xl font-bold">{title || "Generated Script"}</h2>
                <div className="flex gap-4 mt-2">
                  <Badge variant="outline">
                    {scriptSegments.length} segments
                  </Badge>
                  <Badge variant="secondary">
                    {totalWordCount} total words
                  </Badge>
                  {isApproved && (
                    <Badge variant="default" className="bg-green-600">
                      ✓ Approved
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={downloadScript}
                  disabled={scriptSegments.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={scriptSegments.length === 0 || isApproved}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Check className="h-4 w-4 mr-2" />
                  {isApproved ? "Approved" : "Approve Script"}
                </Button>
              </div>
            </div>

            {/* Global segment prompt */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Global Segment Editing</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Apply prompt to all segments</Label>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Enter a prompt to apply to all segments..."
                      className="flex-1"
                      rows={2}
                      id="global-prompt"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const globalPrompt = (document.getElementById('global-prompt') as HTMLTextAreaElement)?.value;
                        if (globalPrompt) {
                          applyPromptToAllSegments(globalPrompt);
                        }
                      }}
                    >
                      Apply to All
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Script segments */}
            <ScrollArea className="h-[600px]">
              <div className="space-y-6">
                {scriptSegments.map((segment, index) => (
                  <Card key={segment.id}>
                    <CardHeader>
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-lg">
                          Segment {index + 1}
                        </CardTitle>
                        <Badge variant="outline">
                          {segment.wordCount} words
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Segment content */}
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown>{segment.content}</ReactMarkdown>
                      </div>
                      
                      {/* Edit prompt */}
                      <div className="space-y-2">
                        <Label>Edit Prompt for this segment</Label>
                        <Textarea
                          placeholder="Enter specific instructions for editing this segment..."
                          value={segment.editPrompt}
                          onChange={(e) => updateSegmentPrompt(segment.id, e.target.value)}
                          disabled={editingSegments.has(segment.id)}
                          rows={2}
                        />
                        <Button
                          variant="outline"
                          onClick={() => handleEditSegment(segment.id, segment.editPrompt)}
                          disabled={editingSegments.has(segment.id) || !segment.editPrompt.trim()}
                          className="w-full"
                        >
                          {editingSegments.has(segment.id) ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Editing Segment...
                            </>
                          ) : (
                            <>
                              <Edit3 className="h-4 w-4 mr-2" />
                              Edit This Segment
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ScriptGenerator; 