import path from 'path';
import fs from 'fs';

export function getYtDlpPath(): string {
  // Check for vendored Linux binary (for Vercel)
  const vendoredLinuxBinary = path.join(process.cwd(), 'bin', 'yt-dlp-linux');
  
  // Debug info
  console.log('DEBUG: Platform:', process.platform);
  console.log('DEBUG: Checking for vendored binary at:', vendoredLinuxBinary);

  if (process.platform === 'linux' && fs.existsSync(vendoredLinuxBinary)) {
     console.log('DEBUG: Found vendored Linux binary');
     return vendoredLinuxBinary;
  }

  // Check for local install (mac/local dev)
  const localBinary = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  console.log('DEBUG: Checking for local binary at:', localBinary);
  
  if (fs.existsSync(localBinary)) {
    console.log('DEBUG: Found local yt-dlp binary');
    return localBinary;
  }

  console.log('DEBUG: Local binary not found, falling back to global command');
  // Fallback to global command
  return 'yt-dlp';
}
