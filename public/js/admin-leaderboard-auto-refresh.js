<!-- ============================================ -->
<!-- LEADERBOARD AUTO-REFRESH - SIMPLE INTEGRATION -->
<!-- ============================================ -->
<!-- Add this ANYWHERE in your leaderboard HTML page -->

<script>
// AUTO-REFRESH CONFIGURATION
const REFRESH_INTERVAL = 5000; // 5 seconds (5000ms)
let refreshTimer = null;
let lastData = [];

// Auto-refresh function
async function autoUpdateLeaderboard() {
  try {
    const response = await fetch('/api/leaderboard');
    const data = await response.json();
    
    if (data.success && data.entries) {
      // Check if data changed
      const changed = JSON.stringify(lastData) !== JSON.stringify(data.entries);
      
      if (changed) {
        console.log('🔄 Leaderboard updated!');
        
        // Find the leaderboard table/container
        const container = document.getElementById('leaderboard-entries') ||
                         document.querySelector('.leaderboard-container') ||
                         document.querySelector('tbody');
        
        if (container) {
          // Smooth fade
          container.style.opacity = '0.5';
          
          setTimeout(() => {
            // Update content
            renderLeaderboard(data.entries, container);
            container.style.opacity = '1';
            
            // Show notification
            showNotification('Leaderboard updated!');
          }, 200);
        }
        
        lastData = data.entries;
      }
    }
  } catch (error) {
    console.error('Auto-refresh error:', error);
  }
  
  // Schedule next refresh
  refreshTimer = setTimeout(autoUpdateLeaderboard, REFRESH_INTERVAL);
}

// Render leaderboard entries
function renderLeaderboard(entries, container) {
  container.innerHTML = entries.map((entry, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '';
    
    return `
      <div class="leaderboard-row" data-id="${entry.id}">
        <div class="rank">${medal} #${entry.rank}</div>
        <div class="name">${entry.company_name || 'Unknown'}</div>
        <div class="url"><a href="${entry.url}" target="_blank">${entry.url}</a></div>
        <div class="score">${entry.score}/100</div>
        <div class="country">${entry.country}</div>
        <div class="actions">
          <button onclick="deleteEntry(${entry.id})">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

// Show update notification
function showNotification(msg) {
  let notif = document.getElementById('auto-notif');
  
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'auto-notif';
    notif.style.cssText = 'position:fixed;top:20px;right:20px;background:#10b981;color:white;padding:12px 24px;border-radius:8px;z-index:9999;opacity:0;transition:opacity 0.3s';
    document.body.appendChild(notif);
  }
  
  notif.textContent = msg;
  notif.style.opacity = '1';
  setTimeout(() => notif.style.opacity = '0', 2000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ Auto-refresh started (every 5 seconds)');
  
  // Load initial data
  fetch('/api/leaderboard')
    .then(r => r.json())
    .then(d => { if (d.success) lastData = d.entries; });
  
  // Start auto-refresh
  refreshTimer = setTimeout(autoUpdateLeaderboard, REFRESH_INTERVAL);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (refreshTimer) clearTimeout(refreshTimer);
});
</script>

<!-- Optional: Live indicator -->
<div id="live-indicator" style="position:fixed;bottom:20px;right:20px;background:rgba(0,0,0,0.7);color:#10b981;padding:8px 16px;border-radius:6px;font-size:12px;z-index:9998;">
  🟢 Live
</div>

<style>
/* Smooth transitions */
#leaderboard-entries,
.leaderboard-container,
tbody {
  transition: opacity 0.3s ease;
}

/* Optional: Pulse animation for live indicator */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

#live-indicator::before {
  content: '';
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #10b981;
  border-radius: 50%;
  margin-right: 8px;
  animation: pulse 2s infinite;
}
</style>
