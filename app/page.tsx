'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

// Declaration for YouTube API
declare global {
  interface Window {
    onYouTubeIframeAPIReady: () => void;
    YT: any;
  }
}

export default function YouTubeClipper() {
  // State
  const [videoId, setVideoId] = useState<string>('');
  const [urlInput, setUrlInput] = useState<string>('');
  const [duration, setDuration] = useState<number>(0);
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlayerReady, setIsPlayerReady] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [activeHandle, setActiveHandle] = useState<'start' | 'end' | null>(null);
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [isPreviewDisabled, setIsPreviewDisabled] = useState<boolean>(false);
  
  // UI States
  const [showTimeline, setShowTimeline] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [loadingOverlay, setLoadingOverlay] = useState<{show: boolean, message: string, progress: number}>({
    show: false,
    message: '',
    progress: 0
  });
  const [toast, setToast] = useState<{show: boolean, message: string}>({show: false, message: ''});
  
  // Download Options
  const [selectedFormat, setSelectedFormat] = useState<'mp4' | 'webm' | 'mp3'>('mp4');
  const [selectedVideoQuality, setSelectedVideoQuality] = useState<string>('720');
  const [selectedAudioQuality, setSelectedAudioQuality] = useState<string>('128');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [autoCaption, setAutoCaption] = useState<boolean>(false);
  const [availableFormats, setAvailableFormats] = useState<{video: number[], audio: number[]}>({video: [], audio: []});

  // Refs
  const playerRef = useRef<any>(null);
  const playerWrapperRef = useRef<HTMLDivElement>(null);
  const timelineTrackRef = useRef<HTMLDivElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Time Formatting
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) seconds = 0;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // YouTube URL Parser
  const extractVideoId = (url: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&?\s]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const extractTimestamp = (url: string) => {
    const match = url.match(/[?&]t=(\d+)/);
    return match ? parseInt(match[1]) : 0;
  };

  // Show Toast
  const showToastMessage = (message: string) => {
    setToast({ show: true, message });
    setTimeout(() => setToast({ show: false, message: '' }), 2500);
  };

  // Load YouTube API
  useEffect(() => {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

    window.onYouTubeIframeAPIReady = () => {
      console.log('YouTube API Ready');
    };

    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, []);

  // Initialize/Update Player
  const loadVideo = (id: string) => {
    console.log('Loading video:', id);
    if (window.YT && window.YT.Player) {
      // If player already exists, try to reuse it
      if (playerRef.current && typeof playerRef.current.loadVideoById === 'function') {
         console.log('Reusing existing player');
         playerRef.current.loadVideoById(id);
      } else {
        // If player instance is broken or doesn't exist, create new one
        console.log('Creating new player instance');
        
        // Cleanup if reference exists but might be stale
        if (playerRef.current) {
            try { playerRef.current.destroy(); } catch(e) { console.warn('Cleanup error', e); }
        }

        // Manually create the element to ensure React doesn't mess with it
        if (!playerWrapperRef.current) return;
        playerWrapperRef.current.innerHTML = ''; // Clear previous
        const newPlayerEl = document.createElement('div');
        newPlayerEl.id = 'player-target';
        playerWrapperRef.current.appendChild(newPlayerEl);

        playerRef.current = new window.YT.Player(newPlayerEl, {
          videoId: id,
          playerVars: {
            'playsinline': 1,
            'modestbranding': 1,
            'rel': 0,
            'fs': 1,
            'enablejsapi': 1,
            'origin': typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'
          },
          events: {
            'onReady': (event: any) => {
              console.log('Player Ready');
              setIsPlayerReady(true);
              const dur = event.target.getDuration();
              setDuration(dur);
              setEndTime(dur);
              setShowTimeline(true);
              showToastMessage('Video loaded! ✓');
            },
            'onStateChange': (event: any) => {
              // Auto-pause at end time
              if (event.data === window.YT.PlayerState.PLAYING) {
                if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
                progressIntervalRef.current = setInterval(() => {
                  // Check if player is still valid
                  if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;
                  
                  const curr = playerRef.current.getCurrentTime();
                  setCurrentTime(curr);
                  if (curr >= endTime) {
                    playerRef.current.pauseVideo();
                  }
                }, 100);
              } else {
                if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
              }
            },
            'onError': (event: any) => {
              console.error('Player Error:', event.data);
              const errorMessages: any = {
                2: 'Invalid video ID.',
                5: 'HTML5 player error.',
                100: 'Video not found.',
                101: 'Embedding disabled.',
                150: 'Embedding disabled.'
              };
              const errorCode = event.data;
              const errorMsg = errorMessages[errorCode] || 'Player error';
              
              if (errorCode === 101 || errorCode === 150) {
                showToastMessage('Preview disabled by owner. Switching to manual mode... ⚠️');
                setIsPreviewDisabled(true);
                setIsPlayerReady(false);
                fetchVideoMetadata(id);
              } else {
                showToastMessage(errorMsg + ' ❌');
                setIsPlayerReady(false);
              }
            }
          }
        });
      }
    } else {
        console.error('YouTube API not ready yet');
        // Retry logic could go here
        setTimeout(() => loadVideo(id), 1000);
    }
  };

  const fetchVideoMetadata = async (id: string) => {
    setLoadingOverlay({ show: true, message: 'Fetching video info...', progress: 0 });
    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: id })
      });
      const data = await res.json();
      if (res.ok) {
        setDuration(data.duration);
        setEndTime(data.duration);
        setVideoTitle(data.title);
        setAvailableFormats({ video: data.video, audio: data.audio });
        setShowTimeline(true);
        // Reset valid check if needed
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      showToastMessage('Failed to fetch info ⚠️');
    } finally {
      setLoadingOverlay({ show: false, message: '', progress: 0 });
    }
  };

  const handleLoadBtn = () => {
    const id = extractVideoId(urlInput);
    if (!id) {
      showToastMessage('Invalid YouTube URL ❌');
      return;
    }
    setVideoId(id);
    setIsPreviewDisabled(false); // Reset state
    const ts = extractTimestamp(urlInput);
    setStartTime(ts);
    loadVideo(id);
  };

  // Timeline Interaction
  const handleDrag = useCallback((e: any) => {
    if (!isDragging || !activeHandle || !timelineTrackRef.current) return;
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const rect = timelineTrackRef.current.getBoundingClientRect();
    let percent = (clientX - rect.left) / rect.width;
    percent = Math.max(0, Math.min(1, percent));
    
    const time = percent * duration;
    
    if (activeHandle === 'start') {
      setStartTime(Math.max(0, Math.min(time, endTime - 1)));
    } else {
      setEndTime(Math.min(duration, Math.max(time, startTime + 1)));
    }
  }, [isDragging, activeHandle, duration, startTime, endTime]);

  const endDrag = useCallback(() => {
    setIsDragging(false);
    setActiveHandle(null);
    document.body.style.cursor = '';
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag);
      window.addEventListener('mouseup', endDrag);
      window.addEventListener('touchmove', handleDrag);
      window.addEventListener('touchend', endDrag);
    } else {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchmove', handleDrag);
      window.removeEventListener('touchend', endDrag);
    }
    return () => {
      window.removeEventListener('mousemove', handleDrag);
      window.removeEventListener('mouseup', endDrag);
      window.removeEventListener('touchmove', handleDrag);
      window.removeEventListener('touchend', endDrag);
    };
  }, [isDragging, handleDrag, endDrag]);

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (isDragging || !timelineTrackRef.current || !playerRef.current) return;
    const rect = timelineTrackRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = percent * duration;
    playerRef.current.seekTo(time, true);
  };

  // Actions
  const previewClip = () => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(startTime, true);
    playerRef.current.playVideo();
    showToastMessage('Playing clip preview ▶️');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToastMessage('Copied! 📋');
  };

  const handleDownloadBtn = async () => {
    if (!videoId) return;
    const clipDur = endTime - startTime;
    if (clipDur <= 0 || clipDur > 600) {
      showToastMessage('Clip must be 1s - 10m ⚠️');
      return;
    }

    setLoadingOverlay({ show: true, message: 'Checking formats...', progress: 0 });
    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId })
      });
      const data = await res.json();
      if (res.ok) {
        setAvailableFormats({ video: data.video, audio: data.audio });
        setVideoTitle(data.title);
        setShowModal(true);
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      showToastMessage('Failed to fetch info ⚠️');
    } finally {
      setLoadingOverlay({ show: false, message: '', progress: 0 });
    }
  };

  const startDownload = async () => {
    setShowModal(false);
    setLoadingOverlay({ show: true, message: 'Processing with AI... Please wait', progress: 0 });
    
    // Simulate progress
    const int = setInterval(() => {
      setLoadingOverlay(prev => ({
        ...prev,
        progress: Math.min(prev.progress + Math.random() * 5, 95)
      }));
    }, 1000);

    try {
      const res = await fetch('/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId,
          startTime: Math.floor(startTime),
          endTime: Math.floor(endTime),
          format: selectedFormat,
          quality: selectedVideoQuality,
          audioQuality: selectedAudioQuality,
          aspectRatio,
          autoCaption,
          smartCrop: aspectRatio === '9:16'
        })
      });
      const data = await res.json();
      if (res.ok) {
        setLoadingOverlay({ show: true, message: 'Download ready!', progress: 100 });
        const link = document.createElement('a');
        link.href = data.downloadUrl;
        link.download = data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToastMessage('Download complete! ✅');
      } else {
        throw new Error(data.error);
      }
    } catch (e: any) {
      showToastMessage('Download failed ❌');
    } finally {
      clearInterval(int);
      setTimeout(() => setLoadingOverlay({ show: false, message: '', progress: 0 }), 1000);
    }
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-icon">🎬</span>
          <h1>YouTube Clipper</h1>
        </div>
        <p className="tagline">Clip & Share video moments dengan mudah</p>
      </header>

      {/* URL Input */}
      <section className="url-section glass-card">
        <div className="input-wrapper">
          <span className="input-icon">🔗</span>
          <input 
            type="text" 
            className="url-input" 
            placeholder="Paste YouTube URL di sini..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleLoadBtn()}
          />
          <button className="btn btn-primary" onClick={handleLoadBtn}>
            <span>Load</span>
            <span className="btn-icon">→</span>
          </button>
        </div>
        <p className="input-hint">Contoh: https://youtube.com/watch?v=xxxxx atau https://youtu.be/xxxxx</p>
      </section>

      {/* Video Player */}
      <section className="video-section glass-card">
        <div className="video-container" ref={playerContainerRef}>
          {!isPlayerReady && (
            <div className="player-placeholder">
              <span className="placeholder-icon">{isPreviewDisabled ? '🚫' : '📺'}</span>
              <p>{isPreviewDisabled ? 'Preview tidak tersedia (Embedding Disabled)' : 'Video akan muncul di sini'}</p>
              {isPreviewDisabled && <p style={{fontSize: '0.9rem', opacity: 0.8, marginTop: '0.5rem'}}>Anda tetap bisa download clip ini via timeline di bawah</p>}
            </div>
          )}
          <div ref={playerWrapperRef} style={{ width: '100%', height: '100%' }}></div>
        </div>
      </section>

      {/* Timeline */}
      <section className={`timeline-section glass-card ${showTimeline ? 'visible' : ''}`}>
        <h2 className="section-title">
          <span className="section-icon">✂️</span>
          Pilih Clip
        </h2>
        <div className="timeline-container">
          <div 
            className="timeline-track" 
            ref={timelineTrackRef}
            onClick={handleTimelineClick}
          >
            <div className="timeline-selection" style={{
              left: `${(startTime / duration) * 100}%`,
              width: `${((endTime - startTime) / duration) * 100}%`
            }}></div>
            <div 
              className="timeline-handle handle-start" 
              style={{ left: `${(startTime / duration) * 100}%` }}
              onMouseDown={(e) => { e.stopPropagation(); setIsDragging(true); setActiveHandle('start'); }}
              onTouchStart={(e) => { e.stopPropagation(); setIsDragging(true); setActiveHandle('start'); }}
            >
              <span className="handle-label">START</span>
            </div>
            <div 
              className="timeline-handle handle-end" 
              style={{ left: `${(endTime / duration) * 100}%` }}
              onMouseDown={(e) => { e.stopPropagation(); setIsDragging(true); setActiveHandle('end'); }}
              onTouchStart={(e) => { e.stopPropagation(); setIsDragging(true); setActiveHandle('end'); }}
            >
              <span className="handle-label">END</span>
            </div>
            <div 
              className="timeline-playhead" 
              style={{ left: `${(currentTime / duration) * 100}%` }}
            ></div>
          </div>
          <div className="timeline-labels">
            <span>{formatTime(0)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Time Controls */}
        <div className="time-controls">
          <div className="time-input-group">
            <label>Start Time</label>
            <div className="time-input-wrapper">
              <input type="text" className="time-input" value={formatTime(startTime)} readOnly />
              <button className="btn-small" onClick={() => setStartTime(currentTime)}>📍</button>
            </div>
            <div className="fine-tune-controls">
              <button className="btn-tiny" onClick={() => setStartTime(Math.max(0, startTime - 5))}>-5s</button>
              <button className="btn-tiny" onClick={() => setStartTime(Math.max(0, startTime - 1))}>-1s</button>
              <button className="btn-tiny" onClick={() => setStartTime(Math.min(endTime - 1, startTime + 1))}>+1s</button>
              <button className="btn-tiny" onClick={() => setStartTime(Math.min(endTime - 1, startTime + 5))}>+5s</button>
            </div>
          </div>
          <div className="time-display">
            <span className="duration-label">Durasi Clip</span>
            <span className="duration-value">{formatTime(endTime - startTime)}</span>
          </div>
          <div className="time-input-group">
            <label>End Time</label>
            <div className="time-input-wrapper">
              <input type="text" className="time-input" value={formatTime(endTime)} readOnly />
              <button className="btn-small" onClick={() => setEndTime(currentTime)}>📍</button>
            </div>
            <div className="fine-tune-controls">
              <button className="btn-tiny" onClick={() => setEndTime(Math.max(startTime + 1, endTime - 5))}>-5s</button>
              <button className="btn-tiny" onClick={() => setEndTime(Math.max(startTime + 1, endTime - 1))}>-1s</button>
              <button className="btn-tiny" onClick={() => setEndTime(Math.min(duration, endTime + 1))}>+1s</button>
              <button className="btn-tiny" onClick={() => setEndTime(Math.min(duration, endTime + 5))}>+5s</button>
            </div>
          </div>
        </div>
      </section>

      {/* Action Buttons */}
      <section className={`actions-section ${showTimeline ? 'visible' : ''}`}>
        <button className="btn btn-action" onClick={previewClip}>▶️ Preview Clip</button>
        <button className="btn btn-action btn-download" onClick={handleDownloadBtn}>⬇️ Download Clip</button>
        <button className="btn btn-action" onClick={() => copyToClipboard(`https://youtu.be/${videoId}?t=${Math.floor(startTime)}`)}>📋 Copy Link</button>
        <button className="btn btn-action" onClick={() => copyToClipboard(`Start: ${formatTime(startTime)}\nEnd: ${formatTime(endTime)}`)}>⏱️ Timestamps</button>
      </section>

      {/* Result Link */}
      <section className={`result-section glass-card ${showTimeline ? 'visible' : ''}`}>
        <h2 className="section-title">🔗 Generated Link</h2>
        <div className="result-content">
          <input 
            type="text" 
            className="result-input" 
            readOnly 
            value={`https://youtu.be/${videoId}?t=${Math.floor(startTime)}`}
          />
          <button className="btn btn-copy" onClick={() => copyToClipboard(`https://youtu.be/${videoId}?t=${Math.floor(startTime)}`)}>📋</button>
        </div>
        <p className="result-hint">Clip: {formatTime(startTime)} → {formatTime(endTime)}</p>
      </section>

      {/* Toast */}
      <div className={`toast ${toast.show ? 'show' : ''}`}>
        <span className="toast-icon">✓</span>
        <span className="toast-message">{toast.message}</span>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay show" onClick={() => setShowModal(false)}>
          <div className="modal glass-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📥 Download Options</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="option-group">
                <label className="option-label">Format</label>
                <div className="option-buttons">
                  <button className="option-btn" data-selected={selectedFormat === 'mp4'} onClick={() => setSelectedFormat('mp4')}>🎬 MP4</button>
                  <button className="option-btn" data-selected={selectedFormat === 'webm'} onClick={() => setSelectedFormat('webm')}>🌐 WEBM</button>
                  <button className="option-btn" data-selected={selectedFormat === 'mp3'} onClick={() => setSelectedFormat('mp3')}>🎵 MP3</button>
                </div>
              </div>

              {selectedFormat !== 'mp3' ? (
                <div className="option-group">
                  <label className="option-label">Video Quality</label>
                  <div className="option-buttons quality-grid">
                    {[144, 360, 480, 720, 1080, 1440, 2160].map(q => (
                      <button 
                        key={q}
                        className={`option-btn option-btn-sm ${!availableFormats.video.includes(q) ? 'disabled' : ''}`}
                        data-selected={selectedVideoQuality === q.toString()}
                        disabled={!availableFormats.video.includes(q)}
                        onClick={() => setSelectedVideoQuality(q.toString())}
                      >
                        {q}p
                      </button>
                    ))}
                  </div>
                  <div className="option-group" style={{marginTop: '1.5rem'}}>
                    <label className="option-label">AI Enhancements ✨</label>
                    <div className="ai-controls">
                      <div className="control-row">
                        <span className="control-label">Aspect Ratio</span>
                        <div className="toggle-group">
                          <button className={`toggle-btn ${aspectRatio === '16:9' ? 'active' : ''}`} onClick={() => setAspectRatio('16:9')}>16:9</button>
                          <button className={`toggle-btn ${aspectRatio === '9:16' ? 'active' : ''}`} onClick={() => setAspectRatio('9:16')}>9:16 (Smart)</button>
                        </div>
                      </div>
                      <div className="control-row">
                        <span className="control-label">Auto Caption</span>
                        <label className="switch">
                          <input type="checkbox" checked={autoCaption} onChange={e => setAutoCaption(e.target.checked)} />
                          <span className="slider round"></span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="option-group">
                  <label className="option-label">Audio Quality</label>
                  <div className="option-buttons">
                    <button className="option-btn" data-selected={selectedAudioQuality === '64'} onClick={() => setSelectedAudioQuality('64')}>Low</button>
                    <button className="option-btn" data-selected={selectedAudioQuality === '128'} onClick={() => setSelectedAudioQuality('128')}>Medium</button>
                    <button className="option-btn" data-selected={selectedAudioQuality === '192'} onClick={() => setSelectedAudioQuality('192')}>High</button>
                  </div>
                </div>
              )}

              <div className="clip-info">
                <span className="clip-info-label">Clip Duration:</span>
                <span className="clip-info-value">{formatTime(endTime - startTime)}</span>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary btn-download-confirm" onClick={startDownload}>Download</button>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {loadingOverlay.show && (
        <div className="loading-overlay show">
          <div className="loading-content glass-card">
            <div className="loading-spinner"></div>
            <h3>Please Wait</h3>
            <p className="loading-message">{loadingOverlay.message}</p>
            <div className="loading-progress">
              <div className="loading-progress-bar" style={{ width: `${loadingOverlay.progress}%` }}></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
