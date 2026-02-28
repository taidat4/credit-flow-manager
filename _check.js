const db = require('./db/database');

const members = db.prepare(`
  SELECT m.name,
    COALESCE((SELECT cl.amount FROM credit_logs cl WHERE cl.member_id = m.id ORDER BY cl.id DESC LIMIT 1), 0) as latest_credit,
    (SELECT COUNT(*) FROM credit_logs cl WHERE cl.member_id = m.id) as log_count
  FROM members m
  WHERE m.admin_id = 2 AND m.status = 'active'
`).all();

console.log('=== Member Credits (latest value per member) ===');
members.forEach(m => console.log(` ${m.name}: ${m.latest_credit} (${m.log_count} log entries)`));

const admin = db.prepare('SELECT credits_remaining_actual, total_monthly_credits FROM admins WHERE id = 2').get();
console.log('\n=== Admin Level ===');
console.log(` Credits remaining (from Google): ${admin.credits_remaining_actual}`);
console.log(` Total monthly: ${admin.total_monthly_credits}`);
console.log(` Used: ${admin.total_monthly_credits - admin.credits_remaining_actual}`);

process.exit(0);
