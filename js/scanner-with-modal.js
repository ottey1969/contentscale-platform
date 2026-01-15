// File: penalty-system.js
// Add this as a new module

class PenaltySystem {
    constructor() {
        this.criticalPenalties = {
            NO_META_DESCRIPTION: 30,
            NO_H1: 25,
            NO_SCHEMA: 20,
            SLOW_LOAD: 15, // >3 seconds
            THIN_CONTENT: 25, // <300 words
            NOT_MOBILE_FRIENDLY: 20
        };
        
        this.pageTypeCaps = {
            ADMIN: 30,
            LOGIN: 30,
            DASHBOARD: 30,
            THANK_YOU: 40,
            CHECKOUT: 50
        };
    }
    
    applyPenalties(rawScore, pageData) {
        let maxPossibleScore = 100;
        
        // 1. Check page type first
        const pageType = this.detectPageType(pageData.url);
        if (this.pageTypeCaps[pageType]) {
            maxPossibleScore = this.pageTypeCaps[pageType];
        }
        
        // 2. Apply critical penalties
        let penalties = 0;
        
        if (!pageData.meta || !pageData.meta.description) {
            penalties += this.criticalPenalties.NO_META_DESCRIPTION;
            console.log('PENALTY: No meta description -30');
        }
        
        if (!pageData.headings || !pageData.headings.h1) {
            penalties += this.criticalPenalties.NO_H1;
            console.log('PENALTY: No H1 -25');
        }
        
        if (!pageData.schema || pageData.schema.length === 0) {
            penalties += this.criticalPenalties.NO_SCHEMA;
            console.log('PENALTY: No schema -20');
        }
        
        if (pageData.performance && pageData.performance.loadTime > 3000) {
            penalties += this.criticalPenalties.SLOW_LOAD;
            console.log('PENALTY: Slow load -15');
        }
        
        if (pageData.content && pageData.content.wordCount < 300) {
            penalties += this.criticalPenalties.THIN_CONTENT;
            console.log('PENALTY: Thin content -25');
        }
        
        // 3. Calculate final score with penalties and cap
        const scoreAfterPenalties = Math.max(0, rawScore - penalties);
        const finalScore = Math.min(scoreAfterPenalties, maxPossibleScore);
        
        return {
            score: finalScore,
            rawScore: rawScore,
            penalties: penalties,
            maxCap: maxPossibleScore,
            pageType: pageType
        };
    }
    
    detectPageType(url) {
        const urlLower = url.toLowerCase();
        
        if (urlLower.includes('/admin') || urlLower.includes('/wp-admin')) {
            return 'ADMIN';
        }
        if (urlLower.includes('/login') || urlLower.includes('/signin')) {
            return 'LOGIN';
        }
        if (urlLower.includes('/dashboard') || urlLower.includes('/panel')) {
            return 'DASHBOARD';
        }
        if (urlLower.includes('/thank-you') || urlLower.includes('/success')) {
            return 'THANK_YOU';
        }
        if (urlLower.includes('/checkout') || urlLower.includes('/cart')) {
            return 'CHECKOUT';
        }
        
        return 'CONTENT'; // Regular content page
    }
}

module.exports = PenaltySystem;
