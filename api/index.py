from fastapi import FastAPI
from ytmusicapi import YTMusic
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Mengizinkan frontend mengambil data dari API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inisialisasi ytmusic tanpa login (bisa search public data)
ytmusic = YTMusic()

@app.get("/api/search")
def search_music(query: str):
    try:
        # Mencari spesifik tipe 'songs' agar yang muncul hanya lagu
        search_results = ytmusic.search(query, filter="songs", limit=12)
        
        # Membersihkan data agar mudah dibaca oleh frontend
        cleaned_results = []
        for item in search_results:
            if 'videoId' in item:
                cleaned_results.append({
                    "videoId": item['videoId'],
                    "title": item.get('title', 'Unknown Title'),
                    "artist": item.get('artists', [{'name': 'Unknown Artist'}])[0]['name'],
                    "thumbnail": item['thumbnails'][-1]['url'] if 'thumbnails' in item else ''
                })
        
        return {"status": "success", "data": cleaned_results}
    except Exception as e:
        return {"status": "error", "message": str(e)}
