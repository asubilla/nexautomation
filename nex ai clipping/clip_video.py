"""
Non-interactive CLI entry point for the clipping pipeline.
Usage:
    # Remote URL (will download first):
    python clip_video.py <video_url> --clips 4 --min 15 --max 90 --style clean_white --output-dir E:/nex-clips

    # Local file (no download needed):
    python clip_video.py E:/path/to/video.mp4 --clips 4 --min 15 --max 90 --style clean_white --output-dir E:/nex-clips
"""
import sys
import os
import json
import argparse
import random
from pathlib import Path

# Force UTF-8 stdout — Windows cp1252 emoji fix
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

def log(msg):
    # Strip emoji for safe Windows terminal output
    safe = msg.encode('ascii', errors='replace').decode('ascii')
    print(safe, flush=True)

def parse_args():
    parser = argparse.ArgumentParser(description="AI Video Clipper")
    parser.add_argument("url", help="Video URL or local file path to process")
    parser.add_argument("--clips", type=int, default=4, help="Number of clips to generate")
    parser.add_argument("--min", type=int, default=15, help="Min clip duration (seconds)")
    parser.add_argument("--max", type=int, default=90, help="Max clip duration (seconds)")
    parser.add_argument("--style", default="clean_white", help="Caption style")
    parser.add_argument("--output-dir", default=None, help="Output directory for clips")
    parser.add_argument("--random-duration", action="store_true", help="Randomize clip duration within min/max range")
    return parser.parse_args()

def main():
    args = parse_args()

    # Override OUTPUT_DIR if specified
    if args.output_dir:
        os.environ["OUTPUT_DIR"] = args.output_dir
        Path(args.output_dir).mkdir(parents=True, exist_ok=True)

    # Import here so env is set before config loads
    from config import OUTPUT_DIR

    # Detect if input is a local file path (already downloaded) or a remote URL
    input_path = args.url
    is_local_file = Path(input_path).exists() and Path(input_path).is_file()

    # Random duration if requested
    min_dur = args.min
    max_dur = args.max
    if args.random_duration:
        min_dur = random.randint(15, 30)
        max_dur = random.randint(45, 90)
        log(f"Random duration: {min_dur}s - {max_dur}s")

    log(f"Starting clip pipeline")
    if is_local_file:
        log(f"   Source: LOCAL FILE {input_path}")
    else:
        log(f"   URL: {input_path}")
    log(f"   Clips: {args.clips}")
    log(f"   Duration: {min_dur}s - {max_dur}s")
    log(f"   Style: {args.style}")
    log(f"   Output: {OUTPUT_DIR}")

    try:
        if is_local_file:
            # Local file provided — skip download, go straight to processing
            from pathlib import Path as _Path
            from services.video_processor import VideoProcessor

            processor = VideoProcessor(caption_style=args.style)

            # Get video metadata without downloading
            local_path = _Path(input_path)
            log(f"Using local file: {local_path.name}")

            # Use VideoProcessor's pipeline directly with local file
            output_files, title = processor.process_local_video(
                local_path, args.clips, min_dur, max_dur
            )
        else:
            # Remote URL — use full pipeline (download + clip)
            from services.video_processor import VideoProcessor

            processor = VideoProcessor(caption_style=args.style)
            output_files, title = processor.process_video(
                input_path,
                args.clips,
                min_dur,
                max_dur
            )

        # Output result as JSON to stdout (last line) so Node.js can parse it
        result = {
            "success": True,
            "title": title,
            "clips": output_files,
            "count": len(output_files)
        }
        log("CLIP_RESULT:" + json.dumps(result))

    except Exception as e:
        import traceback
        log(f"Error: {e}")
        traceback.print_exc()
        result = {"success": False, "error": str(e), "clips": []}
        log("CLIP_RESULT:" + json.dumps(result))
        sys.exit(1)

if __name__ == "__main__":
    main()
