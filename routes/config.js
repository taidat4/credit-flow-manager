const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('./auth');

// GET /api/config
router.get('/', requireAuth, (req, res) => {
    const config = db.prepare('SELECT * FROM family_config WHERE id = 1').get();
    res.json(config);
});

// PUT /api/config
router.put('/', requireAuth, (req, res) => {
    const { total_monthly_credits, total_storage_tb, credit_reset_day, family_name } = req.body;

    db.prepare(`
    UPDATE family_config SET
      total_monthly_credits = COALESCE(?, total_monthly_credits),
      total_storage_tb = COALESCE(?, total_storage_tb),
      credit_reset_day = COALESCE(?, credit_reset_day),
      family_name = COALESCE(?, family_name),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run(total_monthly_credits, total_storage_tb, credit_reset_day, family_name);

    const config = db.prepare('SELECT * FROM family_config WHERE id = 1').get();
    res.json(config);
});

module.exports = router;
