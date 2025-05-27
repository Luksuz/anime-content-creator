import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { google } from 'googleapis';
import { Readable } from 'stream';

export async function POST(req: NextRequest) {
  console.log("Upload request received");
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token || !token.accessToken) {
    console.error("Upload failed: Not authenticated");
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // --- 1. Parse multipart/form-data --- 
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const parentId = (formData.get('parentId') as string) || 'root'; // Default to root if not specified

    if (!file) {
      console.error("Upload failed: No file provided in form data");
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    console.log(`Attempting to upload '${file.name}' to folder ID: ${parentId}`);

    // --- 2. Setup Google Drive API Client --- 
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    // Crucially, set the credentials obtained from the token
    auth.setCredentials({
      access_token: token.accessToken as string,
      refresh_token: token.refreshToken as string,
      expiry_date: token.expiresAt
        ? (token.expiresAt as number) * 1000
        : undefined,
    });
    const drive = google.drive({ version: 'v3', auth });

    // --- 3. Convert File to ReadableStream --- 
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const fileStream = Readable.from(fileBuffer);

    // --- 4. Call drive.files.create --- 
    console.log(`Calling drive.files.create for ${file.name}...`);
    const response = await drive.files.create({
      requestBody: {
        name: file.name,
        parents: [parentId], // Specify parent folder
      },
      media: {
        mimeType: file.type,
        body: fileStream, 
      },
      fields: 'id, name, webViewLink', // Request fields useful for feedback
    });

    console.log(`File Upload Successful: ID=${response.data.id}, Name=${response.data.name}`);
    return NextResponse.json({
      success: true,
      fileId: response.data.id,
      fileName: response.data.name,
      fileLink: response.data.webViewLink,
    });

  } catch (error: any) {
    console.error('Error uploading file to Google Drive:', error);
    // Extract more specific error details if available (e.g., from Google API response)
    const errorMessage = error.response?.data?.error?.message || error.message || 'Failed to upload file';
    // Attempt to get a more specific status code if it's a Google API error
    const status = error.response?.data?.error?.code || (error.code === 'ENOENT' ? 400 : 500);
    return NextResponse.json({ error: errorMessage }, { status });
  }
} 