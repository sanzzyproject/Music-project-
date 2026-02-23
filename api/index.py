from fastapi import FastAPI, Query
from fastapi.responses import JSONResponse
from ytmusicapi import YTMusic
import yt_dlp
import os

app = FastAPI()
yt = YTMusic()

@app.get("/api/search")
async def search(q: str = Query(...)):
    try:
        # Menggunakan SearchMixin.search() sesuai dokumentasi
        results = yt.search(q, filter="songs")
        return results
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/stream")
async def stream(id: str = Query(...)):
    try:
        ydl_opts = {
            'format': 'bestaudio/best',
            'quiet': True,
            'no_warnings': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Mengambil info streaming langsung dari videoId
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={id}", download=False)
            return {"url": info['url']}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
