import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import { Buffer } from 'buffer'; // Ensure Buffer is imported
import { SupabaseClient } from '@supabase/supabase-js';

// Ensure these environment variables are set in your .env.local or environment
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use Service Role Key for backend operations
const supabaseBucket = process.env.SUPABASE_BUCKET_NAME || 'generated_media'; // Default bucket name, adjust as needed

let supabaseAdmin: SupabaseClient | null = null;

if (supabaseUrl && supabaseServiceKey) {
  supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  console.log("Supabase Admin client initialized.");
} else {
  console.error("❌ Supabase URL or Service Role Key environment variables are missing. Supabase functionalities will be unavailable.");
}

/**
 * Uploads a file (from path or buffer) to Supabase Storage.
 *
 * @param fileSource Path to the local file (string) or a Buffer containing the file data.
 * @param destinationPath The desired path within the Supabase bucket (e.g., 'user_123/audio/myaudio.mp3').
 * @param contentType The MIME type of the file (e.g., 'audio/mpeg', 'image/png').
 * @param bucketNameOverride Optional bucket name to use instead of the default
 * @returns The public URL of the uploaded file, or null on failure.
 */
export async function uploadFileToSupabase(
  fileSource: string | Buffer,
  destinationPath: string,
  contentType: string,
  bucketNameOverride?: string
): Promise<string | null> {
  if (!supabaseAdmin) {
    console.error("Supabase Admin client is not initialized. Cannot upload file.");
    return null;
  }

  try {
    let fileBody: Buffer;
    let isLocalFileCleanup = false;

    if (typeof fileSource === 'string') {
      console.log(`Reading file from path for Supabase upload: ${fileSource}`);
      fileBody = await fs.readFile(fileSource);
      isLocalFileCleanup = true; // Mark for potential cleanup
    } else if (Buffer.isBuffer(fileSource)) {
      fileBody = fileSource;
      console.log(`Uploading buffer directly to Supabase. Destination: ${destinationPath}`);
    } else {
      throw new Error("Invalid fileSource type. Must be a file path (string) or a Buffer.");
    }

    const targetBucket = bucketNameOverride || supabaseBucket;
    console.log(`Uploading to Supabase bucket '${targetBucket}' at path: ${destinationPath}`);

    const { data, error } = await supabaseAdmin.storage
      .from(targetBucket)
      .upload(destinationPath, fileBody, {
        contentType: contentType,
        upsert: true, // Overwrite if file exists (optional)
      });

    if (error) {
      console.error("Supabase Storage upload error:", error);
      throw error;
    }

    // Construct the public URL
    const { data: urlData } = supabaseAdmin.storage
      .from(targetBucket)
      .getPublicUrl(destinationPath);

    const publicURL = urlData?.publicUrl;

    if (!publicURL) {
      console.error("Could not retrieve public URL after Supabase upload.");
      return null;
    }

    console.log(`✅ Successfully uploaded to Supabase. Public URL: ${publicURL}`);

    // Cleanup local file *after* successful upload if source was a path
    if (isLocalFileCleanup && typeof fileSource === 'string') {
        try {
            await fs.rm(fileSource);
            console.log(`🧹 Cleaned up local file: ${fileSource}`);
        } catch (cleanupError) {
            console.warn(`⚠️ Failed to clean up local file ${fileSource} after upload:`, cleanupError);
        }
    }

    return publicURL;

  } catch (err: any) {
    console.error(`Error during Supabase upload process for destination ${destinationPath}:`, err.message || err);
    // Attempt to clean up local file even if upload failed, if source was a path
    if (typeof fileSource === 'string') {
        try {
            await fs.access(fileSource); // Check if file exists before trying to remove
            await fs.rm(fileSource);
            console.log(`🧹 Cleaned up local file ${fileSource} after failed upload attempt.`);
        } catch (cleanupError: any) { 
            // Ignore if file doesn't exist (already cleaned or never created)
            if (cleanupError.code !== 'ENOENT') { 
              console.warn(`⚠️ Failed to clean up local file ${fileSource} after failed upload:`, cleanupError); 
            }
        }
    }
    return null;
  }
} 

/**
 * Updates the status of a video job by checking Shotstack's API
 * @param videoId The ID of the video record in our database
 * @param shotstackId The ID of the render job in Shotstack
 * @returns The updated video status and URL (if available)
 */
export async function updateVideoStatusFromShotstack(videoId: string, shotstackId: string) {
  if (!supabaseAdmin) {
    console.error("Supabase Admin client is not initialized. Cannot update video status.");
    return null;
  }

  try {
    const shotstackApiKey = process.env.SHOTSTACK_API_KEY || "ovtvkcufDaBDRJnsTLHkMB3eLG6ytwlRoUAPAHPq";
    const shotstackEndpoint = process.env.SHOTSTACK_ENDPOINT || "https://api.shotstack.io/edit/stage";
    
    // Call Shotstack API to get the render status
    const response = await fetch(`${shotstackEndpoint}/render/${shotstackId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": shotstackApiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Shotstack API responded with status ${response.status}`);
    }

    const data = await response.json();
    console.log(`Shotstack status for render ${shotstackId}:`, data.response.status);

    let newStatus = "processing";
    let videoUrl = null;

    // Map Shotstack status to our status
    if (data.response.status === "done" || data.response.status === "processed") {
      newStatus = "completed";
      videoUrl = data.response.url;
    } else if (data.response.status === "failed") {
      newStatus = "failed";
    }

    // Update our database record
    const { error } = await supabaseAdmin
      .from('video_records_rezu')
      .update({
        status: newStatus,
        final_video_url: videoUrl,
        updated_at: new Date().toISOString(),
        error_message: data.response.error || null
      })
      .eq('id', videoId);

    if (error) {
      console.error("Error updating video record in Supabase:", error);
      return null;
    }

    return {
      status: newStatus,
      videoUrl
    };
  } catch (err: any) {
    console.error("Error checking Shotstack render status:", err);
    return null;
  }
}

/**
 * Attempts to get the duration of an audio file from a URL
 * Uses ffprobe to analyze the audio file and retrieve its duration
 * @param audioUrl URL of the audio file
 * @returns Duration in seconds, or null if it couldn't be determined
 */
export async function getAudioDuration(audioUrl: string): Promise<number | null> {
  try {
    console.log(`Getting duration for audio file: ${audioUrl}`);
    
    // We need to download the file first since ffprobe needs local access
    const tempFilePath = `/tmp/audio-${Date.now()}.mp3`;
    
    // Download the file
    const response = await fetch(audioUrl);
    if (!response.ok) {
      throw new Error(`Failed to download audio file: ${response.statusText}`);
    }
    
    const buffer = await response.arrayBuffer();
    await fs.writeFile(tempFilePath, new Uint8Array(buffer));
    
    // Use Node's child_process to run ffprobe
    const { execFile } = require('child_process');
    const util = require('util');
    const execFilePromise = util.promisify(execFile);
    
    // Run ffprobe to get JSON output with duration
    const { stdout } = await execFilePromise('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'json',
      tempFilePath
    ]);
    
    // Parse the JSON output
    const data = JSON.parse(stdout);
    const duration = parseFloat(data.format.duration);
    
    // Clean up the temp file
    try {
      await fs.unlink(tempFilePath);
    } catch (cleanupError) {
      console.warn(`Warning: Failed to clean up temp file ${tempFilePath}`, cleanupError);
    }
    
    console.log(`Audio duration detected: ${duration} seconds`);
    return duration;
  } catch (error) {
    console.error("Error getting audio duration:", error);
    
    // Fallback if ffprobe fails or is not available
    console.log("Using default duration as fallback");
    return 300; // Default to 5 minutes
  }
} 

/**
 * Deletes a user from Supabase authentication using admin privileges.
 * IMPORTANT: This function is intended for use in a secure server-side Node.js environment
 * as it uses the supabaseAdmin client initialized with the service role key.
 *
 * @param userId The UUID of the user to delete from auth.users.
 * @returns An object indicating success or failure, with an error message if applicable.
 */
export async function deleteSupabaseUser(userId: string): Promise<{ success: boolean; error?: string; data?: any }> {
  if (!supabaseAdmin) {
    console.error("Supabase Admin client is not initialized. Cannot delete user.");
    return { success: false, error: "Supabase Admin client not initialized." };
  }

  if (!userId) {
    console.error("User ID is required to delete a user.");
    return { success: false, error: "User ID is required." };
  }

  console.log(`Attempting to delete user with ID: ${userId} using admin client.`);

  try {
    const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      console.error(`Supabase error deleting user ${userId}:`, error.message);
      return { success: false, error: error.message, data };
    }

    console.log(`✅ Successfully deleted user ${userId} from Supabase auth.`, data);
    return { success: true, data };

  } catch (err: any) {
    console.error(`Unexpected error during Supabase user deletion for ${userId}:`, err.message || err);
    return { success: false, error: err.message || "An unexpected error occurred during user deletion." };
  }
} 

/**
 * Uploads API keys from a text file to the api_keys_rezu table
 * @param apiKeysText Text content with one API key per line
 * @param userId User ID for logging purposes
 * @returns Object with success status and details
 */
export async function uploadApiKeysToDatabase(apiKeysText: string, userId: string): Promise<{ success: boolean; error?: string; count?: number }> {
  if (!supabaseAdmin) {
    console.error("Supabase Admin client is not initialized. Cannot upload API keys.");
    return { success: false, error: "Supabase Admin client not initialized." };
  }

  try {
    // Split text by lines and filter out empty lines
    const apiKeys = apiKeysText
      .split('\n')
      .map(key => key.trim())
      .filter(key => key.length > 0);

    if (apiKeys.length === 0) {
      return { success: false, error: "No valid API keys found in the uploaded file." };
    }

    console.log(`Uploading ${apiKeys.length} API keys to database for user ${userId}`);

    // Prepare data for insertion
    const apiKeyRecords = apiKeys.map(apiKey => ({
      api_key: apiKey,
      is_valid: true,
      use_count: 0 // Initialize usage count to 0
    }));

    // Insert API keys into the database
    const { data, error } = await supabaseAdmin
      .from('api_keys_rezu')
      .insert(apiKeyRecords)
      .select();

    if (error) {
      console.error("Error inserting API keys into database:", error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Successfully uploaded ${apiKeys.length} API keys to database`);
    return { success: true, count: apiKeys.length };

  } catch (err: any) {
    console.error("Error uploading API keys:", err);
    return { success: false, error: err.message || "An unexpected error occurred during API key upload." };
  }
}

/**
 * Gets the first valid API key from the database for WellSaid Labs
 * Excludes keys that have reached the 50-usage limit
 * @returns The first valid API key or null if none found
 */
export async function getValidApiKey(): Promise<string | null> {
  if (!supabaseAdmin) {
    console.error("Supabase Admin client is not initialized. Cannot get API key.");
    return null;
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('api_keys_rezu')
      .select('api_key, use_count')
      .eq('is_valid', true)
      .lt('use_count', 50) // Only get keys with less than 50 uses
      .order('use_count', { ascending: true }) // Prefer keys with lower usage
      .limit(1)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        console.warn("No valid API keys found with usage under 50");
        return null;
      }
      console.error("Error fetching valid API key:", error);
      return null;
    }

    if (!data || !data.api_key) {
      console.warn("No valid API keys found in database");
      return null;
    }

    console.log(`✅ Retrieved valid API key from database (current usage: ${data.use_count}/50)`);
    console.log(`🔑 API key: ${data.api_key}`);
    return data.api_key;

  } catch (err: any) {
    console.error("Error getting valid API key:", err);
    return null;
  }
}

/**
 * Increments the usage count for an API key and marks it as invalid if it reaches 50 uses
 * @param apiKey The API key to increment usage for
 * @returns Success status and whether the key was marked invalid
 */
export async function incrementApiKeyUsage(apiKey: string): Promise<{ success: boolean; markedInvalid: boolean; newCount: number }> {
  if (!supabaseAdmin) {
    console.error("Supabase Admin client is not initialized. Cannot increment API key usage.");
    return { success: false, markedInvalid: false, newCount: 0 };
  }

  try {
    // First, get the current usage count
    const { data: currentData, error: fetchError } = await supabaseAdmin
      .from('api_keys_rezu')
      .select('use_count, is_valid')
      .eq('api_key', apiKey)
      .single();

    if (fetchError) {
      console.error("Error fetching current API key usage:", fetchError);
      return { success: false, markedInvalid: false, newCount: 0 };
    }

    const currentCount = currentData.use_count || 0;
    const newCount = currentCount + 1;
    const shouldMarkInvalid = newCount >= 50;

    // Update the usage count and potentially mark as invalid
    const { error: updateError } = await supabaseAdmin
      .from('api_keys_rezu')
      .update({ 
        use_count: newCount,
        is_valid: shouldMarkInvalid ? false : currentData.is_valid
      })
      .eq('api_key', apiKey);

    if (updateError) {
      console.error("Error updating API key usage:", updateError);
      return { success: false, markedInvalid: false, newCount: currentCount };
    }

    if (shouldMarkInvalid) {
      console.log(`🚫 API key marked as invalid after reaching ${newCount} uses`);
    } else {
      console.log(`📊 API key usage incremented to ${newCount}/50`);
    }

    return { 
      success: true, 
      markedInvalid: shouldMarkInvalid, 
      newCount: newCount 
    };

  } catch (err: any) {
    console.error("Error incrementing API key usage:", err);
    return { success: false, markedInvalid: false, newCount: 0 };
  }
}

/**
 * Marks an API key as invalid in the database
 * @param apiKey The API key to mark as invalid
 * @returns Success status
 */
export async function markApiKeyAsInvalid(apiKey: string): Promise<boolean> {
  if (!supabaseAdmin) {
    console.error("Supabase Admin client is not initialized. Cannot mark API key as invalid.");
    return false;
  }

  try {
    const { error } = await supabaseAdmin
      .from('api_keys_rezu')
      .update({ is_valid: false })
      .eq('api_key', apiKey);

    if (error) {
      console.error("Error marking API key as invalid:", error);
      return false;
    }

    console.log("✅ Marked API key as invalid in database");
    return true;

  } catch (err: any) {
    console.error("Error marking API key as invalid:", err);
    return false;
  }
}

/**
 * Gets statistics about API keys in the database
 * @returns Object with counts of valid and invalid API keys, plus usage statistics
 */
export async function getApiKeyStatistics(): Promise<{ 
  success: boolean; 
  validCount: number; 
  invalidCount: number; 
  totalCount: number; 
  usageLimitReached: number;
  averageUsage: number;
  error?: string 
}> {
  if (!supabaseAdmin) {
    console.error("Supabase Admin client is not initialized. Cannot get API key statistics.");
    return { 
      success: false, 
      validCount: 0, 
      invalidCount: 0, 
      totalCount: 0, 
      usageLimitReached: 0,
      averageUsage: 0,
      error: "Supabase Admin client not initialized." 
    };
  }

  try {
    // Get all API keys with their usage data
    const { data: allKeys, error: allKeysError } = await supabaseAdmin
      .from('api_keys_rezu')
      .select('is_valid, use_count');

    if (allKeysError) {
      console.error("Error fetching API key data:", allKeysError);
      return { 
        success: false, 
        validCount: 0, 
        invalidCount: 0, 
        totalCount: 0, 
        usageLimitReached: 0,
        averageUsage: 0,
        error: allKeysError.message 
      };
    }

    const validKeys = allKeys.filter(key => key.is_valid);
    const invalidKeys = allKeys.filter(key => !key.is_valid);
    const usageLimitReached = allKeys.filter(key => (key.use_count || 0) >= 50).length;
    
    // Calculate average usage
    const totalUsage = allKeys.reduce((sum, key) => sum + (key.use_count || 0), 0);
    const averageUsage = allKeys.length > 0 ? Math.round((totalUsage / allKeys.length) * 100) / 100 : 0;

    const validCount = validKeys.length;
    const invalidCount = invalidKeys.length;
    const totalCount = allKeys.length;

    console.log(`✅ API Key Statistics: ${validCount} valid, ${invalidCount} invalid, ${totalCount} total, ${usageLimitReached} reached limit, avg usage: ${averageUsage}`);
    
    return {
      success: true,
      validCount,
      invalidCount,
      totalCount,
      usageLimitReached,
      averageUsage
    };

  } catch (err: any) {
    console.error("Error getting API key statistics:", err);
    return { 
      success: false, 
      validCount: 0, 
      invalidCount: 0, 
      totalCount: 0, 
      usageLimitReached: 0,
      averageUsage: 0,
      error: err.message || "An unexpected error occurred." 
    };
  }
} 