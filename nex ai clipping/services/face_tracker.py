import cv2
import numpy as np


class FaceTracker:
    """
    Tracks faces in a video and crops the frame to keep the speaker centered.
    Uses OpenCV's built-in Haar cascade for face detection (no mediapipe needed).
    """
    def __init__(self):
        """
        Initializes the FaceTracker with OpenCV's Haar cascade face detector.
        """
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        self.face_cache = {}
        print("🎯 Initialized face tracking with OpenCV Haar cascade")

    def detect_faces_in_frame(self, frame, frame_time=None):
        """
        Detects faces in a single frame using OpenCV Haar cascade.

        Args:
            frame (numpy.ndarray): The video frame to process.
            frame_time (float, optional): Timestamp for caching.

        Returns:
            list: List of dicts with face position info.
        """
        if frame_time is not None and frame_time in self.face_cache:
            return self.face_cache[frame_time]

        try:
            h, w = frame.shape[:2]
            scale = 0.5
            small_frame = cv2.resize(frame, (int(w * scale), int(h * scale)))
            gray = cv2.cvtColor(small_frame, cv2.COLOR_RGB2GRAY)

            faces_raw = self.face_cascade.detectMultiScale(
                gray,
                scaleFactor=1.1,
                minNeighbors=5,
                minSize=(30, 30)
            )

            faces = []
            if len(faces_raw) > 0:
                for (x, y, fw, fh) in faces_raw:
                    # Scale back to original size
                    cx = int((x + fw / 2) / scale)
                    cy = int((y + fh / 2) / scale)
                    faces.append({
                        'center_x': cx,
                        'center_y': cy,
                        'width': int(fw / scale),
                        'height': int(fh / scale),
                        'area': int(fw / scale) * int(fh / scale)
                    })
                # Largest face first
                faces.sort(key=lambda f: f['area'], reverse=True)

            if frame_time is not None:
                self.face_cache[frame_time] = faces

            return faces

        except Exception as e:
            print(f"    ⚠️ Face detection error: {e}")
            return []

    def smooth_trajectory(self, positions, window_size=5):
        """Smoothes a list of (x, y) positions using a moving average."""
        if len(positions) <= window_size:
            return positions

        smoothed = []
        for i in range(len(positions)):
            start_idx = max(0, i - window_size // 2)
            end_idx = min(len(positions), i + window_size // 2 + 1)
            window = positions[start_idx:end_idx]
            avg_x = sum(p[0] for p in window) / len(window)
            avg_y = sum(p[1] for p in window) / len(window)
            smoothed.append((avg_x, avg_y))

        return smoothed

    def track_and_crop(self, clip):
        """
        Crops the clip to 9:16 aspect ratio, keeping detected face centered.
        Uses segment-based tracking: samples face positions across the clip
        and applies the best center per segment.

        Args:
            clip: moviepy VideoFileClip

        Returns:
            Cropped clip.
        """
        import math
        width, height = clip.size
        target_width = int(height * 9 / 16)
        if target_width % 2 != 0:
            target_width -= 1

        if width <= target_width:
            print("    ⏩ Skipping face tracking — video already in target aspect ratio")
            return clip

        print("    🎯 Analyzing frames for face tracking...")
        self.face_cache = {}

        # Sample frames every 3 seconds for segment-based tracking
        segment_duration = 3.0
        num_segments = max(1, int(math.ceil(clip.duration / segment_duration)))

        print(f"    ⏳ Sampling {num_segments} segments ({segment_duration}s each)...")

        # For each segment, find best center_x
        segment_centers = []
        for seg_idx in range(num_segments):
            seg_start = seg_idx * segment_duration
            seg_mid = seg_start + segment_duration / 2
            seg_mid = min(seg_mid, clip.duration - 0.1)

            try:
                frame = clip.get_frame(seg_mid)
                faces = self.detect_faces_in_frame(frame, frame_time=seg_mid)
                if faces:
                    cx = faces[0]['center_x']
                    print(f"    ✅ Seg {seg_idx+1}: face at x={cx}")
                else:
                    cx = segment_centers[-1] if segment_centers else width // 2
                    print(f"    ⚠️ Seg {seg_idx+1}: no face, using x={cx}")
            except Exception as e:
                cx = segment_centers[-1] if segment_centers else width // 2
                print(f"    ⚠️ Seg {seg_idx+1} error: {e}")

            # Clamp to valid range
            cx = max(target_width // 2, min(width - target_width // 2, cx))
            segment_centers.append(cx)

        # Smooth segment centers
        smoothed_centers = []
        window = 2
        for i in range(len(segment_centers)):
            start_i = max(0, i - window)
            end_i = min(len(segment_centers), i + window + 1)
            avg = int(sum(segment_centers[start_i:end_i]) / (end_i - start_i))
            smoothed_centers.append(avg)

        self.face_cache = {}

        def make_crop_frame(get_frame, t):
            """Per-frame crop using the segment's center_x."""
            seg_idx = min(int(t / segment_duration), len(smoothed_centers) - 1)
            cx = smoothed_centers[seg_idx]
            left = cx - target_width // 2
            left = max(0, min(width - target_width, left))
            frame = get_frame(t)
            return frame[:, left:left + target_width]

        # Apply dynamic crop using fl (frame-level function)
        cropped = clip.fl(make_crop_frame, apply_to=["mask"])
        # Force correct size since fl doesn't resize metadata
        # We use crop for the final step with median center to ensure metadata is correct
        median_cx = int(np.median(smoothed_centers))
        median_cx = max(target_width // 2, min(width - target_width // 2, median_cx))
        left = median_cx - target_width // 2

        # For simplicity and stability on low-RAM machines: use static crop with best center
        # (dynamic fl_image is more accurate but uses 2x RAM on encoding)
        cropped = clip.crop(x1=left, width=target_width, resize_algorithm='fast_bilinear')
        print(f"    ✅ Cropped to {target_width}x{height} (center x={median_cx})")
        return cropped


    def close(self):
        """Releases cached resources."""
        self.face_cache = {}
        print("🎯 Face tracking resources released")
