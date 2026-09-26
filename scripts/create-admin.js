// Creates (or resets the password of) an Admin user.
// Interactive:      npm run create-admin
// Non-interactive:  npm run create-admin -- --email you@lab.uz --name "Ism Familiya"   (password is asked)
//                   ADMIN_PASSWORD='...' npm run create-admin -- --email ... --name ...
const readline = require('readline');
const { db } = require('../src/db');
const { hashPassword, passwordProblem } = require('../src/lib/auth');
const { EMAIL_RE } = require('../src/lib/sanitize');

const arg = n => { const i = process.argv.indexOf('--' + n); return i > -1 ? process.argv[i + 1] : undefined; };

function ask(q, hidden = false) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = s => { if (s.includes(q)) rl.output.write(s); else rl.output.write('*'); };
    rl.question(q, a => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(a.trim()); });
  });
}

(async () => {
  const email = (arg('email') || await ask('Email: ')).toLowerCase();
  if (!EMAIL_RE.test(email)) { console.error('Email noto\'g\'ri.'); process.exit(1); }
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const name = arg('name') || existing?.name || await ask('Ism: ');
  let password = process.env.ADMIN_PASSWORD;
  if (!password) {
    password = await ask('Parol (kamida 10 belgi, harf va raqam): ', true);
    const again = await ask('Parolni takrorlang: ', true);
    if (password !== again) { console.error('Parollar mos emas.'); process.exit(1); }
  }
  const problem = passwordProblem(password);
  if (problem) { console.error(problem); process.exit(1); }

  if (existing) {
    db.prepare("UPDATE users SET name = ?, role = 'admin', is_active = 1, password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = datetime('now') WHERE id = ?")
      .run(name, hashPassword(password), existing.id);
    console.log(`✓ ${email} yangilandi (Admin, parol almashtirildi).`);
  } else {
    db.prepare("INSERT INTO users (name, email, role, password_hash) VALUES (?, ?, 'admin', ?)").run(name, email, hashPassword(password));
    console.log(`✓ Admin yaratildi: ${email}`);
  }
})();
