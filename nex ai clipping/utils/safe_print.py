"""
Safe print utility for Windows terminals that don't support UTF-8/emoji.
Import this at the top of any script that prints emoji.
"""
import sys
import io

def setup_utf8_stdout():
    """Force stdout/stderr to UTF-8 with emoji replacement on Windows."""
    if hasattr(sys.stdout, 'reconfigure'):
        try:
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass
    if hasattr(sys.stderr, 'reconfigure'):
        try:
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass

def safe_print(*args, **kwargs):
    """Print with emoji stripped for Windows cp1252 terminals."""
    msg = ' '.join(str(a) for a in args)
    try:
        print(msg, **kwargs)
    except (UnicodeEncodeError, UnicodeDecodeError):
        safe = msg.encode('ascii', errors='replace').decode('ascii')
        print(safe, **kwargs)

# Auto-apply on import
setup_utf8_stdout()
