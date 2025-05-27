'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { 
  Folder, 
  FileIcon, 
  ChevronRight, 
  FileText, 
  FileSpreadsheet, 
  FileImage, 
  Archive, 
  FileCode,
  Play,
  UploadCloud
} from 'lucide-react';
import { toast } from "react-hot-toast";

// Assuming you might need both the Root and Viewport from Radix ScrollArea
const ScrollArea = ScrollAreaPrimitive.Root;
const ScrollAreaViewport = ScrollAreaPrimitive.Viewport;

interface Item {
  id: string;
  name: string;
  type: 'folder' | 'file';
  extension?: string;
  children?: Item[];
  size?: number;
  icon?: string;
}

export default function GoogleDriveComponent() {
  const { data: session, status } = useSession();
  const [structure, setStructure] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  
  // Upload state
  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null); // Ref for hidden file input

  // Function to fetch structure (extracted for reuse)
  const fetchStructure = async () => {
    if (status === 'authenticated') {
      try {
        setIsLoading(true);
        setFetchError(null);
        const response = await fetch('/api/folders');
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to fetch folder structure (${response.status})`);
        }
        const data = await response.json();
        setStructure(data.structure || []);
      } catch (error: any) {
        console.error('Error fetching folder structure:', error);
        setFetchError(error.message || 'An unknown error occurred');
        setStructure([]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchStructure(); // Fetch on initial load/auth change
  }, [status]);

  const toggleFolderOpen = (folderId: string) => {
    setOpenFolders(prev => ({ ...prev, [folderId]: !prev[folderId] }));
  };

  // Handle file selection from hidden input
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFileToUpload(event.target.files[0]);
    }
  };

  // Trigger hidden file input click
  const handleSelectFileClick = () => {
    fileInputRef.current?.click();
  };

  // Handle the upload process
  const handleUpload = async () => {
    if (!fileToUpload) {
      toast.error("Please select a file first.");
      return;
    }
    if (status !== 'authenticated') {
      toast.error("Please sign in to upload.");
      return;
    }

    // Simplified parentId logic for direct uploads, always uploads to 'root' for now
    const parentId = 'root'; 

    setIsUploading(true);
    const toastId = toast.loading(`Uploading ${fileToUpload.name} to Drive root...`);

    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('parentId', parentId);

    try {
      const response = await fetch('/api/upload-to-drive', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || "Upload failed with status: " + response.status);
      }

      toast.success(`Successfully uploaded ${result.fileName}!`, { id: toastId });
      setFileToUpload(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await fetchStructure(); 

    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(`Upload failed: ${error.message}`, { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  // Helper function to get file-specific icon
  const getFileIcon = (extension?: string) => {
    const ext = extension?.toLowerCase();
    switch (ext) {
      case 'doc':
      case 'docx':
      case 'txt':
      case 'rtf':
      case 'odt':
        return <FileText size={16} className="text-gray-500 mr-2 flex-shrink-0" />;
      case 'pdf':
        return <FileText size={16} className="text-red-500 mr-2 flex-shrink-0" />; // PDF often red
      case 'xls':
      case 'xlsx':
      case 'csv':
        return <FileSpreadsheet size={16} className="text-green-500 mr-2 flex-shrink-0" />;
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'bmp':
      case 'svg':
      case 'webp':
        return <FileImage size={16} className="text-purple-500 mr-2 flex-shrink-0" />;
      case 'mp3':
      case 'wav':
      case 'aac':
      case 'ogg':
        return <Play size={16} className="text-orange-500 mr-2 flex-shrink-0" />; // Using FilePlay for audio
      case 'mp4':
      case 'mov':
      case 'avi':
      case 'mkv':
        return <Play size={16} className="text-indigo-500 mr-2 flex-shrink-0" />; // Using FilePlay for video
      case 'zip':
      case 'rar':
      case 'tar':
      case 'gz':
        return <Archive size={16} className="text-yellow-500 mr-2 flex-shrink-0" />;
      case 'js':
      case 'jsx':
      case 'ts':
      case 'tsx':
      case 'html':
      case 'css':
      case 'json':
      case 'py':
      case 'java':
        return <FileCode size={16} className="text-teal-500 mr-2 flex-shrink-0" />;
      default:
        return <FileIcon size={16} className="text-gray-500 mr-2 flex-shrink-0" />;
    }
  };

  const renderItem = (item: Item, level: number = 0) => {
    const isFolderOpen = openFolders[item.id] || false;
    const basePadding = level * 1.5;

    const itemContainerClasses = "flex items-center space-x-2 border rounded-md p-2 mb-1 hover:bg-accent hover:text-accent-foreground transition-colors w-full";

    if (item.type === 'folder') {
      return (
        <CollapsiblePrimitive.Root 
          key={item.id} 
          open={isFolderOpen} 
          onOpenChange={() => toggleFolderOpen(item.id)}
          style={{ paddingLeft: `${basePadding}rem` }}
        >
          <div className={itemContainerClasses}>
            <CollapsiblePrimitive.Trigger asChild>
              <button className="flex items-center text-left flex-grow p-1 rounded hover:bg-muted/50 min-w-0">
                <ChevronRight 
                  size={16} 
                  className={`transform transition-transform duration-150 ${isFolderOpen ? 'rotate-90' : ''} mr-1 flex-shrink-0`}
                />
                <Folder size={16} className="text-blue-500 mr-2 flex-shrink-0" />
                <span 
                  className="text-sm font-medium cursor-pointer truncate flex-grow min-w-0"
                  title={item.name}
                >
                  {item.name}
                </span>
              </button>
            </CollapsiblePrimitive.Trigger>
          </div>
          <CollapsiblePrimitive.Content className="overflow-hidden">
            {item.children && item.children.length > 0 && (
              <ul className="mt-1 border-l border-dashed ml-2">
                {item.children.map((child) => renderItem(child, level + 1))}
              </ul>
            )}
          </CollapsiblePrimitive.Content>
        </CollapsiblePrimitive.Root>
      );
    } else {
      return (
        <div key={item.id} className={itemContainerClasses} style={{ marginLeft: `${basePadding}rem` }}>
          <span style={{ width: '16px' }} className="mr-1 flex-shrink-0"></span>
          {getFileIcon(item.extension)}
          <span 
            className="text-sm font-medium truncate flex-grow min-w-0"
            title={item.name}
          >
            {item.name}
          </span>
        </div>
      );
    }
  };

  if (status === 'loading') {
    return <div className="p-4 text-center">Loading session...</div>;
  }

  if (status === 'unauthenticated') {
    return (
      <div className="flex flex-col items-center justify-center p-6 border rounded-md m-4">
        <p className="mb-4 text-muted-foreground">Connect your Google Drive account to select files.</p>
        <Button onClick={() => signIn('google')}>Connect to Google Drive</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4">
      {isLoading && <div className="p-4 text-center">Loading files...</div>}
      {fetchError && <div className="text-red-500 p-4 text-center">Error: {fetchError}</div>}
      {!isLoading && !fetchError && (
        <ScrollArea className="w-full border rounded-md p-2">
          <ScrollAreaViewport>
            {structure.length > 0 ? (
              <ul>{structure.map((item) => renderItem(item, 0))}</ul>
            ) : (
              <p className="text-muted-foreground text-center p-4">No files or folders found.</p>
            )}
          </ScrollAreaViewport>
        </ScrollArea>
      )}
      {!isLoading && (
        <div className="flex flex-col sm:flex-row justify-between items-center pt-4 border-t space-y-2 sm:space-y-0 sm:space-x-4">
          <div className="flex items-center space-x-2 flex-grow min-w-0">
             {/* Hidden File Input */}
             <input 
               type="file" 
               ref={fileInputRef} 
               onChange={handleFileChange} 
               style={{ display: 'none' }} 
             />
             <Button 
               variant="outline" 
               size="sm" 
               onClick={handleSelectFileClick}
               disabled={isUploading}
             >
               Select File to Upload to Root
             </Button>
             {fileToUpload && (
               <span className="text-sm text-muted-foreground truncate flex-shrink-0" title={fileToUpload.name}> 
                 {fileToUpload.name}
               </span>
             )}
          </div>
          
          <Button 
            onClick={handleUpload} 
            disabled={!fileToUpload || isUploading}
            size="sm" 
            className="flex-shrink-0"
          >
            <UploadCloud size={16} className="mr-2" />
            {isUploading ? 'Uploading...' : 'Upload to Root'}
          </Button>
        </div>
      )}
    </div>
  );
} 