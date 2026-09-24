import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

export function generateAssFile(segments: any[], outputPath: string) {
  let assContent = `[Script Info]
Title: KaraokeMaker Export
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Meiryo,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,3,0,2,10,10,50,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

  segments.forEach(seg => {
    const startStr = formatTime(seg.start);
    const endStr = formatTime(seg.end);
    let textStr = "";

    if (seg.words && seg.words.length > 0) {
      let currentSec = seg.start;
      seg.words.forEach((w: any) => {
        if (w.start > currentSec) {
          const gapCs = Math.round((w.start - currentSec) * 100);
          if (gapCs > 0) textStr += `{\\k${gapCs}}`;
        }
        const durCs = Math.round((w.end - w.start) * 100);
        const wordText = w.ruby ? `${w.text}(${w.ruby})` : (w.text || w.word);
        if (durCs > 0) {
          textStr += `{\\k${durCs}}${wordText}`;
        }
        currentSec = w.end;
      });
    } else {
      const durCs = Math.round((seg.end - seg.start) * 100);
      textStr = `{\\k${durCs}}${seg.text}`;
    }

    assContent += `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${textStr}\n`;
  });

  fs.writeFileSync(outputPath, assContent, 'utf-8');
}

export function runFFmpegExport(
  segments: any[],
  audioPath: string,
  bgVideoPath: string,
  outputVideoPath: string,
  totalDurationSec: number,
  onProgress: (percent: number, fps: number, speed: string) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    // 1. Create temporary ASS file
    const assPath = path.join(path.dirname(outputVideoPath), 'temp_lyrics.ass');
    generateAssFile(segments, assPath);
    
    // Convert path to FFmpeg friendly format (escape backslashes for filter_complex)
    let filterAssPath = assPath.replace(/\\/g, '/');
    filterAssPath = filterAssPath.replace(/:/g, '\\\\:');

    // 2. Build FFmpeg command for AMD AMF
    const ffmpegArgs = [
      '-y',
      '-stream_loop', '-1', '-i', bgVideoPath,
      '-i', audioPath,
      '-filter_complex', `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,fps=60,subtitles='${filterAssPath}'[v]`,
      '-map', '[v]',
      '-map', '1:a',
      '-c:v', 'h264_amf',
      '-b:v', '8M',
      '-c:a', 'aac', '-b:a', '320k',
      '-shortest',
      '-progress', 'pipe:1',
      outputVideoPath
    ];

    console.log('FFmpeg args:', ffmpegArgs);
    const proc = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

    let buffer = '';
    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      let outTimeSec = 0;
      let fps = 0;
      let speed = '0x';

      for (const line of lines) {
        const [k, v] = line.split('=');
        if (!k || !v) continue;
        if (k === 'out_time_us') {
          outTimeSec = parseInt(v, 10) / 1_000_000;
        } else if (k === 'fps') {
          fps = parseFloat(v);
        } else if (k === 'speed') {
          speed = v.trim();
        }
      }

      if (totalDurationSec > 0 && outTimeSec > 0) {
        const percent = Math.min(100, Math.round((outTimeSec / totalDurationSec) * 100));
        onProgress(percent, fps, speed);
      }
    });
    
    proc.stderr.on('data', (data) => {
      // console.log(data.toString());
    });

    proc.on('close', (code) => {
      try {
        if (fs.existsSync(assPath)) {
          fs.unlinkSync(assPath);
        }
      } catch (e) {}

      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}
