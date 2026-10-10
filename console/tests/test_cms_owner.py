import sys
from pathlib import Path
sys.path[:0] = [str(Path(__file__).resolve().parents[1]), str(Path(__file__).resolve().parents[1] / "tools")]
import importlib
import sqlite3
import unittest
from pathlib import Path
owner=importlib.import_module('cms-owner')

class Tests(unittest.TestCase):
    def test_bootstrap_never_resets_existing_accounts(self):
        db=sqlite3.connect(':memory:')
        for name in ['0001_content.sql','0002_access.sql','0003_enrollment.sql']:db.executescript((Path(__file__).resolve().parents[2] / "web"/'migrations/cms'/name).read_text())
        db.executescript(owner.account_sql('bootstrap','qa-first','Disposable test owner password.'))
        initial=db.execute('SELECT id,username,password_hash,auth_epoch FROM cms_accounts').fetchall()
        db.executescript(owner.account_sql('bootstrap','qa-first','Changed test password for attempted reset.'))
        db.executescript(owner.account_sql('bootstrap','qa-other','Disposable test owner password.'))
        self.assertEqual(db.execute('SELECT id,username,password_hash,auth_epoch FROM cms_accounts').fetchall(),initial)
        db.close()
    def test_recovery_does_not_promote_editor_and_revokes_owner_access(self):
        db=sqlite3.connect(':memory:')
        for name in ['0001_content.sql','0002_access.sql','0003_enrollment.sql']:db.executescript((Path(__file__).resolve().parents[2] / "web"/'migrations/cms'/name).read_text())
        db.executescript(owner.account_sql('bootstrap','qa-owner','Disposable test owner password.'))
        id=db.execute('SELECT id FROM cms_accounts').fetchone()[0]
        db.execute("INSERT INTO cms_accounts VALUES('editor','qa-editor','dummy','editor',1,1,0)")
        db.execute("INSERT INTO cms_sessions VALUES('dummy',?,1,9999999999,1)",(id,))
        db.execute("INSERT INTO cms_account_security(account_id,secret) VALUES(?,'dummy')",(id,))
        db.execute("INSERT INTO cms_recovery_codes VALUES(?,'dummy')",(id,))
        db.execute("INSERT INTO cms_invitations VALUES('dummy','new-editor','editor',?,1,0,9999999999,NULL,0)",(id,));db.commit()
        db.executescript(owner.account_sql('recover','qa-editor','Disposable replacement password.'))
        self.assertEqual(db.execute("SELECT role,password_hash FROM cms_accounts WHERE id='editor'").fetchone(),('editor','dummy'))
        db.executescript(owner.account_sql('recover','qa-owner','Disposable replacement password.'))
        for table in ['cms_sessions','cms_account_security','cms_recovery_codes']:self.assertEqual(db.execute('SELECT COUNT(*) FROM '+table).fetchone()[0],0)
        self.assertEqual(db.execute('SELECT revoked FROM cms_invitations').fetchone()[0],1)
        self.assertEqual(db.execute('SELECT action FROM cms_access_audit').fetchone()[0],'owner-recovered');db.close()
    def test_sql_username_injection_rejected(self):
        with self.assertRaises(ValueError):owner.account_sql('bootstrap',"qa';DROP TABLE cms_accounts;--",'Disposable test password.')

if __name__=='__main__':unittest.main()
