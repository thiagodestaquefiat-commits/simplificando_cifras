from __future__ import annotations

import base64
import html
import io
import json
from datetime import date
from urllib.parse import quote

from flask import Blueprint, Response, current_app, redirect, request
from PIL import Image, ImageDraw, ImageFont


blueprint = Blueprint("event_shares", __name__)


def _decode_share(value: str) -> dict:
    if not value or len(value) > 14_000:
        return {}
    try:
        decoded = base64.b64decode(value).decode("utf-8")
        payload = json.loads(decoded)
        return payload if isinstance(payload, dict) else {}
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return {}


def _clean(value, limit: int) -> str:
    return str(value or "").strip()[:limit]


def _payload() -> dict:
    raw = _decode_share(request.args.get("share", ""))
    songs = []
    for item in raw.get("musicas", []) if isinstance(raw.get("musicas"), list) else []:
        if not isinstance(item, dict):
            continue
        title = _clean(item.get("title"), 100)
        if title:
            songs.append({"title": title, "artist": _clean(item.get("artist"), 100)})
    raw_date = _clean(raw.get("date"), 24)
    try:
        parsed = date.fromisoformat(raw_date)
        months = ("jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez")
        display_date = f"{parsed.day:02d} de {months[parsed.month - 1]} de {parsed.year}"
    except ValueError:
        display_date = raw_date
    return {
        "title": _clean(raw.get("title"), 120) or "Evento ROUDY",
        "date": display_date,
        "time": _clean(raw.get("time"), 16),
        "location": _clean(raw.get("location"), 160),
        "musicas": songs[:40],
    }


def _font(size: int, bold: bool = False):
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    try:
        return ImageFont.truetype(name, size)
    except OSError:
        return ImageFont.load_default()


def _fit(draw: ImageDraw.ImageDraw, text: str, font, width: int) -> str:
    value = text
    while value and draw.textbbox((0, 0), value + ("…" if value != text else ""), font=font)[2] > width:
        value = value[:-1]
    return value + ("…" if value != text else "")


@blueprint.get("/share/event")
def event_share_page():
    payload = _payload()
    token = request.args.get("share", "")
    frontend = current_app.config.get("PUBLIC_APP_URL", "https://simplificandocifras.netlify.app/").rstrip("/") + "/"
    destination = f"{frontend}?share={quote(token, safe='')}"
    image_url = request.url_root.rstrip("/") + "/share/event/image?share=" + quote(token, safe="")
    title = html.escape(payload["title"])
    description_bits = [part for part in (payload["date"], payload["time"], payload["location"]) if part]
    description = html.escape(" · ".join(description_bits) or "Evento compartilhado no ROUDY")
    document = f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{title} · ROUDY</title><meta name="description" content="{description}">
<meta property="og:type" content="website"><meta property="og:site_name" content="ROUDY">
<meta property="og:title" content="{title}"><meta property="og:description" content="{description}">
<meta property="og:image" content="{html.escape(image_url)}"><meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="1200">
<meta property="og:url" content="{html.escape(request.url)}">
<meta http-equiv="refresh" content="0;url={html.escape(destination)}"></head>
<body><p>Abrindo <a href="{html.escape(destination)}">{title}</a> no ROUDY…</p>
<script>location.replace({json.dumps(destination)});</script></body></html>"""
    response = Response(document, mimetype="text/html")
    response.headers["Cache-Control"] = "public, max-age=300"
    return response


@blueprint.get("/share/event/image")
def event_share_image():
    payload = _payload()
    image = Image.new("RGB", (1200, 1200), "#06101f")
    draw = ImageDraw.Draw(image)
    for y in range(1200):
        amount = y / 1199
        draw.line((0, y, 1200, y), fill=(int(7 - 5 * amount), int(26 - 20 * amount), int(54 - 46 * amount)))
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    ImageDraw.Draw(overlay).ellipse((-380, -500, 900, 780), fill=(7, 58, 130, 118))
    image = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(image)
    left, width = 96, 1008
    draw.text((left, 74), "R O U D Y", font=_font(29, True), fill="#d9e7ff")
    title_font = _font(66, True)
    draw.text((left, 145), _fit(draw, payload["title"], title_font, width), font=title_font, fill="white")
    meta = " · ".join(part for part in (payload["date"], payload["time"]) if part)
    draw.text((left, 255), _fit(draw, meta, _font(29, True), width), font=_font(29, True), fill="#c4c9d2")
    if payload["location"]:
        draw.text((left, 300), _fit(draw, payload["location"], _font(27), width), font=_font(27), fill="#c4c9d2")
    draw.text((left, 390), "R E P E R T Ó R I O", font=_font(21, True), fill="#aab3c2")
    y = 445
    visible = payload["musicas"][:5]
    if not visible:
        draw.text((left, y), "Repertório ainda vazio", font=_font(31), fill="#c4c9d2")
    for song in visible:
        draw.text((left, y), _fit(draw, song["title"], _font(34, True), width), font=_font(34, True), fill="white")
        y += 43
        if song["artist"]:
            draw.text((left, y), _fit(draw, song["artist"], _font(25), width), font=_font(25), fill="#aeb4bf")
        y += 62
    remaining = len(payload["musicas"]) - len(visible)
    if remaining > 0:
        draw.text((left, y + 4), f"+ {remaining} música{'s' if remaining != 1 else ''}", font=_font(27, True), fill="#9fc2ff")
    draw.text((1090, 1120), "ROUDY", anchor="ra", font=_font(25, True), fill="#b9bec7")
    output = io.BytesIO()
    image.save(output, format="PNG", optimize=True)
    response = Response(output.getvalue(), mimetype="image/png")
    response.headers["Cache-Control"] = "public, max-age=86400"
    return response
