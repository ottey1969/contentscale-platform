// ============================================
// EMAIL TEMPLATES - HYBRID TIER SYSTEM
// FREE TIER: Shows "Powered by ContentScale" branding
// PRO TIER: White-label (no branding)
// ============================================

const emailTemplates = {
  
  // ==========================================
  // NEDERLANDS TEMPLATE
  // ==========================================
  nl: {
    
    subject: (businessName) => {
      return `🎉 ${businessName} staat in onze Top Content Kwaliteit!`;
    },
    
    html: (data) => {
      const { businessName, score, url, slug, tier = 'free' } = data;
      const leaderboardUrl = `https://contentscale.site/leaderboard#${slug}`;
      
      // Free tier branding footer
      const branding = tier === 'free' ? `
              <!-- POWERED BY CONTENTSCALE (FREE TIER ONLY) -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0 0 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; text-align: center; border-radius: 8px;">
                    <p style="color: #ffffff; font-size: 16px; margin: 0 0 10px 0; font-weight: bold;">
                      ⚡ Powered by ContentScale
                    </p>
                    <p style="color: rgba(255,255,255,0.9); font-size: 13px; margin: 0 0 15px 0; line-height: 1.4;">
                      Elite SEO Content Optimization Platform
                    </p>
                    <a href="https://contentscale.site" style="display: inline-block; background: #ffffff; color: #667eea; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
                      🚀 Probeer Gratis
                    </a>
                  </td>
                </tr>
              </table>
      ` : '';
      
      return `
<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">🎉 Gefeliciteerd!</h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              
              <p style="margin: 0 0 20px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Beste <strong>${businessName}</strong>,
              </p>
              
              <p style="margin: 0 0 20px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Uw website heeft een uitstekende score van <strong style="color: #10b981; font-size: 20px;">${score}/100</strong> behaald in onze AI-era SEO Content Kwaliteit analyse!
              </p>
              
              <!-- Score Badge -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px 40px; border-radius: 12px;">
                      <div style="color: #ffffff; font-size: 48px; font-weight: bold; margin-bottom: 5px;">${score}</div>
                      <div style="color: #d1fae5; font-size: 14px; font-weight: 600;">Content Kwaliteit Score</div>
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                We hebben uw bedrijf opgenomen in onze publieke <strong>"Top Content Kwaliteit Nederland"</strong> lijst. 
                Dit is een mooie erkenning van uw hoogwaardige content!
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${leaderboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      👉 Bekijk Uw Vermelding
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px; line-height: 1.6; text-align: center;">
                <em>U mag dit natuurlijk delen met uw team of op social media!</em>
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <!-- Upgrade Section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <tr>
                  <td>
                    <p style="margin: 0 0 10px; color: #92400e; font-size: 15px; font-weight: bold;">
                      🚀 Wilt u naar een 95+ score?
                    </p>
                    <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
                      Onze AI-era SEO content optimization service helpt u uw content te verbeteren voor maximale zichtbaarheid in AI Overviews en zoekmachines.
                    </p>
                  </td>
                </tr>
              </table>
              
              ${branding}
              
              <!-- Footer -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0 0 0; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 15px; color: #1f2937; font-size: 14px;">
                      Met vriendelijke groet,<br>
                      <strong>Ottmar</strong><br>
                      ContentScale
                    </p>
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 13px;">
                      📧 info@contentscale.site<br>
                      📱 WhatsApp: +31 6 2807 3996<br>
                      🌐 <a href="https://contentscale.site" style="color: #8b5cf6;">contentscale.site</a>
                    </p>
                    <p style="margin: 15px 0 0; color: #9ca3af; font-size: 12px;">
                      P.S. Benieuwd naar uw eigen score? Test gratis: <a href="https://contentscale.site/#lead-scanner" style="color: #8b5cf6;">contentscale.site/#lead-scanner</a>
                    </p>
                    <p style="margin: 15px 0 0; color: #9ca3af; font-size: 11px;">
                      <a href="https://contentscale.site/unsubscribe" style="color: #9ca3af; text-decoration: underline;">Uitschrijven</a>
                    </p>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
        </table>
        
      </td>
    </tr>
  </table>
  
</body>
</html>
      `;
    },
    
    text: (data) => {
      const { businessName, score, url, tier = 'free' } = data;
      const leaderboardUrl = `https://contentscale.site/leaderboard`;
      
      const branding = tier === 'free' ? `

⚡ POWERED BY CONTENTSCALE
Elite SEO Content Optimization Platform
🚀 Probeer Gratis: https://contentscale.site
` : '';
      
      return `
🎉 Gefeliciteerd!

Beste ${businessName},

Uw website heeft een uitstekende score van ${score}/100 behaald in onze AI-era SEO Content Kwaliteit analyse!

We hebben uw bedrijf opgenomen in onze publieke "Top Content Kwaliteit Nederland" lijst. Dit is een mooie erkenning van uw hoogwaardige content!

👉 Bekijk uw vermelding: ${leaderboardUrl}

U mag dit natuurlijk delen met uw team of op social media!

---

🚀 WILT U NAAR EEN 95+ SCORE?

Onze AI-era SEO content optimization service helpt u uw content te verbeteren voor maximale zichtbaarheid in AI Overviews en zoekmachines.
${branding}

Met vriendelijke groet,
Ottmar
ContentScale

📧 info@contentscale.site
📱 WhatsApp: +31 6 2807 3996
🌐 contentscale.site

P.S. Benieuwd naar uw eigen score? Test gratis: https://contentscale.site/#lead-scanner

Uitschrijven: https://contentscale.site/unsubscribe
      `;
    }
  },
  
  // ==========================================
  // ENGLISH TEMPLATE
  // ==========================================
  en: {
    
    subject: (businessName) => {
      return `🎉 ${businessName} featured in our Top Content Quality!`;
    },
    
    html: (data) => {
      const { businessName, score, url, slug, tier = 'free' } = data;
      const leaderboardUrl = `https://contentscale.site/leaderboard#${slug}`;
      
      const branding = tier === 'free' ? `
              <!-- POWERED BY CONTENTSCALE (FREE TIER ONLY) -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0 0 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 25px; text-align: center; border-radius: 8px;">
                    <p style="color: #ffffff; font-size: 16px; margin: 0 0 10px 0; font-weight: bold;">
                      ⚡ Powered by ContentScale
                    </p>
                    <p style="color: rgba(255,255,255,0.9); font-size: 13px; margin: 0 0 15px 0; line-height: 1.4;">
                      Elite SEO Content Optimization Platform
                    </p>
                    <a href="https://contentscale.site" style="display: inline-block; background: #ffffff; color: #667eea; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 14px;">
                      🚀 Try Free
                    </a>
                  </td>
                </tr>
              </table>
      ` : '';
      
      return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
  
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
    <tr>
      <td align="center">
        
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 40px 30px; border-radius: 12px 12px 0 0; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: bold;">🎉 Congratulations!</h1>
            </td>
          </tr>
          
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              
              <p style="margin: 0 0 20px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Dear <strong>${businessName}</strong>,
              </p>
              
              <p style="margin: 0 0 20px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Your website achieved an excellent score of <strong style="color: #10b981; font-size: 20px;">${score}/100</strong> in our AI-era SEO Content Quality analysis!
              </p>
              
              <!-- Score Badge -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 20px 40px; border-radius: 12px;">
                      <div style="color: #ffffff; font-size: 48px; font-weight: bold; margin-bottom: 5px;">${score}</div>
                      <div style="color: #d1fae5; font-size: 14px; font-weight: 600;">Content Quality Score</div>
                    </div>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #1f2937; font-size: 16px; line-height: 1.6;">
                We've featured your business in our public <strong>"Top Content Quality"</strong> leaderboard. This is a great recognition of your high-quality content!
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${leaderboardUrl}" style="display: inline-block; background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
                      👉 View Your Listing
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 0 0 20px; color: #6b7280; font-size: 14px; line-height: 1.6; text-align: center;">
                <em>Feel free to share this with your team or on social media!</em>
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <!-- Upgrade Section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fef3c7; border-radius: 8px; padding: 20px; margin: 20px 0;">
                <tr>
                  <td>
                    <p style="margin: 0 0 10px; color: #92400e; font-size: 15px; font-weight: bold;">
                      🚀 Want to reach a 95+ score?
                    </p>
                    <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6;">
                      Our AI-era SEO content optimization service helps you improve your content for maximum visibility in AI Overviews and search engines.
                    </p>
                  </td>
                </tr>
              </table>
              
              ${branding}
              
              <!-- Footer -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0 0 0; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                <tr>
                  <td>
                    <p style="margin: 0 0 15px; color: #1f2937; font-size: 14px;">
                      Best regards,<br>
                      <strong>Ottmar</strong><br>
                      ContentScale
                    </p>
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 13px;">
                      📧 info@contentscale.site<br>
                      📱 WhatsApp: +31 6 2807 3996<br>
                      🌐 <a href="https://contentscale.site" style="color: #8b5cf6;">contentscale.site</a>
                    </p>
                    <p style="margin: 15px 0 0; color: #9ca3af; font-size: 12px;">
                      P.S. Curious about your score? Test for free: <a href="https://contentscale.site/#lead-scanner" style="color: #8b5cf6;">contentscale.site/#lead-scanner</a>
                    </p>
                    <p style="margin: 15px 0 0; color: #9ca3af; font-size: 11px;">
                      <a href="https://contentscale.site/unsubscribe" style="color: #9ca3af; text-decoration: underline;">Unsubscribe</a>
                    </p>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
        </table>
        
      </td>
    </tr>
  </table>
  
</body>
</html>
      `;
    },
    
    text: (data) => {
      const { businessName, score, url, tier = 'free' } = data;
      const leaderboardUrl = `https://contentscale.site/leaderboard`;
      
      const branding = tier === 'free' ? `

⚡ POWERED BY CONTENTSCALE
Elite SEO Content Optimization Platform
🚀 Try Free: https://contentscale.site
` : '';
      
      return `
🎉 Congratulations!

Dear ${businessName},

Your website achieved an excellent score of ${score}/100 in our AI-era SEO Content Quality analysis!

We've featured your business in our public "Top Content Quality" leaderboard. This is a great recognition of your high-quality content!

👉 View your listing: ${leaderboardUrl}

Feel free to share this with your team or on social media!

---

🚀 WANT TO REACH A 95+ SCORE?

Our AI-era SEO content optimization service helps you improve your content for maximum visibility in AI Overviews and search engines.
${branding}

Best regards,
Ottmar
ContentScale

📧 info@contentscale.site
📱 WhatsApp: +31 6 2807 3996
🌐 contentscale.site

P.S. Curious about your score? Test for free: https://contentscale.site/#lead-scanner

Unsubscribe: https://contentscale.site/unsubscribe
      `;
    }
  }
};

module.exports = emailTemplates;
