#!/usr/bin/env python3
"""Stdlib mock of the PixAI routes used by PixAI Gallery Manager (EXT_SPEC rule 0.1).

Usage:  python tests/mock_server.py [port=18765] [delay_ms=120]

Serves http://127.0.0.1:<port>/v2/... with response shapes taken from the research reports,
plus images at /img/<id>.<png|webp|mp4> and /img/thumb/<id>.<ext>.

Data: 40 completed tasks (mixed 1 and 4 images, one video, two published, some starred,
two "edit" tasks, one image without mediaUrls), one failed and one running task that the
"completed" filter hides, and two artwork collections (30 items incl. one unavailable, 5 items
incl. a video artwork). /task/search returns at most 15 rows per page, so 40 tasks span 3 pages.

Every /v2 route except /media/batch needs "Authorization: Bearer test.token.value", otherwise it
answers 401 like PixAI. CORS echoes Origin with credentials and exposes the "token" header.

Test helpers (no auth):
  GET  /__mock/log     every request seen: method, path, query, body, auth (bool), origin
  POST /__mock/reset   rebuild the data and clear the log
  POST /__mock/fail    {"count": 2, "status": 503}: the next N /v2 requests fail with that status
  POST /__mock/upload?name=x.zip   raw body saved to $PGM_MOCK_UPLOAD_DIR (default: <temp>/pgm-mock-uploads)
                                   so tests can check archives built in the browser with Python's zipfile
"""
import base64
import colorsys
import json
import os
import re
import struct
import sys
import tempfile
import threading
import time
import zlib
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, urlsplit

TOKEN = "test.token.value"
PAGE_CAP = 15
USER = {
    "id": "1544489361907720999",
    "username": "mock_user",
    "displayName": "测试用户",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "avatarMediaId": None,
    "platformRoles": [],
    "membership": None,
    "activeDecorationIds": [],
}
WEBP = base64.b64decode("UklGRjAAAABXRUJQVlA4TCMAAAAvX8AXAA/wwf/z/P/+f/7jAWraNmDKn3QYdF0R/U9qlmUuBgA=")
FAKE_MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom" + b"\x00" * 64
COLL_SAVES = "019a4b2c-0000-7000-8000-00000000000a"
COLL_SCENERY = "019a4b2c-0000-7000-8000-00000000000b"

PROMPTS = [
    "masterpiece, best quality, 1girl, silver hair, (smile:1.2), <lora:abc:0.7>",
    "best quality, absurdres, 1boy, black jacket, city street, night, neon lights",
    "A girl holding flowers in a sunny garden",
    "女孩，银发、微笑，樱花",
    "score_9, score_8_up, 1girl, (red eyes:1.3), long hair, school uniform, classroom",
    "masterpiece, very aesthetic, cat, sitting on a windowsill, rain",
    "landscape, mountains, lake, sunrise, (fog:0.8), no humans",
    "1girl, witch hat, [magic circle:0.5], night sky, stars, BREAK, detailed background",
    "masterpiece, best quality, highres",
    "dragon, " * 30 + "castle",
]


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + "%03dZ" % (dt.microsecond // 1000)


def parse_iso(value):
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def bad_request(path, message):
    return 400, {
        "defined": False,
        "code": "BAD_REQUEST",
        "status": 400,
        "message": "Input validation failed",
        "data": {"issues": [{"code": "custom", "path": [path], "message": message}]},
    }


def not_found(code, message):
    return 404, {"defined": True, "code": code, "status": 404, "message": message}


def encode_cursor(offset):
    return base64.urlsafe_b64encode(("o:%d" % offset).encode()).decode()


def decode_cursor(cursor):
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        if raw.startswith("o:"):
            return int(raw[2:])
    except Exception:
        pass
    return None


def stringbool(value):
    if value is None:
        return None
    v = str(value).lower()
    if v in ("true", "1", "yes", "on", "y", "enabled"):
        return True
    if v in ("false", "0", "no", "off", "n", "disabled"):
        return False
    return "invalid"


def int_param(query, name, default, lo, hi):
    if name not in query:
        return default, None
    try:
        n = int(query[name])
    except ValueError:
        return None, bad_request(name, "expected integer")
    if n < lo or n > hi:
        return None, bad_request(name, "must be between %d and %d" % (lo, hi))
    return n, None


# ---- images -----------------------------------------------------------------

_png_cache = {}


def make_png(media_id, size):
    key = (media_id, size)
    if key in _png_cache:
        return _png_cache[key]
    hue = (int(media_id) * 37 % 360) / 360.0
    color = bytes(round(c * 255) for c in colorsys.hsv_to_rgb(hue, 0.45, 0.85))
    accent = bytes(round(c * 255) for c in colorsys.hsv_to_rgb(hue, 0.65, 0.45))
    row_a = b"\x00" + color * size
    row_b = b"\x00" + accent * size
    band = range(size // 3, size // 3 + max(2, size // 10))
    raw = b"".join(row_b if y in band else row_a for y in range(size))

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 6))
        + chunk(b"IEND", b"")
    )
    _png_cache[key] = png
    return png


# ---- data -------------------------------------------------------------------


class State:
    def __init__(self):
        self.tasks = []  # newest first
        self.media = {}  # media id -> {"type", "ext"}
        self.published = set()  # media ids published as artworks
        self.collections = []
        self.items = {}  # collection id -> item rows (internal)
        self.artworks = {}  # artwork id -> artwork (internal)
        self.fail = {"count": 0, "status": 503}
        self.build_tasks()
        self.build_collections()

    def add_media(self, mid, kind, ext):
        self.media[mid] = {"type": kind, "ext": ext}

    def build_tasks(self):
        now = datetime(2026, 11, 3, 6, 5, 9, tzinfo=timezone.utc)
        for i in range(42):
            tid = str(1900000000000000100 + i)
            created = now - timedelta(hours=i * 7, minutes=i)
            prompt = PROMPTS[i % len(PROMPTS)]
            n = 4 if i % 3 == 0 else 1
            ext = "webp" if i % 4 == 1 else "png"
            kind = "t2i"
            params = {"prompts": prompt, "negativePrompts": "lowres, bad anatomy", "modelId": "1648918127446573124"}
            if i in (7, 19):
                kind = "chat"
                params = {"chat": {"prompts": "make the sky purple, " + prompt}}
            media_ids = [str(2000000000000000000 + i * 10 + k) for k in range(n)]
            outputs = {"mediaIds": media_ids, "seed": 1000 + i}
            if i == 5:
                kind = "i2v-pro"
                outputs["videoMediaId"] = str(2000000000000000000 + i * 10 + 9)
                self.add_media(outputs["videoMediaId"], "VIDEO", "mp4")
            for mid in media_ids:
                self.add_media(mid, "IMAGE", ext)
            task = {
                "id": tid,
                "userId": USER["id"],
                "status": "completed",
                "createdAt": iso(created),
                "updatedAt": iso(created + timedelta(seconds=25)),
                "startedAt": iso(created + timedelta(seconds=3)),
                "endAt": iso(created + timedelta(seconds=24)),
                "paidQuota": 2400,
                "isPublished": False,
                "artworkCount": 0,
                "width": 768,
                "height": 1280,
                "imageType": ext,
                "prompts": prompt[:80],
                "batchSize": n,
                "taskKind": kind,
                "model": None,
                "isSensitive": False,
                "outputs": outputs,
                "parameters": params,
                "_fav": None,
                "_mediaFav": {},
                "_nullUrl": i == 11,
            }
            if i == 40:
                task["status"] = "failed"
            if i == 41:
                task["status"] = "running"
            self.tasks.append(task)

        def publish(index, k):
            task = self.tasks[index]
            self.published.add(task["outputs"]["mediaIds"][k])
            task["artworkCount"] += 1
            task["isPublished"] = True

        publish(2, 0)
        publish(9, 0)
        stamp = iso(now)
        self.tasks[1]["_fav"] = stamp
        self.tasks[5]["_fav"] = stamp
        self.tasks[3]["_mediaFav"][self.tasks[3]["outputs"]["mediaIds"][1]] = stamp
        self.tasks[6]["_mediaFav"][self.tasks[6]["outputs"]["mediaIds"][0]] = stamp

    def build_collections(self):
        now = datetime(2026, 10, 30, 12, 0, 0, tzinfo=timezone.utc)
        for cid, title, reserved, count in (
            (COLL_SAVES, "", "default", 30),
            (COLL_SCENERY, "风景收藏", None, 5),
        ):
            rows = []
            for n in range(count):
                serial = (1 if cid == COLL_SAVES else 2) * 1000 + n
                aid = str(3000000000000000000 + serial)
                mid = str(4000000000000000000 + serial)
                ext = "webp" if n % 5 == 3 else "png"
                self.add_media(mid, "IMAGE", ext)
                video = None
                if cid == COLL_SCENERY and n == 2:
                    video = str(4100000000000000000 + serial)
                    self.add_media(video, "VIDEO", "mp4")
                created = now - timedelta(days=n, hours=n)
                self.artworks[aid] = {
                    "id": aid,
                    "mediaId": mid,
                    "title": "作品 %d" % n,
                    "authorId": USER["id"],
                    "authorName": USER["displayName"],
                    "prompts": PROMPTS[(n + 3) % len(PROMPTS)],
                    "hidePrompts": False,
                    "visibility": "PRIVATE" if n % 4 == 0 else "PUBLIC",
                    "isSensitive": False,
                    "type": "DEFAULT",
                    "createdAt": iso(created),
                    "updatedAt": iso(created),
                    "likedCount": n,
                    "liked": False,
                    "commentCount": 0,
                    "author": {"id": USER["id"]},
                    "videoMediaId": video,
                    "tackIds": [],
                    "contest": None,
                    "moderation": [],
                    "flag": {"isSensitive": False, "isMinors": False, "shouldBlur": False},
                    "debugInfo": None,
                    "_serial": serial,
                    "_generatedAt": iso(created - timedelta(days=2, minutes=17)),
                }
                unavailable = cid == COLL_SAVES and n == 7
                rows.append({
                    "id": "019a4b2c-%04x-7000-8000-%012x" % (serial, serial),
                    "collectionId": cid,
                    "refId": aid,
                    "authorId": USER["id"],
                    "effectiveStatus": "unavailable" if unavailable else "available",
                    "effectiveUnavailableReason": "deleted" if unavailable else None,
                    "createdAt": iso(created + timedelta(hours=1)),
                    "updatedAt": iso(created + timedelta(hours=1)),
                    "refType": "artwork",
                    "_artworkId": None if unavailable else aid,
                })
            self.items[cid] = rows
            self.collections.append({
                "id": cid,
                "ownerId": USER["id"],
                "title": title,
                "description": "",
                "contentType": "artwork",
                "sortOrder": 0,
                "visibility": "private",
                "source": "user",
                "reservedType": reserved,
                "status": "available",
                "unavailableReason": None,
                "moderationStatus": "END",
                "coverMode": "single",
                "coverMediaId": None,
                "coverMediaIds": [],
                "resolvedCoverMediaIds": [],
                "featuredPinnedAt": None,
                "featuredPosition": None,
                "itemCount": count,
                "likeCount": 0,
                "likeDirection": None,
                "isOwnOnly": True,
                "isOwner": True,
                "createdAt": iso(now - timedelta(days=60)),
                "updatedAt": iso(now),
            })

    # ---- serialization ----

    def media_url(self, base, mid, thumb=False):
        m = self.media.get(mid, {"ext": "png", "type": "IMAGE"})
        ext = "png" if thumb and m["type"] == "VIDEO" else m["ext"]
        return "%s/img/%s%s.%s" % (base, "thumb/" if thumb else "", mid, ext)

    def task_out(self, task, base, with_params):
        out = {k: v for k, v in task.items() if not k.startswith("_") and k != "parameters"}
        outputs = dict(task["outputs"])
        outputs["mediaUrls"] = [None if task["_nullUrl"] and k == 0 else self.media_url(base, mid)
                                for k, mid in enumerate(outputs["mediaIds"])]
        out["outputs"] = outputs
        if with_params:
            out["parameters"] = task["parameters"]
        out["bookmarkState"] = {
            "favoritedAt": task["_fav"],
            "mediaItems": [{"mediaId": mid, "favoritedAt": at} for mid, at in task["_mediaFav"].items()],
        }
        return out

    def media_out(self, base, mid):
        m = self.media[mid]
        if m["type"] == "VIDEO":
            urls = [
                {"variant": "PUBLIC", "url": self.media_url(base, mid)},
                {"variant": "THUMBNAIL", "url": self.media_url(base, mid, True)},
                {"variant": "STILL_THUMBNAIL", "url": self.media_url(base, mid, True)},
            ]
        else:
            urls = [
                {"variant": "PUBLIC", "url": self.media_url(base, mid)},
                {"variant": "THUMBNAIL", "url": self.media_url(base, mid, True)},
                {"variant": "STILL_THUMBNAIL", "url": self.media_url(base, mid, True)},
            ]
        return {
            "id": mid,
            "type": m["type"],
            "urls": urls,
            "width": 768,
            "height": 1280,
            "imageType": None if m["type"] == "VIDEO" else m["ext"],
            "fileUrl": None,
            "thumbnailUrl": None,
            "hlsUrl": None,
            "duration": 4.0 if m["type"] == "VIDEO" else None,
        }

    def artwork_out(self, base, aid):
        a = self.artworks[aid]
        out = {k: v for k, v in a.items() if not k.startswith("_")}
        out["media"] = {
            "width": 768,
            "height": 1280,
            "thumbnailUrl": self.media_url(base, a["mediaId"], True),
            "publicUrl": self.media_url(base, a["mediaId"]),
        }
        out["imageBlurHash"] = "LKO2?U%2Tw=w]~RBVZRi};RPxuwH"
        out["faceCenter"] = {"x": 0.5, "y": 0.4}
        return out

    def find_task(self, tid):
        return next((t for t in self.tasks if t["id"] == tid), None)

    def remove_task(self, task):
        self.tasks.remove(task)
        for mid in task["outputs"]["mediaIds"] + [task["outputs"].get("videoMediaId")]:
            self.media.pop(mid, None)


STATE = State()
LOCK = threading.Lock()
LOG = []
DELAY = 0.12


# ---- routes -----------------------------------------------------------------


def route_user_me(base, query, body):
    return 200, USER


def route_task_search(base, query, body):
    if "first" in query and "last" in query:
        return bad_request("first", "Cannot provide both first and last")
    first, err = int_param(query, "first", 20, 1, 50)
    if err:
        return err
    tab = query.get("tab")
    if tab is not None and tab not in ("image", "edit", "video"):
        return bad_request("tab", 'expected one of "image"|"edit"|"video"')
    fav = stringbool(query.get("favorited"))
    with_params = stringbool(query.get("withParameters"))
    if fav == "invalid" or with_params == "invalid":
        return bad_request("favorited", "invalid boolean")
    after_dt = parse_iso(query["createdAfter"]) if query.get("createdAfter") else None
    before_dt = parse_iso(query["createdBefore"]) if query.get("createdBefore") else None
    if (query.get("createdAfter") and not after_dt) or (query.get("createdBefore") and not before_dt):
        return bad_request("createdAfter", "Invalid date")
    offset = 0
    if query.get("after"):
        offset = decode_cursor(query["after"])
        if offset is None:
            return bad_request("after", "invalid cursor")
    statuses = set(filter(None, query.get("status", "").split(",")))
    keyword = query.get("keyword", "").strip().lower()

    def kind_tab(task):
        if task["outputs"].get("videoMediaId"):
            return "video"
        return "edit" if task["taskKind"] == "chat" else "image"

    def matches(task):
        if statuses and task["status"] not in statuses:
            return False
        if tab and kind_tab(task) != tab:
            return False
        if fav and not (task["_fav"] or task["_mediaFav"]):
            return False
        created = parse_iso(task["createdAt"])
        if after_dt and created < after_dt:
            return False
        if before_dt and created >= before_dt:
            return False
        if keyword:
            p = task["parameters"]
            text = (p.get("prompts") or (p.get("chat") or {}).get("prompts") or "").lower()
            if keyword not in text:
                return False
        return True

    rows = [t for t in STATE.tasks if matches(t)]
    size = min(first, PAGE_CAP)
    page = rows[offset:offset + size]
    end = offset + len(page)
    return 200, {
        "data": [STATE.task_out(t, base, bool(with_params)) for t in page],
        "pageInfo": {
            "hasNextPage": end < len(rows),
            "hasPreviousPage": offset > 0,
            "startCursor": encode_cursor(offset) if page else None,
            "endCursor": encode_cursor(end) if page else None,
        },
    }


def route_task_get(base, query, body, tid):
    if "with_parameters" in query and stringbool(query["with_parameters"]) == "invalid":
        return bad_request("with_parameters", "invalid boolean")
    task = STATE.find_task(tid)
    if not task:
        return not_found("NOT_FOUND", "Task not found")
    return 200, STATE.task_out(task, base, stringbool(query.get("with_parameters")) is True)


def route_media_batch(base, query, body, ids):
    if not 1 <= len(ids) <= 100:
        return bad_request("ids", "ids must contain between 1 and 100 values")
    return 200, [STATE.media_out(base, mid) for mid in ids if mid in STATE.media]


def check_items(body):
    items = body.get("items") if isinstance(body, dict) else None
    if not isinstance(items, list) or not 1 <= len(items) <= 50:
        return None, bad_request("items", "items must contain between 1 and 50 values")
    for it in items:
        if not isinstance(it, dict) or not isinstance(it.get("taskId"), str):
            return None, bad_request("items", "taskId is required")
    return items, None


def route_bookmarks(base, query, body):
    items, err = check_items(body)
    if err:
        return err
    if not isinstance(body.get("favorited"), bool):
        return bad_request("favorited", "expected boolean")
    stamp = iso(datetime.now(timezone.utc)) if body["favorited"] else None
    results, states, touched = [], [], []
    for it in items:
        task = STATE.find_task(it["taskId"])
        mid = it.get("mediaId")
        ok = bool(task) and (mid is None or mid in task["outputs"]["mediaIds"])
        if ok:
            if mid is None:
                task["_fav"] = stamp
            elif stamp:
                task["_mediaFav"][mid] = stamp
            else:
                task["_mediaFav"].pop(mid, None)
            if task not in touched:
                touched.append(task)
        result = {"taskId": it["taskId"], "success": ok}
        if mid is not None:
            result["mediaId"] = mid
        results.append(result)
    for task in touched:
        states.append({"taskId": task["id"], **STATE.task_out(task, base, False)["bookmarkState"]})
    return 200, {"results": results, "states": states}


def route_batch_delete(base, query, body):
    items, err = check_items(body)
    if err:
        return err
    results, deleted_tasks = [], []
    for it in items:
        task = STATE.find_task(it["taskId"])
        mid = it.get("mediaId")
        entry = {"taskId": it["taskId"], "mediaId": mid}
        if not task or mid not in task["outputs"]["mediaIds"]:
            entry.update(success=False, reason="NOT_FOUND")
        elif mid in STATE.published:
            entry.update(success=False, reason="MEDIA_PUBLISHED")
        else:
            task["outputs"]["mediaIds"].remove(mid)
            task["_mediaFav"].pop(mid, None)
            STATE.media.pop(mid, None)
            entry["success"] = True
            if not task["outputs"]["mediaIds"]:
                STATE.remove_task(task)
                deleted_tasks.append(task["id"])
        results.append(entry)
    return 200, {"results": results, "deletedTaskIds": deleted_tasks}


def route_task_delete(base, query, body, tid):
    task = STATE.find_task(tid)
    if not task:
        return not_found("NOT_FOUND", "Task not found")
    STATE.remove_task(task)
    return 200, {"success": True}


def route_collection_list(base, query, body, owner):
    limit, err = int_param(query, "limit", 20, 1, 50)
    if err:
        return err
    content = query.get("contentType")
    if content is not None and content not in ("artwork", "model", "recipe"):
        return bad_request("contentType", 'expected one of "artwork"|"model"|"recipe"')
    sort = query.get("sort", "manual")
    if sort not in ("manual", "recent", "created", "itemCount"):
        return bad_request("sort", "invalid sort")
    if sort == "manual" and not content:
        return bad_request("sort", "manual ordering requires contentType")
    if owner != USER["id"] and not content:
        return 400, {"defined": True, "code": "COLLECTION_CONTENT_TYPE_REQUIRED", "status": 400,
                     "message": "contentType is required when listing another user's Collections"}
    rows = [c for c in STATE.collections
            if c["ownerId"] == owner and (not content or c["contentType"] == content)]
    offset = decode_cursor(query["cursor"]) if query.get("cursor") else 0
    if offset is None:
        return bad_request("cursor", "invalid cursor")
    page = rows[offset:offset + limit]
    end = offset + len(page)
    return 200, {"data": page, "nextCursor": encode_cursor(end) if end < len(rows) else None,
                 "page": None, "totalItems": None, "totalPages": None, "outOfRange": None}


def route_collection_items(base, query, body, cid):
    limit, err = int_param(query, "limit", 24, 1, 24)
    if err:
        return err
    if query.get("sort", "newest") not in ("newest", "oldest", "mostLiked", "itemNewest"):
        return bad_request("sort", "invalid sort")
    if cid not in STATE.items:
        return not_found("COLLECTION_NOT_FOUND", "Collection not found")
    offset = decode_cursor(query["cursor"]) if query.get("cursor") else 0
    if offset is None:
        return bad_request("cursor", "invalid cursor")
    rows = STATE.items[cid]
    page = rows[offset:offset + limit]
    end = offset + len(page)
    data = []
    for row in page:
        out = {k: v for k, v in row.items() if not k.startswith("_")}
        out["artwork"] = STATE.artwork_out(base, row["_artworkId"]) if row["_artworkId"] else None
        data.append(out)
    return 200, {"data": data, "nextCursor": encode_cursor(end) if end < len(rows) else None,
                 "page": None, "totalItems": len(rows), "totalPages": (len(rows) + limit - 1) // limit,
                 "outOfRange": None}


def route_task_parameters(base, query, body, aid):
    a = STATE.artworks.get(aid)
    # Odd serials act like uploaded or legacy artworks without a task.
    if not a or a["_serial"] % 2:
        return not_found("NOT_FOUND", "Task not found for artwork")
    mid = a["mediaId"]
    return 200, {
        "id": str(1800000000000000000 + a["_serial"]),
        "userId": USER["id"],
        "status": "completed",
        "createdAt": a["_generatedAt"],
        "updatedAt": a["_generatedAt"],
        "isPublished": True,
        "artworkCount": 1,
        "imageType": STATE.media[mid]["ext"],
        "prompts": a["prompts"][:80],
        "taskKind": "t2i",
        "outputs": {"mediaIds": [mid], "mediaUrls": [STATE.media_url(base, mid)]},
        "parameters": {"prompts": a["prompts"]},
    }


ROUTES = [
    ("GET", re.compile(r"^/v2/user/me$"), route_user_me),
    ("GET", re.compile(r"^/v2/task/search$"), route_task_search),
    ("PUT", re.compile(r"^/v2/task/bookmarks/batch$"), route_bookmarks),
    ("POST", re.compile(r"^/v2/task/media/batch-delete$"), route_batch_delete),
    ("POST", re.compile(r"^/v2/task/(\d+)/delete$"), route_task_delete),
    ("GET", re.compile(r"^/v2/task/(\d+)$"), route_task_get),
    ("GET", re.compile(r"^/v2/collection/list/(\d+)$"), route_collection_list),
    ("GET", re.compile(r"^/v2/collection/([0-9a-f-]+)/items$"), route_collection_items),
    ("GET", re.compile(r"^/v2/artwork/(\d+)/task-parameters$"), route_task_parameters),
]
UPLOAD_DIR = os.environ.get("PGM_MOCK_UPLOAD_DIR") or os.path.join(tempfile.gettempdir(), "pgm-mock-uploads")
IMG_RE = re.compile(r"^/img/(thumb/)?(\d+)\.(png|webp|mp4|jpg)$")
CONTENT_TYPES = {"png": "image/png", "webp": "image/webp", "mp4": "video/mp4", "jpg": "image/jpeg"}


def media_ids_from(pairs):
    ids = []
    for key, value in pairs:
        if key == "ids" or key == "ids[]" or re.fullmatch(r"ids\[\d+\]", key):
            ids.extend(v for v in value.split(",") if v)
    return ids


class Handler(BaseHTTPRequestHandler):
    server_version = "PixAIMock/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        sys.stderr.write("[mock] %s\n" % (fmt % args))

    def cors(self):
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Credentials", "true")
        self.send_header("Access-Control-Allow-Headers", "authorization, content-type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
        self.send_header("Access-Control-Expose-Headers", "token")

    def send(self, status, payload=None, body=b"", ctype="application/json", extra=None):
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            ctype = "application/json; charset=utf-8"
        self.send_response(status)
        self.cors()
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        if body or status != 204:
            self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return None, None
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8")), None
        except (ValueError, UnicodeDecodeError):
            return None, bad_request("body", "invalid JSON")

    def record(self, path, query_string, body):
        LOG.append({
            "time": time.time(),
            "method": self.command,
            "path": path,
            "query": query_string,
            "body": body,
            "auth": bool(self.headers.get("Authorization")),
            "origin": self.headers.get("Origin"),
        })
        del LOG[:-2000]

    def save_upload(self, query):
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        name = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "-", query.get("name") or "upload.bin").strip(" .") or "upload.bin"
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        target = os.path.join(UPLOAD_DIR, name)
        with open(target, "wb") as f:
            f.write(raw)
        return self.send(200, {"ok": True, "path": target, "size": len(raw)})

    def handle_any(self):
        global STATE
        parts = urlsplit(self.path)
        path = parts.path
        pairs = parse_qsl(parts.query, keep_blank_values=True)
        query = dict(pairs)
        if path == "/__mock/upload" and self.command == "POST":
            return self.save_upload(query)
        body, body_err = self.read_body()
        base = "http://" + (self.headers.get("Host") or "127.0.0.1")

        with LOCK:
            self.record(path, parts.query, body)

        if self.command == "OPTIONS":
            return self.send(204, extra={"Access-Control-Max-Age": "600"})

        if path == "/__mock/log" and self.command == "GET":
            with LOCK:
                return self.send(200, {"requests": list(LOG)})
        if path == "/__mock/reset" and self.command == "POST":
            with LOCK:
                STATE = State()
                LOG.clear()
            return self.send(200, {"ok": True})
        if path == "/__mock/fail" and self.command == "POST":
            b = body or {}
            with LOCK:
                STATE.fail = {"count": int(b.get("count", 1)), "status": int(b.get("status", 503))}
            return self.send(200, {"ok": True, "fail": STATE.fail})

        m = IMG_RE.match(path)
        if m and self.command in ("GET", "HEAD"):
            thumb, mid, ext = m.groups()
            if ext == "png":
                data = make_png(mid, 160 if thumb else 512)
            elif ext == "webp":
                data = WEBP
            elif ext == "mp4":
                data = FAKE_MP4
            else:
                return self.send(404, {"message": "not found"})
            return self.send(200, body=data, ctype=CONTENT_TYPES[ext],
                             extra={"Access-Control-Allow-Origin": "*"} if not self.headers.get("Origin") else None)

        if not path.startswith("/v2/"):
            return self.send(404, {"defined": False, "code": "NOT_FOUND", "status": 404, "message": "Not found"})

        if DELAY:
            time.sleep(DELAY)

        with LOCK:
            if STATE.fail["count"] > 0:
                STATE.fail["count"] -= 1
                status = STATE.fail["status"]
                return self.send(status, {"defined": False, "code": "MOCK_FAILURE", "status": status,
                                          "message": "injected failure"})

        public = path == "/v2/media/batch"
        if not public and self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self.send(401, {"defined": False, "code": "UNAUTHORIZED", "status": 401,
                                   "message": "must be logged in to access this resource"})
        if body_err:
            return self.send(*body_err)

        with LOCK:
            if path == "/v2/media/batch" and self.command == "GET":
                status, payload = route_media_batch(base, query, body, media_ids_from(pairs))
            else:
                for method, pattern, handler in ROUTES:
                    hit = pattern.match(path)
                    if hit and method == self.command:
                        status, payload = handler(base, query, body or {}, *hit.groups())
                        break
                else:
                    status, payload = 404, {"defined": False, "code": "NOT_FOUND", "status": 404,
                                            "message": "No procedure matched"}
        extra = {"token": TOKEN} if not public and status < 400 else None
        return self.send(status, payload, extra=extra)

    do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = do_OPTIONS = do_HEAD = handle_any


def main():
    global DELAY
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18765
    if len(sys.argv) > 2:
        DELAY = max(0, int(sys.argv[2])) / 1000.0
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print("PixAI mock on http://127.0.0.1:%d (token %s, delay %d ms)" % (port, TOKEN, DELAY * 1000), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
