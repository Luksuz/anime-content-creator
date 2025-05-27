"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, Check, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ApiKeyUploaderProps {
  userId?: string;
  onUploadSuccess?: () => void;
}

const ApiKeyUploader: React.FC<ApiKeyUploaderProps> = ({ userId = 'unknown_user', onUploadSuccess }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState<string>('');
  const [uploadedCount, setUploadedCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith('.txt')) {
      setUploadStatus('error');
      setUploadMessage('Please upload a .txt file');
      return;
    }

    setIsUploading(true);
    setUploadStatus('idle');
    setUploadMessage('');

    try {
      // Read file content
      const fileContent = await file.text();
      
      if (!fileContent.trim()) {
        throw new Error('File is empty');
      }

      console.log(`Uploading API keys for user: ${userId}`);

      // Send to API
      const response = await fetch('/api/upload-api-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKeysText: fileContent,
          userId: userId
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload API keys');
      }

      setUploadStatus('success');
      setUploadMessage(data.message);
      setUploadedCount(data.count || 0);
      
      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Call the success callback if provided
      if (onUploadSuccess) {
        onUploadSuccess();
      }

    } catch (error: any) {
      console.error('API key upload error:', error);
      setUploadStatus('error');
      setUploadMessage(error.message || 'Failed to upload API keys');
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Upload API Keys
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Upload WellSaid Labs API Keys</Label>
          <p className="text-sm text-muted-foreground">
            Upload a .txt file with one API key per line. These keys will be used for voice generation.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          onChange={handleFileUpload}
          className="hidden"
        />

        <Button
          onClick={triggerFileInput}
          disabled={isUploading}
          className="w-full"
          variant="outline"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="h-4 w-4 mr-2" />
              Choose .txt File
            </>
          )}
        </Button>

        {/* Status Messages */}
        {uploadStatus === 'success' && (
          <div className="flex items-center gap-2 p-3 bg-green-100 border border-green-400 text-green-700 rounded-md dark:bg-green-900 dark:text-green-300 dark:border-green-700">
            <Check className="h-4 w-4" />
            <div>
              <p className="font-semibold">Success!</p>
              <p className="text-sm">{uploadMessage}</p>
              {uploadedCount > 0 && (
                <p className="text-sm">Uploaded {uploadedCount} API keys</p>
              )}
            </div>
          </div>
        )}

        {uploadStatus === 'error' && (
          <div className="flex items-center gap-2 p-3 bg-red-100 border border-red-400 text-red-700 rounded-md dark:bg-red-900 dark:text-red-300 dark:border-red-700">
            <AlertCircle className="h-4 w-4" />
            <div>
              <p className="font-semibold">Error</p>
              <p className="text-sm">{uploadMessage}</p>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          <p><strong>File format:</strong> One API key per line</p>
          <p><strong>Example:</strong></p>
          <pre className="mt-1 p-2 bg-muted rounded text-xs">
{`wsl_abc123def456...
wsl_xyz789uvw012...
wsl_mno345pqr678...`}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
};

export default ApiKeyUploader; 