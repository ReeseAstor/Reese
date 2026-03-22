/* ============================================
   Lumina — Application Logic
   ============================================ */

(function () {
  'use strict';

  // --- State ---
  const state = {
    currentScreen: 'sanctuary',
    onboarded: localStorage.getItem('lumina-onboarded') === 'true',
    selectedIntention: null,
    moodValue: 50,
    journalEntries: JSON.parse(localStorage.getItem('lumina-journal') || '[]'),
    audioPlaying: false,
    drawerOpen: false,
    completedMilestones: JSON.parse(localStorage.getItem('lumina-milestones') || '["m1"]'),
  };

  // --- DOM References ---
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.from((ctx || document).querySelectorAll(sel));

  // --- Initialization ---
  function init() {
    setupNavigation();
    setupWelcome();
    setupMoodSlider();
    setupAudioWidget();
    setupReflectionCanvas();
    setupResourceCenter();
    setupGrowthPath();
    setupOverwhelmModal();

    if (!state.onboarded) {
      showWelcome();
    } else {
      hideWelcome(true);
      navigateTo('sanctuary');
    }
  }

  // ============================================
  // Navigation
  // ============================================
  function setupNavigation() {
    $$('.nav-link').forEach(function (link) {
      link.addEventListener('click', function () {
        var screen = this.dataset.screen;
        if (screen) navigateTo(screen);
      });
    });
  }

  function navigateTo(screenId) {
    state.currentScreen = screenId;

    // Update nav
    $$('.nav-link').forEach(function (link) {
      link.classList.toggle('active', link.dataset.screen === screenId);
    });

    // Transition screens
    $$('.screen').forEach(function (screen) {
      if (screen.id === 'screen-' + screenId) {
        screen.classList.add('active');
        // Small delay for transition
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            screen.classList.add('visible');
          });
        });
      } else {
        screen.classList.remove('visible');
        setTimeout(function () {
          screen.classList.remove('active');
        }, 300);
      }
    });
  }

  // ============================================
  // Welcome Screen
  // ============================================
  function setupWelcome() {
    var welcomeScreen = $('.welcome-screen');
    if (!welcomeScreen) return;

    $$('.intention-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        $$('.intention-btn').forEach(function (b) { b.classList.remove('selected'); });
        this.classList.add('selected');
        state.selectedIntention = this.dataset.intention;
        var continueBtn = $('.welcome-continue');
        if (continueBtn) continueBtn.classList.add('visible');
      });
    });

    var continueBtn = $('.welcome-continue-btn');
    if (continueBtn) {
      continueBtn.addEventListener('click', function () {
        state.onboarded = true;
        localStorage.setItem('lumina-onboarded', 'true');
        if (state.selectedIntention) {
          localStorage.setItem('lumina-intention', state.selectedIntention);
        }
        hideWelcome(false);
        navigateTo('sanctuary');
      });
    }
  }

  function showWelcome() {
    var ws = $('.welcome-screen');
    if (ws) ws.classList.remove('hidden');
  }

  function hideWelcome(immediate) {
    var ws = $('.welcome-screen');
    if (!ws) return;
    if (immediate) {
      ws.style.display = 'none';
    } else {
      ws.classList.add('hidden');
      setTimeout(function () { ws.style.display = 'none'; }, 800);
    }
  }

  // ============================================
  // Mood Slider
  // ============================================
  function setupMoodSlider() {
    var track = $('.mood-track');
    var thumb = $('.mood-thumb');
    var label = $('.mood-label');
    if (!track || !thumb) return;

    var moods = [
      { max: 10, text: 'Overwhelmed', emoji: '' },
      { max: 25, text: 'Uneasy', emoji: '' },
      { max: 40, text: 'A little low', emoji: '' },
      { max: 55, text: 'Neutral', emoji: '' },
      { max: 70, text: 'Hopeful', emoji: '' },
      { max: 85, text: 'Calm', emoji: '' },
      { max: 100, text: 'At peace', emoji: '' },
    ];

    var dragging = false;

    function updateMood(pct) {
      pct = Math.max(0, Math.min(100, pct));
      state.moodValue = pct;
      thumb.style.left = pct + '%';

      var mood = moods.find(function (m) { return pct <= m.max; }) || moods[moods.length - 1];
      if (label) label.textContent = mood.text;

      // Show overwhelm action if very low
      var overwhelmBtn = $('.overwhelm-trigger');
      if (overwhelmBtn) {
        overwhelmBtn.style.display = pct <= 15 ? 'inline-flex' : 'none';
      }
    }

    function getPercent(e) {
      var rect = track.getBoundingClientRect();
      var clientX = e.touches ? e.touches[0].clientX : e.clientX;
      return ((clientX - rect.left) / rect.width) * 100;
    }

    track.addEventListener('mousedown', function (e) {
      dragging = true;
      updateMood(getPercent(e));
    });

    thumb.addEventListener('mousedown', function (e) {
      dragging = true;
      e.preventDefault();
    });

    document.addEventListener('mousemove', function (e) {
      if (dragging) updateMood(getPercent(e));
    });

    document.addEventListener('mouseup', function () {
      dragging = false;
    });

    // Touch support
    track.addEventListener('touchstart', function (e) {
      dragging = true;
      updateMood(getPercent(e));
    }, { passive: true });

    thumb.addEventListener('touchstart', function (e) {
      dragging = true;
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (dragging) updateMood(getPercent(e));
    }, { passive: true });

    document.addEventListener('touchend', function () {
      dragging = false;
    });

    // Initialize
    updateMood(50);
  }

  // ============================================
  // Audio Widget
  // ============================================
  function setupAudioWidget() {
    var playBtn = $('.audio-play-btn');
    var vinyl = $('.vinyl-graphic');
    var progressBar = $('.audio-progress-bar');
    if (!playBtn) return;

    var progress = 0;
    var intervalId = null;

    playBtn.addEventListener('click', function () {
      state.audioPlaying = !state.audioPlaying;

      if (state.audioPlaying) {
        playBtn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" fill="white"/><rect x="14" y="4" width="4" height="16" fill="white"/></svg>';
        if (vinyl) vinyl.classList.add('spinning');
        intervalId = setInterval(function () {
          progress = Math.min(100, progress + 0.5);
          if (progressBar) progressBar.style.width = progress + '%';
          if (progress >= 100) {
            clearInterval(intervalId);
            state.audioPlaying = false;
            playBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="8,5 19,12 8,19" fill="white"/></svg>';
            if (vinyl) vinyl.classList.remove('spinning');
            progress = 0;
            if (progressBar) progressBar.style.width = '0%';
          }
        }, 100);
      } else {
        playBtn.innerHTML = '<svg viewBox="0 0 24 24"><polygon points="8,5 19,12 8,19" fill="white"/></svg>';
        if (vinyl) vinyl.classList.remove('spinning');
        if (intervalId) clearInterval(intervalId);
      }
    });
  }

  // ============================================
  // Overwhelm Modal
  // ============================================
  function setupOverwhelmModal() {
    var modal = $('.overwhelm-modal');
    if (!modal) return;

    // Trigger from mood slider
    var triggerBtn = $('.overwhelm-trigger');
    if (triggerBtn) {
      triggerBtn.addEventListener('click', function () {
        modal.classList.add('active');
        startBreathingCycle();
      });
    }

    // Quick action trigger
    var quickOverwhelm = $('.quick-overwhelm');
    if (quickOverwhelm) {
      quickOverwhelm.addEventListener('click', function () {
        modal.classList.add('active');
        startBreathingCycle();
      });
    }

    // Close
    var closeBtn = $('.overwhelm-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        modal.classList.remove('active');
      });
    }

    var toReflection = $('.overwhelm-to-reflection');
    if (toReflection) {
      toReflection.addEventListener('click', function () {
        modal.classList.remove('active');
        navigateTo('reflection');
      });
    }
  }

  function startBreathingCycle() {
    var text = $('.breathing-text');
    if (!text) return;

    var phases = ['Breathe in...', 'Hold...', 'Breathe out...', 'Hold...'];
    var durations = [4000, 2000, 4000, 2000];
    var idx = 0;

    function nextPhase() {
      if (!$('.overwhelm-modal.active')) return;
      text.textContent = phases[idx];
      idx = (idx + 1) % phases.length;
      setTimeout(nextPhase, durations[idx]);
    }

    nextPhase();
  }

  // ============================================
  // Reflection Canvas
  // ============================================
  function setupReflectionCanvas() {
    var textarea = $('.editor-textarea');
    var saveIndicator = $('.save-indicator');
    if (!textarea) return;

    var saveTimeout;

    textarea.addEventListener('input', function () {
      if (saveIndicator) saveIndicator.textContent = 'Writing...';

      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(function () {
        if (textarea.value.trim()) {
          saveJournalEntry(textarea.value);
          if (saveIndicator) saveIndicator.textContent = 'Saved';
        }
      }, 1500);
    });

    // Floating toolbar on text selection
    var toolbar = $('.floating-toolbar');
    if (toolbar) {
      textarea.addEventListener('mouseup', function () {
        var sel = window.getSelection();
        if (sel && sel.toString().trim().length > 0) {
          var range = sel.getRangeAt(0);
          var rect = range.getBoundingClientRect();
          var parentRect = textarea.closest('.editor-area').getBoundingClientRect();
          toolbar.style.top = (rect.top - parentRect.top - 44) + 'px';
          toolbar.style.left = (rect.left - parentRect.left + rect.width / 2 - 50) + 'px';
          toolbar.classList.add('visible');
        } else {
          toolbar.classList.remove('visible');
        }
      });

      document.addEventListener('mousedown', function (e) {
        if (!toolbar.contains(e.target)) {
          toolbar.classList.remove('visible');
        }
      });
    }

    // Load previous entries
    renderJournalEntries();

    // Navigate to reflection from daily prompt
    var promptAction = $('.prompt-action');
    if (promptAction) {
      promptAction.addEventListener('click', function () {
        navigateTo('reflection');
        setTimeout(function () {
          if (textarea) textarea.focus();
        }, 400);
      });
    }
  }

  function saveJournalEntry(text) {
    var today = new Date().toISOString().split('T')[0];
    var existing = state.journalEntries.findIndex(function (e) { return e.date === today; });

    if (existing >= 0) {
      state.journalEntries[existing].text = text;
    } else {
      state.journalEntries.unshift({ date: today, text: text });
    }

    localStorage.setItem('lumina-journal', JSON.stringify(state.journalEntries));
    renderJournalEntries();
  }

  function renderJournalEntries() {
    var container = $('.reflection-entries');
    if (!container) return;

    var today = new Date().toISOString().split('T')[0];
    var pastEntries = state.journalEntries.filter(function (e) { return e.date !== today; });

    if (pastEntries.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = '<h3 style="font-family: var(--font-heading); font-style: italic; font-size: 18px; color: var(--color-muted); margin-bottom: 8px;">Previous reflections</h3>';

    pastEntries.slice(0, 5).forEach(function (entry) {
      var div = document.createElement('div');
      div.className = 'reflection-entry';
      div.innerHTML =
        '<div class="reflection-entry-date">' + formatDate(entry.date) + '</div>' +
        '<div class="reflection-entry-text">' + escapeHtml(entry.text.substring(0, 200)) + (entry.text.length > 200 ? '...' : '') + '</div>';
      container.appendChild(div);
    });
  }

  // ============================================
  // Resource Center
  // ============================================
  function setupResourceCenter() {
    $$('.filter-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        var filter = this.dataset.filter;

        $$('.filter-pill').forEach(function (p) { p.classList.remove('active'); });
        this.classList.add('active');

        $$('.resource-card').forEach(function (card) {
          if (filter === 'all' || card.dataset.category === filter) {
            card.style.display = '';
            card.style.opacity = '0';
            card.style.transform = 'translateY(8px)';
            requestAnimationFrame(function () {
              requestAnimationFrame(function () {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
                card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
              });
            });
          } else {
            card.style.display = 'none';
          }
        });
      });
    });
  }

  // ============================================
  // Growth Path
  // ============================================
  function setupGrowthPath() {
    var drawer = $('.exercise-drawer');
    var overlay = $('.drawer-overlay');
    if (!drawer) return;

    // Update milestone visual states
    updateMilestoneStates();

    $$('.milestone-node').forEach(function (node) {
      node.addEventListener('click', function () {
        if (this.classList.contains('locked')) return;

        var milestoneId = this.dataset.milestone;
        openExerciseDrawer(milestoneId);
      });
    });

    // Close drawer
    var closeBtn = $('.drawer-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeDrawer);
    }
    if (overlay) {
      overlay.addEventListener('click', closeDrawer);
    }

    // Complete exercise
    var completeBtn = $('.drawer-complete-btn');
    if (completeBtn) {
      completeBtn.addEventListener('click', function () {
        var milestoneId = drawer.dataset.currentMilestone;
        if (milestoneId && state.completedMilestones.indexOf(milestoneId) === -1) {
          state.completedMilestones.push(milestoneId);
          localStorage.setItem('lumina-milestones', JSON.stringify(state.completedMilestones));
          updateMilestoneStates();
        }
        closeDrawer();
      });
    }
  }

  var exercises = {
    m1: {
      tag: 'Gentle Start',
      title: 'Smile at yourself',
      body: 'Find a mirror and give yourself a warm, genuine smile. Hold it for 10 seconds. Notice how your body responds to this simple act of self-kindness.',
      steps: [
        'Find a quiet moment and a mirror',
        'Look at your reflection with soft, kind eyes',
        'Let a gentle smile form naturally',
        'Hold for 10 seconds, breathing slowly',
        'Notice any warmth or lightness you feel',
      ],
      encourage: 'Every journey begins with a single moment of courage. You\'ve already started.',
    },
    m2: {
      tag: 'Self Connection',
      title: 'Write a kind note to yourself',
      body: 'Take a moment to write three things you appreciate about yourself. They don\'t have to be grand — small truths are powerful too.',
      steps: [
        'Open your Reflection Canvas',
        'Write "Three things I appreciate about myself:"',
        'List three genuine qualities, no matter how small',
        'Read them back to yourself slowly',
        'Let the words settle in your heart',
      ],
      encourage: 'Acknowledging your own worth is an act of quiet bravery.',
    },
    m3: {
      tag: 'Observation',
      title: 'People-watch for 5 minutes',
      body: 'Find a calm public space — a park bench, a coffee shop window. Simply observe others going about their day without judgment.',
      steps: [
        'Choose a comfortable, calm public spot',
        'Settle in for just 5 minutes',
        'Watch people without making stories about them',
        'Notice what makes you curious vs. anxious',
        'When done, take three deep breaths',
      ],
      encourage: 'The world moves gently when you watch without judgment.',
    },
    m4: {
      tag: 'Micro Interaction',
      title: 'Smile at a stranger',
      body: 'During your day, offer a brief, gentle smile to someone you pass. No conversation needed — just a moment of shared warmth.',
      steps: [
        'Choose a low-pressure moment (walking, in a store)',
        'Make brief eye contact with someone nearby',
        'Offer a small, natural smile',
        'Continue on your way — no follow-up needed',
        'Reflect on how it felt afterward',
      ],
      encourage: 'A single smile can be a bridge between two worlds.',
    },
    m5: {
      tag: 'Verbal Step',
      title: 'Say "good morning" to someone',
      body: 'Choose one person today — a neighbor, a barista, a colleague — and greet them with a simple "good morning." That\'s all.',
      steps: [
        'Pick one person you\'ll encounter today',
        'When the moment comes, take a breath',
        'Say "good morning" or "hello" — just two words',
        'Accept whatever response comes without analysis',
        'Celebrate this step, however small it felt',
      ],
      encourage: 'Your voice deserves to be heard. Even two words matter.',
    },
    m6: {
      tag: 'Brief Exchange',
      title: 'Ask a simple question',
      body: 'Ask someone a low-stakes question: "Do you know the time?" or "Is this seat taken?" Practice the rhythm of a micro-conversation.',
      steps: [
        'Choose a simple, everyday question',
        'Find a natural moment to ask it',
        'Speak clearly and gently',
        'Listen to the response and say "thank you"',
        'Notice: the world didn\'t end. You did it.',
      ],
      encourage: 'Questions are invitations. You\'re learning to extend them.',
    },
  };

  function openExerciseDrawer(milestoneId) {
    var drawer = $('.exercise-drawer');
    var overlay = $('.drawer-overlay');
    var exercise = exercises[milestoneId];
    if (!drawer || !exercise) return;

    drawer.dataset.currentMilestone = milestoneId;

    // Populate drawer
    var tag = drawer.querySelector('.drawer-tag');
    var title = drawer.querySelector('.drawer-title');
    var body = drawer.querySelector('.drawer-body');
    var steps = drawer.querySelector('.drawer-steps');
    var encourage = drawer.querySelector('.drawer-encourage');

    if (tag) tag.textContent = exercise.tag;
    if (title) title.textContent = exercise.title;
    if (body) body.textContent = exercise.body;
    if (encourage) encourage.textContent = exercise.encourage;

    if (steps) {
      steps.innerHTML = '';
      exercise.steps.forEach(function (step, i) {
        var li = document.createElement('li');
        li.innerHTML = '<span class="step-num">' + (i + 1) + '</span><span>' + escapeHtml(step) + '</span>';
        steps.appendChild(li);
      });
    }

    // Show/hide complete button
    var completeBtn = drawer.querySelector('.drawer-complete-btn');
    if (completeBtn) {
      completeBtn.style.display = state.completedMilestones.indexOf(milestoneId) >= 0 ? 'none' : '';
    }

    drawer.classList.add('open');
    if (overlay) overlay.classList.add('active');
    state.drawerOpen = true;
  }

  function closeDrawer() {
    var drawer = $('.exercise-drawer');
    var overlay = $('.drawer-overlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
    state.drawerOpen = false;
  }

  function updateMilestoneStates() {
    var allIds = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
    var lastCompleted = -1;

    allIds.forEach(function (id, idx) {
      if (state.completedMilestones.indexOf(id) >= 0) {
        lastCompleted = idx;
      }
    });

    $$('.milestone-node').forEach(function (node) {
      var id = node.dataset.milestone;
      var idx = allIds.indexOf(id);

      node.classList.remove('active', 'completed', 'locked');

      if (state.completedMilestones.indexOf(id) >= 0) {
        node.classList.add('completed');
        node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><polyline points="6,12 10,16 18,8"/></svg>';
      } else if (idx === lastCompleted + 1) {
        node.classList.add('active');
        node.innerHTML = '';
      } else if (idx > lastCompleted + 1) {
        node.classList.add('locked');
        node.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" opacity="0.4"><rect x="7" y="11" width="10" height="8" rx="2"/><path d="M9 11V8a3 3 0 016 0v3"/></svg>';
      }
    });
  }

  // ============================================
  // Utilities
  // ============================================
  function formatDate(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ============================================
  // Keyboard shortcuts
  // ============================================
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (state.drawerOpen) closeDrawer();
      var modal = $('.overwhelm-modal.active');
      if (modal) modal.classList.remove('active');
    }
  });

  // --- Boot ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
