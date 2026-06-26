#!/usr/bin/env python3
"""
TikTok uploader using tiktok-uploader library with sessionid.
Usage: python tiktok_upload.py <video_path> <caption> <cookies_file>
"""
import sys
import json
import os

def get_sessionid(cookies_file):
    """Extract sessionid from Netscape cookies file."""
    try:
        with open(cookies_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                # Remove #HttpOnly_ prefix
                clean = line.replace('#HttpOnly_', '')
                parts = clean.split('\t')
                if len(parts) >= 7:
                    name = parts[5].strip()
                    value = parts[6].strip()
                    if name == 'sessionid' and value:
                        return value
    except Exception as e:
        sys.stderr.write(f"Cookie read error: {e}\n")
    return None

def main():
    if len(sys.argv) < 4:
        print(json.dumps({"success": False, "error": "Usage: tiktok_upload.py <video> <caption> <cookies>"}))
        sys.exit(1)

    video_path = sys.argv[1]
    caption    = sys.argv[2]
    cookies_file = sys.argv[3]

    if not os.path.exists(video_path):
        print(json.dumps({"success": False, "error": f"Video not found: {video_path}"}))
        sys.exit(1)

    sessionid = get_sessionid(cookies_file)
    if not sessionid:
        print(json.dumps({"success": False, "error": "sessionid not found in cookies file"}))
        sys.exit(1)

    sys.stderr.write(f"Using sessionid: {sessionid[:8]}...\n")

    try:
        from tiktok_uploader.upload import upload_video

        result = upload_video(
            filename=video_path,
            description=caption,
            sessionid=sessionid,
            headless=True,
            browser_args=["--no-sandbox", "--disable-setuid-sandbox"],
        )

        result_str = str(result) if result else "None"
        # Check for failure indicators
        if result is None or 'error' in result_str.lower() or 'fail' in result_str.lower():
            print(json.dumps({"success": False, "error": f"Upload result: {result_str}"}))
        else:
            print(json.dumps({"success": True, "result": result_str}))

    except Exception as e:
        err = str(e)
        if 'No module' in err or 'ModuleNotFoundError' in err:
            print(json.dumps({"success": False, "error": "MODULE_NOT_FOUND"}))
        else:
            print(json.dumps({"success": False, "error": err[:300]}))

if __name__ == "__main__":
    main()
