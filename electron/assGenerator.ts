import fs from 'fs';
import path from 'path';

// ASS format requires centiseconds (10ms units) for karaoke tags
function toCentiseconds(sec: number): number {
  return Math.round(sec * 100);
}

// ASS format requires H:MM:SS.cs
function formatAssTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

export async function generateAssFile(segments: any[], outputPath: string) {
  let assContent = `[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,MS UI Gothic,80,&H0000FFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,2,2,10,10,60,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const seg of segments) {
    if (!seg.words || seg.words.length === 0) continue;

    const start = formatAssTime(seg.start);
    const end = formatAssTime(seg.end);

    let textLine = '';
    
    // We want the text to fill smoothly. {\kf} or {\k} are standard.
    // {\kf} fills smoothly, {\k} fills abruptly.
    for (const w of seg.words) {
      const durationCs = toCentiseconds(w.end - w.start);
      // Ruby is not natively supported by standard ASS without complex pos/clip, 
      // but some renderers support it. For simplicity, we just render the text.
      // If we wanted to, we could format ruby above, but for now we focus on text sync.
      textLine += `{\\kf${durationCs}}${w.text}`;
    }

    assContent += `Dialogue: 0,${start},${end},Karaoke,,0,0,0,,${textLine}\n`;
  }

  await fs.promises.writeFile(outputPath, assContent, 'utf-8');
}
