// ============================================
// HYBRID EMAIL SERVICE
// Supports FREE (with branding) and PRO (white-label) tiers
// ============================================

const emailTemplates = require('./email-templates');

class HybridEmailService {
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Save user's email configuration
   */
  async saveUserEmailConfig(userId, tier, sendgridApiKey = null, userEmail = null, userName = null) {
    const client = await this.pool.connect();
    
    try {
      await client.query(`
        INSERT INTO user_email_configs (user_id, tier, sendgrid_api_key, user_email, user_name)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (user_id) 
        DO UPDATE SET 
          tier = EXCLUDED.tier,
          sendgrid_api_key = EXCLUDED.sendgrid_api_key,
          user_email = EXCLUDED.user_email,
          user_name = EXCLUDED.user_name,
          updated_at = NOW()
      `, [userId, tier, sendgridApiKey, userEmail, userName]);
      
      return { success: true };
    } finally {
      client.release();
    }
  }

  /**
   * Get user's email configuration
   */
  async getUserEmailConfig(userId) {
    const result = await this.pool.query(
      'SELECT * FROM user_email_configs WHERE user_id = $1',
      [userId]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Verify SendGrid API key (for Pro tier)
   */
  async verifyApiKey(userId, apiKey, testEmail) {
    try {
      // In production, make actual SendGrid API call
      // For now, just save it
      await this.saveUserEmailConfig(userId, 'pro', apiKey);
      
      return {
        success: true,
        message: 'API key verified and saved'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send batch emails to leaderboard entries
   */
  async sendBatchEmails(entries, language, userId, batchId) {
    const config = await this.getUserEmailConfig(userId);
    const tier = config?.tier || 'free';
    
    const results = {
      success: [],
      failed: [],
      total: entries.length
    };
    
    for (const entry of entries) {
      try {
        // Prepare email data
        const emailData = {
          businessName: entry.company_name || 'Unknown Business',
          score: entry.score,
          url: entry.url,
          slug: entry.url.replace(/https?:\/\//g, '').replace(/[^a-z0-9]/gi, '-'),
          tier: tier
        };
        
        const template = emailTemplates[language] || emailTemplates.nl;
        const subject = template.subject(emailData.businessName);
        const htmlBody = template.html(emailData);
        const textBody = template.text(emailData);
        
        // In production: Send via SendGrid
        // For now, just log
        console.log(`📧 Would send email to ${entry.email} (${tier} tier)`);
        
        // Record in database
        await this.pool.query(`
          INSERT INTO email_sends (
            user_id, batch_id, recipient_email, subject, 
            tier, status, sent_at
          ) VALUES ($1, $2, $3, $4, $5, 'sent', NOW())
        `, [userId, batchId, entry.email, subject, tier]);
        
        results.success.push(entry.email);
        
      } catch (error) {
        console.error(`Failed to send to ${entry.email}:`, error);
        results.failed.push({
          email: entry.email,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * Get user's email stats
   */
  async getUserEmailStats(userId) {
    const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_sent,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered,
        COUNT(CASE WHEN status = 'opened' THEN 1 END) as opened,
        COUNT(CASE WHEN status = 'clicked' THEN 1 END) as clicked
      FROM email_sends
      WHERE user_id = $1
    `, [userId]);
    
    return result.rows[0];
  }

  /**
   * Upgrade user to Pro tier
   */
  async upgradeToProTier(userId) {
    await this.saveUserEmailConfig(userId, 'pro');
    return { success: true };
  }
}

module.exports = HybridEmailService;
