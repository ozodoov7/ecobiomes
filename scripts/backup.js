// Manual / cron backup: creates a ZIP in backups/, keeps the newest BACKUP_KEEP, and uploads it
// off-site when OFFSITE_REMOTE is set. (The running server already does this daily by itself.)
const { runBackup } = require('../src/lib/backup');
runBackup('cli').then(s => {
  const bad = !s.last_local?.ok || (s.last_offsite && !s.last_offsite.ok);
  if (s.last_offsite) console.log(s.last_offsite.ok ? `✓ Off-site: ${s.last_offsite.remote}/${s.last_offsite.file}` : `✗ Off-site: ${s.last_offsite.error}`);
  process.exit(bad ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
