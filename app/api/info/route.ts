import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';

import { getYtDlpPath } from '@/lib/binaries';

const execPromise = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const { videoId } = await req.json();

    if (!videoId) {
      return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
    }

    console.log(`Fetching info for: ${videoId}`);

    const ytDlpPath = getYtDlpPath();
    const command = `${ytDlpPath} --dump-json https://www.youtube.com/watch?v=${videoId}`;
    const { stdout, stderr } = await execPromise(command);

    if (stderr && !stdout) {
      console.error(`yt-dlp error: ${stderr}`);
      return NextResponse.json({ error: 'Failed to fetch video info' }, { status: 500 });
    }

    const videoInfo = JSON.parse(stdout);
    const formats = videoInfo.formats || [];

    const videoQualities = new Set<number>();
    const audioQualities = new Set<number>();

    for (const f of formats) {
      if (f.vcodec !== 'none' && f.height) {
        videoQualities.add(f.height);
      }
      if (f.acodec !== 'none' && f.abr) {
        audioQualities.add(Math.round(f.abr));
      }
    }

    return NextResponse.json({
      video: Array.from(videoQualities).sort((a, b) => b - a),
      audio: Array.from(audioQualities).sort((a, b) => b - a),
      title: videoInfo.title || 'Unknown Title',
      duration: videoInfo.duration || 0,
    });
  } catch (error: any) {
    console.error('Error in /api/info:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
