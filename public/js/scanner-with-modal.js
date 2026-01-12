/**
 * CONTENTSCALE SCANNER WITH MODAL + AGENCY LEADERBOARD + COPY FUNCTION
 * Version: 2.2
 */

// API Configuration
const API_BASE = window.location.origin;

console.log('✅ ContentScale Scanner initialized');

// ==========================================
// NAVIGATION FUNCTIONS
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
    
    // Update active nav link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });
    event.target.classList.add('active');
  }
}

// ==========================================
// SCANNER FUNCTION
// ==========================================

async function performScan() {
  const urlInput = document.getElementById('scanInput');
  const button = document.getElementById('scanButton');
  const url = urlInput.value.trim();
  
  // Validation
  if (!url) {
    alert('⚠️ Please enter a URL');
    return;
  }
  
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    alert('⚠️ URL must start with http:// or https://');
    return;
  }
  
  // Disable button
  button.disabled = true;
  button.innerHTML = '<span class="scan-spinner"></span>Scanning...';
  
  console.log('[SCAN] Starting scan for:', url);
  
  try {
    // Perform scan
    const response = await fetch(`${API_BASE}/api/scan-free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    
    const result = await response.json();
    
    console.log('[SCAN] Result:', result);
    
    if (!result.success) {
      throw new Error(result.error || 'Scan failed');
    }
    
    // Show results in modal
    showResultsModal(result);
    
    // Check if user wants to submit to leaderboard
    const submitCheckbox = document.getElementById('submitToLeaderboard');
    if (submitCheckbox && submitCheckbox.checked) {
      await submitToLeaderboard(result);
      await refreshLeaderboard();
    }
    
  } catch (error) {
    console.error('[SCAN ERROR]', error);
    alert('❌ Scan failed: ' + error.message);
  } finally {
    // Re-enable button
    button.disabled = false;
    button.innerHTML = 'Scan Now';
  }
}

// ==========================================
// RESULTS MODAL
// ==========================================

function showResultsModal(result) {
  // Create modal overlay
  const modal = document.createElement('div');
  modal.id = 'resultsModal';
  modal.className = 'modal-overlay';
  
  // Store result data for copy function
  window.currentScanResult = result;
  
  // Determine score class
  let scoreClass = 'score-poor';
  if (result.score >= 90) scoreClass = 'score-excellent';
  else if (result.score >= 75) scoreClass = 'score-good';
  else if (result.score >= 60) scoreClass = 'score-fair';
  
  // Build modal content
  modal.innerHTML = `
    <div class="modal-content">
      <!-- HEADER -->
      <div class="modal-header">
        <div class="score-circle ${scoreClass}">
          <div style="font-size: 48px; font-weight: bold; color: white;">${result.score}</div>
          <div style="font-size: 14px; color: #9ca3af;">/ 100</div>
        </div>
        <div style="font-size: 18px; font-weight: 600; color: #10b981; margin-bottom: 8px;">
          ${result.quality.toUpperCase()}
        </div>
        <div style="font-size: 14px; color: #9ca3af; word-break: break-all;">
          ${result.url}
        </div>
      </div>
      
      <!-- BODY -->
      <div class="modal-body">
        <!-- BREAKDOWN -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px;">
          <div style="background: rgba(34, 197, 94, 0.1); padding: 20px; border-radius: 12px; border: 2px solid #22c55e;">
            <div style="font-size: 12px; color: #9ca3af; margin-bottom: 5px;">GRAAF FRAMEWORK</div>
            <div style="font-size: 32px; font-weight: bold; color: #22c55e;">${result.breakdown.graaf.total}/50</div>
          </div>
          <div style="background: rgba(59, 130, 246, 0.1); padding: 20px; border-radius: 12px; border: 2px solid #3b82f6;">
            <div style="font-size: 12px; color: #9ca3af; margin-bottom: 5px;">CRAFT METHODOLOGY</div>
            <div style="font-size: 32px; font-weight: bold; color: #3b82f6;">${result.breakdown.craft.total}/30</div>
          </div>
          <div style="background: rgba(245, 158, 11, 0.1); padding: 20px; border-radius: 12px; border: 2px solid #f59e0b;">
            <div style="font-size: 12px; color: #9ca3af; margin-bottom: 5px;">TECHNICAL SEO</div>
            <div style="font-size: 32px; font-weight: bold; color: #f59e0b;">${result.breakdown.technical.total}/20</div>
          </div>
        </div>
        
        <!-- SUMMARY -->
        <div style="background: rgba(17, 24, 39, 0.5); padding: 20px; border-radius: 12px; margin-bottom: 30px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; text-align: center;">
            <div>
              <div style="font-size: 12px; color: #9ca3af; margin-bottom: 5px;">Issues Found</div>
              <div style="font-size: 24px; font-weight: bold; color: #ef4444;">${result.recommendations.summary.totalIssues}</div>
            </div>
            <div>
              <div style="font-size: 12px; color: #9ca3af; margin-bottom: 5px;">Est. Fix Time</div>
              <div style="font-size: 24px; font-weight: bold; color: #f59e0b;">${result.recommendations.summary.estimatedTimeToFix} min</div>
            </div>
            <div>
              <div style="font-size: 12px; color: #9ca3af; margin-bottom: 5px;">Potential Gain</div>
              <div style="font-size: 24px; font-weight: bold; color: #22c55e;">+${result.recommendations.summary.potentialScoreGain} pts</div>
            </div>
            <div>
              <div style="font-size: 12px; color: #9ca3af; margin-bottom: 5px;">Word Count</div>
              <div style="font-size: 24px; font-weight: bold; color: #60a5fa;">${result.wordCount}</div>
            </div>
          </div>
        </div>
        
        <!-- RECOMMENDATIONS -->
        <h3 style="font-size: 24px; font-weight: bold; margin-bottom: 20px; color: white;">📋 Recommendations</h3>
        ${generateRecommendationsHTML(result.recommendations)}
        
        <!-- ACTIONS -->
        <div style="display: flex; gap: 10px; margin-top: 30px; flex-wrap: wrap;">
          <button onclick="closeResultsModal()" style="flex: 1; min-width: 150px; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: white; padding: 15px 30px; border-radius: 12px; font-weight: 700; border: none; cursor: pointer; transition: all 0.3s;">
            ✅ Close
          </button>
          <button onclick="copyRecommendations()" style="flex: 1; min-width: 150px; background: #22c55e; color: white; padding: 15px 30px; border-radius: 12px; font-weight: 700; border: none; cursor: pointer; transition: all 0.3s;">
            📋 Copy Text
          </button>
          <button onclick="downloadPDF()" style="flex: 1; min-width: 150px; background: #374151; color: white; padding: 15px 30px; border-radius: 12px; font-weight: 700; border: none; cursor: pointer; transition: all 0.3s;">
            📥 Download PDF
          </button>
        </div>
      </div>
    </div>
  `;
  
  // Add to page
  document.body.appendChild(modal);
  
  // Close on click outside
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeResultsModal();
    }
  });
}

function generateRecommendationsHTML(recommendations) {
  let html = '';
  
  // Quick Wins
  if (recommendations.quickWins && recommendations.quickWins.length > 0) {
    html += `
      <div class="rec-section rec-quickwin">
        <h4 style="font-size: 20px; font-weight: bold; margin-bottom: 15px; color: white; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 24px;">⚡</span>
          <span>Quick Wins</span>
          <span style="font-size: 14px; color: #9ca3af;">(High Priority)</span>
        </h4>
        ${recommendations.quickWins.map(rec => `
          <div class="rec-item">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <div style="font-weight: bold; color: white;">${rec.category}</div>
              <div style="font-size: 12px; padding: 4px 8px; border-radius: 6px; background: #22c55e; color: white;">${rec.timeEstimate || 5} min</div>
            </div>
            <div style="font-size: 14px; color: #9ca3af; margin-bottom: 10px;">${rec.issue}</div>
            <div style="font-size: 14px; color: #22c55e; font-weight: 600; margin-bottom: 10px;">✅ ${rec.action}</div>
            ${rec.details ? `
              <ul style="font-size: 12px; color: #6b7280; margin-left: 20px;">
                ${rec.details.map(d => `<li style="margin-bottom: 5px;">• ${d}</li>`).join('')}
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
        <h4 style="font-size: 20px; font-weight: bold; margin-bottom: 15px; color: white; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 24px;">🎯</span>
          <span>Major Impact</span>
          <span style="font-size: 14px; color: #9ca3af;">(Medium Priority)</span>
        </h4>
        ${recommendations.majorImpact.map(rec => `
          <div class="rec-item">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <div style="font-weight: bold; color: white;">${rec.category}</div>
              <div style="font-size: 12px; padding: 4px 8px; border-radius: 6px; background: #f59e0b; color: white;">${rec.timeEstimate || 30} min</div>
            </div>
            <div style="font-size: 14px; color: #9ca3af; margin-bottom: 10px;">${rec.issue}</div>
            <div style="font-size: 14px; color: #f59e0b; font-weight: 600; margin-bottom: 10px;">🎯 ${rec.action}</div>
            ${rec.details ? `
              <ul style="font-size: 12px; color: #6b7280; margin-left: 20px;">
                ${rec.details.map(d => `<li style="margin-bottom: 5px;">• ${d}</li>`).join('')}
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
        <h4 style="font-size: 20px; font-weight: bold; margin-bottom: 15px; color: white; display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 24px;">🚀</span>
          <span>Advanced</span>
          <span style="font-size: 14px; color: #9ca3af;">(Long-term)</span>
        </h4>
        ${recommendations.advanced.map(rec => `
          <div class="rec-item">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
              <div style="font-weight: bold; color: white;">${rec.category}</div>
              <div style="font-size: 12px; padding: 4px 8px; border-radius: 6px; background: #8b5cf6; color: white;">${rec.timeEstimate || 60} min</div>
            </div>
            <div style="font-size: 14px; color: #9ca3af; margin-bottom: 10px;">${rec.issue}</div>
            <div style="font-size: 14px; color: #8b5cf6; font-weight: 600; margin-bottom: 10px;">🚀 ${rec.action}</div>
            ${rec.details ? `
              <ul style="font-size: 12px; color: #6b7280; margin-left: 20px;">
                ${rec.details.map(d => `<li style="margin-bottom: 5px;">• ${d}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }
  
  if (!html) {
    html = '<div style="text-center; padding: 40px; color: #9ca3af;">🎉 Excellent! No major improvements needed.</div>';
  }
  
  return html;
}

function closeResultsModal() {
  const modal = document.getElementById('resultsModal');
  if (modal) {
    modal.remove();
  }
  window.currentScanResult = null;
}

function downloadPDF() {
  alert('📥 PDF Download\n\nPDF generation coming soon!\n\nFor now, use the "📋 Copy Text" button to get a text version, or take a screenshot.\n\nContact info@contentscale.site for professional PDF reports.');
}

// ==========================================
// ⭐ NEW: COPY RECOMMENDATIONS FUNCTION
// ==========================================

function copyRecommendations() {
  const result = window.currentScanResult;
  
  if (!result) {
    alert('❌ No scan data available');
    return;
  }
  
  // Build text content
  let text = `╔═══════════════════════════════════════════════╗\n`;
  text += `║  📊 CONTENTSCALE SEO SCAN RESULTS           ║\n`;
  text += `╚═══════════════════════════════════════════════╝\n\n`;
  
  text += `🌐 URL: ${result.url}\n`;
  text += `🔢 Score: ${result.score}/100\n`;
  text += `⭐ Quality: ${result.quality.toUpperCase()}\n`;
  text += `📝 Word Count: ${result.wordCount}\n\n`;
  
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📈 BREAKDOWN:\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  text += `✅ GRAAF Framework: ${result.breakdown.graaf.total}/50\n`;
  text += `✅ CRAFT Methodology: ${result.breakdown.craft.total}/30\n`;
  text += `✅ Technical SEO: ${result.breakdown.technical.total}/20\n\n`;
  
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `📋 SUMMARY:\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  text += `🔍 Issues Found: ${result.recommendations.summary.totalIssues}\n`;
  text += `⏱️  Est. Fix Time: ${result.recommendations.summary.estimatedTimeToFix} minutes\n`;
  text += `📈 Potential Gain: +${result.recommendations.summary.potentialScoreGain} points\n\n`;
  
  // Quick Wins
  if (result.recommendations.quickWins && result.recommendations.quickWins.length > 0) {
    text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `⚡ QUICK WINS (High Priority)\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    result.recommendations.quickWins.forEach((rec, index) => {
      text += `${index + 1}. ${rec.category} (${rec.timeEstimate || 5} min)\n`;
      text += `   ❌ Issue: ${rec.issue}\n`;
      text += `   ✅ Action: ${rec.action}\n`;
      
      if (rec.details && rec.details.length > 0) {
        text += `   📌 Details:\n`;
        rec.details.forEach(d => {
          text += `      • ${d}\n`;
        });
      }
      text += `\n`;
    });
  }
  
  // Major Impact
  if (result.recommendations.majorImpact && result.recommendations.majorImpact.length > 0) {
    text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🎯 MAJOR IMPACT (Medium Priority)\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    result.recommendations.majorImpact.forEach((rec, index) => {
      text += `${index + 1}. ${rec.category} (${rec.timeEstimate || 30} min)\n`;
      text += `   ❌ Issue: ${rec.issue}\n`;
      text += `   🎯 Action: ${rec.action}\n`;
      
      if (rec.details && rec.details.length > 0) {
        text += `   📌 Details:\n`;
        rec.details.forEach(d => {
          text += `      • ${d}\n`;
        });
      }
      text += `\n`;
    });
  }
  
  // Advanced
  if (result.recommendations.advanced && result.recommendations.advanced.length > 0) {
    text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🚀 ADVANCED (Long-term)\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    
    result.recommendations.advanced.forEach((rec, index) => {
      text += `${index + 1}. ${rec.category} (${rec.timeEstimate || 60} min)\n`;
      text += `   ❌ Issue: ${rec.issue}\n`;
      text += `   🚀 Action: ${rec.action}\n`;
      
      if (rec.details && rec.details.length > 0) {
        text += `   📌 Details:\n`;
        rec.details.forEach(d => {
          text += `      • ${d}\n`;
        });
      }
      text += `\n`;
    });
  }
  
  text += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  text += `🌐 Generated by ContentScale.site\n`;
  text += `📅 ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}\n`;
  text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  
  // Copy to clipboard
  navigator.clipboard.writeText(text).then(() => {
    // Show success feedback
    const btn = event.target;
    const originalHTML = btn.innerHTML;
    const originalBG = btn.style.background;
    
    btn.innerHTML = '✅ Copied!';
    btn.style.background = '#16a34a';
    
    setTimeout(() => {
      btn.innerHTML = originalHTML;
      btn.style.background = originalBG;
    }, 2000);
    
    console.log('[COPY] ✅ Recommendations copied to clipboard');
  }).catch(err => {
    console.error('[COPY] ❌ Failed:', err);
    alert('❌ Copy failed. Please try again or take a screenshot.');
  });
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
// LEADERBOARD DISPLAY
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
    const agencyName = entry.agency_name || ''; // ⭐ AGENCY CREDIT
    
    html += `
      <div class="bg-gray-800 hover:bg-gray-750 rounded-lg p-4 transition">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-4 flex-1 min-w-0">
            <div class="text-2xl font-bold w-12 text-center flex-shrink-0">${medal}</div>
            <div class="min-w-0 flex-1">
              <div class="font-semibold text-white truncate">${url}</div>
              ${company ? `<div class="text-sm text-gray-400">${company}</div>` : ''}
              ${agencyName ? `<div class="text-xs text-purple-400 mt-1">🏢 Optimized by ${agencyName}</div>` : ''}
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
  console.log('✅ ContentScale initialized with results modal + agency leaderboard + copy function');
  
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


