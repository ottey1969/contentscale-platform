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
   * Extract public business contacts belonging to the company domain.
   * Works with HTML already obtained by existing CEO / crawler scans:
   * no extra network request, API fee, or SSRF exposure.
   */
  detectBusinessContacts(html, pageUrl) {
    const url = new URL(pageUrl);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Invalid business page URL');
    const domain = url.hostname.toLowerCase().replace(/^www\./, '');
    const candidates = this.extractEmails(String(html || '')
      .replace(/&#64;|&#x40;|&commat;/gi, '@')
      .replace(/&#46;|&#x2e;/gi, '.'));
    const emails = candidates.map(email => email.toLowerCase()).filter(email => {
      const addressDomain = email.split('@')[1];
      const local = email.split('@')[0];
      return (addressDomain === domain || domain.endsWith('.' + addressDomain))
        && !/^(?:no-?reply|donotreply|bounce|mailer-daemon)$/.test(local)
        && !/\.(?:png|jpe?g|gif|svg|webp|css|js)$/i.test(email);
    });
    const unique = [...new Set(emails)];
    unique.sort((a,b) => this.scoreEmail(b,domain) - this.scoreEmail(a,domain));
    return { all:unique, best:unique[0] || null, count:unique.length,
      source_url:url.href, verification:'publicly_observed' };
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
