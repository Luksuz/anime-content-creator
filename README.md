# YouTube Content Analyzer

A comprehensive application that extracts audio from YouTube videos, generates transcriptions, and provides AI-powered content analysis.

## 🔄 Workflow

1. **Download Audio** - Extracts audio from YouTube videos using `ytdl-core` and `ffmpeg`
2. **Upload to Storage** - Stores audio files in Supabase Storage
3. **Generate Transcription** - Uses Shotstack API to create SRT transcriptions
4. **AI Analysis** - Leverages OpenAI GPT-4 via LangChain for content analysis

## 📁 Project Structure

```
/
├── utils/
│   ├── youtube.js          # YouTube audio download utilities
│   ├── supabase.js         # Supabase storage operations
│   ├── shotstack.js        # Shotstack transcription services
│   └── ai-analysis.js      # OpenAI/LangChain content analysis
├── pages/
│   ├── api/
│   │   └── process-youtube.js   # Main API endpoint
│   └── index.js            # Main application page
├── components/
│   └── YouTubeProcessor.jsx     # React UI component
├── types/
│   └── index.ts            # TypeScript type definitions
└── README.md
```

## 🚀 Setup Instructions

### 1. Environment Variables

Create a `.env.local` file with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_BUCKET_NAME=video-generator

# Shotstack Configuration
SHOTSTACK_API_KEY=your_shotstack_api_key

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

### 2. Dependencies

```bash
npm install
# or
yarn install
```

Required packages:
- `ytdl-core` - YouTube video downloading
- `fluent-ffmpeg` - Audio processing
- `@supabase/supabase-js` - Supabase client
- `@langchain/openai` - OpenAI integration
- `zod` - Schema validation
- `next` - Next.js framework
- `react` - React library
- `tailwindcss` - Styling

### 3. System Requirements

- **FFmpeg** - Required for audio processing
  ```bash
  # macOS
  brew install ffmpeg
  
  # Ubuntu/Debian
  sudo apt update && sudo apt install ffmpeg
  
  # Windows
  # Download from https://ffmpeg.org/download.html
  ```

### 4. Supabase Setup

1. Create a Supabase project
2. Create a storage bucket named `video-generator` (or your preferred name)
3. Set bucket to public access for file URLs
4. Get your project URL and service role key

### 5. Shotstack Setup

1. Sign up for Shotstack API
2. Get your API key from the dashboard
3. Note: Uses the `stage` environment for development

### 6. OpenAI Setup

1. Create an OpenAI account
2. Generate an API key
3. Ensure you have access to GPT-4 models

## 🎯 Usage

### Web Interface

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Open http://localhost:3000

3. Enter a YouTube URL and click "Process Video"

4. Monitor the progress through the visual indicators

5. View the complete analysis results

### API Usage

**Endpoint:** `POST /api/process-youtube`

**Request:**
```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=VIDEO_ID"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "youtube_url": "https://www.youtube.com/watch?v=VIDEO_ID",
    "audio_url": "https://supabase-url/audio-file.mp3",
    "transcription": "SRT format transcription...",
    "ai_analysis": {
      "video_script": {
        "title": "Video Title",
        "scripting": "Analysis of scripting approach",
        "emotional_tone": "Tone description",
        "structure": "Structure analysis"
      },
      "content_suggestions": {
        "key_topics": ["topic1", "topic2"],
        "target_audience": "Audience description",
        "content_type": "Content type",
        "improvement_suggestions": ["suggestion1"],
        "hashtags": ["hashtag1", "hashtag2"]
      },
      "summaries": {
        "short_summary": "Brief summary",
        "medium_summary": "Detailed summary",
        "detailed_summary": "Comprehensive summary",
        "bullet_points": ["point1", "point2"]
      }
    }
  }
}
```

## 🛠️ Utility Functions

### YouTube Utils (`/utils/youtube.js`)
- `downloadYouTubeAudio(url, outputPath)` - Download and convert audio
- `isValidYouTubeUrl(url)` - Validate YouTube URLs
- `extractVideoId(url)` - Extract video ID

### Supabase Utils (`/utils/supabase.js`)
- `uploadFileToSupabase(file, path, contentType)` - Upload files
- `generateUniqueFilename(prefix, extension)` - Generate unique names
- `isSupabaseConfigured()` - Check configuration

### Shotstack Utils (`/utils/shotstack.js`)
- `transcribeAudio(audioUrl)` - Complete transcription workflow
- `requestTranscription(audioUrl)` - Request transcription job
- `pollJobStatus(jobId)` - Poll for job completion
- `downloadSrtContent(srtUrl)` - Download SRT file

### AI Analysis Utils (`/utils/ai-analysis.js`)
- `completeAnalysis(transcription)` - Full AI analysis
- `generateVideoScript(transcription)` - Video script analysis
- `generateContentSuggestions(transcription)` - Content suggestions
- `extractKeyQuotes(transcription)` - Extract key quotes
- `generateSummaries(transcription)` - Generate summaries

## 🎨 UI Components

### YouTubeProcessor (`/components/YouTubeProcessor.jsx`)
- Complete processing interface
- Real-time progress tracking
- Results display with organized sections
- Error handling and user feedback
- Responsive design with Tailwind CSS

## 📝 TypeScript Support

Type definitions are available in `/types/index.ts` for:
- API request/response interfaces
- Processing result structures
- Configuration objects
- Error handling types

## 🔧 Configuration

### Processing Settings
- **Transcription polling**: 5-second intervals, 5-minute timeout
- **Audio quality**: 128kbps MP3
- **File cleanup**: Automatic local file removal after upload
- **Error handling**: Comprehensive error logging and user feedback

### Customization
- Modify AI prompts in `/utils/ai-analysis.js`
- Adjust polling intervals in `/utils/shotstack.js`
- Update UI styling in `/components/YouTubeProcessor.jsx`
- Configure storage paths in `/utils/supabase.js`

## 🚨 Error Handling

The application includes comprehensive error handling:
- Input validation for YouTube URLs
- Network error recovery
- File upload verification
- Transcription job monitoring
- AI processing fallbacks

## 📊 Monitoring & Logging

All operations include detailed console logging with emojis for easy identification:
- 🎵 YouTube operations
- ☁️ Supabase operations  
- 🔤 Shotstack operations
- 🤖 AI processing
- ✅ Success indicators
- ❌ Error indicators

## 🔐 Security

- Service role keys for backend operations
- Input sanitization and validation
- Secure file upload handling
- Environment variable protection

## 📈 Scalability

The modular architecture supports:
- Easy service swapping (replace Shotstack with other transcription services)
- Multiple storage backends
- Different AI providers
- Horizontal scaling of API endpoints
