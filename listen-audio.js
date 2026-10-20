// Stream the show's public RSS enclosures with the site's own controls.
(() => {
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  const player = document.createElement('div');
  player.className = 'podcast-player';
  player.innerHTML = `<div class="podcast-controls">
    <button class="podcast-toggle" type="button" aria-label="Play episode">Play</button>
    <input class="podcast-seek" type="range" min="0" max="1" step="1" value="0" aria-label="Seek in episode" disabled>
    <span class="podcast-time">0:00 / 0:00</span>
  </div><p class="podcast-error" role="status" hidden></p>`;
  player.append(audio);
  const toggle = player.querySelector('button');
  const seek = player.querySelector('input');
  const time = player.querySelector('.podcast-time');
  const error = player.querySelector('.podcast-error');
  let currentLink;
  let fallbackDuration = 0;

  function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor(seconds % 3600 / 60);
    const remainder = String(seconds % 60).padStart(2, '0');
    return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`;
  }

  function update() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : fallbackDuration;
    const position = audio.currentTime || 0;
    seek.max = Math.max(1, duration);
    seek.value = position;
    seek.disabled = audio.readyState < 1 || duration <= 0;
    seek.setAttribute('aria-valuetext', `${formatTime(position)} of ${formatTime(duration)}`);
    time.textContent = `${formatTime(position)} / ${formatTime(duration)}`;
    toggle.textContent = audio.paused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-label', `${audio.paused ? 'Play' : 'Pause'} episode`);
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-audio-src]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (currentLink === link && !player.hidden) {
      audio.pause();
      player.hidden = true;
      link.setAttribute('aria-expanded', 'false');
      return;
    }
    player.hidden = false;
    link.setAttribute('aria-expanded', 'true');
    if (currentLink !== link) {
      audio.pause();
      currentLink?.removeAttribute('aria-expanded');
      currentLink = link;
      link.setAttribute('aria-expanded', 'true');
      link.closest('li').append(player);
      fallbackDuration = link.dataset.duration.split(':').reduce((sum, part) => sum * 60 + Number(part), 0);
      error.hidden = true;
      audio.src = link.dataset.audioSrc;
      audio.load();
      update();
    }
    toggle.focus({ preventScroll: true });
  });

  toggle.addEventListener('click', async () => {
    if (!audio.paused) {
      audio.pause();
      return;
    }
    const source = audio.getAttribute('src');
    error.hidden = true;
    if (audio.error) audio.load();
    try {
      await audio.play();
    } catch (failure) {
      if (failure.name === 'AbortError' || audio.getAttribute('src') !== source) return;
      error.textContent = 'Audio could not play. Please try again.';
      error.hidden = false;
    }
  });
  seek.addEventListener('input', () => {
    if (audio.readyState >= 1) audio.currentTime = Number(seek.value);
    update();
  });
  for (const event of ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause', 'ended', 'emptied']) {
    audio.addEventListener(event, update);
  }
  audio.addEventListener('error', () => {
    error.textContent = 'Audio could not load. Please try again.';
    error.hidden = false;
    update();
  });
  window.addEventListener('pagehide', () => audio.pause());
})();
