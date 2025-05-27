export interface CreateVideoRequestBody {
    imageUrls: string[];
    audioUrl?: string;
    subtitlesUrl?: string; // URL to SRT file for video subtitles
    userId?: string;
    thumbnailUrl?: string; // Custom thumbnail URL generated with Leonardo.ai
  }
  
  export interface CreateVideoResponse {
    message?: string;
    video_id?: string;
    videoUrl?: string;
    error?: string;
    details?: string; // For more detailed errors
  }
  