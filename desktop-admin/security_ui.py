"""Native access management. No Cloudflare SDK, local account setup or stored secrets."""
from datetime import datetime
from PySide6.QtCore import Qt, QTimer
from PySide6.QtWidgets import (QDialog, QVBoxLayout, QFormLayout, QLineEdit, QLabel,
    QPushButton, QComboBox, QPlainTextEdit, QListWidget, QMessageBox)
from gui_async import start_job

def caption(text):
    item=QLabel(text);item.setTextFormat(Qt.TextFormat.PlainText);item.setWordWrap(True);return item

def notice(parent, text):
    box=QMessageBox(parent);box.setTextFormat(Qt.TextFormat.PlainText);box.setText(text);box.exec()

def secret_field():
    field=QLineEdit();field.setEchoMode(QLineEdit.EchoMode.Password);return field

class ApiDialog(QDialog):
    def __init__(self,parent,client,title):
        super().__init__(parent);self.client=client;self.busy=False;self.setWindowTitle(title);self.resize(640,540)
        self.layout=QVBoxLayout(self);self.status=caption('');self.layout.addWidget(self.status)
    def call(self,path,data,done,method='POST'):
        if self.busy:return
        self.busy=True;self.setEnabled(False);self.status.setText('Menghubungi server…')
        def success(result):
            self.busy=False;self.setEnabled(True);self.status.setText('');done(result)
        def failure(exc):
            self.busy=False;self.setEnabled(True);self.status.setText(str(exc))
        start_job(self,lambda:self.client.request(method,path,data),success,failure)
    def reject(self):
        if not self.busy:super().reject()
    def closeEvent(self,event):
        if self.busy:event.ignore()
        else:super().closeEvent(event)

class InvitationDialog(ApiDialog):
    def __init__(self,parent,client):
        super().__init__(parent,client,'Terima undangan pengurus')
        self.layout.addWidget(caption('Akun hanya dibuat melalui undangan owner. Izin dan username ditentukan server. Undangan berlaku 24 jam dan sekali pakai.'))
        form=QFormLayout();self.invitation=secret_field();self.password=secret_field();self.confirm=secret_field()
        for text,field in [('Kode undangan',self.invitation),('Password baru (15–128 karakter)',self.password),('Ulangi password',self.confirm)]:form.addRow(text,field)
        self.layout.addLayout(form);action=QPushButton('Aktifkan akun');action.clicked.connect(self.submit);self.layout.addWidget(action)
    def submit(self):
        if self.password.text()!=self.confirm.text():notice(self,'Password belum cocok.');return
        data=dict(invitation=self.invitation.text().strip(),password=self.password.text());self.password.clear();self.confirm.clear()
        def done(result):
            self.invitation.clear()
            if result.get('activation'):
                self.status.setText('Akun owner '+result['username']+' siap. Simpan kode aktivasi berikut, lalu login dan aktifkan autentikator.')
                output=QPlainTextEdit();output.setReadOnly(True);output.setPlainText(result['activation']);self.layout.addWidget(output)
                close=QPushButton('Kode sudah disimpan · kembali ke login');close.clicked.connect(self.accept);self.layout.addWidget(close)
                self.findChildren(QPushButton)[0].setEnabled(False)
            else:
                notice(self,'Akun '+result['username']+' siap. Login dengan password yang baru kamu buat.')
                # Let the queued GuiJob receiver finish before exec() returns and
                # destroys its parent dialog. Closing inside delivery can crash Qt.
                QTimer.singleShot(0,self.accept)
        self.call('/api/manage/invitations/accept',data,done)

class EnrollmentDialog(ApiDialog):
    def __init__(self,parent,client):
        super().__init__(parent,client,'Aktifkan autentikasi dua langkah · Owner')
        self.completed=False
        self.layout.addWidget(caption('Akun owner belum dapat membuka konten sampai autentikator aktif. Tambahkan kunci di aplikasi autentikator melalui pilihan masukkan kunci manual: TOTP, 6 digit, 30 detik. Kunci dan kode pemulihan tidak disimpan di laptop ini.'))
        self.form=QFormLayout();self.current=secret_field();self.code=QLineEdit();self.code.setMaxLength(6);self.next=secret_field();self.confirm=secret_field()
        self.activation=secret_field();self.form.addRow('Kode aktivasi dari pemilik / undangan',self.activation)
        self.form.addRow('Password saat ini',self.current);self.layout.addLayout(self.form)
        self.begin=QPushButton('Buat kunci autentikator');self.begin.clicked.connect(self.begin_setup);self.layout.addWidget(self.begin)
        self.output=QPlainTextEdit();self.output.setReadOnly(True);self.output.setMaximumHeight(180);self.layout.addWidget(self.output)
        self.form.addRow('Kode autentikator',self.code);self.form.addRow('Password baru (wajib diganti)',self.next);self.form.addRow('Ulangi password baru',self.confirm)
        self.finish=QPushButton('Konfirmasi autentikator');self.finish.setEnabled(False);self.finish.clicked.connect(self.confirm_setup);self.layout.addWidget(self.finish)
    def begin_setup(self):
        self.call('/api/manage/mfa/begin',dict(current=self.current.text(),activation=self.activation.text().strip()),self.started)
    def started(self,result):
        self.output.setPlainText('Kunci manual: '+result['secret']+'\n\nLabel: OSIS / '+self.client.user['username']+'\nTipe: TOTP · 6 digit · 30 detik\nBerlaku 10 menit. Jangan bagikan kunci ini.');self.finish.setEnabled(True)
    def confirm_setup(self):
        if self.next.text()!=self.confirm.text():notice(self,'Password baru belum cocok.');return
        data=dict(current=self.current.text(),next=self.next.text(),code=self.code.text().strip(),activation=self.activation.text().strip());self.current.clear();self.next.clear();self.confirm.clear();self.code.clear()
        def done(result):
            self.completed=True;self.client.token='';self.client.user=None
            self.activation.clear()
            self.output.setPlainText('Simpan kode pemulihan ini di tempat pribadi yang aman. Masing-masing sekali pakai.\n\n'+'\n'.join(result['recoveryCodes'])+'\n\nSetup selesai. Login dengan password baru dan tunggu kode autentikator berikutnya (maksimal 30 detik).')
            self.begin.setEnabled(False);self.finish.setEnabled(False)
            close=QPushButton('Sudah disimpan · kembali ke login');close.clicked.connect(self.accept);self.layout.addWidget(close)
        self.call('/api/manage/mfa/confirm',data,done)

class AccessDialog(ApiDialog):
    def __init__(self,parent,client):
        super().__init__(parent,client,'Akses pengurus · Owner panel');self.resize(780,720);self.accounts=[]
        self.layout.addWidget(caption('Owner panel mengelola konten dan akun pengurus. Domain, hosting, secret, serta Cloudflare tetap dikelola pemilik infrastruktur. Setiap tindakan akses membutuhkan password dan kode baru.'))
        self.list=QListWidget();self.layout.addWidget(self.list)
        form=QFormLayout();self.username=QLineEdit();self.role=QComboBox();self.role.addItem('Editor · simpan draft','editor');self.role.addItem('Owner panel · publikasi dan akses pengurus','owner');self.password=secret_field();self.code=QLineEdit();self.code.setPlaceholderText('6 digit, atau kode pemulihan')
        for text,field in [('Username untuk undangan',self.username),('Izin undangan',self.role),('Password kamu saat ini',self.password),('Kode autentikator kamu',self.code)]:form.addRow(text,field)
        self.layout.addLayout(form)
        for text,callback in [('Buat undangan (24 jam)',self.invite),('Cabut undangan username di atas',self.revoke_invite),('Nonaktifkan akun terpilih',lambda:self.account_action(False)),('Aktifkan akun terpilih',lambda:self.account_action(True)),('Cabut seluruh sesi akun terpilih',lambda:self.account_action(None)),('Muat ulang daftar akun',self.refresh),('Lihat catatan akses',self.audit)]:
            action=QPushButton(text);action.clicked.connect(callback);self.layout.addWidget(action)
        self.output=QPlainTextEdit();self.output.setReadOnly(True);self.output.setMaximumHeight(150);self.layout.addWidget(self.output)
        self.refresh()
    def credentials(self):
        data=dict(current=self.password.text(),code=self.code.text().strip());self.password.clear();self.code.clear();return data
    def refresh(self):
        def done(result):
            self.accounts=result['items'];self.list.clear()
            for user in self.accounts:self.list.addItem(f"{user['username']} · {user['role']} · {'aktif' if user['enabled'] else 'nonaktif'} · MFA {'aktif' if user['mfaEnabled'] else 'belum aktif'}")
        self.call('/api/manage/accounts',None,done,'GET')
    def invite(self):
        data={**self.credentials(),'username':self.username.text().strip(),'role':self.role.currentData()}
        self.call('/api/manage/invitations',data,lambda result:self.output.setPlainText('Kode hanya ditampilkan sekali. Berikan secara pribadi kepada calon pengurus.\n\n'+result['invitation']+'\n\nBerlaku sampai '+datetime.fromtimestamp(result['expiresAt']).strftime('%d/%m/%Y %H:%M')))
    def revoke_invite(self):
        self.call('/api/manage/invitations/revoke',{**self.credentials(),'username':self.username.text().strip()},lambda _:self.output.setPlainText('Undangan dicabut.'))
    def account_action(self,enabled):
        row=self.list.currentRow()
        if row<0:notice(self,'Pilih akun terlebih dahulu.');return
        user=self.accounts[row]
        if user['username']==self.client.user['username']:notice(self,'Gunakan akun owner lain untuk mengubah atau mencabut akses akun ini.');return
        box=QMessageBox(self);box.setTextFormat(Qt.TextFormat.PlainText);box.setText('Ubah akses / cabut sesi '+user['username']+'?');box.setStandardButtons(QMessageBox.StandardButton.Yes|QMessageBox.StandardButton.No);box.setDefaultButton(QMessageBox.StandardButton.No)
        if box.exec()!=QMessageBox.StandardButton.Yes:return
        data={**self.credentials(),'id':user['id']}
        if enabled is not None:data['enabled']=enabled
        self.call('/api/manage/accounts/revoke-sessions' if enabled is None else '/api/manage/accounts/status',data,lambda _:self.refresh())
    def audit(self):
        self.call('/api/manage/audit',None,lambda result:self.output.setPlainText('\n'.join(f"{datetime.fromtimestamp(row['created_at']).strftime('%d/%m %H:%M')} · {row.get('actor') or 'infrastruktur'} · {row['action']} · {row['target']}" for row in result['items'])),'GET')
