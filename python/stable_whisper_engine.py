import time
import os
import stable_whisper
import traceback
import numpy as np
import soundfile as sf
import scipy.signal
import math
import re

def get_ruby_chunks(word_text, ai_kana, kks_results):
    if not ai_kana:
        return [(r['orig'], r['hira'] if r['orig'] != r['hira'] else "") for r in kks_results]
    
    match_trailing = re.search(r'([ぁ-んァ-ヶ]+)$', word_text)
    if match_trailing:
        trailing = match_trailing.group(1)
        if ai_kana.endswith(trailing):
            core_kanji = word_text[:-len(trailing)]
            core_ruby = ai_kana[:-len(trailing)]
            if not re.search(r'[ぁ-んァ-ヶ]', core_kanji):
                return [(core_kanji, core_ruby), (trailing, "")]
                
    match_leading = re.search(r'^([ぁ-んァ-ヶ]+)', word_text)
    if match_leading:
        leading = match_leading.group(1)
        if ai_kana.startswith(leading):
            core_kanji = word_text[len(leading):]
            core_ruby = ai_kana[len(leading):]
            if not re.search(r'[ぁ-んァ-ヶ]', core_kanji):
                return [(leading, ""), (core_kanji, core_ruby)]
                
    if word_text == ai_kana:
        return [(word_text, "")]
    if re.search(r'[一-龥]', word_text):
        return [(word_text, ai_kana)]
    return [(word_text, "")]

class StableWhisperEngine:
    def __init__(self, model_name: str = "small", device: str = "cpu"):
        self.model_name = model_name
        self.device = device
        self.model = None

    def load(self, send_progress_cb=None):
        if self.model is None:
            if send_progress_cb:
                send_progress_cb(f"Whisper ({self.model_name}) モデルをロード中...", 10)
            
            self.model = stable_whisper.load_model(self.model_name, device=self.device)
            
            if send_progress_cb:
                send_progress_cb("モデルのロード完了", 20)

    def _load_audio_as_numpy(self, audio_path: str) -> np.ndarray:
        data, sr = sf.read(audio_path)
        if data.ndim > 1:
            data = data.mean(axis=1)
        
        target_sr = 16000
        if sr != target_sr:
            gcd = math.gcd(sr, target_sr)
            up = target_sr // gcd
            down = sr // gcd
            data = scipy.signal.resample_poly(data, up, down)
            
        return data.astype(np.float32)

    def transcribe(self, audio_path: str, send_progress_cb=None) -> dict:
        self.load(send_progress_cb)

        if send_progress_cb:
            send_progress_cb("音声ファイルをデコード中...", 30)
            
        # FFmpegの未インストール環境(Windows等)での subprocess エラーを回避するため、
        # Python側で numpy 配列に変換してから stable-ts に渡す。
        audio_data = self._load_audio_as_numpy(audio_path)

        if send_progress_cb:
            send_progress_cb("音声ファイルの解析中... (CPUを使用するため数分かかる場合があります)", 40)

        t0 = time.time()
        
        result = self.model.transcribe(audio_data, language='ja', word_timestamps=True)
        
        t1 = time.time()
        inference_time_ms = (t1 - t0) * 1000

        if send_progress_cb:
            send_progress_cb("Pass 2: 実際の歌唱（ひらがな）を解析中...", 60)
            
        t2 = time.time()
        result_kana = self.model.transcribe(
            audio_data, 
            language='ja', 
            initial_prompt="以下はすべてひらがなで出力してください。漢字は一切使いません。",
            word_timestamps=True
        )
        t3 = time.time()
        inference_time_ms += (t3 - t2) * 1000

        if send_progress_cb:
            send_progress_cb("タイムスタンプのアライメントとルビ結合中...", 90)
            
        kana_words = []
        for seg in result_kana.to_dict().get('segments', []):
            for w in seg.get('words', []):
                text = w.get('word', '').strip()
                if text:
                    kana_words.append({
                        "text": text,
                        "start": w.get('start', 0.0),
                        "end": w.get('end', 0.0)
                    })

        res_dict = result.to_dict()
        
        segments = []
        total_text = ""
        
        for seg in res_dict.get('segments', []):
            seg_start = round(seg.get('start', 0.0), 3)
            seg_end = round(seg.get('end', 0.0), 3)
            seg_text = seg.get('text', '').strip()
            total_text += seg_text + " "
            
            words = []
            
            # pykakasiの初期化（遅延ロード）
            if not hasattr(self, 'kks'):
                import pykakasi
                self.kks = pykakasi.kakasi()
                
            for w in seg.get('words', []):
                original_text = w.get('word', '').strip()
                if not original_text:
                    continue
                    
                w_start = round(w.get('start', 0.0), 3)
                w_end = round(w.get('end', 0.0), 3)
                prob = round(w.get('probability', 1.0), 3)
                
                # AI Kana overlap
                overlapping_kana = []
                for kw in kana_words:
                    overlap = min(w_end, kw['end']) - max(w_start, kw['start'])
                    if overlap > 0.05 or overlap == (kw['end'] - kw['start']):
                        overlapping_kana.append(kw['text'])
                ai_kana = "".join(overlapping_kana)
                ai_kana = re.sub(r'[^ぁ-んァ-ヶー]', '', ai_kana) # 記号等を除去
                
                # pykakasi 
                kks_results = self.kks.convert(original_text)
                
                # チャンクごとに分割してルビを付与
                chunks = get_ruby_chunks(original_text, ai_kana, kks_results)
                total_len = sum(len(c[0]) for c in chunks)
                
                current_time = w_start
                for orig_chunk, hira_chunk in chunks:
                    if len(orig_chunk) == 0:
                        continue
                        
                    chunk_duration = (w_end - w_start) * (len(orig_chunk) / total_len) if total_len > 0 else 0
                    chunk_end = current_time + chunk_duration
                    
                    words.append({
                        "text": orig_chunk,
                        "ruby": hira_chunk,
                        "start": round(current_time, 3),
                        "end": round(chunk_end, 3),
                        "confidence": prob
                    })
                    
                    current_time = chunk_end
            
            segments.append({
                "start": seg_start,
                "end": seg_end,
                "text": seg_text,
                "words": words
            })

        duration = result.duration if hasattr(result, 'duration') else 0.0
        if duration == 0.0 and len(segments) > 0:
            duration = segments[-1]["end"]

        return {
            "durationSec": round(duration, 2),
            "totalChunks": 1,
            "segments": segments,
            "totalText": total_text.strip(),
            "encoderTotalMs": 0,
            "decoderTotalMs": 0,
            "totalInferenceMs": round(inference_time_ms, 2),
            "realTimeFactor": round((inference_time_ms / 1000.0) / duration, 4) if duration > 0 else 0,
            "speedupRatio": round(duration / (inference_time_ms / 1000.0), 1) if inference_time_ms > 0 else 0
        }
