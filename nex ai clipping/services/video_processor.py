from pathlib import Path
from moviepy import VideoFileClip

from config import OUTPUT_DIR, TEMP_DIR, OPENROUTER_API_KEY
from services.youtube_downloader import YouTubeDownloader
from services.whisper_transcriber import WhisperSingleton
from services.gemini_selector import GeminiSelector
from services.face_tracker import FaceTracker
from services.caption_maker import CaptionMaker
from utils.helpers import generate_random_clips, cleanup_temp_files


class VideoProcessor:
    """
    Orchestrates the entire video processing pipeline.

    This class initializes and manages all the services required for
    downloading, transcribing, selecting clips, tracking faces, and
    adding captions to a YouTube video.
    """
    def __init__(self, caption_style='clean_white'):
        """
        Initializes the VideoProcessor with a specific caption style.

        Args:
            caption_style (str, optional): The style of captions to use.
                                            Defaults to 'clean_white'.
        """
        self.downloader = YouTubeDownloader()
        self.transcriber = WhisperSingleton()
        self.ai_selector = GeminiSelector(api_key=OPENROUTER_API_KEY)
        self.face_tracker = FaceTracker()
        self.caption_maker = CaptionMaker(caption_style)

    def process_local_video(self, video_path, num_clips, min_duration, max_duration):
        """
        Processes an already-downloaded local video file to generate viral clips.
        Skips the download step — useful when the scheduler pre-downloads the video.

        Args:
            video_path (Path): Path to the local video file.
            num_clips (int): The number of clips to generate.
            min_duration (int): The minimum duration of each clip.
            max_duration (int): The maximum duration of each clip.

        Returns:
            tuple: A tuple containing a list of output file paths and the title.
        """
        video_path = Path(video_path)
        if not video_path.exists():
            raise FileNotFoundError(f"Local video file not found: {video_path}")

        # Get duration via moviepy
        print(f"📂 Processing local file: {video_path.name}")
        with VideoFileClip(str(video_path)) as probe:
            duration = probe.duration

        title = video_path.stem
        print(f"✅ Local file ready: {title} ({duration:.1f}s)")

        # Delegate to the shared clipping logic
        return self._clip_and_process(video_path, title, duration, num_clips, min_duration, max_duration)

    def process_video(self, url, num_clips, min_duration, max_duration):
        """
        Processes a YouTube video to generate viral clips.

        Args:
            url (str): The URL of the YouTube video.
            num_clips (int): The number of clips to generate.
            min_duration (int): The minimum duration of each clip.
            max_duration (int): The maximum duration of each clip.

        Returns:
            tuple: A tuple containing a list of output file paths and the
                   title of the video.
        """
        print("📥 Downloading video...")
        video_path, title, duration = self.downloader.download(url)
        print(f"✅ Download complete: {title} ({duration:.1f}s)")

        return self._clip_and_process(video_path, title, duration, num_clips, min_duration, max_duration)

    def _clip_and_process(self, video_path, title, duration, num_clips, min_duration, max_duration):
        """
        Shared clipping pipeline: transcribe → AI select → face track → caption → encode.

        Args:
            video_path (Path): Path to the local video file.
            title (str): Video title (used in output filename).
            duration (float): Video duration in seconds.
            num_clips (int): Number of clips to generate.
            min_duration (int): Minimum clip duration.
            max_duration (int): Maximum clip duration.

        Returns:
            tuple: (list of output file paths, title)
        """
        print("🎵 Starting transcription with Whisper...")
        words, transcript, segments = self.transcriber.transcribe(video_path)
        print(f"✅ Transcription processing complete")

        if not segments:
            print("❌ Transcription failed. Using random clips.")
            print("🎲 Generating random clips...")
            clip_specs = generate_random_clips(duration, num_clips, min_duration, max_duration)
            print(f"✅ Generated {len(clip_specs)} random clips")
        else:
            print("🧠 Using AI to select the most viral clips...")
            clip_specs = self.ai_selector.select_clips(
                segments, duration, num_clips, min_duration, max_duration
            )
            print(f"✅ AI selected {len(clip_specs)} viral clips")

        if not clip_specs:
            raise ValueError("Could not select any clips from the video.")

        output_files = []
        print(f"\n🎬 Processing {len(clip_specs)} viral clips...")

        for i, clip_info in enumerate(clip_specs, 1):
            start = clip_info['start']
            end = clip_info['end']
            title_text = clip_info.get('title', f'Clip {i}')
            virality_score = clip_info.get('virality_score', 0)

            print(f"\n📹 Clip {i}/{len(clip_specs)}: {title_text}")
            print(f"    ⭐ Virality Score: {virality_score}/100")
            print(f"    ⏱️  Time: {start:.1f}s to {end:.1f}s")
            print(f"    🎨 Caption Style: {self.caption_maker.styles[self.caption_maker.selected_style]['name']}")

            try:
                with VideoFileClip(str(video_path)) as video:
                    clip = video.subclipped(start, end)

                    print(f"    🎯 Applying intelligent face tracking...")
                    print(f"    ⏳ Analyzing frames for face detection...")
                    clip = self.face_tracker.track_and_crop(clip)
                    print(f"    ✅ Face tracking and cropping complete")

                    if words:
                        print(f"    📝 Adding word-by-word captions...")
                        clip = self.caption_maker.add_captions(clip, words, start)

                    filename = f"clip_{i}_{virality_score}pts_{Path(video_path).stem}.mp4"
                    output_path = OUTPUT_DIR / filename

                    print(f"    🎥 Encoding with optimized settings...")
                    print(f"    ⏳ Starting video encoding (this may take a while)...")
                    clip.write_videofile(
                        str(output_path),
                        codec='libx264',
                        audio_codec='aac',
                        preset='ultrafast',  # i3 ke liye ultrafast — quality thodi kam par RAM/CPU safe
                        ffmpeg_params=['-crf', '23', '-pix_fmt', 'yuv420p', '-threads', '1'],
                        logger=None,
                        temp_audiofile=str(TEMP_DIR / f'temp_audio_{i}.m4a'),
                        remove_temp=True,
                        threads=1
                    )
                    print(f"    ✅ Video encoding complete")
                    output_files.append(str(output_path))
                    print(f"    ✅ Saved: {filename}")

            except Exception as e:
                print(f"    ❌ Error processing clip {i}: {e}")
                continue
        
        self.face_tracker.close()
        cleanup_temp_files()

        return output_files, title
