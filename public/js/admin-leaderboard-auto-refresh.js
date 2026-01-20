// ============================================
// ADMIN DASHBOARD - LEADERBOARD AUTO-REFRESH
// ============================================
// Add this to your admin-dashboard.html in the Leaderboard tab section

// PASTE THIS INSIDE YOUR EXISTING LEADERBOARD TAB JAVASCRIPT

// Auto-refresh configuration
const ADMIN_REFRESH_INTERVAL = 5000; // 5 seconds
let adminRefreshTimer = null;
let adminLastData = [];
let isAdminAutoRefreshActive = true;

// Enhanced loadLeaderboard function with auto-refresh
async function loadLeaderboardWithAutoRefresh() {
  try {
    const response = await fetch('/api/admin/leaderboard');
    const data = await response.json();
    
    if (data.success && data.entries) {
      const tbody = document.querySelector('#leaderboard-table tbody');
      
      if (!tbody) {
        console.error('Leaderboard table not found');
        return;
      }
      
      // Check if data changed
      const hasChanges = JSON.stringify(adminLastData) !== JSON.stringify(data.entries);
      
      if (hasChanges) {
        // Smooth fade effect
        tbody.style.opacity = '0.5';
        tbody.style.transition = 'opacity 0.3s ease';
        
        setTimeout(() => {
          // Clear and rebuild table
          tbody.innerHTML = '';
          
          data.entries.forEach((entry, index) => {
            const row = createLeaderboardRow(entry, index);
            tbody.appendChild(row);
          });
          
          // Fade back in
          tbody.style.opacity = '1';
          
          // Show update notification if admin is watching
          if (document.activeElement.closest('#leaderboard-tab')) {
            showAdminNotification('Leaderboard updated!', 'success');
          }
          
          console.log(`✅ Leaderboard refreshed: ${data.entries.length} entries`);
        }, 300);
        
        adminLastData = data.entries;
      }
    }
  } catch (error) {
    console.error('❌ Auto-refresh error:', error);
  }
  
  // Schedule next refresh if active
  if (isAdminAutoRefreshActive) {
    adminRefreshTimer = setTimeout(loadLeaderboardWithAutoRefresh, ADMIN_REFRESH_INTERVAL);
  }
}

// Create table row with animation
function createLeaderboardRow(entry, index) {
  const tr = document.createElement('tr');
  tr.dataset.entryId = entry.id;
  tr.dataset.score = entry.score;
  
  // Add highlight class for new/changed entries
  const oldEntry = adminLastData.find(e => e.id === entry.id);
  if (oldEntry && oldEntry.score !== entry.score) {
    tr.classList.add('score-changed');
    setTimeout(() => tr.classList.remove('score-changed'), 2000);
  }
  
  // Medal for top 3
  let medal = '';
  if (index === 0) medal = '🥇 ';
  else if (index === 1) medal = '🥈 ';
  else if (index === 2) medal = '🥉 ';
  
  // Checkbox for bulk delete
  tr.innerHTML = `
    <td style="text-align: center;">
      <input type="checkbox" class="entry-checkbox" value="${entry.id}">
    </td>
    <td>${medal}#${entry.rank || index + 1}</td>
    <td>${entry.company_name || 'Unknown'}</td>
    <td><a href="${entry.url}" target="_blank" style="color: #3b82f6;">${entry.url}</a></td>
    <td><strong>${entry.score}/100</strong></td>
    <td>${entry.country || 'NL'}</td>
    <td>${entry.is_verified ? '✅' : '❌'}</td>
    <td>
      <button onclick="viewLeaderboardEntry(${entry.id})" class="btn-view">👁️ View</button>
      <button onclick="deleteLeaderboardEntry(${entry.id})" class="btn-delete">🗑️ Delete</button>
    </td>
  `;
  
  return tr;
}

// Show admin notification
function showAdminNotification(message, type = 'info') {
  let notification = document.getElementById('admin-auto-refresh-notif');
  
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'admin-auto-refresh-notif';
    notification.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
      font-size: 14px;
      font-weight: 500;
      color: white;
    `;
    document.body.appendChild(notification);
  }
  
  // Set background color based on type
  const colors = {
    success: '#10b981',
    error: '#ef4444',
    info: '#3b82f6',
    warning: '#f59e0b'
  };
  
  notification.style.background = colors[type] || colors.info;
  notification.textContent = message;
  notification.style.opacity = '1';
  
  setTimeout(() => {
    notification.style.opacity = '0';
  }, 2000);
}

// Toggle auto-refresh
function toggleAdminAutoRefresh() {
  isAdminAutoRefreshActive = !isAdminAutoRefreshActive;
  
  const button = document.getElementById('toggle-admin-refresh-btn');
  const indicator = document.getElementById('admin-live-indicator');
  
  if (button) {
    button.textContent = isAdminAutoRefreshActive ? '⏸️ Pause' : '▶️ Resume';
    button.style.background = isAdminAutoRefreshActive ? '#ef4444' : '#10b981';
  }
  
  if (indicator) {
    indicator.innerHTML = isAdminAutoRefreshActive 
      ? '<span style="color: #10b981;">●</span> Live (refreshes every 5s)' 
      : '<span style="color: #666;">●</span> Paused';
  }
  
  if (isAdminAutoRefreshActive) {
    console.log('✅ Auto-refresh resumed');
    loadLeaderboardWithAutoRefresh();
  } else {
    console.log('⏸️ Auto-refresh paused');
    if (adminRefreshTimer) {
      clearTimeout(adminRefreshTimer);
      adminRefreshTimer = null;
    }
  }
}

// Manual refresh
async function manualAdminRefresh() {
  showAdminNotification('Refreshing...', 'info');
  await loadLeaderboardWithAutoRefresh();
}

// Initialize auto-refresh for admin leaderboard
function initAdminLeaderboardAutoRefresh() {
  console.log('🚀 Admin leaderboard auto-refresh initialized');
  
  // Add controls to leaderboard tab header
  const tabHeader = document.querySelector('#leaderboard-tab h2') || 
                    document.querySelector('#leaderboard-tab .tab-header');
  
  if (tabHeader) {
    const controls = document.createElement('div');
    controls.style.cssText = 'display: inline-flex; gap: 10px; float: right; align-items: center;';
    controls.innerHTML = `
      <span id="admin-live-indicator" style="font-size: 12px; padding: 4px 12px; background: rgba(16, 185, 129, 0.1); border-radius: 4px;">
        <span style="color: #10b981;">●</span> Live (refreshes every 5s)
      </span>
      <button id="toggle-admin-refresh-btn" onclick="toggleAdminAutoRefresh()" style="
        background: #ef4444;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
      ">
        ⏸️ Pause
      </button>
      <button onclick="manualAdminRefresh()" style="
        background: #3b82f6;
        color: white;
        border: none;
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
      ">
        🔄 Refresh Now
      </button>
    `;
    
    tabHeader.appendChild(controls);
  }
  
  // Load initial data
  fetch('/api/admin/leaderboard')
    .then(res => res.json())
    .then(data => {
      if (data.success && data.entries) {
        adminLastData = data.entries;
        console.log(`✅ Loaded ${data.entries.length} entries`);
      }
    })
    .catch(err => console.error('Initial load error:', err));
  
  // Start auto-refresh
  adminRefreshTimer = setTimeout(loadLeaderboardWithAutoRefresh, ADMIN_REFRESH_INTERVAL);
}

// Add CSS for score change animation
const adminAutoRefreshStyles = document.createElement('style');
adminAutoRefreshStyles.textContent = `
  /* Score changed animation */
  tr.score-changed {
    background-color: rgba(16, 185, 129, 0.2) !important;
    transition: background-color 0.5s ease;
  }
  
  /* Smooth opacity transitions */
  #leaderboard-table tbody {
    transition: opacity 0.3s ease;
  }
  
  /* Pulse animation for live indicator */
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.95); }
  }
  
  #admin-live-indicator span {
    display: inline-block;
    animation: pulse-dot 2s infinite;
  }
`;
document.head.appendChild(adminAutoRefreshStyles);

// Start when leaderboard tab is opened
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on the leaderboard tab
  const leaderboardTab = document.getElementById('leaderboard-tab');
  
  if (leaderboardTab) {
    // Initialize when tab becomes visible
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
          const isVisible = leaderboardTab.style.display !== 'none' && 
                           !leaderboardTab.classList.contains('hidden');
          
          if (isVisible && !adminRefreshTimer) {
            initAdminLeaderboardAutoRefresh();
          }
        }
      });
    });
    
    observer.observe(leaderboardTab, { 
      attributes: true,
      attributeFilter: ['style', 'class']
    });
    
    // Also check initial state
    if (leaderboardTab.style.display !== 'none') {
      initAdminLeaderboardAutoRefresh();
    }
  }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (adminRefreshTimer) {
    clearTimeout(adminRefreshTimer);
  }
});

console.log('✅ Admin leaderboard auto-refresh script loaded');
