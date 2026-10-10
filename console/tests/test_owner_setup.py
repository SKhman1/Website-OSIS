import sys
from pathlib import Path
sys.path[:0] = [str(Path(__file__).resolve().parents[1]), str(Path(__file__).resolve().parents[1] / "tools")]
import importlib
import sqlite3
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

owner=importlib.import_module('cms-owner')
ROOT=Path(__file__).resolve().parents[2] / "web"

class OwnerSetupTests(unittest.TestCase):
    def test_grant_is_bound_to_existing_enabled_owner_without_mfa(self):
        db=sqlite3.connect(':memory:')
        for path in sorted((ROOT/'migrations/cms').glob('*.sql')):db.executescript(path.read_text())
        for name,role,enabled in [('owner','owner',1),('editor','editor',1),('disabled','owner',0),('enrolled','owner',1)]:
            db.execute('INSERT INTO cms_accounts(id,username,password_hash,role,enabled,auth_epoch,created_at) VALUES(?,?,?,?,?,1,0)',(name,name,'dummy-verifier',role,enabled))
        db.execute("INSERT INTO cms_account_security(account_id,secret) VALUES('enrolled','sealed-test-key')")
        for name in ('owner','editor','disabled','enrolled'):db.executescript(owner.enrollment_sql(name,'a'*64))
        self.assertEqual(db.execute('SELECT account_id FROM cms_mfa_enrollments').fetchall(),[('owner',)])
        old=db.execute('SELECT token_hash FROM cms_mfa_enrollments').fetchone()[0]
        db.executescript(owner.enrollment_sql('owner','b'*64))
        self.assertNotEqual(db.execute('SELECT token_hash FROM cms_mfa_enrollments').fetchone()[0],old)
        self.assertEqual(db.execute("SELECT password_hash,auth_epoch FROM cms_accounts WHERE id='owner'").fetchone(),('dummy-verifier',1))
        self.assertEqual(db.execute('SELECT COUNT(*) FROM cms_access_audit').fetchone()[0],2)
        db.close()

    def test_failure_diagnostics_never_echo_secret_or_provider_output(self):
        secret='SensitiveCredentialThatMustNotAppear'
        cases=[('Authentication error [code: 10000]', 'login'),('fetch failed','Koneksi'),('no such table: cms_mfa_enrollments','Skema'),('SQLITE_ERROR syntax error','query'),('Unknown provider error','exit')]
        for message,hint in cases:
            with self.subTest(message=message):
                result=subprocess.CompletedProcess([],1,stdout=secret,stderr=message+' '+secret)
                diagnostic=owner.wrangler_failure(result)
                self.assertIn(hint,diagnostic);self.assertNotIn(secret,diagnostic)

    def test_timeout_does_not_expose_command_or_retry_mutation(self):
        with patch.object(owner.subprocess,'run',side_effect=subprocess.TimeoutExpired(['secret-sql'],90)) as run:
            with self.assertRaisesRegex(RuntimeError,'90 detik') as result:owner.run_wrangler(ROOT,['secret-sql'])
            self.assertNotIn('secret-sql',str(result.exception));self.assertEqual(run.call_count,1)

if __name__=='__main__':unittest.main()
