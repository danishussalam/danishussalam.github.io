// Survey Design Assistant Frontend
// Handles tab switching, API calls, and result rendering

const WORKER_URL = 'https://survey-design.danish-us-salam.workers.dev';

// ─── Tab Switching ─────────────────────────────────────────────
function switchTab(tabName) {
  // Hide all tab contents and deactivate all buttons
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.remove('active');
  });
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.remove('active');
    btn.classList.add('inactive');
  });

  // Show selected tab content and activate its button
  const tabContent = document.getElementById(tabName + '-content');
  if (tabContent) {
    tabContent.classList.add('active');
  }

  // Find and activate the clicked button
  event.target.classList.remove('inactive');
  event.target.classList.add('active');
}

// ─── Flesch-Kincaid Grade Level ───────────────────────────────
function calculateFleschKincaid(text) {
  // Simple FK formula: 0.39*(W/S) + 11.8*(SY/W) - 15.59
  // W = words, S = sentences, SY = syllables

  const sentences = (text.match(/[.!?]+/g) || []).length || 1;
  const words = text.trim().split(/\s+/).length;
  const syllables = countSyllables(text);

  if (words === 0) return 0;

  const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  return Math.max(0, Math.round(grade * 10) / 10);
}

function countSyllables(text) {
  let count = 0;
  const words = text.toLowerCase().match(/\b[\w']+\b/g) || [];

  for (const word of words) {
    // Simple syllable counter: count vowel groups
    const vowels = word.match(/[aeiouy]/g) || [];
    if (word.endsWith('e')) {
      count += Math.max(1, vowels.length - 1);
    } else {
      count += Math.max(1, vowels.length);
    }
  }

  return Math.max(1, count);
}

// ─── Main Analysis Function ────────────────────────────────────
async function analyzeQuestions(tool) {
  let input = '';
  let context = '';

  // Collect input based on selected tool
  switch (tool) {
    case 'question-reviewer':
      input = document.getElementById('reviewer-input').value.trim();
      if (!input) {
        showError('reviewer', 'Please enter at least one question.');
        return;
      }
      break;
    case 'question-builder':
      input = document.getElementById('builder-construct').value.trim();
      context = document.getElementById('builder-context').value.trim();
      if (!input) {
        showError('builder', 'Please describe what you want to measure.');
        return;
      }
      break;
    case 'scale-recommender':
      input = document.getElementById('recommender-goal').value.trim();
      context = document.getElementById('recommender-context').value.trim();
      if (!input) {
        showError('recommender', 'Please describe your measurement goal.');
        return;
      }
      break;
    case 'cognitive-load':
      input = document.getElementById('cognitive-input').value.trim();
      if (!input) {
        showError('cognitive', 'Please paste your questionnaire.');
        return;
      }
      break;
    case 'order-effects':
      input = document.getElementById('order-input').value.trim();
      if (!input) {
        showError('order', 'Please list your questions in order.');
        return;
      }
      break;
  }

  // Show loading, hide results
  showLoading(tool, true);
  hideResults(tool);

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: tool,
        payload: { input, context }
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();

    // Handle tool-specific rendering
    switch (tool) {
      case 'question-reviewer':
        renderQuestionReviewer(data);
        break;
      case 'question-builder':
        renderQuestionBuilder(data);
        break;
      case 'scale-recommender':
        renderScaleRecommender(data);
        break;
      case 'cognitive-load':
        renderCognitiveLoad(data);
        break;
      case 'order-effects':
        renderOrderEffects(data);
        break;
    }

    showResults(tool);
  } catch (err) {
    console.error('Error:', err);
    showError(tool, err.message || 'An error occurred. Please try again.');
  } finally {
    showLoading(tool, false);
  }
}

// ─── Rendering Functions ──────────────────────────────────────

function renderQuestionReviewer(data) {
  const container = document.getElementById('reviewer-results');
  container.innerHTML = '';

  if (!data.issues || data.issues.length === 0) {
    container.innerHTML = '<p class="text-[13px] text-gray-600">No major issues detected. Your questions look good!</p>';
    return;
  }

  const issuesByQuestion = {};
  for (const issue of data.issues) {
    if (!issuesByQuestion[issue.question]) {
      issuesByQuestion[issue.question] = [];
    }
    issuesByQuestion[issue.question].push(issue);
  }

  for (const [q, issues] of Object.entries(issuesByQuestion)) {
    const card = document.createElement('div');
    card.className = 'bg-white border-2 border-gray-200 rounded-xl p-6';
    card.innerHTML = `
      <p class="text-[13px] font-semibold text-gray-900 mb-4">"${q}"</p>
      <div class="space-y-3">
        ${issues.map(issue => `
          <div class="bg-amber-50 border border-amber-200 rounded p-3">
            <p class="text-[11px] font-bold text-amber-900 mb-1">
              ${issue.issue_type} (${issue.severity})
            </p>
            <p class="text-[12px] text-amber-800 mb-2">${issue.suggestion}</p>
          </div>
        `).join('')}
      </div>
    `;
    container.appendChild(card);
  }
}

function renderQuestionBuilder(data) {
  const container = document.getElementById('builder-results');
  container.innerHTML = '';

  if (!data.variants || data.variants.length === 0) {
    container.innerHTML = '<p class="text-[13px] text-gray-600">No variants generated. Please try again.</p>';
    return;
  }

  for (const variant of data.variants) {
    const card = document.createElement('div');
    card.className = 'bg-white border-2 border-gray-200 rounded-xl p-6';

    const anchorsHTML = variant.anchor_labels && variant.anchor_labels.length > 0
      ? `<p class="text-[12px] text-gray-600 mb-2"><strong>Scale:</strong> ${variant.anchor_labels.join(' — ')}</p>`
      : '';

    const refHTML = variant.reference
      ? `<p class="text-[11px] text-du-blue italic bg-blue-50 p-2 rounded mt-3">📚 Reference: ${variant.reference}</p>`
      : '';

    card.innerHTML = `
      <p class="text-[11px] font-bold text-du-blue uppercase tracking-wider mb-2">${variant.scale_type}</p>
      <p class="text-[13px] text-gray-900 mb-3">${variant.question_text}</p>
      ${anchorsHTML}
      ${refHTML}
      <button class="mt-3 text-[12px] text-du-blue font-semibold hover:text-[#1f2b1e]" onclick="copyText('${escapeQuotes(variant.question_text)}')">
        Copy Question
      </button>
    `;
    container.appendChild(card);
  }
}

function renderScaleRecommender(data) {
  const container = document.getElementById('recommender-results');
  container.innerHTML = '';

  if (!data.recommended) {
    container.innerHTML = '<p class="text-[13px] text-gray-600">No recommendation generated.</p>';
    return;
  }

  const rec = data.recommended;

  let altHTML = '';
  if (data.alternatives && data.alternatives.length > 0) {
    altHTML = `
      <div class="mt-6 pt-6 border-t border-gray-200">
        <p class="text-[12px] font-semibold text-gray-900 mb-3">Alternative Options:</p>
        <div class="space-y-3">
          ${data.alternatives.map(alt => `
            <div class="bg-gray-50 p-3 rounded border border-gray-200">
              <p class="text-[12px] font-semibold text-gray-900">${alt.format}</p>
              <p class="text-[11px] text-gray-600 mt-1">${alt.rationale}</p>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="bg-white border-2 border-du-blue rounded-xl p-6">
      <p class="text-[11px] font-bold text-du-blue uppercase tracking-wider mb-2">Recommended</p>
      <p class="text-[14px] font-bold text-gray-900 mb-3">${rec.format}</p>
      <p class="text-[13px] text-gray-600 mb-4">${rec.rationale}</p>
      <div class="bg-blue-50 p-4 rounded border border-du-blue/20">
        <p class="text-[12px] font-semibold text-gray-900 mb-2">Example:</p>
        <p class="text-[12px] text-gray-700 font-mono">${rec.example}</p>
      </div>
      ${altHTML}
    </div>
  `;
}

function renderCognitiveLoad(data) {
  const container = document.getElementById('cognitive-results');
  container.innerHTML = '';

  if (!data.estimated_minutes) {
    container.innerHTML = '<p class="text-[13px] text-gray-600">Analysis failed. Please try again.</p>';
    return;
  }

  const burdenColor = data.burden_level === 'High' ? 'red' : data.burden_level === 'Moderate' ? 'amber' : 'green';
  const burdenClass = {
    red: 'bg-red-50 border-red-200 text-red-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    green: 'bg-green-50 border-green-200 text-green-900'
  }[burdenColor];

  const suggestionsHTML = data.suggestions && data.suggestions.length > 0
    ? `
      <div class="mt-6">
        <p class="text-[12px] font-semibold text-gray-900 mb-3">Suggestions to reduce burden:</p>
        <ul class="space-y-2">
          ${data.suggestions.map(s => `<li class="text-[12px] text-gray-700">• ${s}</li>`).join('')}
        </ul>
      </div>
    `
    : '';

  container.innerHTML = `
    <div class="space-y-4">
      <div class="grid md:grid-cols-3 gap-4">
        <div class="bg-white border-2 border-gray-200 rounded-xl p-5">
          <p class="text-[11px] font-bold text-gray-600 uppercase mb-1">Est. Completion Time</p>
          <p class="text-[24px] font-bold text-gray-900">${data.estimated_minutes} min</p>
        </div>
        <div class="bg-white border-2 border-gray-200 rounded-xl p-5">
          <p class="text-[11px] font-bold text-gray-600 uppercase mb-1">Reading Level (FK)</p>
          <p class="text-[24px] font-bold text-gray-900">${data.fk_grade}</p>
        </div>
        <div class="bg-white border-2 border-gray-200 rounded-xl p-5">
          <p class="text-[11px] font-bold text-gray-600 uppercase mb-1">Burden Level</p>
          <p class="text-[14px] font-bold text-gray-900">${data.burden_level}</p>
        </div>
      </div>

      <div class="bg-white border-2 border-gray-200 rounded-xl p-6">
        <p class="text-[12px] font-semibold text-gray-900 mb-3">Analysis Feedback:</p>
        <p class="text-[13px] text-gray-700 leading-relaxed">${data.feedback}</p>
        ${suggestionsHTML}
      </div>
    </div>
  `;
}

function renderOrderEffects(data) {
  const container = document.getElementById('order-results');
  container.innerHTML = '';

  if (!data.flags || data.flags.length === 0) {
    container.innerHTML = '<div class="bg-green-50 border border-green-200 rounded-xl p-6"><p class="text-[13px] text-green-700">✓ No significant order effects detected in your question sequence!</p></div>';
    return;
  }

  let flagsHTML = '<div class="space-y-4 mb-6">';
  for (const flag of data.flags) {
    flagsHTML += `
      <div class="bg-amber-50 border-2 border-amber-200 rounded-xl p-5">
        <p class="text-[11px] font-bold text-amber-900 uppercase mb-2">${flag.effect_type}</p>
        <p class="text-[12px] text-amber-900 mb-2"><strong>${flag.between_questions}</strong></p>
        <p class="text-[12px] text-amber-800 mb-2">${flag.explanation}</p>
        <p class="text-[12px] font-semibold text-amber-900">💡 Suggestion: ${flag.suggestion}</p>
      </div>
    `;
  }
  flagsHTML += '</div>';

  let reorderHTML = '';
  if (data.reorder_suggestion) {
    reorderHTML = `
      <div class="bg-white border-2 border-gray-200 rounded-xl p-6">
        <p class="text-[12px] font-semibold text-gray-900 mb-3">Suggested Reordering:</p>
        <p class="text-[12px] text-gray-700 leading-relaxed">${data.reorder_suggestion}</p>
      </div>
    `;
  }

  container.innerHTML = flagsHTML + reorderHTML;
}

// ─── UI Helpers ────────────────────────────────────────────────
function showLoading(tool, show) {
  const loader = document.getElementById(tool + '-loading');
  if (loader) {
    loader.style.display = show ? 'block' : 'none';
  }
}

function showResults(tool) {
  const results = document.getElementById(tool + '-results');
  if (results) {
    results.style.display = 'block';
  }
}

function hideResults(tool) {
  const results = document.getElementById(tool + '-results');
  const error = document.getElementById(tool + '-error');
  if (results) results.style.display = 'none';
  if (error) error.style.display = 'none';
}

function showError(tool, message) {
  const errorDiv = document.getElementById(tool + '-error');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

// ─── Utility Functions ─────────────────────────────────────────
function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    const btn = event.target;
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    btn.classList.add('text-green-600');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.classList.remove('text-green-600');
    }, 2000);
  }).catch(err => {
    console.error('Copy failed:', err);
  });
}

function escapeQuotes(text) {
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}
