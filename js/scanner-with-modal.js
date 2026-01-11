console.log('%c🚀 ContentScale v2.1 - WITH RESULTS MODAL','color:#8b5cf6;font-size:16px;font-weight:bold');

const API_BASE = window.location.origin;
let currentScanResult = null;

// ==========================================
// NAVIGATION
// ==========================================

function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const hamburger = document.querySelector('.hamburger');
  menu.classList.toggle('active');
  hamburger.classList.toggle('active');
}

function scrollToSection(sectionId) {
  const element = document.getElementById(sectionId);
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const menu = document.getElementById('mobileMenu');
    const hamburger = document.querySelector('.hamburger');
    if (menu && menu.classList.contains('active')) {
      menu.classList.remove('active');
      hamburger.classList.remove('active');
    }
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('onclick')?.includes(sectionId)) {
        link.classList.add('active');
      }
    });
  }
}

// ==========================================
// SCANNER WITH RESULTS MODAL
// ==========================================

async function performScan() {
  const input = document.getElementById('scanInput');
  const button = document.getElementById('scanButton');
  const url = input.value.trim();
  
  if (!url) {
    alert('⚠️ Please enter a URL');
    return;
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('⚠️ Please enter a valid URL starting with http:// or https://');
    return;
  }
  
  button.disabled = true;
  button.innerHTML = '<span class="scan-spinner"></span>Scanning...';
  
  try {
    console.log('[SCAN] Starting scan for:', url);
    
    const response = await fetch(`${API_BASE}/api/scan-free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url })
    });
    
    console.log('[SCAN] Response status:', response.status);
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Scan failed (HTTP ${response.status})`);
    }
    
    const result = await response.json();
    console.log('[SCAN] Result:', result);
    
    if (!result.success) {
      throw new Error(result.error || 'Scan failed');
    }
    
    // ✅ SAVE RESULT
    currentScanResult = result;
    
    // ✅ SHOW RESULTS MODAL (not alert!)
    showResultsModal(result);
    
    // ✅ SUBMIT TO LEADERBOARD IF CHECKED
    const submitCheckbox = document.getElementById('submitToLeaderboard');
    if (submitCheckbox && submitCheckbox.checked) {
      await submitToLeaderboard(result);
    }
    
    // Refresh leaderboard
    setTimeout(() => refreshLeaderboard(), 1000);
    
  } catch (error) {
    console.error('[SCAN ERROR]', error);
    alert(`❌ Scan Failed\n\n${error.message}\n\nPlease try again or contact support at info@contentscale.site`);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Scan Now';
  }
}

// ==========================================
// RESULTS MODAL
// ==========================================

function showResultsModal(result) {
  // Remove existing modal if any
  const existing = document.getElementById('resultsModal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.id = 'resultsModal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-content">
      ${generateModalContent(result)}
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Close on overlay click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      closeResultsModal();
    }
  });
}

function generateModalContent(result) {
  const score = result.score || 0;
  const quality = result.quality || 'fair';
  const breakdown = result.breakdown || {};
  const recommendations = result.recommendations || {};
  const summary = recommendations.summary || {};
  
  // Score color
  let scoreClass = 'score-fair';
  if (score >= 90) scoreClass = 'score-excellent';
  else if (score >= 75) scoreClass = 'score-good';
  else if (score < 60) scoreClass = 'score-poor';
  
  // Quality badge color
  let qualityColor = '#f59e0b';
  if (quality === 'excellent') qualityColor = '#22c55e';
  else if (quality === 'good') qualityColor = '#3b82f6';
  else if (quality === 'poor') qualityColor = '#ef4444';
  
  return `
    <!-- HEADER -->
    <div class="modal-header">
      <div class="text-6xl mb-4">✅</div>
      <h2 class="text-4xl font-bold mb-3 text-white">Scan Complete!</h2>
      
      <div class="score-circle ${scoreClass}">
        <div class="text-5xl font-bold" style="color: ${qualityColor}">${score}</div>
        <div class="text-sm text-gray-400">/ 100</div>
      </div>
      
      <div class="inline-block px-6 py-2 rounded-full font-bold text-lg" style="background: ${qualityColor}; color: white;">
        ${quality.toUpperCase()}
      </div>
      
      <div class="mt-6 text-gray-400">
        <strong>${result.url}</strong>
      </div>
    </div>
    
    <!-- BODY -->
    <div class="modal-body">
      
      <!-- BREAKDOWN -->
      <div class="grid grid-cols-3 gap-4 mb-8">
        <div class="bg-purple-900 bg-opacity-30 rounded-lg p-4 text-center border border-purple-700">
          <div class="text-3xl font-bold text-purple-400">${breakdown.graaf?.total || 0}</div>
          <div class="text-xs text-gray-400 mt-1">GRAAF (50 max)</div>
        </div>
        <div class="bg-blue-900 bg-opacity-30 rounded-lg p-4 text-center border border-blue-700">
          <div class="text-3xl font-bold text-blue-400">${breakdown.craft?.total || 0}</div>
          <div class="text-xs text-gray-400 mt-1">CRAFT (30 max)</div>
        </div>
        <div class="bg-green-900 bg-opacity-30 rounded-lg p-4 text-center border border-green-700">
          <div class="text-3xl font-bold text-green-400">${breakdown.technical?.total || 0}</div>
          <div class="text-xs text-gray-400 mt-1">Technical (20 max)</div>
        </div>
      </div>
      
      <!-- SUMMARY -->
      <div class="bg-gray-800 bg-opacity-50 rounded-lg p-5 mb-8">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div class="text-2xl font-bold text-yellow-400">${summary.totalIssues || 0}</div>
            <div class="text-xs text-gray-400">Issues Found</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-blue-400">${summary.estimatedTimeToFix || 0}m</div>
            <div class="text-xs text-gray-400">Est. Time</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-green-400">+${summary.potentialScoreGain || 0}</div>
            <div class="text-xs text-gray-400">Score Gain</div>
          </div>
          <div>
            <div class="text-2xl font-bold text-purple-400">${result.wordCount || 0}</div>
            <div class="text-xs text-gray-400">Words</div>
          </div>
        </div>
      </div>
      
      <!-- RECOMMENDATIONS -->
      <div class="mb-6">
        <h3 class="text-2xl font-bold mb-4 text-white">💡 Recommendations</h3>
        
        ${generateRecommendationsHTML(recommendations)}
      </div>
      
      <!-- ACTIONS -->
      <div class="flex flex-col sm:flex-row gap-3 pt-6 border-t border-gray-700">
        <button onclick="downloadPDF()" class="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 py-4 rounded-lg font-bold transition">
          📥 Download PDF Report
        </button>
        <button onclick="closeResultsModal()" class="flex-1 bg-gray-700 hover:bg-gray-600 text-white px-6 py-4 rounded-lg font-bold transition">
          ✅ Close
        </button>
      </div>
    </div>
  `;
}
function generateRecommendationsHTML(recommendations) {
  let html = '';
  
  // Quick Wins
  if (recommendations.quickWins && recommendations.quickWins.length > 0) {
    html += `
      <div class="rec-section rec-quickwin">
        <h4 class="text-xl font-bold mb-3 flex items-center gap-2">
          <span class="text-green-400">⚡</span>
          <span class="text-white">Quick Wins</span>
          <span class="text-sm text-gray-400">(High Priority)</span>
        </h4>
        ${recommendations.quickWins.map(rec => `
          <div class="rec-item">
            <div class="flex items-start justify-between mb-2">
              <div class="font-bold text-white">${rec.category}</div>
              <div class="text-xs px-2 py-1 rounded bg-green-600 text-white">${rec.timeEstimate || 5} min</div>
            </div>
            <div class="text-sm text-gray-400 mb-2">${rec.issue}</div>
            <div class="text-sm text-green-400 font-semibold mb-2">✅ ${rec.action}</div>
            ${rec.details ? `
              <ul class="text-xs text-gray-500 ml-4 space-y-1">
                ${rec.details.map(d => `<li>• ${d}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // Major Impact
  if (recommendations.majorImpact && recommendations.majorImpact.length > 0) {
    html += `
      <div class="rec-section rec-major">
        <h4 class="text-xl font-bold mb-3 flex items-center gap-2">
          <span class="text-orange-400">🎯</span>
          <span class="text-white">Major Impact</span>
          <span class="text-sm text-gray-400">(Medium Priority)</span>
        </h4>
        ${recommendations.majorImpact.map(rec => `
          <div class="rec-item">
            <div class="flex items-start justify-between mb-2">
              <div class="font-bold text-white">${rec.category}</div>
              <div class="text-xs px-2 py-1 rounded bg-orange-600 text-white">${rec.timeEstimate || 30} min</div>
            </div>
            <div class="text-sm text-gray-400 mb-2">${rec.issue}</div>
            <div class="text-sm text-orange-400 font-semibold mb-2">🎯 ${rec.action}</div>
            ${rec.details ? `
              <ul class="text-xs text-gray-500 ml-4 space-y-1">
                ${rec.details.map(d => `<li>• ${d}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // Advanced
  if (recommendations.advanced && recommendations.advanced.length > 0) {
    html += `
      <div class="rec-section rec-advanced">
        <h4 class="text-xl font-bold mb-3 flex items-center gap-2">
          <span class="text-purple-400">🚀</span>
          <span class="text-white">Advanced</span>
          <span class="text-sm text-gray-400">(Long-term)</span>
        </h4>
        ${recommendations.advanced.map(rec => `
          <div class="rec-item">
            <div class="flex items-start justify-between mb-2">
              <div class="font-bold text-white">${rec.category}</div>
              <div class="text-xs px-2 py-1 rounded bg-purple-600 text-white">${rec.timeEstimate || 60} min</div>
            </div>
            <div class="text-sm text-gray-400 mb-2">${rec.issue}</div>
            <div class="text-sm text-purple-400 font-semibold mb-2">🚀 ${rec.action}</div>
            ${rec.details ? `
              <ul class="text-xs text-gray-500 ml-4 space-y-1">
                ${rec.details.map(d => `<li>• ${d}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }
  
  if (!html) {
    html = '<div class="text-center py-8 text-gray-400">🎉 Excellent! No major improvements needed.</div>';
  }
  
  return html;
}

function closeResultsModal() {
  const modal = document.getElementById('resultsModal');
  if (modal) {
    modal.remove();
  }
}

function downloadPDF() {
  alert('📥 PDF Download\n\nPDF generation coming soon!\n\nFor now, take a screenshot of this report or contact us at info@contentscale.site for a detailed PDF report.');
}

// ==========================================
// LEADERBOARD SUBMIT
// ==========================================

async function submitToLeaderboard(scanResult) {
  try {
    const companyName = document.getElementById('companyName')?.value || '';
    
    const response = await fetch(`${API_BASE}/api/leaderboard/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: scanResult.url,
        score: scanResult.score,
        quality: scanResult.quality,
        graaf_score: scanResult.breakdown?.graaf?.total || 0,
        craft_score: scanResult.breakdown?.craft?.total || 0,
        technical_score: scanResult.breakdown?.technical?.total || 0,
        word_count: scanResult.wordCount || 0,
        company_name: companyName
      })
    });
    
    if (response.ok) {
      console.log('[LEADERBOARD] ✅ Submitted successfully');
    } else {
      console.error('[LEADERBOARD] ❌ Submit failed:', response.status);
    }
  } catch (error) {
    console.error('[LEADERBOARD] Submit error:', error);
  }
}

// ==========================================
// LEADERBOARD
// ==========================================

async function refreshLeaderboard() {
  const container = document.getElementById('leaderboard-container');
  
  try {
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="scan-spinner mx-auto mb-4" style="width: 40px; height: 40px; border-width: 4px;"></div>
        <div class="text-gray-400">Loading leaderboard...</div>
      </div>
    `;
    
    console.log('[LEADERBOARD] Fetching from:', `${API_BASE}/api/leaderboard`);
    
    const response = await fetch(`${API_BASE}/api/leaderboard`);
    
    console.log('[LEADERBOARD] Response status:', response.status);
    
    if (!response.ok) {
      throw new Error('Failed to load leaderboard');
    }
    
    const data = await response.json();
    console.log('[LEADERBOARD] Data:', data);
    
    let entries = [];
    
    if (Array.isArray(data)) {
      entries = data;
    } else if (data.entries && Array.isArray(data.entries)) {
      entries = data.entries;
    } else if (data.success && data.entries) {
      entries = data.entries;
    }
    
    console.log('[LEADERBOARD] Entries:', entries.length);
    
    displayLeaderboard(entries);
    
  } catch (error) {
    console.error('[LEADERBOARD ERROR]', error);
    
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="text-5xl mb-4">📊</div>
        <div class="text-gray-400 mb-2">No entries yet</div>
        <div class="text-sm text-gray-500 mb-4">Be the first to scan your website!</div>
        <button onclick="scrollToSection('scanner')" class="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-semibold transition">
          Scan Now
        </button>
      </div>
    `;
  }
}

function displayLeaderboard(entries) {
  const container = document.getElementById('leaderboard-container');
  
  if (!entries || entries.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="text-5xl mb-4">📊</div>
        <div class="text-gray-400 mb-2">No entries yet</div>
        <div class="text-sm text-gray-500 mb-4">Be the first to scan your website!</div>
        <button onclick="scrollToSection('scanner')" class="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg font-semibold transition">
          Scan Now
        </button>
      </div>
    `;
    return;
  }
  
  let html = '<div class="space-y-4">';
  
  entries.slice(0, 100).forEach((entry, index) => {
    const rank = entry.rank || (index + 1);
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
    const score = entry.score || 0;
    const url = entry.url || 'Unknown';
    const company = entry.company_name || entry.company || '';
    
    html += `
      <div class="bg-gray-800 hover:bg-gray-750 rounded-lg p-4 transition">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4 flex-1 min-w-0">
            <div class="text-2xl font-bold w-12 text-center flex-shrink-0">${medal}</div>
            <div class="min-w-0 flex-1">
              <div class="font-semibold text-white truncate">${url}</div>
              ${company ? `<div class="text-sm text-gray-400">${company}</div>` : ''}
            </div>
          </div>
          <div class="text-right flex-shrink-0 ml-4">
            <div class="text-3xl font-bold text-green-400">${score}/100</div>
          </div>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}
// ==========================================
// INITIALIZE
// ==========================================

document.addEventListener('DOMContentLoaded', function() {
  console.log('✅ ContentScale initialized with results modal');
  
  // Leaderboard checkbox toggle
  const checkbox = document.getElementById('submitToLeaderboard');
  const companyField = document.getElementById('companyNameField');
  
  if (checkbox && companyField) {
    checkbox.addEventListener('change', function() {
      if (this.checked) {
        companyField.classList.remove('hidden');
      } else {
        companyField.classList.add('hidden');
      }
    });
  }
  
  // Load leaderboard
  refreshLeaderboard();
  
  // Enter key support
  const scanInput = document.getElementById('scanInput');
  if (scanInput) {
    scanInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        performScan();
      }
    });
  }
  
  // ESC key to close modal
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeResultsModal();
    }
  });
});
