async function searchMusic() {
    const query = document.getElementById('searchInput').value;
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<p>Searching...</p>';

    const res = await fetch(`/api/search?q=${query}`);
    const data = await res.json();

    resultsDiv.innerHTML = data.map(song => `
        <div class="bg-zinc-900 p-4 rounded-xl hover:bg-zinc-800 transition cursor-pointer group" 
             onclick="playSong('${song.videoId}', '${song.title}', '${song.artists[0].name}', '${song.thumbnails[0].url}')">
            <img src="${song.thumbnails[0].url}" class="rounded-lg mb-3 shadow-lg">
            <h3 class="font-semibold truncate">${song.title}</h3>
            <p class="text-sm text-zinc-400 truncate">${song.artists[0].name}</p>
        </div>
    `).join('');
}

async function playSong(id, title, artist, art) {
    document.getElementById('trackTitle').innerText = title;
    document.getElementById('trackArtist').innerText = artist;
    document.getElementById('trackArt').style.backgroundImage = `url(${art})`;
    document.getElementById('trackArt').style.backgroundSize = 'cover';

    const res = await fetch(`/api/stream?id=${id}`);
    const data = await res.json();
    
    const player = document.getElementById('audioPlayer');
    player.src = data.url;
    player.play();
}
