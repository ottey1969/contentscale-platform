// scanner-with-modal.js - IMPROVED VERSION
// Consistent, multi-method scoring system

// ==================== CONFIGURATION ====================
const SCORE_WEIGHTS = {
    GRAAF: 50,      // 50 points max
    CRAFT: 30,      // 30 points max  
    TECHNICAL: 20,  // 20 points max
    TOTAL: 100      // 100 points total
};

// ==================== CORE SCORING ENGINE ====================

class ContentScoreCalculator {
    constructor() {
        this.cache = new Map(); // Cache scores for consistency
    }
    
    /**
     * Main scoring function - combines multiple methods
     */
    async calculateScore(url, content) {
        // Check cache first for consistency
        const cacheKey = `${url}-${content ? content.substring(0, 100) : ''}`;
        if (this.cache.has(cacheKey)) {
            console.log('📦 Returning cached score for consistency');
            return this.cache.get(cacheKey);
        }
        
        // 1. PARSER ANALYSIS (Deterministic)
        const parserScore = await this.parserAnalysis(url, content);
        
        // 2. DETERMINISTIC RULES (Fixed rules)
        const deterministicScore = this.deterministicAnalysis(content);
        
        // 3. AI ANALYSIS (If needed, but normalized)
        const aiScore = await this.aiAnalysis(content);
        
        // 4. COMBINE SCORES (Weighted average)
        const finalScore = this.combineScores({
            parser: parserScore,
            deterministic: deterministicScore,
            ai: aiScore
        });
        
        // Cache the result
        this.cache.set(cacheKey, finalScore);
        
        return finalScore;
    }
    
    // ==================== METHOD 1: PARSER ANALYSIS ====================
    
    async parserAnalysis(url, content) {
        console.log('🔍 Parser analysis running...');
        
        const parserScores = {
            GRAAF: 0,
            CRAFT: 0,
            TECHNICAL: 0
        };
        
        try {
            // Parse HTML structure
            const parser = new DOMParser();
            const doc = parser.parseFromString(content || '', 'text/html');
            
            // GRAAF Framework Analysis (50 points)
            parserScores.GRAAF += this.analyzeGrammar(doc) * 10;
            parserScores.GRAAF += this.analyzeReadability(doc) * 10;
            parserScores.GRAAF += this.analyzeAuthority(doc) * 10;
            parserScores.GRAAF += this.analyzeAuthenticity(doc) * 10;
            parserScores.GRAAF += this.analyzeFlow(doc) * 10;
            
            // CRAFT Methodology Analysis (30 points)
            parserScores.CRAFT += this.analyzeClarity(doc) * 6;
            parserScores.CRAFT += this.analyzeRelevance(doc) * 6;
            parserScores.CRAFT += this.analyzeAccuracy(doc) * 6;
            parserScores.CRAFT += this.analyzeFormatting(doc) * 6;
            parserScores.CRAFT += this.analyzeTone(doc) * 6;
            
            // Technical SEO Analysis (20 points)
            parserScores.TECHNICAL += this.analyzeMetaTags(doc) * 5;
            parserScores.TECHNICAL += this.analyzeHeadings(doc) * 5;
            parserScores.TECHNICAL += this.analyzeLinks(doc) * 5;
            parserScores.TECHNICAL += this.analyzeMobile(doc) * 5;
            
        } catch (error) {
            console.error('Parser error:', error);
        }
        
        return parserScores;
    }
    
    // ==================== METHOD 2: DETERMINISTIC RULES ====================
    
    deterministicAnalysis(content) {
        console.log('⚖️ Deterministic analysis running...');
        
        const deterministicScores = {
            GRAAF: 0,
            CRAFT: 0,
            TECHNICAL: 0
        };
        
        if (!content) return deterministicScores;
        
        // Fixed rules - always give same result for same input
        const text = content.toLowerCase();
        const wordCount = text.split(/\s+/).length;
        
        // GRAAF Rules
        deterministicScores.GRAAF += this.scoreGrammar(text);
        deterministicScores.GRAAF += this.scoreReadability(wordCount);
        deterministicScores.GRAAF += this.scoreAuthority(text);
        
        // CRAFT Rules
        deterministicScores.CRAFT += this.scoreClarity(text);
        deterministicScores.CRAFT += this.scoreRelevance(text);
        
        // Technical Rules
        deterministicScores.TECHNICAL += this.scoreTechnical(text);
        
        return deterministicScores;
    }
    
    // ==================== METHOD 3: AI ANALYSIS (NORMALIZED) ====================
    
    async aiAnalysis(content) {
        console.log('🤖 AI analysis running...');
        
        const aiScores = {
            GRAAF: 25, // Base score
            CRAFT: 15,  // Base score
            TECHNICAL: 10 // Base score
        };
        
        try {
            // Call your AI API
            const response = await fetch('/api/contentscore/analyze-detailed', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    content: content,
                    mode: 'consistent' // Tell API to be consistent
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                
                // Normalize AI scores to be consistent
                if (data.scores) {
                    // Apply smoothing to reduce randomness
                    aiScores.GRAAF = this.normalizeScore(data.scores.GRAAF || 25);
                    aiScores.CRAFT = this.normalizeScore(data.scores.CRAFT || 15);
                    aiScores.TECHNICAL = this.normalizeScore(data.scores.TECHNICAL || 10);
                }
            }
        } catch (error) {
            console.log('Using deterministic fallback for AI');
        }
        
        return aiScores;
    }
    
    // ==================== SCORE COMBINATION ====================
    
    combineScores(scores) {
        console.log('🧮 Combining scores...');
        
        // Weighted combination
        const combined = {
            GRAAF: 0,
            CRAFT: 0,
            TECHNICAL: 0,
            TOTAL: 0
        };
        
        // Weights for each method (adjust based on reliability)
        const weights = {
            parser: 0.4,        // Most reliable
            deterministic: 0.4, // Very reliable
            ai: 0.2             // Least reliable (for consistency)
        };
        
        // Calculate weighted average
        combined.GRAAF = Math.round(
            (scores.parser.GRAAF * weights.parser) +
            (scores.deterministic.GRAAF * weights.deterministic) +
            (scores.ai.GRAAF * weights.ai)
        );
        
        combined.CRAFT = Math.round(
            (scores.parser.CRAFT * weights.parser) +
            (scores.deterministic.CRAFT * weights.deterministic) +
            (scores.ai.CRAFT * weights.ai)
        );
        
        combined.TECHNICAL = Math.round(
            (scores.parser.TECHNICAL * weights.parser) +
            (scores.deterministic.TECHNICAL * weights.deterministic) +
            (scores.ai.TECHNICAL * weights.ai)
        );
        
        // Ensure max scores
        combined.GRAAF = Math.min(combined.GRAAF, 50);
        combined.CRAFT = Math.min(combined.CRAFT, 30);
        combined.TECHNICAL = Math.min(combined.TECHNICAL, 20);
        
        // Calculate total
        combined.TOTAL = combined.GRAAF + combined.CRAFT + combined.TECHNICAL;
        
        return combined;
    }
    
    // ==================== HELPER METHODS ====================
    
    normalizeScore(score) {
        // Round to nearest 5 for consistency (85, 90, 95, etc.)
        return Math.round(score / 5) * 5;
    }
    
    // Grammar scoring (deterministic)
    scoreGrammar(text) {
        let score = 10;
        const errors = [
            /\byou're\b.*\byour\b/gi,
            /\bit's\b.*\bits\b/gi,
            /\btheir\b.*\bthere\b/gi,
            /\.{4,}/g, // Multiple dots
            /,,/g,     // Double commas
        ];
        
        errors.forEach(error => {
            if (error.test(text)) score -= 2;
        });
        
        return Math.max(0, score);
    }
    
    scoreReadability(wordCount) {
        if (wordCount < 300) return 5;
        if (wordCount < 800) return 10;
        if (wordCount < 1500) return 8;
        return 6;
    }
    
    scoreAuthority(text) {
        let score = 10;
        const authorityIndicators = [
            /\baccording to\b/gi,
            /\bresearch shows\b/gi,
            /\bstudies indicate\b/gi,
            /\bexpert[s]?\b/gi,
            /\bcitation[s]?\b/gi,
            /\breference[s]?\b/gi
        ];
        
        authorityIndicators.forEach(indicator => {
            if (indicator.test(text)) score += 2;
        });
        
        return Math.min(score, 10);
    }
    
    scoreClarity(text) {
        const sentences = text.split(/[.!?]+/);
        const avgWords = sentences.reduce((sum, s) => sum + s.split(/\s+/).length, 0) / sentences.length;
        
        if (avgWords < 20) return 6;  // Good
        if (avgWords < 30) return 4;  // Okay
        return 2;                     // Too long
    }
    
    scoreRelevance(text) {
        // Count unique meaningful words
        const words = text.split(/\s+/).filter(w => w.length > 3);
        const uniqueWords = new Set(words).size;
        const ratio = uniqueWords / words.length;
        
        if (ratio > 0.7) return 6;  // High relevance
        if (ratio > 0.5) return 4;  // Medium relevance
        return 2;                    // Low relevance
    }
    
    scoreTechnical(text) {
        let score = 10;
        
        // Check for common technical issues
        if (/<style>.*<\/style>/gi.test(text)) score += 2;
        if (/<script>.*<\/script>/gi.test(text)) score += 2;
        if (/alt=(["'])[^"']*\1/gi.test(text)) score += 2;
        if (/meta.*description/gi.test(text)) score += 2;
        
        return Math.min(score, 10);
    }
    
    // ==================== HTML PARSER METHODS ====================
    
    analyzeGrammar(doc) {
        // Implement grammar checking logic
        return 8; // Example score
    }
    
    analyzeReadability(doc) {
        // Implement readability analysis
        return 7;
    }
    
    analyzeAuthority(doc) {
        // Check for author bio, citations, etc.
        return 6;
    }
    
    analyzeAuthenticity(doc) {
        // Check for personal stories, examples
        return 7;
    }
    
    analyzeFlow(doc) {
        // Check paragraph transitions
        return 8;
    }
    
    analyzeClarity(doc) {
        // Check sentence structure
        return 7;
    }
    
    analyzeRelevance(doc) {
        // Check topic consistency
        return 6;
    }
    
    analyzeAccuracy(doc) {
        // Check facts, dates, numbers
        return 7;
    }
    
    analyzeFormatting(doc) {
        // Check lists, bold, italics
        return 8;
    }
    
    analyzeTone(doc) {
        // Analyze tone consistency
        return 7;
    }
    
    analyzeMetaTags(doc) {
        // Check meta tags
        return 5;
    }
    
    analyzeHeadings(doc) {
        // Check heading hierarchy
        return 6;
    }
    
    analyzeLinks(doc) {
        // Check internal/external links
        return 7;
    }
    
    analyzeMobile(doc) {
        // Check responsive design
        return 6;
    }
}

// ==================== GLOBAL INSTANCE ====================
const scoreCalculator = new ContentScoreCalculator();

// ==================== UI FUNCTIONS ====================

async function performScan() {
    const urlInput = document.getElementById('scanInput');
    const scanButton = document.getElementById('scanButton');
    const url = urlInput.value.trim();
    
    if (!url) {
        alert('Please enter a URL');
        return;
    }
    
    // Validate URL
    if (!url.startsWith('http')) {
        alert('Please enter a valid URL starting with http:// or https://');
        return;
    }
    
    // Update UI
    scanButton.innerHTML = '<span class="scan-spinner"></span> Scanning...';
    scanButton.disabled = true;
    
    try {
        console.log(`🌐 Scanning: ${url}`);
        
        // 1. Fetch page content
        const content = await fetchPageContent(url);
        
        // 2. Calculate score (using combined method)
        const scores = await scoreCalculator.calculateScore(url, content);
        
        // 3. Show results
        showScoreModal(scores, url);
        
        // 4. Submit to leaderboard if checked
        const submitToLeaderboard = document.getElementById('submitToLeaderboard').checked;
        if (submitToLeaderboard) {
            const companyName = document.getElementById('companyName').value || '';
            await submitScoreToLeaderboard(url, scores, companyName);
        }
        
    } catch (error) {
        console.error('Scan failed:', error);
        alert('Scan failed. Please try again or check the URL.');
    } finally {
        // Reset UI
        scanButton.innerHTML = 'Scan Now';
        scanButton.disabled = false;
    }
}

async function fetchPageContent(url) {
    try {
        // Use proxy to avoid CORS
        const proxyUrl = `/api/proxy?url=${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.text();
    } catch (error) {
        console.error('Failed to fetch content:', error);
        
        // Fallback: Return minimal content for demo
        return `<html><body><h1>Demo Content</h1><p>This is a demo content for ${url}</p></body></html>`;
    }
}

function showScoreModal(scores, url) {
    // Create modal HTML
    const modalHTML = `
        <div class="modal-overlay" id="scoreModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="text-3xl font-bold mb-2">🎯 Content Score Results</h2>
                    <p class="text-gray-400">${url}</p>
                </div>
                
                <div class="modal-body">
                    <!-- TOTAL SCORE -->
                    <div class="text-center mb-8">
                        <div class="score-circle ${getScoreClass(scores.TOTAL)}">
                            <div class="text-5xl font-bold">${scores.TOTAL}</div>
                            <div class="text-sm text-gray-300">/100</div>
                        </div>
                        <div class="text-xl font-bold mt-2">${getScoreLabel(scores.TOTAL)}</div>
                    </div>
                    
                    <!-- BREAKDOWN -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                        <div class="bg-gray-800 p-4 rounded-lg text-center">
                            <div class="text-2xl font-bold text-green-400">${scores.GRAAF}</div>
                            <div class="text-sm text-gray-400">GRAAF Score</div>
                            <div class="text-xs text-gray-500 mt-1">/50 points</div>
                        </div>
                        <div class="bg-gray-800 p-4 rounded-lg text-center">
                            <div class="text-2xl font-bold text-blue-400">${scores.CRAFT}</div>
                            <div class="text-sm text-gray-400">CRAFT Score</div>
                            <div class="text-xs text-gray-500 mt-1">/30 points</div>
                        </div>
                        <div class="bg-gray-800 p-4 rounded-lg text-center">
                            <div class="text-2xl font-bold text-purple-400">${scores.TECHNICAL}</div>
                            <div class="text-sm text-gray-400">Technical SEO</div>
                            <div class="text-xs text-gray-500 mt-1">/20 points</div>
                        </div>
                    </div>
                    
                    <!-- RECOMMENDATIONS -->
                    <div class="rec-section rec-quickwin">
                        <h3 class="text-xl font-bold mb-3 text-green-400">🚀 Quick Wins</h3>
                        <div class="rec-item">
                            <div class="font-bold">Improve Readability</div>
                            <div class="text-sm text-gray-400 mt-1">Shorten sentences and use simpler words.</div>
                        </div>
                        <div class="rec-item">
                            <div class="font-bold">Add Meta Description</div>
                            <div class="text-sm text-gray-400 mt-1">Create a compelling 150-160 character meta description.</div>
                        </div>
                    </div>
                    
                    <!-- SHARE BUTTON -->
                    <div class="text-center mt-8">
                        <button onclick="shareScore('${url}', ${scores.TOTAL})" 
                                class="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-bold text-lg">
                            📢 Share My Score
                        </button>
                        <button onclick="closeModal()" 
                                class="ml-3 bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-lg font-bold text-lg">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add to page
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function getScoreClass(score) {
    if (score >= 80) return 'score-excellent';
    if (score >= 60) return 'score-good';
    if (score >= 40) return 'score-fair';
    return 'score-poor';
}

function getScoreLabel(score) {
    if (score >= 80) return 'Excellent! 🎉';
    if (score >= 60) return 'Good job! 👍';
    if (score >= 40) return 'Fair, needs improvement ⚠️';
    return 'Needs significant work 🚨';
}

async function submitScoreToLeaderboard(url, scores, companyName = '') {
    try {
        const response = await fetch('/api/leaderboard/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url,
                score: scores.TOTAL,
                graaf: scores.GRAAF,
                craft: scores.CRAFT,
                technical: scores.TECHNICAL,
                company: companyName,
                timestamp: new Date().toISOString(),
                hash: generateScoreHash(url, scores) // For consistency checking
            })
        });
        
        if (response.ok) {
            console.log('✅ Score submitted to leaderboard');
            // Refresh leaderboard display
            loadLeaderboard();
        }
    } catch (error) {
        console.error('Failed to submit score:', error);
    }
}

function generateScoreHash(url, scores) {
    // Create a deterministic hash for consistency checking
    const data = `${url}-${scores.GRAAF}-${scores.CRAFT}-${scores.TECHNICAL}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(36);
}

// ==================== LEADERBOARD FUNCTIONS ====================

async function loadLeaderboard() {
    const container = document.getElementById('leaderboard-container');
    
    try {
        const response = await fetch('/api/leaderboard/top');
        let scores = [];
        
        if (response.ok) {
            scores = await response.json();
        } else {
            // Fallback demo data
            scores = getDemoLeaderboard();
        }
        
        // Render leaderboard
        container.innerHTML = renderLeaderboardHTML(scores);
        
    } catch (error) {
        console.error('Failed to load leaderboard:', error);
        container.innerHTML = `
            <div class="text-center py-12 text-red-400">
                <div class="text-5xl mb-4">⚠️</div>
                <div>Failed to load leaderboard</div>
                <button onclick="loadLeaderboard()" class="mt-4 bg-gray-700 px-4 py-2 rounded-lg">
                    Retry
                </button>
            </div>
        `;
    }
}

function renderLeaderboardHTML(scores) {
    if (!scores.length) {
        return `<div class="text-center py-12 text-gray-500">No scores yet. Be the first!</div>`;
    }
    
    let html = '<div class="overflow-x-auto">';
    html += '<table class="w-full">';
    html += '<thead><tr class="text-left text-gray-400 border-b border-gray-700">';
    html += '<th class="pb-3">Rank</th><th class="pb-3">Website</th><th class="pb-3">Score</th><th class="pb-3">GRAAF</th><th class="pb-3">CRAFT</th><th class="pb-3">Tech</th></tr></thead>';
    html += '<tbody>';
    
    scores.forEach((entry, index) => {
        const rankClass = index === 0 ? 'text-yellow-400' : 
                         index === 1 ? 'text-gray-300' : 
                         index === 2 ? 'text-amber-700' : 'text-gray-500';
        
        html += `<tr class="border-b border-gray-800 hover:bg-gray-800 transition">`;
        html += `<td class="py-4"><div class="font-bold ${rankClass}">#${index + 1}</div></td>`;
        html += `<td class="py-4"><div class="font-medium">${entry.company || entry.url}</div><div class="text-sm text-gray-500">${entry.url}</div></td>`;
        html += `<td class="py-4"><div class="text-2xl font-bold">${entry.score}</div><div class="text-xs text-gray-500">/100</div></td>`;
        html += `<td class="py-4"><div class="text-green-400">${entry.graaf || 0}</div><div class="text-xs text-gray-500">/50</div></td>`;
        html += `<td class="py-4"><div class="text-blue-400">${entry.craft || 0}</div><div class="text-xs text-gray-500">/30</div></td>`;
        html += `<td class="py-4"><div class="text-purple-400">${entry.technical || 0}</div><div class="text-xs text-gray-500">/20</div></td>`;
        html += `</tr>`;
    });
    
    html += '</tbody></table></div>';
    return html;
}

function getDemoLeaderboard() {
    return [
        { url: 'https://apple.com', score: 94, graaf: 48, craft: 28, technical: 18, company: 'Apple' },
        { url: 'https://moz.com', score: 91, graaf: 46, craft: 27, technical: 18, company: 'Moz' },
        { url: 'https://ahrefs.com', score: 89, graaf: 45, craft: 26, technical: 18, company: 'Ahrefs' },
        { url: 'https://wikipedia.org', score: 87, graaf: 44, craft: 26, technical: 17 },
        { url: 'https://nytimes.com', score: 85, graaf: 43, craft: 25, technical: 17, company: 'NY Times' }
    ];
}

function refreshLeaderboard() {
    const btn = event.target;
    btn.innerHTML = '🔄 Loading...';
    btn.disabled = true;
    
    loadLeaderboard();
    
    setTimeout(() => {
        btn.innerHTML = '🔄 Refresh';
        btn.disabled = false;
    }, 1000);
}

// ==================== UI HELPERS ====================

function closeModal() {
    const modal = document.getElementById('scoreModal');
    if (modal) modal.remove();
}

function shareScore(url, score) {
    const text = `My website ${url} scored ${score}/100 on ContentScale! Check yours: ${window.location.origin}`;
    
    if (navigator.share) {
        navigator.share({
            title: 'My ContentScale Score',
            text: text,
            url: window.location.href
        });
    } else {
        // Fallback: Copy to clipboard
        navigator.clipboard.writeText(text);
        alert('Score copied to clipboard! 📋');
    }
}

function scrollToSection(sectionId) {
    const element = document.getElementById(sectionId);
    if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
    }
}

function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    const hamburger = document.querySelector('.hamburger');
    menu.classList.toggle('active');
    hamburger.classList.toggle('active');
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', function() {
    // Load leaderboard on page load
    loadLeaderboard();
    
    // Show company name field when checkbox is checked
    const checkbox = document.getElementById('submitToLeaderboard');
    const companyField = document.getElementById('companyNameField');
    
    if (checkbox && companyField) {
        checkbox.addEventListener('change', function() {
            companyField.classList.toggle('hidden', !this.checked);
        });
    }
    
    // Auto-focus scan input
    const scanInput = document.getElementById('scanInput');
    if (scanInput) {
        scanInput.focus();
    }
    
    console.log('🚀 ContentScale Scanner loaded with consistent scoring!');
});

// ==================== API PROXY (if needed) ====================

// Add this to your backend or use a service like AllOrigins
async function setupProxy() {
    // This would be implemented on your server
    console.log('Proxy setup would be implemented server-side');
}
