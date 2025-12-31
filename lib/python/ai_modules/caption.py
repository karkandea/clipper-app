import whisper
import os
import subprocess
import datetime

def format_timestamp(seconds):
    """Converts seconds to SRT timestamp format (HH:MM:SS,mmm)"""
    td = datetime.timedelta(seconds=seconds)
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    millis = int(td.microseconds / 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"

def generate_srt(transcription, srt_path):
    """Generates SRT file from Whisper transcription"""
    with open(srt_path, "w", encoding="utf-8") as f:
        for i, segment in enumerate(transcription['segments']):
            start = format_timestamp(segment['start'])
            end = format_timestamp(segment['end'])
            text = segment['text'].strip()
            
            f.write(f"{i+1}\n")
            f.write(f"{start} --> {end}\n")
            f.write(f"{text}\n\n")

def add_captions(input_path, output_path, model_size="base"):
    """
    Transcribes video and burns subtitles.
    """
    print(f"Transcribing with Whisper ({model_size})...")
    
    # 1. Transcribe
    model = whisper.load_model(model_size)
    result = model.transcribe(input_path)
    
    # 2. Generate SRT
    base_name = os.path.splitext(input_path)[0]
    srt_path = f"{base_name}.srt"
    generate_srt(result, srt_path)
    
    print("Burning subtitles...")
    
    # 3. Burn Subtitles with FFmpeg
    # Style: Font size 24, Primary Color Yellow (&H00FFFF), Outline (Border) 2
    # Note: path to srt must be escaped properly for ffmpeg
    # Using simple force_style for now
    
    # Fix path for ffmpeg (escape colons and backslashes if needed, mostly for windows but good practice)
    # Using relative path is safer if cwd is correct
    srt_filename = os.path.basename(srt_path)
    video_dir = os.path.dirname(input_path)
    
    # Construct FFmpeg command
    # Filter: subtitles=filename.srt:force_style='...'
    style = "Alignment=2,OutlineColour=&H40000000,BorderStyle=3,Outline=1,Shadow=0,Fontsize=18,MarginV=25"
    
    # We need to run ffmpeg from the video dir so it finds the SRT easily, or use absolute path
    # Escaping full path in filter_complex is tricky. Let's rely on CWD.
    
    full_srt_path = os.path.abspath(srt_path)
    # Escape colon for filter (and backslashes for windows)
    # Ideally we just CD into the dir.
    
    # Simpler approach: Use relative path but run subprocess in the correct CWD
    video_dir = os.path.dirname(os.path.abspath(input_path))
    srt_filename = os.path.basename(srt_path)
    input_filename = os.path.basename(input_path)
    output_filename = os.path.basename(output_path)
    
    # Modern subtitle style (Yellow text, black outline, bottom center)
    style = "Alignment=2,OutlineColour=&H80000000,BorderStyle=3,Outline=2,Shadow=0,Fontsize=16,MarginV=30,PrimaryColour=&H00FFFF"
    
    command = [
        'ffmpeg', '-y',
        '-i', input_filename,
        '-vf', f"subtitles={srt_filename}:force_style='{style}'",
        '-c:a', 'copy',
        output_filename
    ]
    
    # Run in the download directory to simplify path handling
    try:
        subprocess.run(command, cwd=video_dir, check=True, stderr=subprocess.PIPE)
        return True
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg subtitle burn failed: {e.stderr.decode()}")
        return False
