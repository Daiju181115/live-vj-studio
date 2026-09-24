#!/usr/bin/env python3
"""
VJ Studio - Live Chat Listener
Supports YouTube Live Chat (official API) and TikTok Live (TikTokLive OSS).

Commands received via server.py:
  { "command": "startChatListener", "platform": "youtube|tiktok", "videoId": "...", "apiKey": "..." }
  { "command": "stopChatListener" }

Events emitted via stdout:
  { "type": "chat_message", "data": { "platform", "author", "text", "isSuperChat", "amount", "color" } }
  { "type": "chat_error",   "data": { "message" } }
  { "type": "chat_ready",   "data": { "platform", "title" } }
"""

import sys
import json
import time
import threading
import traceback
from typing import Optional


# ── YouTube Live Chat Listener ──────────────────────────────

class YouTubeChatListener:
    """
    Polls YouTube Live Chat API using the Data API v3.
    Requires:
      pip install google-api-python-client
    And a valid API key (or OAuth token for broader access).
    """

    def __init__(self, video_id: str, api_key: str, send_fn):
        self.video_id = video_id
        self.api_key = api_key
        self.send = send_fn
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=3)

    def _run(self):
        try:
            from googleapiclient.discovery import build
        except ImportError:
            self.send("chat_error", {"message": "google-api-python-client が未インストールです。\npip install google-api-python-client を実行してください。"})
            return

        try:
            youtube = build("youtube", "v3", developerKey=self.api_key)

            # Get live chat ID from video
            video_response = youtube.videos().list(
                part="liveStreamingDetails",
                id=self.video_id
            ).execute()

            items = video_response.get("items", [])
            if not items:
                self.send("chat_error", {"message": f"動画ID '{self.video_id}' が見つかりません。"})
                return

            live_details = items[0].get("liveStreamingDetails", {})
            chat_id = live_details.get("activeLiveChatId")

            if not chat_id:
                self.send("chat_error", {"message": "このビデオはライブ配信中ではありません。"})
                return

            self.send("chat_ready", {"platform": "youtube", "title": f"YouTube Live: {self.video_id}"})

            next_page_token = None
            poll_interval = 5.0  # seconds

            while not self._stop_event.is_set():
                try:
                    params = {
                        "liveChatId": chat_id,
                        "part": "snippet,authorDetails",
                        "maxResults": 50,
                    }
                    if next_page_token:
                        params["pageToken"] = next_page_token

                    response = youtube.liveChatMessages().list(**params).execute()

                    for item in response.get("items", []):
                        snippet = item.get("snippet", {})
                        author = item.get("authorDetails", {})
                        msg_type = snippet.get("type", "textMessageEvent")
                        text = snippet.get("displayMessage", "")

                        is_super_chat = "superChat" in msg_type.lower() or "superSticker" in msg_type.lower()
                        amount = None
                        amount_color = None

                        if is_super_chat:
                            sc_details = snippet.get("superChatDetails", {})
                            amount = sc_details.get("amountDisplayString", "")
                            tier = sc_details.get("tier", 1)
                            # Super Chat tier colors (1=blue, 2=cyan, 3=green, 4=yellow, 5=orange, 6=magenta, 7=red)
                            tier_colors = {1: "#1e88e5", 2: "#00e5ff", 3: "#1de9b6",
                                           4: "#ffca28", 5: "#f57c00", 6: "#e91e63", 7: "#e53935"}
                            amount_color = tier_colors.get(tier, "#ffd600")

                        self.send("chat_message", {
                            "platform": "youtube",
                            "author": author.get("displayName", "Unknown"),
                            "text": text,
                            "isSuperChat": is_super_chat,
                            "amount": amount,
                            "color": amount_color or "#6366f1",
                        })

                    next_page_token = response.get("nextPageToken")
                    poll_ms = response.get("pollingIntervalMillis", 5000)
                    poll_interval = max(2.0, poll_ms / 1000.0)

                except Exception as e:
                    self.send("chat_error", {"message": f"YouTube API エラー: {str(e)}"})
                    time.sleep(10)

                self._stop_event.wait(timeout=poll_interval)

        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            self.send("chat_error", {"message": f"YouTube リスナーエラー: {str(e)}"})


# ── TikTok Live Chat Listener ──────────────────────────────

class TikTokChatListener:
    """
    Listens to TikTok Live Chat using the TikTokLive OSS library.
    Requires:
      pip install TikTokLive
    """

    def __init__(self, username: str, send_fn):
        self.username = username.lstrip("@")
        self.send = send_fn
        self._client = None
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        try:
            if self._client:
                import asyncio
                asyncio.run(self._client.disconnect())
        except Exception:
            pass

    def _run(self):
        try:
            from TikTokLive import TikTokLiveClient
            from TikTokLive.events import ConnectEvent, CommentEvent, GiftEvent
        except ImportError:
            self.send("chat_error", {"message": "TikTokLive が未インストールです。\npip install TikTokLive を実行してください。"})
            return

        try:
            import asyncio

            client = TikTokLiveClient(unique_id=f"@{self.username}")
            self._client = client

            @client.on(ConnectEvent)
            async def on_connect(event: ConnectEvent):
                self.send("chat_ready", {"platform": "tiktok", "title": f"TikTok Live: @{self.username}"})

            @client.on(CommentEvent)
            async def on_comment(event: CommentEvent):
                self.send("chat_message", {
                    "platform": "tiktok",
                    "author": event.user.nickname or event.user.unique_id,
                    "text": event.comment,
                    "isSuperChat": False,
                    "amount": None,
                    "color": "#f43f5e",
                })

            @client.on(GiftEvent)
            async def on_gift(event: GiftEvent):
                if event.gift.streakable and not event.gift.is_streak_ended:
                    return  # Wait until streak ends to avoid spam
                self.send("chat_message", {
                    "platform": "tiktok",
                    "author": event.user.nickname or event.user.unique_id,
                    "text": f"🎁 {event.gift.name} × {event.repeat_count}",
                    "isSuperChat": True,
                    "amount": f"×{event.repeat_count}",
                    "color": "#f59e0b",
                })

            asyncio.run(client.start())

        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            self.send("chat_error", {"message": f"TikTok リスナーエラー: {str(e)}"})


# ── Singleton Manager (called from server.py) ──────────────

_current_listener = None


def handle_start_chat_listener(cmd: dict, send_fn):
    """Entry point from server.py — starts the appropriate listener."""
    global _current_listener

    # Stop existing listener first
    if _current_listener is not None:
        try:
            _current_listener.stop()
        except Exception:
            pass
        _current_listener = None

    platform = cmd.get("platform", "youtube").lower()
    video_id = cmd.get("videoId", "")
    api_key = cmd.get("apiKey", "")
    username = cmd.get("username", "")

    if platform == "youtube":
        if not video_id:
            send_fn("chat_error", {"message": "videoId が指定されていません。"})
            return
        if not api_key:
            send_fn("chat_error", {"message": "YouTube API Key が指定されていません。"})
            return
        _current_listener = YouTubeChatListener(video_id, api_key, send_fn)
        _current_listener.start()

    elif platform == "tiktok":
        if not username:
            send_fn("chat_error", {"message": "TikTok username が指定されていません。"})
            return
        _current_listener = TikTokChatListener(username, send_fn)
        _current_listener.start()

    else:
        send_fn("chat_error", {"message": f"未対応のプラットフォーム: {platform}"})


def handle_stop_chat_listener():
    """Entry point from server.py — stops the listener."""
    global _current_listener
    if _current_listener is not None:
        try:
            _current_listener.stop()
        except Exception:
            pass
        _current_listener = None
