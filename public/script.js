// public/script.js

// --- 0.1 INJECT YOUTUBE IFRAME API SECARA DINAMIS (ANTI GAGAL) ---
const tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
const firstScriptTag = document.getElementsByTagName('script')[0];
if(firstScriptTag) {
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
} else {
    document.head.appendChild(tag);
}

// --- 0. REGISTER PWA & CUSTOM INSTALL BUTTON ---
let deferredPrompt;
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.log('PWA gagal terdaftar:', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); 
    deferredPrompt = e;
    const installBtn = document.getElementById('installAppBtn');
    if(installBtn) {
        installBtn.style.display = 'flex'; 
        installBtn.addEventListener('click', async () => {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if(outcome === 'accepted') {
                installBtn.style.display = 'none'; 
            }
            deferredPrompt = null;
        });
    }
});

// --- 1. INDEXEDDB SETUP (SannMusicDB) ---
let db;
const request = indexedDB.open("SannMusicDB", 1);
request.onupgradeneeded = function(e) {
    db = e.target.result;
    if(!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists', { keyPath: 'id' });
    if(!db.objectStoreNames.contains('liked_songs')) db.createObjectStore('liked_songs', { keyPath: 'videoId' });
};
request.onsuccess = function(e) { db = e.target.result; renderLibraryUI(); };

// --- 2. YOUTUBE IFRAME API & PLAYER LOGIC ---
let ytPlayer;
let isPlaying = false;
let currentTrack = null;
let progressInterval;

function onYouTubeIframeAPIReady() {
    ytPlayer = new YT.Player('youtube-player', {
        height: '0', 
        width: '0',
        playerVars: {
            'playsinline': 1, // Penting untuk background play di Mobile
            'autoplay': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
        }
    });
}

function onPlayerReady(event) {
    console.log("YouTube Player is ready");
}

function onPlayerError(event) {
    console.error("Error memutar video. Lanjut ke lagu berikutnya...", event.data);
    playNextSimilarSong(); // Jika lagu di-block/error, otomatis lanjut
}

function onPlayerStateChange(event) {
    const mainPlayBtn = document.getElementById('mainPlayBtn');
    const miniPlayBtn = document.getElementById('miniPlayBtn');
    
    // Play Path
    const playIconPath = "M8 5v14l11-7z";
    // Pause Path
    const pauseIconPath = "M6 19h4V5H6v14zm8-14v14h4V5h-4z";

    if (event.data == YT.PlayerState.PLAYING) {
        isPlaying = true;
        mainPlayBtn.innerHTML = `<path d="${pauseIconPath}"></path>`;
        miniPlayBtn.innerHTML = `<path d="${pauseIconPath}"></path>`;
        startProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
    } else if (event.data == YT.PlayerState.PAUSED) {
        isPlaying = false;
        mainPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        miniPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        stopProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
    } else if (event.data == YT.PlayerState.ENDED) {
        isPlaying = false;
        mainPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        miniPlayBtn.innerHTML = `<path d="${playIconPath}"></path>`;
        stopProgressBar();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'none';
        
        // Fitur Auto-play lagu selanjutnya saat lagu habis
        playNextSimilarSong();
    }
}

// Update UI dan integrasi Media Session API untuk background play (Aman dari crash)
function updateMediaSession() {
    if ('mediaSession' in navigator && currentTrack) {
        try {
            // Gunakan gambar valid atau kosongkan jika tidak ada agar tidak crash di mobile
            const artworkUrl = currentTrack.img && currentTrack.img.startsWith('http') ? currentTrack.img : 'https://placehold.co/512x512/282828/FFFFFF?text=Music';
            
            navigator.mediaSession.metadata = new MediaMetadata({
                title: currentTrack.title || 'Unknown Title',
                artist: currentTrack.artist || 'Unknown Artist',
                artwork: [
                    { src: artworkUrl, sizes: '512x512', type: 'image/png' }
                ]
            });

            navigator.mediaSession.setActionHandler('play', function() { togglePlay(); });
            navigator.mediaSession.setActionHandler('pause', function() { togglePlay(); });
            navigator.mediaSession.setActionHandler('nexttrack', function() { playNextSimilarSong(); });
        } catch (error) {
            console.warn("Background MediaSession diabaikan karena browser tidak full support:", error);
        }
    }
}

// Fitur Auto-play lagu dengan genre/artis yang sama
async function playNextSimilarSong() {
    if (!currentTrack) return;
    try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(currentTrack.artist + " official audio")}`);
        const result = await response.json();
        
        if (result.status === 'success' && result.data && result.data.length > 0) {
            // Filter agar lagu yang sama tidak diputar ulang
            const relatedSongs = result.data.filter(t => t.videoId !== currentTrack.videoId);
            if (relatedSongs.length > 0) {
                // Pilih lagu secara acak dari hasil yang relevan
                const nextTrack = relatedSongs[Math.floor(Math.random() * relatedSongs.length)];
                
                const img = nextTrack.thumbnail ? nextTrack.thumbnail : (nextTrack.img ? nextTrack.img : 'https://placehold.co/140x140/282828/FFFFFF?text=Music');
                const artist = nextTrack.artist ? nextTrack.artist : 'Unknown';
                const trackData = encodeURIComponent(JSON.stringify({videoId: nextTrack.videoId, title: nextTrack.title, artist: artist, img: img}));
                
                playMusic(nextTrack.videoId, trackData);
            }
        }
    } catch (error) {
        console.error("Gagal auto-play lagu selanjutnya", error);
    }
}

function playMusic(videoId, encodedTrackData) {
    currentTrack = JSON.parse(decodeURIComponent(encodedTrackData));
    checkIfLiked(currentTrack.videoId);

    // Update UI Mini Player
    document.getElementById('miniPlayer').style.display = 'flex';
    document.getElementById('miniPlayerImg').src = currentTrack.img;
    document.getElementById('miniPlayerTitle').innerText = currentTrack.title;
    document.getElementById('miniPlayerArtist').innerText = currentTrack.artist;

    // Update UI Full Player
    document.getElementById('playerArt').src = currentTrack.img;
    document.getElementById('playerTitle').innerText = currentTrack.title;
    document.getElementById('playerArtist').innerText = currentTrack.artist;
    document.getElementById('playerBg').style.backgroundImage = `url('${currentTrack.img}')`;

    // Set Background Play Control
    updateMediaSession();

    // Pastikan ytPlayer sudah siap sebelum memanggil loadVideoById
    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
        ytPlayer.loadVideoById(videoId);
    } else {
        // Jika diklik terlalu cepat sebelum Iframe siap, tunggu bentar
        const checkReady = setInterval(() => {
            if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
                ytPlayer.loadVideoById(videoId);
                clearInterval(checkReady);
            }
        }, 500);
    }
    
    document.getElementById('progressBar').value = 0;
    document.getElementById('currentTime').innerText = "0:00";
    document.getElementById('totalTime').innerText = "0:00";
}

function togglePlay() {
    if (!ytPlayer) return;
    if (isPlaying) {
        ytPlayer.pauseVideo();
    } else {
        ytPlayer.playVideo();
    }
}

function expandPlayer() {
    document.getElementById('playerModal').style.display = 'flex';
}

function minimizePlayer() {
    document.getElementById('playerModal').style.display = 'none';
}

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function startProgressBar() {
    stopProgressBar();
    progressInterval = setInterval(() => {
        if (ytPlayer && ytPlayer.getCurrentTime && ytPlayer.getDuration) {
            const current = ytPlayer.getCurrentTime();
            const duration = ytPlayer.getDuration();
            
            if (duration > 0) {
                const percent = (current / duration) * 100;
                const progressBar = document.getElementById('progressBar');
                progressBar.value = percent;
                progressBar.style.background = `linear-gradient(to right, white ${percent}%, rgba(255,255,255,0.2) ${percent}%)`;
                
                document.getElementById('currentTime').innerText = formatTime(current);
                document.getElementById('totalTime').innerText = formatTime(duration);
            }
        }
    }, 1000);
}

function stopProgressBar() {
    clearInterval(progressInterval);
}

function seekTo(value) {
    if (ytPlayer && ytPlayer.getDuration) {
        const duration = ytPlayer.getDuration();
        const seekTime = (value / 100) * duration;
        ytPlayer.seekTo(seekTime, true);
        const percent = value;
        document.getElementById('progressBar').style.background = `linear-gradient(to right, white ${percent}%, rgba(255,255,255,0.2) ${percent}%)`;
    }
}

// --- 3. SISTEM NAVIGASI ---
function switchView(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById('view-' + viewName).classList.add('active');
    
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    navItems.forEach(nav => nav.classList.remove('active'));
    if(viewName === 'home') navItems[0].classList.add('active');
    else if (viewName === 'search') navItems[1].classList.add('active');
    else if (viewName === 'library') { navItems[2].classList.add('active'); renderLibraryUI(); }
    else if (viewName === 'developer') navItems[3].classList.add('active'); 
    
    window.scrollTo(0,0);
}

// --- 4. RENDER KOMPONEN UI ---
const dotsSvg = '<svg class="dots-icon" viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>';

function createListHTML(track) {
    const img = track.thumbnail ? track.thumbnail : (track.img ? track.img : 'https://placehold.co/48x48/282828/FFFFFF?text=Music');
    const artist = track.artist ? track.artist : 'Unknown';
    const trackData = encodeURIComponent(JSON.stringify({videoId: track.videoId, title: track.title, artist: artist, img: img}));
    
    return `
        <div class="v-item" onclick="playMusic('${track.videoId}', '${trackData}')">
            <img src="${img}" class="v-img" onerror="this.src='https://placehold.co/48x48/282828/FFFFFF?text=Music'">
            <div class="v-info">
                <div class="v-title">${track.title}</div>
                <div class="v-sub">${artist}</div>
            </div>
            ${dotsSvg}
        </div>
    `;
}

function createCardHTML(track, isArtist = false) {
    const img = track.thumbnail ? track.thumbnail : (track.img ? track.img : 'https://placehold.co/140x140/282828/FFFFFF?text=Music');
    const artist = track.artist ? track.artist : 'Unknown';
    const trackData = encodeURIComponent(JSON.stringify({videoId: track.videoId, title: track.title, artist: artist, img: img}));
    
    const clickAction = isArtist ? `openArtistView('${track.title}')` : `playMusic('${track.videoId}', '${trackData}')`;
    const imgClass = isArtist ? 'h-img artist-img' : 'h-img';

    return `
        <div class="h-card" onclick="${clickAction}">
            <img src="${img}" class="${imgClass}" onerror="this.src='https://placehold.co/140x140/282828/FFFFFF?text=Music'">
            <div class="h-title">${track.title}</div>
            <div class="h-sub">${isArtist ? 'Artis' : artist}</div>
        </div>
    `;
}

async function fetchAndRender(query, containerId, formatType, isArtist = false) {
    try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
        const result = await response.json();
        if (result.status === 'success') {
            let tracks = result.data.slice(0, formatType === 'list' ? 4 : 8);
            let html = '';
            tracks.forEach(t => html += formatType === 'list' ? createListHTML(t) : createCardHTML(t, isArtist));
            document.getElementById(containerId).innerHTML = html;
        }
    } catch (error) {}
}

async function loadHomeData() {
    try {
        // PERUBAHAN NO 1: Fetch gabungan 1 kali dari backend caching agar kuat ribuan user
        const response = await fetch('/api/home');
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
            const data = result.data;
            
            const renderHTML = (tracks, formatType, isArtist = false) => {
                let html = '';
                if(tracks) {
                    tracks.forEach(t => html += formatType === 'list' ? createListHTML(t) : createCardHTML(t, isArtist));
                }
                return html;
            };

            document.getElementById('recentList').innerHTML = renderHTML(data.recent, 'list');
            document.getElementById('rowAnyar').innerHTML = renderHTML(data.anyar, 'card');
            document.getElementById('rowGembira').innerHTML = renderHTML(data.gembira, 'card');
            document.getElementById('rowCharts').innerHTML = renderHTML(data.charts, 'card');
            document.getElementById('rowGalau').innerHTML = renderHTML(data.galau, 'card');
            document.getElementById('rowBaru').innerHTML = renderHTML(data.baru, 'card');
            document.getElementById('rowTiktok').innerHTML = renderHTML(data.tiktok, 'card');
            document.getElementById('rowArtists').innerHTML = renderHTML(data.artists, 'card', true);
        }
    } catch (error) {
        console.error("Gagal memuat data home gabungan", error);
    }
}

function renderSearchCategories() {
    const categories = [
        { title: 'Dibuat Untuk Kamu', color: '#8d67ab', img: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=100&q=80' },
        { title: 'Rilis Mendatang', color: '#188653', img: 'https://images.unsplash.com/photo-1493225457124-a1a2a5956093?w=100&q=80' },
        { title: 'Rilis Baru', color: '#739c18', img: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&q=80' },
        { title: 'Ramadan', color: '#188653', img: 'https://images.unsplash.com/photo-1584551246679-0daf3d275d0f?w=100&q=80' },
        { title: 'Pop', color: '#477d95', img: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=100&q=80' },
        { title: 'Indie', color: '#e1118c', img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=100&q=80' },
        { title: 'Musik Indonesia', color: '#e8115b', img: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=100&q=80' },
        { title: 'Tangga Lagu', color: '#8d67ab', img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&q=80' },
        { title: 'Peringkat Podcast', color: '#1e3264', img: 'https://images.unsplash.com/photo-1593697821252-0c9137d9fc45?w=100&q=80' },
        { title: 'K-pop', color: '#e8115b', img: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=100&q=80' }
    ];
    let html = '';
    categories.forEach(cat => { html += `<div class="category-card" style="background-color: ${cat.color};"><div class="category-title">${cat.title}</div><img src="${cat.img}" class="category-img"></div>`; });
    document.getElementById('categoryGrid').innerHTML = html;
}

let searchTimeout;
document.getElementById('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (query.length === 0) {
        document.getElementById('searchCategoriesUI').style.display = 'block';
        document.getElementById('searchResultsUI').style.display = 'none';
        return;
    }
    document.getElementById('searchCategoriesUI').style.display = 'none';
    document.getElementById('searchResultsUI').style.display = 'block';

    searchTimeout = setTimeout(async () => {
        document.getElementById('searchResults').innerHTML = '<div style="color:var(--text-sub); text-align:center;">Mencari musik...</div>';
        try {
            const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
            const result = await response.json();
            if (result.status === 'success') {
                let html = '';
                result.data.forEach(t => html += createListHTML(t));
                document.getElementById('searchResults').innerHTML = html;
            }
        } catch (error) {}
    }, 800);
});

// --- 5. FITUR HALAMAN ARTIS ---
async function openArtistView(artistName) {
    document.getElementById('artistNameDisplay').innerText = artistName;
    document.getElementById('artistTracksContainer').innerHTML = '<div style="color:var(--text-sub); text-align:center;">Memuat lagu artis...</div>';
    switchView('artist');

    try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(artistName + " official audio")}`);
        const result = await response.json();
        if (result.status === 'success') {
            let html = '';
            result.data.forEach(track => { html += createListHTML(track); });
            document.getElementById('artistTracksContainer').innerHTML = html;
            
            if(result.data.length > 0) {
                const firstTrack = result.data[0];
                const img = firstTrack.thumbnail ? firstTrack.thumbnail : (firstTrack.img ? firstTrack.img : 'https://placehold.co/48x48/282828/FFFFFF?text=Music');
                const artist = firstTrack.artist ? firstTrack.artist : 'Unknown';
                const trackData = encodeURIComponent(JSON.stringify({videoId: firstTrack.videoId, title: firstTrack.title, artist: artist, img: img}));
                document.querySelector('.artist-play-btn').setAttribute('onclick', `playMusic('${firstTrack.videoId}', '${trackData}')`);
            }
        }
    } catch(e) {}
}

// --- 6. LOGIKA KOLEKSI, LIKE & PLAYLIST ---

function checkIfLiked(videoId) {
    const tx = db.transaction("liked_songs", "readonly");
    const request = tx.objectStore("liked_songs").get(videoId);
    request.onsuccess = function() {
        const btnLikeSong = document.getElementById('btnLikeSong');
        if(request.result) {
            btnLikeSong.classList.add('liked');
            btnLikeSong.style.fill = '#1ed760'; // Mengganti inline style ke hijau
        } else {
            btnLikeSong.classList.remove('liked');
            btnLikeSong.style.fill = 'white'; // Mengembalikan inline style ke putih
        }
    };
}

function toggleLike() {
    if(!currentTrack) return;
    const tx = db.transaction("liked_songs", "readwrite");
    const store = tx.objectStore("liked_songs");
    const getReq = store.get(currentTrack.videoId);

    getReq.onsuccess = function() {
        const btnLikeSong = document.getElementById('btnLikeSong');
        if(getReq.result) {
            store.delete(currentTrack.videoId);
            btnLikeSong.classList.remove('liked');
            btnLikeSong.style.fill = 'white'; // Hapus Like -> Putih
        } else {
            store.put(currentTrack);
            btnLikeSong.classList.add('liked');
            btnLikeSong.style.fill = '#1ed760'; // Tambah Like -> Hijau
        }
        renderLibraryUI();
    };
}

function renderLibraryUI() {
    if(!db) return;
    const container = document.getElementById('libraryContainer');
    let html = '';

    const tx = db.transaction("liked_songs", "readonly");
    const req = tx.objectStore("liked_songs").getAll();
    
    req.onsuccess = function() {
        const likedCount = req.result.length;
        html += `
            <div class="lib-item" onclick="openPlaylistView('liked')">
                <div class="lib-item-img liked">
                    <svg viewBox="0 0 24 24" style="fill:white; width:28px; height:28px;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                </div>
                <div class="lib-item-info">
                    <div class="lib-item-title">Lagu yang Disukai</div>
                    <div class="lib-item-sub"><svg class="pin-icon" viewBox="0 0 24 24"><path d="M12 2L15 8l6 1-4.5 4.5L18 20l-6-3-6 3 1.5-6.5L3 9l6-1z"></path></svg> Playlist • ${likedCount} lagu</div>
                </div>
            </div>
        `;

        const txP = db.transaction("playlists", "readonly");
        const reqP = txP.objectStore("playlists").getAll();
        reqP.onsuccess = function() {
            const playlists = reqP.result;
            playlists.forEach(p => {
                html += `
                    <div class="lib-item" onclick="openPlaylistView('${p.id}')">
                        <img src="${p.img || 'https://via.placeholder.com/120?text=+'}" class="lib-item-img" onerror="this.src='https://via.placeholder.com/120?text=+'">
                        <div class="lib-item-info">
                            <div class="lib-item-title">${p.name}</div>
                            <div class="lib-item-sub">Playlist • SANN404 FORUM</div>
                        </div>
                    </div>
                `;
            });

            html += `
                <div class="lib-item">
                    <div class="lib-item-img add-btn circle">
                        <svg viewBox="0 0 24 24" style="fill:white; width:32px; height:32px;"><path d="M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2h7z"></path></svg>
                    </div>
                    <div class="lib-item-info"><div class="lib-item-title">Tambahkan artis</div></div>
                </div>
                <div class="lib-item">
                    <div class="lib-item-img add-btn add-btn-sq">
                        <svg viewBox="0 0 24 24" style="fill:white; width:32px; height:32px;"><path d="M11 11V4h2v7h7v2h-7v7h-2v-7H4v-2h7z"></path></svg>
                    </div>
                    <div class="lib-item-info"><div class="lib-item-title">Tambahkan podcast</div></div>
                </div>
            `;

            container.innerHTML = html;
        };
    };
}

let currentPlaylistTracks = [];

function openPlaylistView(id) {
    switchView('playlist');
    const container = document.getElementById('playlistTracksContainer');
    container.innerHTML = '<div style="color:var(--text-sub); text-align:center;">Memuat daftar lagu...</div>';

    if (id === 'liked') {
        document.getElementById('playlistNameDisplay').innerText = "Lagu yang Disukai";
        document.getElementById('playlistImageDisplay').src = "https://via.placeholder.com/240/450af5/ffffff?text=Like";
        
        const tx = db.transaction("liked_songs", "readonly");
        const req = tx.objectStore("liked_songs").getAll();
        req.onsuccess = () => {
            currentPlaylistTracks = req.result;
            document.getElementById('playlistStatsDisplay').innerText = `${req.result.length} lagu disimpan`;
            renderTracksInPlaylist(req.result);
        };
    } else {
        const tx = db.transaction("playlists", "readonly");
        const req = tx.objectStore("playlists").get(id);
        req.onsuccess = () => {
            const p = req.result;
            currentPlaylistTracks = p.tracks || [];
            document.getElementById('playlistNameDisplay').innerText = p.name;
            document.getElementById('playlistImageDisplay').src = p.img || 'https://via.placeholder.com/240/282828/ffffff?text=+';
            const trackCount = p.tracks ? p.tracks.length : 0;
            document.getElementById('playlistStatsDisplay').innerText = `${trackCount} lagu disimpan`;
            renderTracksInPlaylist(p.tracks || []);
        };
    }
}

function playFirstPlaylistTrack() {
    if(currentPlaylistTracks && currentPlaylistTracks.length > 0) {
        const firstTrack = currentPlaylistTracks[0];
        const trackData = encodeURIComponent(JSON.stringify(firstTrack));
        playMusic(firstTrack.videoId, trackData);
    }
}

function renderTracksInPlaylist(tracks) {
    const container = document.getElementById('playlistTracksContainer');
    if (!tracks || tracks.length === 0) {
        container.innerHTML = '<div style="color:var(--text-sub); text-align:center;">Playlist ini masih kosong.</div>';
        return;
    }
    let html = '';
    tracks.forEach(t => html += createListHTML(t));
    container.innerHTML = html;
}

let base64PlaylistImage = '';

function openCreatePlaylist() { document.getElementById('createPlaylistModal').style.display = 'block'; }
function closeCreatePlaylist() {
    document.getElementById('createPlaylistModal').style.display = 'none';
    document.getElementById('cpName').value = '';
    document.getElementById('cpPreview').src = 'https://via.placeholder.com/120x120?text=+';
    base64PlaylistImage = '';
}

function previewImage(event) {
    const file = event.target.files[0];
    const reader = new FileReader();
    reader.onloadend = () => {
        document.getElementById('cpPreview').src = reader.result;
        base64PlaylistImage = reader.result;
    };
    if(file) reader.readAsDataURL(file);
}

function saveNewPlaylist() {
    const name = document.getElementById('cpName').value || "Playlist baruku";
    const newPlaylist = { id: Date.now().toString(), name: name, img: base64PlaylistImage, tracks: [] };
    
    const tx = db.transaction("playlists", "readwrite");
    tx.objectStore("playlists").put(newPlaylist);
    tx.oncomplete = function() {
        closeCreatePlaylist();
        renderLibraryUI();
    };
}

function openAddToPlaylistModal() {
    if(!currentTrack) return;
    const tx = db.transaction("playlists", "readonly");
    const req = tx.objectStore("playlists").getAll();
    req.onsuccess = () => {
        let html = '';
        req.result.forEach(p => {
            html += `
                <div class="lib-item" onclick="addTrackToPlaylist('${p.id}')" style="margin-bottom: 12px; cursor: pointer;">
                    <img src="${p.img || 'https://via.placeholder.com/50'}" style="width:50px; height:50px; object-fit:cover; border-radius:4px;" onerror="this.src='https://via.placeholder.com/50'">
                    <div style="color:white; font-size:16px;">${p.name}</div>
                </div>`;
        });
        if(req.result.length === 0) html = '<div style="color:#a7a7a7; text-align:center;">Belum ada playlist. Buat dulu di Koleksi Kamu.</div>';
        document.getElementById('addToPlaylistList').innerHTML = html;
        document.getElementById('addToPlaylistModal').style.display = 'flex';
    };
}

function closeAddToPlaylistModal() { document.getElementById('addToPlaylistModal').style.display = 'none'; }

function addTrackToPlaylist(playlistId) {
    const tx = db.transaction("playlists", "readwrite");
    const store = tx.objectStore("playlists");
    const req = store.get(playlistId);
    req.onsuccess = () => {
        const p = req.result;
        if(!p.tracks) p.tracks = [];
        if(!p.tracks.find(t => t.videoId === currentTrack.videoId)) {
            p.tracks.push(currentTrack);
            store.put(p);
            alert('Lagu berhasil ditambahkan ke playlist ' + p.name + '!');
        } else {
            alert('Lagu ini sudah ada di playlist ' + p.name + '.');
        }
        closeAddToPlaylistModal();
    };
}

window.onload = () => {
    loadHomeData();
    renderSearchCategories();
};
