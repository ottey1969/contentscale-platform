// ============================================
// EMAIL DETECTION SERVICE
// Extracts email addresses from website content
// ============================================

class EmailDetectionService {
  
  /**
   * Extract emails from HTML content
   */
  extractEmails(html) {
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const matches = html.match(emailRegex);
    
    if (!matches) return [];
    
    // Remove duplicates and filter out common false positives
    const emails = [...new Set(matches)].filter(email => {
      // Filter out image extensions and common false positives
      return !email.match(/\.(jpg|png|gif|svg|webp)@/i) &&
             !email.includes('example.com') &&
             !email.includes('your-email') &&
             !email.includes('email@');
    });
    
    return emails;
  }

  /**
   * Score email quality (likelihood of being a contact email)
   */
  scoreEmail(email, domain) {
    let score = 0;
    
    // Prefer emails with contact-related terms
    const contactTerms = ['info', 'contact', 'hello', 'support', 'sales', 'service'];
    const localPart = email.split('@')[0].toLowerCase();
    
    if (contactTerms.some(term => localPart.includes(term))) {
      score += 10;
    }
    
    // Prefer emails on the same domain
    if (email.includes(domain)) {
      score += 5;
    }
    
    // Penalize generic/noreply emails
    if (localPart.includes('noreply') || localPart.includes('no-reply')) {
      score -= 20;
    }
    
    return score;
  }

  /**
   * Get best contact email from a list
   */
  getBestContactEmail(emails, domain) {
    if (!emails || emails.length === 0) return null;
    
    const scored = emails.map(email => ({
      email,
      score: this.scoreEmail(email, domain)
    }));
    
    scored.sort((a, b) => b.score - a.score);
    
    return scored[0].email;
  }

  /**
   * Detect emails from full page content
   */
  detectFromPage(html, url) {
    const emails = this.extractEmails(html);
    const domain = new URL(url).hostname.replace('www.', '');
    
    return {
      all: emails,
      best: this.getBestContactEmail(emails, domain),
      count: emails.length
    };
  }
}

module.exports = EmailDetectionService;
