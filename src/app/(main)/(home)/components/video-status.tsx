"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import * as SelectPrimitive from '@radix-ui/react-select';
import { Download, AlertCircle, Clock, CheckCircle, Loader2, UploadCloud, ChevronsUpDown, Check, Film } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { useInterval } from "@/hooks/use-interval";

export interface VideoJob {
  id: string; // video_id from backend
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string | null;
  errorMessage?: string | null;
  createdAt: Date | string; // Store as Date object or ISO string
  updatedAt?: Date | string;
  user_id: string; // Add user_id field
  thumbnail_url?: string | null;
  subtitles_url?: string | null; // Add subtitles URL field
}

interface DriveFolder {
  id: string;
  name: string;
}

interface VideoStatusProps {
  jobs: VideoJob[];
  isLoading: boolean; // Add isLoading prop
}

const VideoStatus: React.FC<VideoStatusProps> = ({ jobs, isLoading }) => {
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [isFetchingFolders, setIsFetchingFolders] = useState<boolean>(false);
  const [targetFolderId, setTargetFolderId] = useState<string | undefined>(undefined);
  const [jobToUpload, setJobToUpload] = useState<VideoJob | null>(null);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState<boolean>(false);
  const [pollingJobs, setPollingJobs] = useState<Set<string>>(new Set());

  useEffect(() => {
    const inProgressJobs = jobs.filter(job => 
      job.status === 'pending' || job.status === 'processing'
    );
    
    setPollingJobs(new Set(inProgressJobs.map(job => job.id)));
  }, [jobs]);

  useInterval(() => {
    if (pollingJobs.size === 0) return;

    const checkJobStatus = async (jobId: string) => {
      try {
        const response = await fetch(`/api/video-status/${jobId}`);
        
        if (!response.ok) {
          console.error(`Error checking status for job ${jobId}:`, response.statusText);
          return;
        }
        
        const data = await response.json();
        
        if (data.status === 'completed' || data.status === 'failed') {
          setPollingJobs(prev => {
            const updated = new Set(prev);
            updated.delete(jobId);
            return updated;
          });
          
          if (data.status === 'completed') {
            toast.success(`Video "${jobId}" is ready!`);
          } else {
            toast.error(`Video processing failed: ${data.errorMessage || 'Unknown error'}`);
          }
        }
      } catch (error) {
        console.error(`Failed to check status for job ${jobId}:`, error);
      }
    };

    Array.from(pollingJobs).forEach(checkJobStatus);
  }, 10000);

  const getStatusBadgeVariant = (status: VideoJob['status']): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case 'completed':
        return 'default'; // Greenish or primary
      case 'processing':
        return 'secondary'; // Yellowish or blue
      case 'pending':
        return 'outline'; // Gray
      case 'failed':
        return 'destructive'; // Red
      default:
        return 'outline';
    }
  };

  const getStatusIcon = (status: VideoJob['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'processing':
      case 'pending':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const handleDownload = (url: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = url.split('/').pop() || `video-${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const fetchDriveFolders = async () => {
    setIsFetchingFolders(true);
    try {
      const response = await fetch('/api/list-drive-folders');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to fetch Drive folders');
      }
      const data = await response.json();
      setFolders(data.folders || []);
      if (data.folders && data.folders.length > 0) {
        // setTargetFolderId(data.folders[0].id); // Optionally pre-select first folder
      } else {
        toast.error("No Google Drive folders found or accessible.");
      }
    } catch (error: any) {
      console.error("Error fetching drive folders:", error);
      toast.error(error.message || "Could not load folders.");
      setFolders([]);
    } finally {
      setIsFetchingFolders(false);
    }
  };

  const handleInitiateDriveUpload = async (job: VideoJob) => {
    setJobToUpload(job);
    setTargetFolderId(undefined);
    if (folders.length === 0) {
      await fetchDriveFolders();
    }
  };

  const handleConfirmDriveUpload = async () => {
    if (!jobToUpload || !jobToUpload.videoUrl || !targetFolderId) {
      toast.error("Missing video URL or target folder.");
      return;
    }

    setIsUploadingToDrive(true);
    const toastId = toast.loading(`Preparing to upload video to Drive...`);

    try {
      toast.loading(`Downloading video for upload...`, { id: toastId });
      const videoResponse = await fetch(jobToUpload.videoUrl);
      if (!videoResponse.ok) throw new Error('Failed to download video file for upload.');
      const videoBlob = await videoResponse.blob();
      const videoFile = new File([videoBlob], jobToUpload.videoUrl.split('/').pop() || `video-${jobToUpload.id}.mp4`, {
        type: videoBlob.type || 'video/mp4',
      });

      toast.loading(`Uploading ${videoFile.name} to Google Drive...`, { id: toastId });
      const formData = new FormData();
      formData.append('file', videoFile);
      formData.append('parentId', targetFolderId);

      const uploadApiResponse = await fetch('/api/upload-to-drive', {
        method: 'POST',
        body: formData,
      });

      const result = await uploadApiResponse.json();
      if (!uploadApiResponse.ok || result.error) {
        throw new Error(result.error || "Drive upload failed");
      }

      toast.success(`Successfully uploaded ${result.fileName} to Google Drive!`, { id: toastId });
      setJobToUpload(null);
      setTargetFolderId(undefined);

    } catch (error: any) {
      console.error("Drive upload error:", error);
      toast.error(`Drive upload failed: ${error.message}`, { id: toastId });
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle>Video Generation Jobs</CardTitle>
        {pollingJobs.size > 0 && (
          <div className="flex items-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Polling for updates on {pollingJobs.size} job(s)...
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center items-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading jobs...</span>
          </div>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No video generation jobs found for the selected user.</p>
        ) : (
          jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).map((job) => (
            <div key={job.id} className="flex flex-col sm:flex-row rounded-lg overflow-hidden border shadow-sm">
              {/* Thumbnail section */}
              <div className="sm:w-64 aspect-video bg-muted relative flex-shrink-0">
                {job.thumbnail_url ? (
                  <img 
                    src={job.thumbnail_url} 
                    alt="Video thumbnail" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <Film className="h-10 w-10 text-muted-foreground" />
                </div>
                )}
                <Badge 
                  variant={getStatusBadgeVariant(job.status)} 
                  className="absolute top-2 right-2 capitalize flex items-center gap-1"
                >
                   {getStatusIcon(job.status)} 
                   {job.status}
                </Badge>
              </div>
              
              {/* Details section */}
              <div className="flex-1 p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-sm font-medium truncate mr-2" title={job.id}>
                      Video ID: {job.id.substring(0, 8)}...
                    </h3>
                    <span className="text-xs text-muted-foreground flex flex-wrap">
                      <span className="mr-2">Created: {formatDistanceToNow(new Date(job.createdAt))} ago</span>
                      {job.updatedAt && (
                        <span>Updated: {formatDistanceToNow(new Date(job.updatedAt))} ago</span>
                      )}
                    </span>
                    {job.subtitles_url && (
                      <span className="text-xs text-blue-500 flex items-center mt-1">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                        </svg>
                        With subtitles
                      </span>
                    )}
                  </div>
              </div>
              
              {job.status === 'completed' && job.videoUrl && (
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <Button 
                    size="sm" 
                    onClick={() => handleDownload(job.videoUrl!)}
                    className="flex-grow"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download Video
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleInitiateDriveUpload(job)}
                    disabled={isFetchingFolders || (jobToUpload === job && isUploadingToDrive)}
                    className="flex-grow"
                  >
                    <UploadCloud className="mr-2 h-4 w-4" />
                    {jobToUpload === job && isUploadingToDrive ? 'Uploading...' : (jobToUpload === job && isFetchingFolders ? 'Loading Folders...' : 'Upload to GDrive')}
                  </Button>
                </div>
              )}

              {jobToUpload === job && (
                <div className="mt-2 space-y-2 p-3 border rounded-md bg-muted/30">
                  <p className="text-sm font-medium">Select Google Drive Folder:</p>
                  {isFetchingFolders ? (
                    <div className="flex items-center"><Loader2 className="h-4 w-4 animate-spin mr-2" /><span>Fetching folders...</span></div>
                  ) : folders.length > 0 ? (
                    <SelectPrimitive.Root onValueChange={setTargetFolderId} value={targetFolderId}>
                      <SelectPrimitive.Trigger className="inline-flex items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 w-full">
                        <SelectPrimitive.Value placeholder="Select a folder..." />
                        <SelectPrimitive.Icon asChild>
                          <ChevronsUpDown className="h-4 w-4 opacity-50" />
                        </SelectPrimitive.Icon>
                      </SelectPrimitive.Trigger>
                      <SelectPrimitive.Portal>
                        <SelectPrimitive.Content className="relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-80">
                          <SelectPrimitive.Viewport className="p-1">
                            {folders.map(folder => (
                              <SelectPrimitive.Item 
                                key={folder.id} 
                                value={folder.id} 
                                className="relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                              >
                                <SelectPrimitive.ItemText>{folder.name}</SelectPrimitive.ItemText>
                                <SelectPrimitive.ItemIndicator className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                  <Check className="h-4 w-4" />
                                </SelectPrimitive.ItemIndicator>
                              </SelectPrimitive.Item>
                            ))}
                          </SelectPrimitive.Viewport>
                        </SelectPrimitive.Content>
                      </SelectPrimitive.Portal>
                    </SelectPrimitive.Root>
                  ) : (
                    <p className="text-xs text-muted-foreground">No folders found or could not load them. Try signing in to Google Drive again or ensure permissions are correct.</p>
                  )}
                  <Button 
                    size="sm" 
                    onClick={handleConfirmDriveUpload} 
                    disabled={!targetFolderId || isUploadingToDrive || isFetchingFolders}
                    className="w-full"
                   >
                    {isUploadingToDrive ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirm Upload to Drive
                  </Button>
                </div>
              )}

              {job.status === 'failed' && job.errorMessage && (
                  <Alert variant="destructive" className="mt-2 text-xs">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription className="text-xs">
                    {job.errorMessage}
                  </AlertDescription>
                </Alert>
              )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export default VideoStatus; 