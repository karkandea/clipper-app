import path from 'path';
import fs from 'fs';

export function getYtDlpPath(): string {
  // Check for local binary (installed via postinstall)
  const localBinary = path.join(process.cwd(), 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
  
  if (fs.existsSync(localBinary)) {
    return localBinary;
  }

  // Fallback to global command if specific binary not found (though postinstall should have handled it)
  return 'yt-dlp';
}
