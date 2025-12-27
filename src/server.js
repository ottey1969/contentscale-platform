// ==========================================
// RANK FIX - Replace your /api/leaderboard/submit endpoint with this:
// ==========================================

app.post('/api/leaderboard/submit', async (req, res) => {
  try {
    const {
      url,
      score,
      quality,
      graaf_score,
      craft_score,
      technical_score,
      word_count,
      company_name,
      category,
      country,
      language
    } = req.body;
    
    if (!url || score === undefined) {
      return res.status(400).json({
        success: false,
        error: 'URL and score required'
      });
    }
    
    const urlHash = hashUrl(url);
    
    // Check if URL already exists in leaderboard
    const existing = await pool.query(
      'SELECT id, score FROM public_leaderboard WHERE url = $1',
      [url]
    );
    
    if (existing.rows.length > 0) {
      // Update if new score is better
      if (score > existing.rows[0].score) {
        await pool.query(`
          UPDATE public_leaderboard
          SET score = $1,
              quality = $2,
              graaf_score = $3,
              craft_score = $4,
              technical_score = $5,
              word_count = $6,
              company_name = $7,
              category = $8,
              country = $9,
              language = $10,
              updated_at = NOW()
          WHERE url = $11
        `, [
          score, quality, graaf_score, craft_score, technical_score,
          word_count, company_name, category, country, language, url
        ]);
        
        // Get NEW rank after update
        const rankResult = await pool.query(
          'SELECT COUNT(*) + 1 as rank FROM public_leaderboard WHERE score > $1',
          [score]
        );
        
        const rank = parseInt(rankResult.rows[0].rank) || 1;
        
        console.log(`✅ Leaderboard updated: ${url} (${existing.rows[0].score} → ${score}) - Rank #${rank}`);
        
        return res.json({
          success: true,
          message: 'Leaderboard entry updated with better score!',
          action: 'updated',
          rank: rank
        });
      } else {
        // Get current rank even if not updating
        const rankResult = await pool.query(
          'SELECT COUNT(*) + 1 as rank FROM public_leaderboard WHERE score > $1',
          [existing.rows[0].score]
        );
        
        const rank = parseInt(rankResult.rows[0].rank) || 1;
        
        return res.json({
          success: true,
          message: 'Already on leaderboard with equal or better score',
          action: 'existing',
          rank: rank
        });
      }
    }
    
    // Insert new entry
    const result = await pool.query(`
      INSERT INTO public_leaderboard (
        url, url_hash, score, quality,
        graaf_score, craft_score, technical_score,
        word_count, company_name, category, country, language,
        is_public, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, true, NOW())
      RETURNING *
    `, [
      url, urlHash, score, quality,
      graaf_score, craft_score, technical_score,
      word_count, company_name, category, country, language
    ]);
    
    // Get rank
    const rankResult = await pool.query(
      'SELECT COUNT(*) + 1 as rank FROM public_leaderboard WHERE score > $1',
      [score]
    );
    
    const rank = parseInt(rankResult.rows[0].rank) || 1;
    
    console.log(`✅ Added to leaderboard: ${url} - Rank #${rank} (${score}/100)`);
    
    res.json({
      success: true,
      message: 'Added to leaderboard!',
      action: 'created',
      rank: rank,
      entry: result.rows[0]
    });
    
  } catch (error) {
    console.error('[LEADERBOARD SUBMIT ERROR]', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit to leaderboard'
    });
  }
});

// ==========================================
// UPDATED detectLanguage - Remove DE/FR, Keep ES
// ==========================================

function detectLanguage(url) {
  const country = detectCountry(url);
  
  const countryLanguageMap = {
    'NL': 'nl',
    'BE': 'nl',
    'UK': 'en',
    'ES': 'es',  // Spanish kept
    'GLOBAL': 'en'
  };
  
  return countryLanguageMap[country] || 'en';
}
