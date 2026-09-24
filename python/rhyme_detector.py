#!/usr/bin/env python3
"""
VJ Studio - Rhyme Detection Engine
Detects rhyming pairs in lyric segments using phonetic (kana) similarity.
Falls back to vowel-only comparison when fugashi is unavailable.
"""

import re
import unicodedata
from typing import List, Dict, Tuple


# Japanese vowel mapping (mora → vowel)
VOWEL_MAP = {
    'あ': 'a', 'か': 'a', 'さ': 'a', 'た': 'a', 'な': 'a', 'は': 'a', 'ま': 'a', 'や': 'a', 'ら': 'a', 'わ': 'a',
    'い': 'i', 'き': 'i', 'し': 'i', 'ち': 'i', 'に': 'i', 'ひ': 'i', 'み': 'i', 'り': 'i',
    'う': 'u', 'く': 'u', 'す': 'u', 'つ': 'u', 'ぬ': 'u', 'ふ': 'u', 'む': 'u', 'ゆ': 'u', 'る': 'u',
    'え': 'e', 'け': 'e', 'せ': 'e', 'て': 'e', 'ね': 'e', 'へ': 'e', 'め': 'e', 'れ': 'e',
    'お': 'o', 'こ': 'o', 'そ': 'o', 'と': 'o', 'の': 'o', 'ほ': 'o', 'も': 'o', 'よ': 'o', 'ろ': 'o', 'を': 'o',
    'が': 'a', 'ざ': 'a', 'だ': 'a', 'ば': 'a', 'ぱ': 'a',
    'ぎ': 'i', 'じ': 'i', 'ぢ': 'i', 'び': 'i', 'ぴ': 'i',
    'ぐ': 'u', 'ず': 'u', 'づ': 'u', 'ぶ': 'u', 'ぷ': 'u',
    'げ': 'e', 'ぜ': 'e', 'で': 'e', 'べ': 'e', 'ぺ': 'e',
    'ご': 'o', 'ぞ': 'o', 'ど': 'o', 'ぼ': 'o', 'ぽ': 'o',
}


def kata_to_hira(text: str) -> str:
    """Converts katakana to hiragana."""
    return ''.join(
        chr(ord(c) - 0x60) if 'ァ' <= c <= 'ン' else c
        for c in text
    )


def get_ending_kana(text: str, length: int = 2) -> str:
    """Extracts the last N kana characters from text."""
    # Remove punctuation and spaces
    text = re.sub(r'[^\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]', '', text)
    hira = kata_to_hira(text)
    # Get last N characters
    return hira[-length:] if len(hira) >= length else hira


def get_vowel_ending(text: str, length: int = 2) -> str:
    """Returns vowels of the ending kana."""
    ending = get_ending_kana(text, length)
    vowels = ''
    for ch in ending:
        v = VOWEL_MAP.get(ch)
        if v:
            vowels += v
    return vowels


def detect_rhymes(segments: List[Dict]) -> List[Dict]:
    """
    Detect rhyming pairs between lyric segments.

    Each segment has: { text, start, end, words: [{word, start, end}] }
    Returns list of rhyme pairs: { word1, time1, word2, time2, vowelMatch }
    """
    try:
        import fugashi
        tagger = fugashi.Tagger()
        use_fugashi = True
    except ImportError:
        use_fugashi = False
        print("[RhymeDetector] fugashi not available, using vowel fallback", flush=True)

    # Build word-time pairs from segment endings
    word_times: List[Tuple[str, float]] = []

    for seg in segments:
        words = seg.get('words', [])
        if words:
            last_word = words[-1]
            word_times.append((last_word.get('word', ''), last_word.get('end', seg.get('end', 0))))
        else:
            word_times.append((seg.get('text', ''), seg.get('end', 0)))

    rhyme_pairs = []

    for i in range(len(word_times)):
        for j in range(i + 1, len(word_times)):
            w1, t1 = word_times[i]
            w2, t2 = word_times[j]

            if not w1 or not w2:
                continue

            # Skip if too close in time (same phrase)
            if abs(t2 - t1) < 1.0:
                continue

            # Exact ending match (2 characters)
            ending1 = get_ending_kana(w1, 2)
            ending2 = get_ending_kana(w2, 2)

            if ending1 and ending2 and ending1 == ending2 and len(ending1) >= 1:
                rhyme_pairs.append({
                    'word1': w1, 'time1': t1,
                    'word2': w2, 'time2': t2,
                    'vowelMatch': False
                })
                continue

            # Vowel-level match (looser)
            v1 = get_vowel_ending(w1, 2)
            v2 = get_vowel_ending(w2, 2)
            if v1 and v2 and v1 == v2 and len(v1) >= 2:
                rhyme_pairs.append({
                    'word1': w1, 'time1': t1,
                    'word2': w2, 'time2': t2,
                    'vowelMatch': True
                })

    return rhyme_pairs


def handle_detect_rhymes(segments: List[Dict]):
    """Entry point called by server.py."""
    import sys, json
    pairs = detect_rhymes(segments)
    payload = {'type': 'result_rhymes', 'data': {'pairs': pairs}}
    sys.stdout.write(json.dumps(payload) + '\n')
    sys.stdout.flush()


if __name__ == '__main__':
    # Quick test
    test_segments = [
        {'text': '夢を追いかけて', 'start': 0, 'end': 3, 'words': [
            {'word': '夢', 'start': 0, 'end': 0.5},
            {'word': 'を', 'start': 0.5, 'end': 0.8},
            {'word': '追いかけて', 'start': 0.8, 'end': 3},
        ]},
        {'text': '空を羽ばたいて', 'start': 4, 'end': 7, 'words': [
            {'word': '空', 'start': 4, 'end': 4.5},
            {'word': 'を', 'start': 4.5, 'end': 4.8},
            {'word': '羽ばたいて', 'start': 4.8, 'end': 7},
        ]},
    ]
    pairs = detect_rhymes(test_segments)
    print(f"Detected {len(pairs)} rhyme pairs:", pairs)
