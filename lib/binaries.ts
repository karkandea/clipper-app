import path from 'path';
import fs from 'fs';

export function getYtDlpPath(): string {
  // Check for local binary (installed via postinstall)
  const localBinary = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  
  console.log('DEBUG: Looking for yt-dlp at:', localBinary);
  console.log('DEBUG: Available files in bin:', fs.existsSync(path.join(process.cwd(), 'bin')) ? fs.readdirSync(path.join(process.cwd(), 'bin')) : 'bin dir not found');
  
  if (fs.existsSync(localBinary)) {
    console.log('DEBUG: Found local yt-dlp binary');
    return localBinary;
  }

  console.log('DEBUG: Local binary not found, falling back to global command');
  // Fallback to global command
  return 'yt-dlp';
}
