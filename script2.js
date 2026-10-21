    var ROLL_SECONDS = 5;      // EDIT: how long the build-up lasts (drum roll + music)
    var CHEER_SECONDS = 4;     // EDIT: how long the cheering lasts
    var MUSIC_VOLUME = 1;      // EDIT: build-up music volume (0 = none, 1 = normal, 1.5 = louder)
    var BG_VOLUME = 0.6;       // EDIT: background music volume (0 = none, 1 = loud)
    var BG_BPM = 84;           // EDIT: background music speed (higher = faster)
    var CONFETTI_AMOUNT = 1;   // EDIT: 0 = no confetti, 1 = normal, 2 = double
    var CURTAIN_MS = 1800;     // should match the curtain transition in the CSS

    var cover = document.getElementById("cover");
    var curtains = document.getElementById("curtains");
    var ticket = document.getElementById("ticket");
    var openBtn = document.getElementById("openBtn");
    var musicBtn = document.getElementById("musicBtn");
    var hint = document.getElementById("hint");

    // ---------- Confetti ----------
    var confettiCanvas = document.getElementById("confetti");
    var cctx = confettiCanvas.getContext("2d");
    var confettiPieces = [];
    var confettiRunning = false;
    var confettiRainUntil = 0;
    var CONFETTI_COLORS = ["#f4d98c", "#d9aa3c", "#b3202f", "#ff5a6b", "#fff3c4", "#ffffff", "#7fd1ff"];

    function sizeConfetti() {
      var dpr = window.devicePixelRatio || 1;
      confettiCanvas.width = Math.round(window.innerWidth * dpr);
      confettiCanvas.height = Math.round(window.innerHeight * dpr);
      cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener("resize", sizeConfetti);
    sizeConfetti();

    function addPiece(x, y, vx, vy) {
      confettiPieces.push({
        x: x, y: y, vx: vx, vy: vy,
        w: 6 + Math.random() * 6,
        h: 9 + Math.random() * 8,
        rot: Math.random() * 6.28,
        vr: (Math.random() - 0.5) * 0.3,
        wob: Math.random() * 6.28,
        wobSpeed: 0.08 + Math.random() * 0.18,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        round: Math.random() < 0.25,
        age: 0
      });
    }

    // Shoots confetti up and across from the bottom corner of the screen
    function confettiBurst(fromLeft, count) {
      var w = window.innerWidth, h = window.innerHeight;
      for (var i = 0; i < count; i++) {
        var angle = (50 + Math.random() * 35) * Math.PI / 180;   // upward and toward the middle
        var speed = (0.04 * h + 8) * (0.6 + Math.random() * 0.6);
        var dir = fromLeft ? 1 : -1;
        addPiece(fromLeft ? -10 : w + 10, h + 10, Math.cos(angle) * speed * dir, -Math.sin(angle) * speed);
      }
    }

    function confettiTick() {
      var w = window.innerWidth, h = window.innerHeight;
      cctx.clearRect(0, 0, w, h);

      // A gentle shower from the top while the rain timer is running
      if (performance.now() < confettiRainUntil) {
        for (var r = 0; r < 3 * CONFETTI_AMOUNT; r++) {
          addPiece(Math.random() * w, -12, (Math.random() - 0.5) * 2, 1 + Math.random() * 2);
        }
      }

      for (var i = confettiPieces.length - 1; i >= 0; i--) {
        var p = confettiPieces[i];
        p.vx *= 0.93;
        p.vy = p.vy * 0.93 + 0.16;       // slows down, then drifts gently down
        p.x += p.vx + Math.sin(p.wob) * 0.6;
        p.y += p.vy;
        p.rot += p.vr;
        p.wob += p.wobSpeed;
        p.age++;

        if (p.y > h + 20 || p.age > 600) { confettiPieces.splice(i, 1); continue; }

        cctx.save();
        cctx.translate(p.x, p.y);
        cctx.rotate(p.rot);
        cctx.scale(1, Math.cos(p.wob));  // flips like real paper
        cctx.fillStyle = p.color;
        if (p.round) {
          cctx.beginPath();
          cctx.arc(0, 0, p.w / 2, 0, 6.2832);
          cctx.fill();
        } else {
          cctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        }
        cctx.restore();
      }

      if (confettiPieces.length > 0 || performance.now() < confettiRainUntil) {
        requestAnimationFrame(confettiTick);
      } else {
        confettiRunning = false;
        cctx.clearRect(0, 0, w, h);
      }
    }

    function launchConfetti() {
      if (CONFETTI_AMOUNT <= 0) { return; }
      var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var amt = CONFETTI_AMOUNT * (reduce ? 0.3 : 1);

      confettiBurst(true, Math.round(90 * amt));
      confettiBurst(false, Math.round(90 * amt));
      setTimeout(function () {
        confettiBurst(true, Math.round(60 * amt));
        confettiBurst(false, Math.round(60 * amt));
      }, 500);

      confettiRainUntil = performance.now() + (reduce ? 0 : 2400);
      if (!confettiRunning) {
        confettiRunning = true;
        requestAnimationFrame(confettiTick);
      }
    }

    // Shared audio state so everything uses one sound engine
    var audio = { ctx: null, master: null, out: null, noise: null, bg: null, muted: false };

    function bgLevel() { return Math.max(0.0001, 0.5 * BG_VOLUME); }

    function updateMusicBtn() {
      if (!audio.ctx) { return; }
      var running = audio.ctx.state === "running";
      if (!running) {
        musicBtn.textContent = "🔇 Tap for music";
      } else {
        musicBtn.textContent = audio.muted ? "🔇 Music off" : "🔊 Music on";
        hint.hidden = true;
      }
    }

    // ---------- Background music: a cozy looping chord progression that never stops ----------
    function startBackgroundMusic() {
      var ctx = audio.ctx, out = audio.out, noiseBuffer = audio.noise;
      var beat = 60 / BG_BPM;
      var bar = beat * 4;

      // Fades in gently when the music starts
      var bus = ctx.createGain();
      bus.gain.setValueAtTime(0.0001, ctx.currentTime);
      bus.gain.setTargetAtTime(bgLevel(), ctx.currentTime + 0.1, 1.2);
      bus.connect(out);
      audio.bg = bus;

      // Am - F - C - G, repeating forever
      var chords = [
        { bass: 110.00, notes: [220.00, 261.63, 329.63, 440.00] },
        { bass: 87.31,  notes: [174.61, 220.00, 261.63, 349.23] },
        { bass: 130.81, notes: [196.00, 261.63, 329.63, 392.00] },
        { bass: 98.00,  notes: [196.00, 246.94, 293.66, 392.00] }
      ];
      var arpPattern = [0, 1, 2, 3, 2, 1, 2, 1];

      function bassNote(freq, time, dur) {
        var o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = freq;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(0.32, time + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, time + dur);
        o.connect(g); g.connect(bus);
        o.start(time); o.stop(time + dur + 0.05);
      }

      function pluck(freq, time, vol) {
        var o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = freq;
        var f = ctx.createBiquadFilter();
        f.type = "lowpass";
        f.frequency.value = 2600;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, time);
        g.gain.linearRampToValueAtTime(vol, time + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
        o.connect(f); f.connect(g); g.connect(bus);
        o.start(time); o.stop(time + 0.5);
      }

      function hat(time) {
        var n = ctx.createBufferSource();
        n.buffer = noiseBuffer;
        var hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 7000;
        var g = ctx.createGain();
        g.gain.setValueAtTime(0.035, time);
        g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
        n.connect(hp); hp.connect(g); g.connect(bus);
        n.start(time, Math.random() * 0.5); n.stop(time + 0.05);
      }

      function scheduleBar(t, chord) {
        // Soft pad that swells across the bar
        var padFilter = ctx.createBiquadFilter();
        padFilter.type = "lowpass";
        padFilter.frequency.value = 1100;
        padFilter.connect(bus);
        for (var p = 0; p < 3; p++) {
          var o = ctx.createOscillator();
          o.type = "triangle";
          o.frequency.value = chord.notes[p];
          var g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(0.07, t + 0.6);
          g.gain.setValueAtTime(0.07, t + bar - 0.3);
          g.gain.exponentialRampToValueAtTime(0.0001, t + bar + 0.5);
          o.connect(g); g.connect(padFilter);
          o.start(t); o.stop(t + bar + 0.6);
        }

        // Bass on beats 1 and 3
        bassNote(chord.bass, t, beat * 1.8);
        bassNote(chord.bass, t + beat * 2, beat * 1.8);

        // Gentle plucked arpeggio and soft hi-hat
        for (var i = 0; i < 8; i++) {
          var nt = t + i * (beat / 2);
          pluck(chord.notes[arpPattern[i]] * 2, nt, 0.045);
          if (i % 2 === 1) { hat(nt); }
        }
      }

      // Keeps scheduling the next bars forever
      var nextBar = ctx.currentTime + 0.1;
      var barCount = 0;
      function pump() {
        while (nextBar < ctx.currentTime + 2.5) {
          scheduleBar(nextBar, chords[barCount % chords.length]);
          nextBar += bar;
          barCount++;
        }
      }
      pump();
      setInterval(pump, 500);
    }

    // ---------- Set up the sound engine as soon as the page loads ----------
    function initAudio() {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { return false; }
      try {
        var ctx = new AC();
        var master = ctx.createGain();
        master.gain.value = 1;
        master.connect(ctx.destination);
        var out = ctx.createDynamicsCompressor();
        out.connect(master);

        // One second of white noise, reused for many sounds
        var noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        var data = noiseBuffer.getChannelData(0);
        for (var i = 0; i < data.length; i++) { data[i] = Math.random() * 2 - 1; }

        audio.ctx = ctx;
        audio.master = master;
        audio.out = out;
        audio.noise = noiseBuffer;
        ctx.onstatechange = updateMusicBtn;

        if (BG_VOLUME > 0) { startBackgroundMusic(); }

        // Try to start right away. Many browsers refuse until the first tap, which is handled below.
        var tryStart = ctx.resume();
        if (tryStart && tryStart.catch) { tryStart.catch(function () {}); }
        updateMusicBtn();
        return true;
      } catch (e) { return false; }
    }

    // Browsers only allow sound after a tap, click, or key press, so the first one anywhere starts the music
    function wake() {
      if (audio.ctx && audio.ctx.state !== "running") {
        var p = audio.ctx.resume();
        if (p && p.catch) { p.catch(function () {}); }
      }
    }
    ["click", "keydown", "touchend", "pointerup"].forEach(function (evt) {
      document.addEventListener(evt, wake, true);
    });

    // ---------- Build-up + drum roll + cheers (the background music ducks out of the way, then returns) ----------
    function playShow(seconds) {
      if (!audio.ctx) { return; }
      try {
        var ctx = audio.ctx, out = audio.out, noiseBuffer = audio.noise;
        var now = ctx.currentTime + 0.05;
        var end = now + seconds;

        // Quiet the background music during the build-up, bring it back under the cheers
        if (audio.bg) {
          audio.bg.gain.cancelScheduledValues(ctx.currentTime);
          audio.bg.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
          audio.bg.gain.setTargetAtTime(bgLevel(), end + 0.8, 1.2);
        }

        // ===== MUSIC BUILD-UP =====
        var mv = Math.max(0.0001, MUSIC_VOLUME);

        // 1) Pad: a dark A minor chord that slowly brightens and swells
        var padNotes = [110, 164.81, 220, 261.63];
        var padFilter = ctx.createBiquadFilter();
        padFilter.type = "lowpass";
        padFilter.frequency.setValueAtTime(220, now);
        padFilter.frequency.exponentialRampToValueAtTime(3800, end);
        var padGain = ctx.createGain();
        padGain.gain.setValueAtTime(0.0001, now);
        padGain.gain.exponentialRampToValueAtTime(0.16 * mv, end - 0.1);
        padGain.gain.exponentialRampToValueAtTime(0.0001, end + 0.25);
        padFilter.connect(padGain); padGain.connect(out);
        padNotes.forEach(function (f, idx) {
          [-6, 6].forEach(function (detune) {
            var o = ctx.createOscillator();
            o.type = "sawtooth";
            o.frequency.value = f;
            o.detune.value = detune + idx;
            var g = ctx.createGain();
            g.gain.value = 0.25;
            o.connect(g); g.connect(padFilter);
            o.start(now); o.stop(end + 0.3);
          });
        });

        // 2) Rising arpeggio that speeds up and climbs higher
        var arpScale = [220, 261.63, 329.63, 440, 523.25, 659.25, 880, 1046.5, 1318.5];
        function arpNote(freq, time, vol) {
          var o = ctx.createOscillator();
          o.type = "triangle";
          o.frequency.value = freq;
          var f = ctx.createBiquadFilter();
          f.type = "lowpass";
          f.frequency.value = 3200;
          var g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, time);
          g.gain.linearRampToValueAtTime(vol, time + 0.01);
          g.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
          o.connect(f); f.connect(g); g.connect(out);
          o.start(time); o.stop(time + 0.25);
        }
        var at = 0.3, step = 0;
        while (at < seconds - 0.15) {
          var ap = at / seconds;
          var pick = arpScale[Math.min(arpScale.length - 1, (step % 4) + Math.floor(ap * 5))];
          arpNote(pick, now + at, (0.05 + ap * 0.13) * mv);
          at += 0.24 - ap * 0.15;   // gets faster
          step++;
        }

        // 3) Riser: a sweeping whoosh of noise that climbs in pitch
        var riser = ctx.createBufferSource();
        riser.buffer = noiseBuffer;
        riser.loop = true;
        var riserFilter = ctx.createBiquadFilter();
        riserFilter.type = "bandpass";
        riserFilter.Q.value = 2;
        riserFilter.frequency.setValueAtTime(300, now);
        riserFilter.frequency.exponentialRampToValueAtTime(7000, end);
        var riserGain = ctx.createGain();
        riserGain.gain.setValueAtTime(0.0001, now);
        riserGain.gain.exponentialRampToValueAtTime(0.28 * mv, end - 0.05);
        riserGain.gain.exponentialRampToValueAtTime(0.0001, end + 0.15);
        riser.connect(riserFilter); riserFilter.connect(riserGain); riserGain.connect(out);
        riser.start(now); riser.stop(end + 0.2);

        // 4) Big triumphant chord (A major) the moment the curtains open
        var fanfare = [110, 220, 277.18, 329.63, 440, 554.37];
        var fanfareFilter = ctx.createBiquadFilter();
        fanfareFilter.type = "lowpass";
        fanfareFilter.frequency.value = 3000;
        var fanfareGain = ctx.createGain();
        fanfareGain.gain.setValueAtTime(0.0001, end);
        fanfareGain.gain.linearRampToValueAtTime(0.24 * mv, end + 0.03);
        fanfareGain.gain.exponentialRampToValueAtTime(0.001, end + 2.4);
        fanfareFilter.connect(fanfareGain); fanfareGain.connect(out);
        fanfare.forEach(function (f) {
          [-5, 5].forEach(function (detune) {
            var o = ctx.createOscillator();
            o.type = "sawtooth";
            o.frequency.value = f;
            o.detune.value = detune;
            var g = ctx.createGain();
            g.gain.value = 0.16;
            o.connect(g); g.connect(fanfareFilter);
            o.start(end); o.stop(end + 2.5);
          });
        });

        // ===== DRUM ROLL =====
        function snareHit(time, volume) {
          var noise = ctx.createBufferSource();
          noise.buffer = noiseBuffer;
          var filter = ctx.createBiquadFilter();
          filter.type = "bandpass";
          filter.frequency.value = 1900;
          var gain = ctx.createGain();
          gain.gain.setValueAtTime(volume, time);
          gain.gain.exponentialRampToValueAtTime(0.001, time + 0.07);
          noise.connect(filter); filter.connect(gain); gain.connect(out);
          noise.start(time); noise.stop(time + 0.08);

          // Low thump for the body of the drum
          var osc = ctx.createOscillator();
          var oscGain = ctx.createGain();
          osc.frequency.setValueAtTime(190, time);
          osc.frequency.exponentialRampToValueAtTime(110, time + 0.06);
          oscGain.gain.setValueAtTime(volume * 0.5, time);
          oscGain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
          osc.connect(oscGain); oscGain.connect(out);
          osc.start(time); osc.stop(time + 0.09);
        }

        // Hits get faster and louder as the roll builds
        var t = 0;
        while (t < seconds) {
          var progress = t / seconds;
          snareHit(now + t, 0.2 + progress * 0.5);
          t += 0.13 - progress * 0.09;
        }

        // Final big hit plus a cymbal crash as the curtains open
        snareHit(end, 1);
        var crash = ctx.createBufferSource();
        crash.buffer = noiseBuffer;
        var hp = ctx.createBiquadFilter();
        hp.type = "highpass";
        hp.frequency.value = 6000;
        var crashGain = ctx.createGain();
        crashGain.gain.setValueAtTime(0.5, end);
        crashGain.gain.exponentialRampToValueAtTime(0.001, end + 0.9);
        crash.connect(hp); hp.connect(crashGain); crashGain.connect(out);
        crash.start(end); crash.stop(end + 1);

        // ===== CHEERS =====
        var cheerEnd = end + CHEER_SECONDS;

        // 1) Crowd roar: a swell of filtered noise
        var roar = ctx.createBufferSource();
        roar.buffer = noiseBuffer;
        roar.loop = true;
        var roarFilter = ctx.createBiquadFilter();
        roarFilter.type = "bandpass";
        roarFilter.frequency.value = 900;
        roarFilter.Q.value = 0.6;
        var roarGain = ctx.createGain();
        roarGain.gain.setValueAtTime(0.0001, end);
        roarGain.gain.linearRampToValueAtTime(0.35, end + 0.4);
        roarGain.gain.setValueAtTime(0.35, end + CHEER_SECONDS * 0.45);
        roarGain.gain.exponentialRampToValueAtTime(0.001, cheerEnd);
        roar.connect(roarFilter); roarFilter.connect(roarGain); roarGain.connect(out);
        roar.start(end); roar.stop(cheerEnd + 0.1);

        // 2) Applause: lots of tiny random claps
        for (var c = 0; c < 90; c++) {
          var ct = end + 0.15 + Math.random() * (CHEER_SECONDS - 0.5);
          var fade = 1 - (ct - end) / CHEER_SECONDS;
          var clap = ctx.createBufferSource();
          clap.buffer = noiseBuffer;
          var clapFilter = ctx.createBiquadFilter();
          clapFilter.type = "bandpass";
          clapFilter.frequency.value = 1400 + Math.random() * 2200;
          clapFilter.Q.value = 1;
          var clapGain = ctx.createGain();
          clapGain.gain.setValueAtTime(0.35 * fade + 0.03, ct);
          clapGain.gain.exponentialRampToValueAtTime(0.001, ct + 0.04);
          clap.connect(clapFilter); clapFilter.connect(clapGain); clapGain.connect(out);
          clap.start(ct, Math.random() * 0.5); clap.stop(ct + 0.06);
        }

        // 3) "Woo!" voices: rising tones shaped like a cheer
        for (var v = 0; v < 8; v++) {
          var vt = end + 0.1 + Math.random() * (CHEER_SECONDS * 0.55);
          var base = 260 + Math.random() * 260;
          var voice = ctx.createOscillator();
          voice.type = "sawtooth";
          voice.frequency.setValueAtTime(base, vt);
          voice.frequency.exponentialRampToValueAtTime(base * 1.6, vt + 0.35);
          voice.frequency.exponentialRampToValueAtTime(base * 1.3, vt + 0.75);
          var formant = ctx.createBiquadFilter();
          formant.type = "bandpass";
          formant.frequency.value = 700 + Math.random() * 500;
          formant.Q.value = 3;
          var voiceGain = ctx.createGain();
          voiceGain.gain.setValueAtTime(0.0001, vt);
          voiceGain.gain.linearRampToValueAtTime(0.1, vt + 0.12);
          voiceGain.gain.exponentialRampToValueAtTime(0.001, vt + 0.8);
          voice.connect(formant); formant.connect(voiceGain); voiceGain.connect(out);
          voice.start(vt); voice.stop(vt + 0.85);
        }
      } catch (e) { /* if audio fails, the curtains still open */ }
    }

    // ---------- Open invitation: music + drum roll build, then the curtains part with cheers and confetti ----------
    openBtn.addEventListener("click", function () {
      openBtn.disabled = true;
      openBtn.textContent = "Here we go…";
      cover.classList.add("rolling");
      wake();
      playShow(ROLL_SECONDS);

      setTimeout(function () {
        cover.classList.add("fade");
        ticket.hidden = false;
        curtains.classList.add("open");
        launchConfetti();

        setTimeout(function () {
          curtains.hidden = true;
          cover.hidden = true;
          ticket.focus();
        }, CURTAIN_MS + 100);
      }, ROLL_SECONDS * 1000);
    });

    // ---------- Music on/off ----------
    musicBtn.addEventListener("click", function () {
      if (!audio.ctx) { return; }
      // If the music hasn't started yet, this tap turns it on instead of muting
      if (audio.ctx.state !== "running") {
        audio.muted = false;
        audio.master.gain.setTargetAtTime(1, audio.ctx.currentTime, 0.05);
        wake();
        return;
      }
      audio.muted = !audio.muted;
      audio.master.gain.setTargetAtTime(audio.muted ? 0 : 1, audio.ctx.currentTime, 0.05);
      updateMusicBtn();
    });

    // ---------- RSVP buttons ----------
    var buttons = document.querySelectorAll(".actions button");
    var reply = document.getElementById("reply");
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        buttons.forEach(function (b) { b.setAttribute("aria-pressed", "false"); });
        btn.setAttribute("aria-pressed", "true");
        reply.textContent = btn.getAttribute("data-msg");
      });
    });

    // ---------- Start everything ----------
    if (!initAudio()) {
      musicBtn.hidden = true;
      hint.hidden = true;
    }