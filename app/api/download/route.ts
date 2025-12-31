import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

import { getYtDlpPath } from '@/lib/binaries';

const execPromise = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const data = await req.json();
    const { videoId, startTime, endTime, format, quality, audioQuality, aspectRatio, autoCaption, smartCrop } = data;

    if (!videoId) {
      return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
    }

    const downloadsDir = path.join(process.cwd(), 'public', 'downloads');
    if (!fs.existsSync(downloadsDir)) {
      fs.mkdirSync(downloadsDir, { recursive: true });
    }

    const baseFileName = `clip_${videoId}_${startTime}_${endTime}`;
    let outputFileName = `${baseFileName}.${format}`;
    let outputPath = path.join(downloadsDir, outputFileName);

    console.log(`Downloading clip: ${videoId} (${startTime}-${endTime}s) [${format}]`);

    const ytDlpPath = getYtDlpPath();
    let downloadCommand = '';
    if (format === 'mp3') {
      downloadCommand = `${ytDlpPath} -x --audio-format mp3 --download-sections "*${startTime}-${endTime}" -o "${outputPath}" --force-overwrites "https://www.youtube.com/watch?v=${videoId}"`;
    } else {
      const formatSelector = `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]`;
      downloadCommand = `${ytDlpPath} -f "${formatSelector}" --download-sections "*${startTime}-${endTime}" --merge-output-format mp4 -o "${outputPath}" --force-overwrites "https://www.youtube.com/watch?v=${videoId}"`;
    }

    console.log(`Running: ${downloadCommand}`);
    await execPromise(downloadCommand);

    // Verify file exists (yt-dlp might change extension)
    if (!fs.existsSync(outputPath)) {
        const files = fs.readdirSync(downloadsDir);
        const matchingFile = files.find(f => f.startsWith(baseFileName));
        if (matchingFile) {
            outputFileName = matchingFile;
            outputPath = path.join(downloadsDir, outputFileName);
        } else {
            throw new Error('Download failed: Output file not found');
        }
    }

    let currentPath = outputPath;

    // AI Processing
    // Note: We'll call the python scripts directly
    const pythonPath = 'python3'; // Or path to venv python

    // 1. Smart Crop
    if (smartCrop || aspectRatio === '9:16') {
        process.env.PYTHONPATH = path.join(process.cwd(), 'lib', 'python');
        const cropOutput = currentPath.replace(/(\.[\w\d]+)$/, '_crop$1');
        const cropScript = path.join(process.cwd(), 'lib', 'python', 'ai_modules', 'smart_crop.py');
        
        console.log('Applying Smart Crop...');
        // We'll run a small wrapper command to call the function in the script
        // Or modify the scripts to be CLI-runnable. Let's assume they have a __main__ block or we write a tiny wrapper.
        // Looking at server.py, it imports them. 
        // We can run: python3 -c "import ai_modules.smart_crop; ai_modules.smart_crop.smart_crop_video('in', 'out')"
        const cropCmd = `${pythonPath} -c "import sys; sys.path.append('lib/python'); from ai_modules import smart_crop; smart_crop.smart_crop_video('${currentPath}', '${cropOutput}')"`;
        
        try {
            await execPromise(cropCmd);
            if (fs.existsSync(cropOutput)) {
                if (currentPath !== outputPath) fs.unlinkSync(currentPath);
                currentPath = cropOutput;
                console.log('✅ Smart Crop successful');
            }
        } catch (e) {
            console.error('❌ Smart Crop failed:', e);
        }
    }

    // 2. Auto Caption
    if (autoCaption) {
        const captionOutput = currentPath.replace(/(\.[\w\d]+)$/, '_caption$1');
        const captionCmd = `${pythonPath} -c "import sys; sys.path.append('lib/python'); from ai_modules import caption; caption.add_captions('${currentPath}', '${captionOutput}', model_size='base')"`;
        
        console.log('Applying Auto Captions...');
        try {
            await execPromise(captionCmd);
            if (fs.existsSync(captionOutput)) {
                if (currentPath !== outputPath) fs.unlinkSync(currentPath);
                currentPath = captionOutput;
                console.log('✅ Auto Caption successful');
            }
        } catch (e) {
            console.error('❌ Auto Caption failed:', e);
        }
    }

    // 3. Final Compatibility Fix (Re-encode to H.264/AAC)
    console.log('Ensuring compatibility (H.264/AAC)...');
    const finalOutput = currentPath.replace(/(\.[\w\d]+)$/, '_fixed.mp4');
    const finalEncodingCmd = `ffmpeg -y -i "${currentPath}" -c:v libx264 -preset fast -crf 23 -c:a aac -b:a 128k -movflags +faststart "${finalOutput}"`;
    
    try {
        await execPromise(finalEncodingCmd);
        if (fs.existsSync(finalOutput)) {
            if (currentPath !== outputPath) fs.unlinkSync(currentPath);
            currentPath = finalOutput;
            console.log('✅ Final encoding successful');
        }
    } catch (e) {
        console.error('❌ Final encoding failed:', e);
    }

    const finalFileName = path.basename(currentPath);

    return NextResponse.json({
      downloadUrl: `/downloads/${finalFileName}`,
      filename: finalFileName
    });

  } catch (error: any) {
    console.error('Error in /api/download:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
