// ============================================
// HYBRID SENDGRID SERVICE
// FREE TIER: Users own SendGrid, own email
// PRO TIER: Centralized, FROM info@contentscale.site
// ============================================

const sgMail = require('@sendgrid/mail');
const emailTemplates = require('./email-templates');

class HybridEmailService {
  
  constructor(db) {
    this.db = db;
  }
  
  /**
   * Send batch emails - auto-detects tier
   */
  async sendBatchEmails(entries, language, userId, batchId) {
    console.log(`Batch send for user ${userId}: ${entries.length} emails`);
    
    // Get user's email tier
    const config = await this.getUserEmailConfig(userId);
    
    if (!config) {
      return {
        success: false,
        error: 'No email configured. Please add your SendGrid API key in Settings.',
        needsConfig: true
      };
    }
    
    // Route to appropriate tier
    if (config.tier === 'pro') {
      return await this.sendBatchProTier(entries, language, userId, config, batchId);
    } else {
      return await this.sendBatchFreeTier(entries, language, userId, config, batchId);
    }
  }
  
  /**
   * FREE TIER: Send via user's own SendGrid
   * FROM: user's email
   */
  async sendBatchFreeTier(entries, language, userId, config, batchId) {
    console.log(`FREE TIER send for user ${userId}`);
    
    // Use user's API key
    sgMail.setApiKey(config.sendgrid_api_key);
    
    const batch = await this.createEmailBatch(userId, 'free', batchId, language, entries.length);
    
    const results = [];
    let sentCount = 0;
    let failedCount = 0;
    
    for (const entry of entries) {
      try {
        if (!entry.email || entry.email_sent) {
          results.push({ 
            id: entry.id, 
            status: 'skipped', 
            reason: entry.email_sent ? 'Already sent' : 'No email' 
          });
          continue;
        }
        
        const result = await this.sendSingleEmailFreeTier(
          entry, language, batch.id, userId, config
        );
        
        if (result.success) {
          sentCount++;
          results.push({ id: entry.id, status: 'sent', messageId: result.messageId });
          await this.markEmailAsSent(entry.id, language);
        } else {
          failedCount++;
          results.push({ id: entry.id, status: 'failed', error: result.error });
        }
        
        await this.sleep(1000); // Rate limiting
        
      } catch (error) {
        failedCount++;
        results.push({ id: entry.id, status: 'failed', error: error.message });
      }
    }
    
    await this.updateEmailBatch(batch.id, sentCount, failedCount);
    
    return {
      success: true,
      tier: 'free',
      batchId: batch.id,
      sent: sentCount,
      failed: failedCount,
      total: entries.length,
      results
    };
  }
  
  /**
   * PRO TIER: Send via ContentScale's SendGrid
   * FROM: info@contentscale.site
   */
  async sendBatchProTier(entries, language, userId, config, batchId) {
    console.log(`PRO TIER send for user ${userId}`);
    
    // Use ContentScale's master API key
    sgMail.setApiKey(process.env.SENDGRID_MASTER_API_KEY);
    
    const batch = await this.createEmailBatch(userId, 'pro', batchId, language, entries.length);
    
    const results = [];
    let sentCount = 0;
    let failedCount = 0;
    
    for (const entry of entries) {
      try {
        if (!entry.email || entry.email_sent) {
          results.push({ 
            id: entry.id, 
            status: 'skipped', 
            reason: entry.email_sent ? 'Already sent' : 'No email' 
          });
          continue;
        }
        
        const result = await this.sendSingleEmailProTier(
          entry, language, batch.id, userId, config
        );
        
        if (result.success) {
          sentCount++;
          results.push({ id: entry.id, status: 'sent', messageId: result.messageId });
          await this.markEmailAsSent(entry.id, language);
        } else {
          failedCount++;
          results.push({ id: entry.id, status: 'failed', error: result.error });
        }
        
        await this.sleep(1000);
        
      } catch (error) {
        failedCount++;
        results.push({ id: entry.id, status: 'failed', error: error.message });
      }
    }
    
    await this.updateEmailBatch(batch.id, sentCount, failedCount);
    
    return {
      success: true,
      tier: 'pro',
      batchId: batch.id,
      sent: sentCount,
      failed: failedCount,
      total: entries.length,
      results
    };
  }
  
  /**
   * Send single email - FREE TIER
   * FROM: user's email, ContentScale branding in template
   */
  async sendSingleEmailFreeTier(entry, language, batchId, userId, config) {
    try {
      const template = emailTemplates[language];
      
      const emailData = {
        businessName: entry.business_name || 'Valued Customer',
        score: entry.score,
        url: entry.url,
        slug: entry.slug || this.createSlug(entry.business_name || entry.url),
        category: entry.category || '',
        city: entry.city || '',
        tier: 'free', // Template shows "Powered by ContentScale"
        userEmail: config.user_email // For signature
      };
      
      const subject = template.subject(emailData.businessName);
      const htmlBody = template.html(emailData);
      const textBody = template.text(emailData);
      
      const msg = {
        to: entry.email,
        from: {
          email: config.user_email, // FROM user's email
          name: config.user_name || 'SEO Specialist'
        },
        replyTo: config.user_email, // Replies to user
        subject: subject,
        html: htmlBody,
        text: textBody,
        customArgs: {
          user_id: userId.toString(),
          tier: 'free',
          entry_id: entry.id.toString(),
          batch_id: batchId,
          campaign: 'leaderboard'
        },
        categories: ['leaderboard-free', `user-${userId}`]
      };
      
      const response = await sgMail.send(msg);
      const messageId = response[0].headers['x-message-id'] || `sg-${Date.now()}`;
      
      await this.logEmail(batchId, entry.id, userId, 'free', entry.email, subject, 'sent', null, messageId);
      
      console.log(`✅ FREE: Email sent to ${entry.email} FROM ${config.user_email}`);
      
      return { success: true, messageId };
      
    } catch (error) {
      console.error(`❌ FREE: Send failed:`, error.message);
      await this.logEmail(batchId, entry.id, userId, 'free', entry.email, '', 'failed', error.message);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send single email - PRO TIER
   * FROM: info@contentscale.site, white-label
   */
  async sendSingleEmailProTier(entry, language, batchId, userId, config) {
    try {
      const template = emailTemplates[language];
      
      const emailData = {
        businessName: entry.business_name || 'Valued Customer',
        score: entry.score,
        url: entry.url,
        slug: entry.slug || this.createSlug(entry.business_name || entry.url),
        category: entry.category || '',
        city: entry.city || '',
        tier: 'pro' // Template is white-label
      };
      
      const subject = template.subject(emailData.businessName);
      const htmlBody = template.html(emailData);
      const textBody = template.text(emailData);
      
      const msg = {
        to: entry.email,
        from: {
          email: 'info@contentscale.site', // FROM ContentScale
          name: 'Ottmar ContentScale'
        },
        replyTo: 'info@contentscale.site',
        subject: subject,
        html: htmlBody,
        text: textBody,
        customArgs: {
          user_id: userId.toString(),
          tier: 'pro',
          user_email: config.user_email, // For reply forwarding
          entry_id: entry.id.toString(),
          batch_id: batchId,
          campaign: 'leaderboard'
        },
        categories: ['leaderboard-pro', `user-${userId}`]
      };
      
      const response = await sgMail.send(msg);
      const messageId = response[0].headers['x-message-id'] || `sg-${Date.now()}`;
      
      await this.logEmail(batchId, entry.id, userId, 'pro', entry.email, subject, 'sent', null, messageId);
      
      console.log(`✅ PRO: Email sent to ${entry.email} FROM info@contentscale.site`);
      
      return { success: true, messageId };
      
    } catch (error) {
      console.error(`❌ PRO: Send failed:`, error.message);
      await this.logEmail(batchId, entry.id, userId, 'pro', entry.email, '', 'failed', error.message);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Save user's email config
   */
  async saveUserEmailConfig(userId, tier, sendgridApiKey, userEmail, userName = null) {
    await this.db.query(
      `INSERT INTO user_email_configs (
        user_id, tier, sendgrid_api_key, user_email, user_name, is_verified
      ) VALUES ($1, $2, $3, $4, $5, false)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        tier = $2,
        sendgrid_api_key = $3,
        user_email = $4,
        user_name = $5,
        updated_at = NOW()`,
      [userId, tier, sendgridApiKey, userEmail, userName]
    );
    
    console.log(`✅ Email config saved for user ${userId}: ${tier} tier`);
  }
  
  /**
   * Verify user's SendGrid API key
   */
  async verifyApiKey(userId, apiKey, testEmail) {
    try {
      sgMail.setApiKey(apiKey);
      
      const msg = {
        to: testEmail,
        from: {
          email: testEmail,
          name: 'Test'
        },
        subject: '✅ SendGrid API Key Verified - ContentScale',
        text: 'Your SendGrid API key works! You can now send emails via ContentScale.',
        html: `
<div style="text-align: center; padding: 40px; font-family: Arial, sans-serif;">
  <h1 style="color: #10b981;">✅ API Key Verified!</h1>
  <p>Your SendGrid API key is working correctly.</p>
  <p>You can now send leaderboard notification emails via ContentScale.</p>
  <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
  <p style="color: #6b7280; font-size: 14px;">ContentScale - Elite SEO Optimization</p>
</div>
        `
      };
      
      await sgMail.send(msg);
      
      // Mark as verified
      await this.db.query(
        'UPDATE user_email_configs SET is_verified = true, verified_at = NOW() WHERE user_id = $1',
        [userId]
      );
      
      return { success: true, message: 'API key verified! Check your email.' };
      
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Upgrade user to Pro tier
   */
  async upgradeToProTier(userId) {
    await this.db.query(
      `UPDATE user_email_configs 
       SET tier = 'pro', upgraded_at = NOW() 
       WHERE user_id = $1`,
      [userId]
    );
    
    console.log(`✅ User ${userId} upgraded to PRO tier`);
  }
  
  /**
   * Get user's email config
   */
  async getUserEmailConfig(userId) {
    const result = await this.db.query(
      'SELECT * FROM user_email_configs WHERE user_id = $1',
      [userId]
    );
    
    return result.rows.length > 0 ? result.rows[0] : null;
  }
  
  /**
   * Create email batch
   */
  async createEmailBatch(userId, tier, scanBatchId, language, totalCount) {
    const result = await this.db.query(
      `INSERT INTO email_batches (user_id, tier, scan_batch_id, language, total_count, status) 
       VALUES ($1, $2, $3, $4, $5, 'sending') 
       RETURNING id`,
      [userId, tier, scanBatchId, language, totalCount]
    );
    
    return { id: result.rows[0].id };
  }
  
  /**
   * Update batch
   */
  async updateEmailBatch(batchId, sentCount, failedCount) {
    await this.db.query(
      `UPDATE email_batches 
       SET sent_count = $1, failed_count = $2, status = 'completed', completed_at = NOW() 
       WHERE id = $3`,
      [sentCount, failedCount, batchId]
    );
  }
  
  /**
   * Log email
   */
  async logEmail(batchId, entryId, userId, tier, recipientEmail, subject, status, errorMsg = null, messageId = null) {
    await this.db.query(
      `INSERT INTO email_logs (
        batch_id, leaderboard_id, sent_by_user_id, tier,
        recipient_email, subject, status, error_message,
        sendgrid_message_id, sent_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
      [batchId, entryId, userId, tier, recipientEmail, subject, status, errorMsg, messageId]
    );
  }
  
  /**
   * Mark as sent
   */
  async markEmailAsSent(entryId, language) {
    await this.db.query(
      `UPDATE leaderboard 
       SET email_sent = true, email_sent_at = NOW(), email_language = $1 
       WHERE id = $2`,
      [language, entryId]
    );
  }
  
  /**
   * Get user stats
   */
  async getUserEmailStats(userId) {
    const stats = await this.db.query(
      `SELECT 
        COUNT(*) as total_sent,
        SUM(CASE WHEN DATE(sent_at) = CURRENT_DATE THEN 1 ELSE 0 END) as sent_today,
        COUNT(DISTINCT batch_id) as total_batches,
        SUM(CASE WHEN tier = 'pro' THEN 1 ELSE 0 END) as pro_emails
       FROM email_logs 
       WHERE sent_by_user_id = $1 AND status = 'sent'`,
      [userId]
    );
    
    const config = await this.getUserEmailConfig(userId);
    
    return {
      total_sent: parseInt(stats.rows[0].total_sent) || 0,
      sent_today: parseInt(stats.rows[0].sent_today) || 0,
      total_batches: parseInt(stats.rows[0].total_batches) || 0,
      pro_emails: parseInt(stats.rows[0].pro_emails) || 0,
      has_config: !!config,
      is_verified: config?.is_verified || false,
      tier: config?.tier || 'free',
      user_email: config?.user_email || null
    };
  }
  
  createSlug(text) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = HybridEmailService;
