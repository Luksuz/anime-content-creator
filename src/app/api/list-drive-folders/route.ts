import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { google, drive_v3 } from 'googleapis';

interface DriveFolder {
  id: string;
  name: string;
}

async function fetchAllFoldersRecursive(
  drive: drive_v3.Drive,
  folderId: string = 'root',
  allFolders: DriveFolder[] = [],
  path: string = '' // To build a breadcrumb-like path for display
): Promise<DriveFolder[]> {
  try {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: 'files(id, name)',
      spaces: 'drive',
    });

    const currentLevelFolders = response.data.files || [];

    for (const folder of currentLevelFolders) {
      if (folder.id && folder.name) {
        const fullPath = path ? `${path} / ${folder.name}` : folder.name;
        allFolders.push({ id: folder.id, name: fullPath });
        // Recursively fetch subfolders
        await fetchAllFoldersRecursive(drive, folder.id, allFolders, fullPath);
      }
    }
  } catch (error) {
    console.warn(`Could not fetch folders for folderId ${folderId}:`, error);
    // Continue fetching other folders even if one branch fails
  }
  return allFolders;
}

export async function GET(req: NextRequest) {
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  if (!token || !token.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    auth.setCredentials({
      access_token: token.accessToken as string,
      refresh_token: token.refreshToken as string,
      expiry_date: token.expiresAt ? (token.expiresAt as number) * 1000 : undefined,
    });

    const drive = google.drive({ version: 'v3', auth });
    const folders: DriveFolder[] = [];
    await fetchAllFoldersRecursive(drive, 'root', folders, ''); // Initial call for root children
    
    // Add root folder explicitly at the beginning
    folders.unshift({ id: 'root', name: 'My Drive (Root)' });

    return NextResponse.json({ folders });

  } catch (error: any) {
    console.error('Error fetching Google Drive folder list:', error);
    return NextResponse.json(
      { error: 'Failed to fetch folder list', details: error.message },
      { status: 500 }
    );
  }
} 