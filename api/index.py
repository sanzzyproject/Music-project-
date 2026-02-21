from fastapi import FastAPI, Query
from ytmusicapi import YTMusic
import yt_dlp

app = FastAPI()
yt = YTMusic()

@app.get("/api/search")
async def search(q: str = Query(...)):
    # Mencari lagu menggunakan mixin SearchMixin
    results = yt.search(q, filter="songs")
    return results

@app.get("/api/stream")
async def stream(id: str = Query(...)):
    # Mengambil URL audio mentah agar bisa diputar di tag <audio>
    ydl_opts = {
        'format': 'bestaudio/best',
        'quiet': True,
        'no_warnings': True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f"https://www.youtube.com/watch?v={id}", download=False)
        return {"url": info['url']}
