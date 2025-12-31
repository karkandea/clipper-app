const fs = require('fs');
const path = require('path');
const YTDlpWrap = require('yt-dlp-wrap').default;

// Function to ensure directory exists
function ensureDirectoryExistence(filePath) {
  const dirname = path.dirname(filePath);
  if (fs.existsSync(dirname)) {
    return true;
  }
  ensureDirectoryExistence(dirname);
  fs.mkdirSync(dirname);
}

(async () => {
  try {
    console.log('Downloading yt-dlp binary...');
    
    // Define where to download the binary
    // In Vercel, we can try to put it in a 'bin' folder in the root or /tmp
    // But relying on a local folder in the project is safer for the build phase persistence logic (sometimes).
    // Let's put it in ./bin/yt-dlp
    
    const binDir = path.join(process.cwd(), 'bin');
    const binaryPath = path.join(binDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    // Initialize yt-dlp-wrap
    // If we don't pass a path, it tries to find it. We want to download it.
    
    // Download the latest release
    await YTDlpWrap.downloadFromGithub(binaryPath);
    
    console.log(`yt-dlp downloaded successfully to ${binaryPath}`);
    
    // Ensure executable permissions on Unix-like systems
    if (process.platform !== 'win32') {
      fs.chmodSync(binaryPath, '755');
    }
  } catch (error) {
    console.error('Error downloading yt-dlp:', error);
    process.exit(1);
  }
})();
