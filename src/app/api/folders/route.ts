import { NextRequest, NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { google } from 'googleapis';

async function fetchFolderContents(
  drive: any,
  folderId: string = 'root'
): Promise<any[]> {
  console.log('fetching folder contents');
  const response = await drive.files.list({
    q: `'${folderId}' in parents`,
    fields: 'files(id, name, mimeType, fileExtension, size, iconLink)',
  });

  console.log(response.data.files);

  const items = await Promise.all(
    response.data.files.map(async (file: any) => {
      const item: any = {
        id: file.id,
        name: file.name,
        type:
          file.mimeType === 'application/vnd.google-apps.folder'
            ? 'folder'
            : 'file',
        extension: file.fileExtension,
        size: file.size,
        icon: file.iconLink,
      };

      if (item.type === 'folder') {
        item.children = await fetchFolderContents(drive, file.id);
      }

      return item;
    })
  );

  return items;
}

export async function GET(req: NextRequest) {
  console.log('getting token');
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  console.log('token', token);

  if (!token || !token.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  console.log('token', token);
  console.log('token.accessToken', token.accessToken);

  try {
    const auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );


    auth.setCredentials({
      access_token: token.accessToken as string,
      refresh_token: token.refreshToken as string,
      expiry_date: token.expiresAt
        ? (token.expiresAt as number) * 1000
        : undefined,
    });

    const drive = google.drive({ version: 'v3', auth });
    console.log('drive', drive);
    const structure = await fetchFolderContents(drive);
    console.log('structure', structure);
    return NextResponse.json({ structure });
  } catch (error) {
    console.error('Error fetching folder structure:', error);
    return NextResponse.json(
      { error: 'Failed to fetch folder structure' },
      { status: 500 }
    );
  }
}