let player;
let isPlaying = false;

// Setup YouTube API saat siap
function onYouTubeIframeAPIReady() {
    player = new YT.Player('youtube-player', {
        height: '0', width: '0',
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log("Player is ready");
}

function onPlayerStateChange(event) {
    const playBtn = document.getElementById('playBtn');
    if (event.data == YT.PlayerState.PLAYING) {
        isPlaying = true;
        playBtn.innerText = "⏸ Pause";
    } else if (event.data == YT.PlayerState.PAUSED || event.data == YT.PlayerState.ENDED) {
        isPlaying = false;
        playBtn.innerText = "▶ Play";
    }
}

async function searchMusic() {
    const query = document.getElementById('searchInput').value;
    if (!query) return;

    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('resultsGrid').innerHTML = '';

    try {
        const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
        const result = await response.json();

        if (result.status === 'success') {
            displayResults(result.data);
        } else {
            alert("Gagal mengambil data dari server");
        }
    } catch (error) {
        console.error("Error fetching data:", error);
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

function displayResults(songs) {
    const grid = document.getElementById('resultsGrid');
    songs.forEach(song => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <img src="${song.thumbnail}" alt="Thumbnail">
            <h3>${song.title}</h3>
            <p>${song.artist}</p>
        `;
        // Klik card untuk memutar lagu
        card.onclick = () => playSong(song.videoId, song.title, song.artist, song.thumbnail);
        grid.appendChild(card);
    });
}

function playSong(videoId, title, artist, thumbnail) {
    document.getElementById('playerTitle').innerText = title;
    document.getElementById('playerArtist').innerText = artist;
    document.getElementById('playerImage').src = thumbnail;

    if (player && player.loadVideoById) {
        player.loadVideoById(videoId);
    }
}

function togglePlay() {
    if (!player) return;
    if (isPlaying) {
        player.pauseVideo();
    } else {
        player.playVideo();
    }
}
