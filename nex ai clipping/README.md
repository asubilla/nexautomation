# Nex AI Clipping

Transform any YouTube video into viral short-form clips using AI.

## Features

- **AI Clip Selection** — OpenRouter AI picks the most engaging moments
- **Smart Face Tracking** — Keeps the speaker perfectly framed
- **Word-by-Word Captions** — Multiple caption styles for better retention
- **Fast Transcription** — Uses faster-whisper locally

## Setup

1. **Create virtual environment and install dependencies:**
   ```bash
   python -m venv venv
   venv\Scripts\pip install -r requirements.txt
   ```

2. **Configure environment:**
   ```bash
   copy .env.example .env
   ```
   Edit `.env` and set your OpenRouter API key:
   ```
   OPENROUTER_API_KEY="your-key-here"
   ```

3. **Run:**
   ```bash
   venv\Scripts\python main.py
   ```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | — | Your OpenRouter API key |
| `OUTPUT_DIR` | `./clips` | Where clips are saved |
| `TEMP_DIR` | `./temp` | Temp files location |
| `WHISPER_MODEL` | `large-v2` | Whisper model size |

## AI Model

Uses `google/gemini-2.0-flash-exp:free` via OpenRouter (free tier).
Get your API key at [openrouter.ai](https://openrouter.ai).
