/**
 * ContentScale Lead Scanner Module
 * Provides content scanning and lead generation functionality
 */

class LeadScanner {
  constructor(config = {}) {
    this.apiEndpoint = config.apiEndpoint || '/api/scan';
    this.onScanComplete = config.onScanComplete || (() => {});
    this.onError = config.onError || ((error) => console.error(error));
    this.lastResults = [];
  }

  async scanSingleURL(url) {
    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Scan failed');

      this.onScanComplete(data);
      return data;
    } catch (error) {
      this.onError(error);
      throw error;
    }
  }

  async scanMultipleURLs(urls, progressCallback) {
    this.lastResults = [];
    const total = urls.length;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        if (progressCallback) progressCallback(i, total, `Scanning ${url}...`);
        const result = await this.scanSingleURL(url);
        this.lastResults.push(result);
        if (progressCallback) progressCallback(i + 1, total, `Completed ${i + 1}/${total}`);
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        this.lastResults.push({ success: false, url, error: error.message });
      }
    }
    return this.lastResults;
  }
}

class LeadScannerUI {
  renderScanResult(result) {
    if (!result || !result.success) {
      return `<div class="bg-red-900 bg-opacity-20 border-2 border-red-500 rounded-xl p-6">
        <h3 class="text-xl font-bold text-red-400 mb-2">Scan Failed</h3>
        <p class="text-gray-300">${result?.error || 'Unknown error'}</p></div>`;
    }

    const score = result.score || 0;
    const metrics = result.metrics || {};
    let scoreColor = score >= 90 ? 'text-green-400' : score >= 75 ? 'text-blue-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400';
    let qualityLabel = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Average' : 'Poor';

    return `<div class="bg-gray-800 rounded-xl p-6 border-2 border-gray-700 shadow-xl">
      <div class="flex items-center justify-between mb-6">
        <div><h3 class="text-xl font-bold text-white mb-1">${result.url || 'URL'}</h3>
        <p class="text-sm text-gray-400">Content Quality Analysis</p></div>
        <div class="text-center bg-gray-900 rounded-xl px-6 py-4 border-2 border-gray-600">
          <div class="${scoreColor} text-5xl font-black mb-1">${score}</div>
          <div class="text-sm text-gray-300">${qualityLabel}</div>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-4 mb-6">
        <div class="bg-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-blue-400">${metrics.content || 0}</div>
          <div class="text-xs text-gray-400 mt-1">Content</div>
        </div>
        <div class="bg-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-green-400">${metrics.technical || 0}</div>
          <div class="text-xs text-gray-400 mt-1">Technical</div>
        </div>
        <div class="bg-gray-700 rounded-lg p-4 text-center">
          <div class="text-2xl font-bold text-yellow-400">${metrics.ux || 100}</div>
          <div class="text-xs text-gray-400 mt-1">UX</div>
        </div>
      </div>
      ${score < 90 ? `<div class="bg-purple-900 bg-opacity-30 border border-purple-500 rounded-lg p-4">
        <p class="text-sm text-purple-300 font-semibold mb-2">💡 Improvement Opportunity</p>
        <p class="text-sm text-gray-300">Potential score: <strong class="text-white">${Math.min(95, score + 15)}+</strong></p>
      </div>` : `<div class="bg-green-900 bg-opacity-30 border border-green-500 rounded-lg p-4">
        <p class="text-sm text-green-300 font-semibold">✅ High-Quality Content</p></div>`}
    </div>`;
  }

  renderGoogleMapsLead(lead, index) {
    const hasWebsite = lead.website && lead.website !== 'N/A';
    const score = lead.score || null;
    return `<div class="bg-gray-800 rounded-xl p-5 border-2 border-gray-700 shadow-lg" data-lead-index="${index}">
      <div class="flex items-start justify-between mb-3">
        <div class="flex-1">
          <h4 class="font-bold text-lg text-white mb-1">${lead.name}</h4>
          <p class="text-sm text-gray-400 mb-2">📍 ${lead.location || 'Unknown'}</p>
          ${lead.rating ? `<div class="flex items-center gap-2 text-sm">
            <span class="text-yellow-400">★ ${lead.rating}</span>
            <span class="text-gray-500">(${lead.reviews || 0} reviews)</span>
          </div>` : ''}
        </div>
        <div class="flex items-center gap-3">
          ${score !== null ? `<div class="text-center">
            <div class="text-2xl font-bold ${score >= 75 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400'}">${score}</div>
            <div class="text-xs text-gray-400">Score</div>
          </div>` : ''}
          <input type="checkbox" class="lead-checkbox" data-index="${index}" ${hasWebsite ? '' : 'disabled'}>
        </div>
      </div>
      ${hasWebsite ? `<div class="mb-3">
        <a href="${lead.website}" target="_blank" class="text-sm text-blue-400 hover:text-blue-300 break-all">🔗 ${lead.website}</a>
      </div>` : `<div class="mb-3"><p class="text-sm text-gray-500 italic">No website found</p></div>`}
      ${lead.phone ? `<div class="text-sm text-gray-400">📞 ${lead.phone}</div>` : ''}
    </div>`;
  }
}

if (typeof window !== 'undefined') {
  window.LeadScanner = LeadScanner;
  window.LeadScannerUI = LeadScannerUI;
  console.log('✅ LeadScanner module loaded');
}
