(() => {
  "use strict";

  const audio = document.getElementById("page-load-sound");
  const canvas = document.getElementById("rave-visualizer");
  const soundButton = document.getElementById("sound-toggle");
  const soundStatus = document.getElementById("sound-status");
  const subtitle = document.getElementById("sound-subtitle");
  const subtitleText = document.getElementById("sound-subtitle-text");
  const subtitleProgress = document.getElementById("sound-subtitle-progress");
  const rhythmGalleryLayer = document.getElementById("rhythm-gallery-layer");
  const rhythmGalleryCount = document.getElementById("rhythm-gallery-count");
  const rhythmGalleryProgress = document.getElementById("rhythm-gallery-progress");
  if (!audio || !canvas || !soundButton || !soundStatus) return;

  const ctx = canvas.getContext("2d");
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const localFileMode = window.location.protocol === "file:";
  const ANALYSIS_INTERVAL_MS = 30;
  const ONSET_HISTORY_SIZE = 44;
  const PERCUSSION_REFRACTORY_MS = 65;
  const GALLERY_FIRST_APPEARANCE_SECONDS = 30;
  const GALLERY_MIN_DURATION_MS = 6000;
  const GALLERY_MAX_DURATION_MS = 8000;
  const GALLERY_GAP_SECONDS = 3;
  // Paste direct image links here. Empty or non-HTTP entries are ignored.
  const galleryImageLinks = [
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSRgVTn3DvToRQk4eZ4WhsiAkw_brkBA6yXXC9cxTzHWVy_VpsUqK5JDH_p&s=10",
    "https://i.pinimg.com/736x/6c/7b/d0/6c7bd05189c6c6da96fff6705301afa5.jpg",
    "https://media.tenor.com/mpxG95eb7aAAAAAe/rusdi-ngawi.png",
    "https://media.licdn.com/dms/image/v2/D4E03AQF0EnyeCdrZIg/profile-displayphoto-shrink_200_200/profile-displayphoto-shrink_200_200/0/1713884929816?e=2147483647&v=beta&t=7noXGuvU2CLHJrhygpVNiQmR2cOQM4CA5S_c6o7WVsM",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS7OUY9RnN5LkP62Wnbh4JoiJBZrM9b0ZvbSq4Uw8pvi_l40JDB32gEkEY&s=10",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSty2tQkl9rMTA8QGppf5ZRQ_oLbu_2OJ1IK0aag7AbgB4oC3z_fxchaumI&s=10",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQQksOGul25HcNJowmz_86fajjZ5mj2F4D2IJaytG4sJXAe_uZhIXWxe4w&s=10",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQxoI1Lzohx6Dovt331RehQqbaCQnQEp6IWbOJblEu0UoJfssNgJ5nOEfcW&s=10",
    "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS6fv55MpvsUnomSOaKw8m_d8zZXH09g-3tmoRJl1uodk9zaz-d27aI99pN&s=10"
  ];
  const galleryImages = galleryImageLinks
    .map((source) => source.trim())
    .filter((source) => /^https?:\/\//i.test(source));

  let audioContext;
  let analyser;
  let frequencyData;
  let previousFrequencyData;
  let silentAnalysisGain;
  let animationId = 0;
  let zoomStartedAt = -Infinity;
  let zoomStrength = 0;
  let smoothBass = 0;
  let smoothMid = 0;
  let smoothHigh = 0;
  let lastAnalysisAt = -Infinity;
  let lastPercussionHit = -Infinity;
  let pageRotationDirection = 1;
  let analysisPrimed = false;
  let previousKick = 0;
  let previousSnareBody = 0;
  let previousSnap = 0;
  let previousAir = 0;
  let subtitleCues = [];
  let activeSubtitleIndex = -1;
  let subtitleGlyphs = [];
  let sungGlyphCount = 0;
  let galleryDeck = [];
  let galleryPulseCount = 0;
  let lastGalleryImage = "";
  let nextGallerySpawnAt = GALLERY_FIRST_APPEARANCE_SECONDS;

  function shuffle(values) {
    const shuffled = [...values];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const swapIndex = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[i]];
    }
    return shuffled;
  }

  function refillGalleryDeck() {
    galleryDeck = shuffle(galleryImages);
    if (galleryDeck.length > 1 && galleryDeck[galleryDeck.length - 1] === lastGalleryImage) {
      [galleryDeck[0], galleryDeck[galleryDeck.length - 1]] = [galleryDeck[galleryDeck.length - 1], galleryDeck[0]];
    }
  }

  function nextGalleryImage() {
    if (!galleryDeck.length) refillGalleryDeck();
    lastGalleryImage = galleryDeck.pop();
    return lastGalleryImage;
  }

  function preloadGalleryImages() {
    galleryImages.forEach((source) => {
      const image = new Image();
      image.decoding = "async";
      image.src = source;
    });
  }

  function spawnGalleryShot(strength, time) {
    if (!rhythmGalleryLayer || !galleryImages.length || audio.currentTime < nextGallerySpawnAt) return;

    const shot = document.createElement("div");
    const image = document.createElement("img");
    const edgeBias = Math.random();
    const x = edgeBias < 0.5 ? 8 + Math.random() * 26 : 66 + Math.random() * 27;
    const y = 18 + Math.random() * 57;
    const minViewport = Math.min(window.innerWidth, window.innerHeight);
    const size = Math.round(Math.max(118, Math.min(330, minViewport * (0.2 + strength * 0.14))));
    const tilt = -14 + Math.random() * 28;
    const hue = Math.round((audio.currentTime * 37 + galleryPulseCount * 71) % 360);
    const driftDirection = x < 50 ? -1 : 1;
    const motif = ["", "rhythm-shot--wide", "rhythm-shot--tall"][galleryPulseCount % 3];

    shot.className = `rhythm-shot ${motif}${galleryPulseCount % 5 === 4 ? " rhythm-shot--echo" : ""}`;
    shot.style.setProperty("--shot-x", `${x.toFixed(1)}vw`);
    shot.style.setProperty("--shot-y", `${y.toFixed(1)}vh`);
    shot.style.setProperty("--shot-size", `${size}px`);
    shot.style.setProperty("--shot-tilt", `${tilt.toFixed(1)}deg`);
    shot.style.setProperty("--shot-drift-x", `${Math.round(driftDirection * (28 + Math.random() * 70))}px`);
    shot.style.setProperty("--shot-drift-y", `${Math.round(-54 + Math.random() * 108)}px`);
    shot.style.setProperty("--shot-hue", String(hue));
    const shotLife = Math.round(
      GALLERY_MIN_DURATION_MS
      + Math.random() * (GALLERY_MAX_DURATION_MS - GALLERY_MIN_DURATION_MS)
    );
    shot.style.setProperty("--shot-life", `${shotLife}ms`);

    image.className = "rhythm-shot__image";
    image.src = nextGalleryImage();
    image.alt = "";
    image.decoding = "async";
    image.draggable = false;
    shot.appendChild(image);
    rhythmGalleryLayer.appendChild(shot);

    galleryPulseCount += 1;
    nextGallerySpawnAt = audio.currentTime + shotLife / 1000 + GALLERY_GAP_SECONDS;
    if (rhythmGalleryCount) rhythmGalleryCount.textContent = `PULSE ${String(galleryPulseCount).padStart(3, "0")}`;
    shot.addEventListener("animationend", () => shot.remove(), { once: true });
  }

  function clearGallery() {
    if (rhythmGalleryLayer) rhythmGalleryLayer.replaceChildren();
    if (rhythmGalleryProgress) rhythmGalleryProgress.style.width = "0%";
    galleryPulseCount = 0;
    nextGallerySpawnAt = Math.max(
      GALLERY_FIRST_APPEARANCE_SECONDS,
      audio.currentTime + GALLERY_GAP_SECONDS
    );
    if (rhythmGalleryCount) rhythmGalleryCount.textContent = "PULSE 000";
  }

  async function loadSubtitles() {
    if (!subtitle || !subtitleText || !subtitleProgress) return;

    try {
      const response = await fetch("sound-effect.json");
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const subtitleData = await response.json();

      subtitleCues = (Array.isArray(subtitleData.lyrics) ? subtitleData.lyrics : [])
        .map((cue) => ({
          start: Number(cue.start_seconds),
          end: Number(cue.end_seconds),
          text: String(cue.text || "").trim()
        }))
        .filter((cue) => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start && cue.text)
        .sort((a, b) => a.start - b.start);

      if (!audio.paused) updateSubtitle(audio.currentTime);
    } catch (error) {
      console.warn("Could not load subtitles from sound-effect.json:", error);
    }
  }

  function findSubtitleIndex(time) {
    const currentCue = subtitleCues[activeSubtitleIndex];
    if (currentCue && time >= currentCue.start && time < currentCue.end) return activeSubtitleIndex;

    for (let i = 0; i < subtitleCues.length; i += 1) {
      if (time >= subtitleCues[i].start && time < subtitleCues[i].end) return i;
      if (subtitleCues[i].start > time) break;
    }
    return -1;
  }

  function hideSubtitle() {
    if (!subtitle || !subtitleProgress) return;
    activeSubtitleIndex = -1;
    sungGlyphCount = 0;
    subtitle.classList.remove("is-visible", "is-entering");
    subtitle.setAttribute("aria-hidden", "true");
    subtitle.style.setProperty("--subtitle-progress", "0%");
    subtitle.style.setProperty("--subtitle-beat-scale", "1");
    subtitle.style.setProperty("--subtitle-beat-glow", "14px");
    subtitleProgress.style.width = "0%";
  }

  function renderSubtitleText(text) {
    subtitleText.replaceChildren();
    subtitleText.setAttribute("aria-label", text);
    subtitleGlyphs = [];
    sungGlyphCount = 0;

    text.split(/\s+/).forEach((word, wordIndex) => {
      const wordElement = document.createElement("span");
      wordElement.className = "sound-subtitle__word";
      wordElement.setAttribute("aria-hidden", "true");

      Array.from(word).forEach((character) => {
        const glyph = document.createElement("span");
        glyph.className = "sound-subtitle__glyph";
        glyph.textContent = character;
        glyph.style.setProperty("--glyph-index", subtitleGlyphs.length);
        glyph.style.setProperty("--glyph-offset", subtitleGlyphs.length * 8);
        wordElement.appendChild(glyph);
        subtitleGlyphs.push(glyph);
      });

      subtitleText.appendChild(wordElement);
      if (wordIndex < text.split(/\s+/).length - 1) {
        subtitleText.appendChild(document.createTextNode(" "));
      }
    });
  }

  function updateSubtitleGlyphs(progress) {
    const nextCount = Math.round(progress * subtitleGlyphs.length);
    if (nextCount === sungGlyphCount) return;

    const start = Math.min(sungGlyphCount, nextCount);
    const end = Math.max(sungGlyphCount, nextCount);
    for (let i = start; i < end; i += 1) {
      subtitleGlyphs[i].classList.toggle("is-sung", i < nextCount);
    }
    sungGlyphCount = nextCount;
  }

  function updateSubtitle(time) {
    if (!subtitle || !subtitleText || !subtitleProgress || !subtitleCues.length) return;

    const cueIndex = findSubtitleIndex(time);
    if (cueIndex === -1) {
      if (activeSubtitleIndex !== -1) hideSubtitle();
      return;
    }

    const cue = subtitleCues[cueIndex];
    if (cueIndex !== activeSubtitleIndex) {
      activeSubtitleIndex = cueIndex;
      renderSubtitleText(cue.text);
      subtitle.style.setProperty("--subtitle-hue", String((188 + cueIndex * 29) % 360));
      subtitle.classList.remove("is-entering");
      void subtitle.offsetWidth;
      subtitle.classList.add("is-visible", "is-entering");
      subtitle.setAttribute("aria-hidden", "false");
    }

    const cueProgress = clamp((time - cue.start) / (cue.end - cue.start), 0, 1);
    const progressValue = `${(cueProgress * 100).toFixed(2)}%`;
    subtitle.style.setProperty("--subtitle-progress", progressValue);
    subtitleProgress.style.width = progressValue;
    updateSubtitleGlyphs(cueProgress);
  }

  const onsetDetectors = {
    kick: createOnsetDetector({
      cooldown: 115,
      minEnergy: 0.065,
      minFlux: 0.011,
      minMargin: 0.003,
      sensitivity: 3
    }),
    snare: createOnsetDetector({
      cooldown: 90,
      minEnergy: 0.05,
      minFlux: 0.009,
      minMargin: 0.0025,
      sensitivity: 3.2
    }),
    hat: createOnsetDetector({
      cooldown: 75,
      minEnergy: 0.03,
      minFlux: 0.01,
      minMargin: 0.0025,
      sensitivity: 3.6
    })
  };

  function createOnsetDetector(config) {
    return {
      ...config,
      history: [],
      lastHit: -Infinity
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[middle]
      : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function detectOnset(detector, novelty, energy, time) {
    let strength = 0;

    if (detector.history.length >= 10) {
      const center = median(detector.history);
      const deviation = median(detector.history.map((value) => Math.abs(value - center)));
      const threshold = Math.max(
        detector.minFlux,
        center + Math.max(detector.minMargin, deviation * detector.sensitivity)
      );

      if (
        novelty > threshold
        && energy > detector.minEnergy
        && time - detector.lastHit >= detector.cooldown
      ) {
        const excess = (novelty - threshold) / Math.max(threshold, 0.008);
        const energyLift = clamp((energy - detector.minEnergy) / 0.28, 0, 1);
        strength = clamp(0.46 + excess * 0.62 + energyLift * 0.18, 0.46, 1.1);
        detector.lastHit = time;
      }
    }

    detector.history.push(novelty);
    if (detector.history.length > ONSET_HISTORY_SIZE) detector.history.shift();
    return strength;
  }

  function resetOnsetDetector(detector) {
    detector.history.length = 0;
    detector.lastHit = -Infinity;
  }

  function setupAudioAnalysis() {
    if (analyser || !AudioContextClass) return;

    audioContext = new AudioContextClass();
    analyser = audioContext.createAnalyser();
    // A larger FFT resolves the kick range; light smoothing preserves drum attacks.
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.2;
    analyser.minDecibels = -85;
    analyser.maxDecibels = -10;

    if (localFileMode) {
      const captureStream = audio.captureStream || audio.mozCaptureStream;
      if (!captureStream) {
        analyser = null;
        return;
      }

      const source = audioContext.createMediaStreamSource(captureStream.call(audio));
      silentAnalysisGain = audioContext.createGain();
      silentAnalysisGain.gain.value = 0;
      source.connect(analyser);
      analyser.connect(silentAnalysisGain);
      silentAnalysisGain.connect(audioContext.destination);
    } else {
      const source = audioContext.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(audioContext.destination);
    }

    frequencyData = new Uint8Array(analyser.frequencyBinCount);
    previousFrequencyData = new Uint8Array(analyser.frequencyBinCount);
  }

  function resizeCanvas() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * pixelRatio);
    canvas.height = Math.round(window.innerHeight * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function bandEnergy(fromHz, toHz) {
    const binSize = audioContext.sampleRate / analyser.fftSize;
    const start = Math.max(0, Math.floor(fromHz / binSize));
    const end = Math.min(frequencyData.length - 1, Math.ceil(toHz / binSize));
    let total = 0;

    for (let i = start; i <= end; i += 1) total += frequencyData[i];
    return total / Math.max(1, end - start + 1) / 255;
  }

  function bandFlux(fromHz, toHz) {
    const binSize = audioContext.sampleRate / analyser.fftSize;
    const start = Math.max(0, Math.floor(fromHz / binSize));
    const end = Math.min(frequencyData.length - 1, Math.ceil(toHz / binSize));
    let risingEnergy = 0;

    for (let i = start; i <= end; i += 1) {
      risingEnergy += Math.max(0, frequencyData[i] - previousFrequencyData[i]);
    }
    return risingEnergy / Math.max(1, end - start + 1) / 255;
  }

  function currentZoomEnvelope(time) {
    const zoomAge = time - zoomStartedAt;
    return zoomAge >= 0 && zoomAge < 260
      ? Math.exp(-zoomAge / 92)
      : 0;
  }

  function drawSpectrum(bass, mid, high, time) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const hue = (time * 0.035 + mid * 190) % 360;

    ctx.clearRect(0, 0, width, height);

    const backdrop = ctx.createRadialGradient(
      width * (0.5 + Math.sin(time * 0.001) * 0.18),
      height * 0.42,
      10,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.8
    );
    backdrop.addColorStop(0, `hsla(${hue}, 100%, ${24 + bass * 25}%, 0.98)`);
    backdrop.addColorStop(0.48, `hsla(${(hue + 95) % 360}, 100%, 16%, 0.96)`);
    backdrop.addColorStop(1, "rgba(3, 0, 15, 1)");
    ctx.fillStyle = backdrop;
    ctx.fillRect(0, 0, width, height);

    const barCount = 72;
    const gap = 3;
    const barWidth = width / barCount;
    ctx.globalCompositeOperation = "screen";

    for (let i = 0; i < barCount; i += 1) {
      const dataIndex = frequencyData
        ? Math.floor((i / barCount) * Math.min(frequencyData.length, 150))
        : 0;
      const strength = frequencyData
        ? frequencyData[dataIndex] / 255
        : Math.max(0.08, (Math.sin(i * 0.58 + time * 0.004) + 1) * 0.13 + bass * 0.55);
      const barHeight = Math.max(2, strength * height * 0.34);
      const x = i * barWidth;
      const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
      gradient.addColorStop(0, `hsla(${(hue + i * 3) % 360}, 100%, 55%, 0.92)`);
      gradient.addColorStop(1, `hsla(${(hue + 120 + i * 2) % 360}, 100%, 70%, 0.12)`);
      ctx.fillStyle = gradient;
      ctx.fillRect(x + gap / 2, height - barHeight, Math.max(1, barWidth - gap), barHeight);
      ctx.fillRect(x + gap / 2, 0, Math.max(1, barWidth - gap), barHeight * 0.42);
    }

    const zoomEnvelope = currentZoomEnvelope(time);
    const percussionPulse = zoomStrength * zoomEnvelope;
    const peakBlur = clamp((percussionPulse - 0.45) / 0.55, 0, 1) * 5;
    document.documentElement.style.setProperty(
      "--page-pulse-scale",
      (1 + percussionPulse * 0.09).toFixed(4)
    );
    document.documentElement.style.setProperty(
      "--page-pulse-rotation",
      `${(percussionPulse * pageRotationDirection * 2).toFixed(2)}deg`
    );
    document.documentElement.style.setProperty("--page-pulse-blur", `${peakBlur.toFixed(2)}px`);
    ctx.globalAlpha = 0.2 + percussionPulse * 0.36;
    ctx.strokeStyle = `hsl(${(hue + 180) % 360} 100% 75%)`;
    ctx.lineWidth = 3 + percussionPulse * 6;
    ctx.beginPath();
    ctx.arc(
      width / 2,
      height / 2,
      Math.min(width, height) * (0.14 + percussionPulse * 0.045),
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }

  function render(time) {
    if (audio.paused || audio.ended) {
      stopVisualizer();
      return;
    }

    updateSubtitle(audio.currentTime);
    if (rhythmGalleryProgress) {
      const songProgress = Number.isFinite(audio.duration) && audio.duration > 0
        ? clamp(audio.currentTime / audio.duration, 0, 1)
        : 0;
      rhythmGalleryProgress.style.width = `${(songProgress * 100).toFixed(2)}%`;
    }

    let bass;
    let mid;
    let high;
    let kick;
    let snareBody;
    let snap;
    let air;
    let percussionStrength = 0;

    if (analyser) {
      analyser.getByteFrequencyData(frequencyData);
      kick = bandEnergy(35, 180);
      snareBody = bandEnergy(180, 2200);
      snap = bandEnergy(2200, 7000);
      air = bandEnergy(7000, 12000);
      bass = bandEnergy(35, 360);
      mid = bandEnergy(190, 2200);
      high = bandEnergy(2200, 9000);

      // Compare spectra at a stable cadence so high-refresh displays do not
      // produce smaller, less reliable flux values than 60 Hz displays.
      if (time - lastAnalysisAt >= ANALYSIS_INTERVAL_MS) {
        if (analysisPrimed) {
          const kickFlux = bandFlux(35, 180);
          const bodyFlux = bandFlux(180, 2200);
          const snapFlux = bandFlux(2200, 7000);
          const airFlux = bandFlux(7000, 12000);
          const kickRise = Math.max(0, kick - previousKick);
          const bodyRise = Math.max(0, snareBody - previousSnareBody);
          const snapRise = Math.max(0, snap - previousSnap);
          const airRise = Math.max(0, air - previousAir);

          const kickOnset = detectOnset(
            onsetDetectors.kick,
            kickFlux * 0.72 + kickRise * 0.28,
            kick,
            time
          );
          const snareOnset = detectOnset(
            onsetDetectors.snare,
            bodyFlux * 0.38 + snapFlux * 0.46 + bodyRise * 0.06 + snapRise * 0.1,
            snareBody * 0.42 + snap * 0.58,
            time
          );
          const hatOnset = detectOnset(
            onsetDetectors.hat,
            snapFlux * 0.25 + airFlux * 0.57 + snapRise * 0.05 + airRise * 0.13,
            snap * 0.3 + air * 0.7,
            time
          );

          // Low drums move the circle most; snares and hats make smaller pulses.
          percussionStrength = Math.max(kickOnset, snareOnset * 0.78, hatOnset * 0.42);
        } else {
          analysisPrimed = true;
        }

        previousKick = kick;
        previousSnareBody = snareBody;
        previousSnap = snap;
        previousAir = air;
        previousFrequencyData.set(frequencyData);
        lastAnalysisAt = time;
      }
    } else {
      // Browsers without local-stream FFT still get visuals, but no fake zoom beats.
      const seconds = audio.currentTime;
      kick = 0.2 + Math.max(0, Math.sin(seconds * 5.1)) * 0.46;
      snareBody = 0.16 + Math.max(0, Math.sin(seconds * 3.4 + 0.8)) * 0.32;
      snap = 0.14 + Math.max(0, Math.sin(seconds * 6.8 + 2.2)) * 0.3;
      air = 0.1 + Math.max(0, Math.sin(seconds * 10.6 + 0.4)) * 0.2;
      bass = kick * 0.68 + snareBody * 0.32;
      mid = 0.22 + Math.max(0, Math.sin(seconds * 2.7 + 1.4)) * 0.26;
      high = 0.15 + Math.max(0, Math.sin(seconds * 8.3 + 0.7)) * 0.18;
    }

    smoothBass += (bass - smoothBass) * 0.28;
    smoothMid += (mid - smoothMid) * 0.2;
    smoothHigh += (high - smoothHigh) * 0.22;

    if (subtitle && activeSubtitleIndex !== -1) {
      subtitle.style.setProperty("--subtitle-beat-scale", (1 + smoothBass * 0.075).toFixed(3));
      subtitle.style.setProperty("--subtitle-beat-glow", `${(14 + smoothBass * 34).toFixed(1)}px`);
    }

    if (percussionStrength > 0 && time - lastPercussionHit >= PERCUSSION_REFRACTORY_MS) {
      pageRotationDirection *= -1;
      zoomStrength = percussionStrength;
      zoomStartedAt = time;
      lastPercussionHit = time;
    }

    if (audio.currentTime >= nextGallerySpawnAt && percussionStrength >= 0.48) {
      spawnGalleryShot(percussionStrength, time);
    } else if (audio.currentTime >= nextGallerySpawnAt) {
      spawnGalleryShot(clamp(0.44 + smoothBass * 0.7, 0.44, 0.86), time);
    }

    drawSpectrum(smoothBass, smoothMid, smoothHigh, time);
    animationId = requestAnimationFrame(render);
  }

  function startVisualizer() {
    document.body.classList.add("rave-active");
    soundStatus.textContent = "";
    updateSubtitle(audio.currentTime);
    cancelAnimationFrame(animationId);
    animationId = requestAnimationFrame(render);
  }

  function stopVisualizer() {
    cancelAnimationFrame(animationId);
    animationId = 0;
    document.body.classList.remove("rave-active");
    document.documentElement.style.removeProperty("--page-pulse-scale");
    document.documentElement.style.removeProperty("--page-pulse-rotation");
    document.documentElement.style.removeProperty("--page-pulse-blur");
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    zoomStartedAt = -Infinity;
    zoomStrength = 0;
    lastAnalysisAt = -Infinity;
    lastPercussionHit = -Infinity;
    pageRotationDirection = 1;
    analysisPrimed = false;
    previousKick = 0;
    previousSnareBody = 0;
    previousSnap = 0;
    previousAir = 0;
    Object.values(onsetDetectors).forEach(resetOnsetDetector);
    if (previousFrequencyData) previousFrequencyData.fill(0);
    hideSubtitle();
    clearGallery();
  }

  async function playExperience() {
    audio.muted = false;
    audio.volume = 1;
    setupAudioAnalysis();
    if (audioContext && audioContext.state === "suspended") await audioContext.resume();
    await audio.play();
  }

  function updateSoundButton() {
    const isPlaying = !audio.paused && !audio.ended;
    soundButton.textContent = isPlaying ? "\u23f8 Jeda audio" : "\u25b6 Putar audio";
    soundButton.setAttribute("aria-pressed", String(isPlaying));
  }

  function toggleAudio() {
    soundStatus.textContent = "";
    if (!audio.paused) {
      audio.pause();
      return;
    }
    if (audio.ended) audio.currentTime = 0;
    playExperience().catch(showPlaybackError);
  }

  function showPlaybackError(error) {
    soundStatus.textContent = `Could not play audio: ${error && error.message ? error.message : "browser blocked playback"}`;
    updateSoundButton();
    console.error("Audio playback failed:", error);
  }

  soundButton.addEventListener("click", toggleAudio);

  loadSubtitles();
  preloadGalleryImages();
  resizeCanvas();
  updateSoundButton();
  window.addEventListener("resize", resizeCanvas);
  audio.addEventListener("play", () => {
    updateSoundButton();
    startVisualizer();
  });
  audio.addEventListener("pause", () => {
    updateSoundButton();
    stopVisualizer();
  });
  audio.addEventListener("ended", () => {
    updateSoundButton();
    stopVisualizer();
  });
  audio.addEventListener("error", () => {
    const code = audio.error ? audio.error.code : "unknown";
    soundStatus.textContent = `The browser could not load sound-effect.m4a (media error ${code}).`;
    updateSoundButton();
  });
})();
