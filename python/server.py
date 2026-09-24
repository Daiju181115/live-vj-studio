#!/usr/bin/env python3
# VJ Studio Python IPC Server
# Receives JSON commands via stdin, sends JSON responses via stdout.
# Drives Whisper, audio separation, and rhyme detection.


import sys
import json
import os
import traceback

# Ensure UTF-8 I/O
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')
if sys.stderr.encoding != 'utf-8':
    sys.stderr.reconfigure(encoding='utf-8')
if sys.stdin.encoding != 'utf-8':
    sys.stdin.reconfigure(encoding='utf-8')

# Add project root to Python path
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

def handle_detect_rhymes(segments):
    from python.rhyme_detector import handle_detect_rhymes as _handle
    _handle(segments)

def _send_message_fn(msg_type: str, data: dict = None):
    """Helper send function for use in background threads."""
    payload = {"type": msg_type}
    if data:
        payload["data"] = data
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def send_message(msg_type: str, data: dict = None):
    """Sends a JSON message to Electron Main process via stdout."""
    payload = {"type": msg_type}
    if data:
        payload["data"] = data
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()

def handle_transcribe(audio_path: str):
    """Runs StableWhisper transcription for highly accurate word-level alignment."""
    from python.stable_whisper_engine import StableWhisperEngine
    import traceback
    
    # Instantiate stable-ts engine (using CPU to ensure cross-compatibility on AMD/Windows)
    engine = StableWhisperEngine(model_name="small", device="cpu")
    
    def progress_cb(step_msg, percent):
        send_message("progress", {"step": step_msg, "percent": percent})

    try:
        res = engine.transcribe(audio_path, send_progress_cb=progress_cb)
        send_message("result", res)
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        send_message("error", {"message": f"解析中にエラーが発生しました: {str(e)}"})

def handle_separate(audio_path: str, output_dir: str, model_name: str = "UVR-MDX-NET-Inst_HQ_3.onnx"):
    """Runs audio separation using python-audio-separator (MDX-Net/HTDemucs)."""
    from audio_separator.separator import Separator
    import traceback
    import sys
    
    try:
        send_message("progress", {"step": "分離エンジンを初期化中...", "percent": 0})
        
        # NOTE: Using a custom log_level to prevent it from messing with stdout JSON
        import logging
        separator = Separator(
            output_dir=output_dir,
            output_format="WAV",
            normalization_threshold=0.9,
            log_level=logging.WARNING
        )
        
        send_message("progress", {"step": f"モデルをロード中: {model_name}", "percent": 10})
        separator.load_model(model_filename=model_name)
        
        send_message("progress", {"step": "ボーカルと楽器を分離中... (これには数分かかります)", "percent": 30})
        output_files = separator.separate(audio_path)
        
        send_message("progress", {"step": "分離完了", "percent": 100})
        send_message("result_separate", {
            "output_files": output_files,
            "output_dir": output_dir
        })
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        send_message("error", {"message": f"分離中にエラーが発生しました: {str(e)}"})

def handle_pitch(audio_path: str):
    """Runs Basic Pitch analysis on vocal stem."""
    from python.basic_pitch_engine import extract_vocal_notes
    import traceback
    
    def progress_cb(step_msg, percent):
        send_message("progress", {"step": step_msg, "percent": percent})
        
    try:
        notes = extract_vocal_notes(audio_path, progress_cb=progress_cb)
        send_message("progress", {"step": "ピッチ解析完了", "percent": 100})
        send_message("result_pitch", {"notes": notes})
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        send_message("error", {"message": f"ピッチ解析中にエラーが発生しました: {str(e)}"})

def handle_download_url(url: str, output_dir: str):
    """Downloads audio from a URL using yt-dlp and converts to WAV."""
    import yt_dlp
    import traceback
    
    send_message("progress", {"step": "動画の情報を取得中...", "percent": 10})
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': os.path.join(output_dir, '%(title)s.%(ext)s'),
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'wav',
            'preferredquality': '192',
        }],
        'quiet': True,
        'no_warnings': True,
    }
    
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            title = info.get('title', 'Downloaded Audio')
            
            send_message("progress", {"step": f"音声をダウンロード中: {title}", "percent": 30})
            ydl.download([url])
            
            expected_filename = ydl.prepare_filename(info)
            wav_path = os.path.splitext(expected_filename)[0] + ".wav"
            
            if os.path.exists(wav_path):
                send_message("progress", {"step": "ダウンロード完了", "percent": 100})
                send_message("result_download", {"audioPath": wav_path, "title": title})
            else:
                send_message("error", {"message": "ダウンロードしたWAVファイルが見つかりません。"})
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        send_message("error", {"message": f"ダウンロードエラー: {str(e)}"})




def main():
    """Main event loop: reads JSON commands from stdin."""
    send_message("ready")

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            cmd = json.loads(line)
        except json.JSONDecodeError:
            send_message("error", {"message": f"Invalid JSON: {line}"})
            continue

        command = cmd.get("command", "")

        if command == "transcribe":
            audio_path = cmd.get("audioPath", "")
            if not audio_path or not os.path.exists(audio_path):
                send_message("error", {"message": f"Audio file not found: {audio_path}"})
                continue
            try:
                handle_transcribe(audio_path)
            except Exception as e:
                traceback.print_exc(file=sys.stderr)
                send_message("error", {"message": str(e)})

        elif command == "separate":
            audio_path = cmd.get("audioPath", "")
            output_dir = cmd.get("outputDir", "")
            model_name = cmd.get("model", "UVR-MDX-NET-Inst_HQ_3.onnx")
            
            if not audio_path or not os.path.exists(audio_path):
                send_message("error", {"message": f"Audio file not found: {audio_path}"})
                continue
            if not output_dir:
                send_message("error", {"message": "outputDir not specified"})
                continue
                
            os.makedirs(output_dir, exist_ok=True)
            
            try:
                handle_separate(audio_path, output_dir, model_name)
            except Exception as e:
                traceback.print_exc(file=sys.stderr)
                send_message("error", {"message": str(e)})

        elif command == "pitch":
            audio_path = cmd.get("audioPath", "")
            if not audio_path or not os.path.exists(audio_path):
                send_message("error", {"message": f"Audio file not found: {audio_path}"})
                continue
            try:
                handle_pitch(audio_path)
            except Exception as e:
                traceback.print_exc(file=sys.stderr)
                send_message("error", {"message": str(e)})

        elif command == "downloadUrl":
            url = cmd.get("url", "")
            output_dir = cmd.get("outputDir", "")
            if not url or not output_dir:
                send_message("error", {"message": "URLまたは出力先フォルダが指定されていません。"})
                continue
            
            os.makedirs(output_dir, exist_ok=True)
            try:
                handle_download_url(url, output_dir)
            except Exception as e:
                traceback.print_exc(file=sys.stderr)
                send_message("error", {"message": str(e)})

        elif command == "detectRhymes":
            segments = cmd.get("segments", [])
            if not segments:
                send_message("error", {"message": "segments not provided"})
                continue
            try:
                handle_detect_rhymes(segments)
            except Exception as e:
                traceback.print_exc(file=sys.stderr)
                send_message("error", {"message": str(e)})

        elif command == "startChatListener":
            try:
                from python.live_chat_listener import handle_start_chat_listener
                handle_start_chat_listener(cmd, _send_message_fn)
            except Exception as e:
                traceback.print_exc(file=sys.stderr)
                send_message("chat_error", {"message": str(e)})

        elif command == "stopChatListener":
            try:
                from python.live_chat_listener import handle_stop_chat_listener
                handle_stop_chat_listener()
                send_message("progress", {"step": "チャットリスナーを停止しました", "percent": 0})
            except Exception as e:
                traceback.print_exc(file=sys.stderr)

        elif command == "cancel":
            send_message("progress", {"step": "キャンセルされました", "percent": 0})


        elif command == "quit":
            break

        else:
            send_message("error", {"message": f"Unknown command: {command}"})


if __name__ == "__main__":
    main()
