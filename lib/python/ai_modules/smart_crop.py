import cv2
import mediapipe as mp
import subprocess
import os

def detect_face_center(video_path):
    """
    Detects the main face in the video and returns its average X position (normalized 0-1).
    Heuristic: Checks frames every 1 second and averages the X center of the largest face.
    """
    mp_face_detection = mp.solutions.face_detection
    
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        return 0.5 # Default to center
        
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    duration = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) / fps
    
    centers = []
    
    with mp_face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5) as face_detection:
        # Check 1 frame every second
        for t in range(0, int(duration), 1):
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            success, image = cap.read()
            if not success:
                continue
                
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = face_detection.process(image)
            
            if results.detections:
                # Find largest face
                largest_face = None
                max_area = 0
                
                for detection in results.detections:
                    bboxC = detection.location_data.relative_bounding_box
                    area = bboxC.width * bboxC.height
                    if area > max_area:
                        max_area = area
                        largest_face = bboxC
                
                if largest_face:
                    center_x = largest_face.xmin + (largest_face.width / 2)
                    centers.append(center_x)
    
    cap.release()
    
    if not centers:
        return 0.5
        
    # Return average center
    return sum(centers) / len(centers)

def smart_crop_video(input_path, output_path):
    """
    Crops video to 9:16 aspect ratio centered on the speaker.
    """
    # 1. Detect Center
    print("Detecting speaker...")
    center_x_norm = detect_face_center(input_path)
    print(f"Speaker detected at X: {center_x_norm:.2f}")
    
    # 2. Calculate Crop Parameters
    # Get dimensions
    probe = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', input_path],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    width, height = map(int, probe.stdout.decode().strip().split('x'))
    
    # Target dimensions (9:16)
    target_width = int(height * (9/16))
    target_height = height
    
    if target_width > width:
        # If video is too narrow, scale it? Or just fit width
        # For typical 16:9, height is smaller than width, so we crop width.
        target_width = width
        target_height = int(width * (16/9)) # Wait, 9:16 is (width < height)
        # Usually input is 16:9 (1920x1080)
        # Output 9:16 (should be 608x1080)
        target_width = int(height * (9/16))
        
    # Calculate x offset based on detected center
    # center_x_pixel is center of the crop
    center_x_pixel = int(center_x_norm * width)
    
    x_offset = center_x_pixel - (target_width // 2)
    
    # Clamp offset
    x_offset = max(0, min(x_offset, width - target_width))
    
    print(f"Cropping: {target_width}x{target_height} at x={x_offset}")
    
    # 3. Apply Crop with FFmpeg
    # Use absolute paths
    input_abs = os.path.abspath(input_path)
    output_abs = os.path.abspath(output_path)
    
    command = [
        'ffmpeg', '-y',
        '-i', input_abs,
        '-vf', f'crop={target_width}:{target_height}:{x_offset}:0',
        '-c:a', 'copy',
        output_abs
    ]
    
    try:
        subprocess.run(command, check=True, stderr=subprocess.PIPE)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Smart Crop Failed: {e.stderr.decode()}")
        return False
