"""Native access management. No Cloudflare SDK, local account setup or stored secrets."""
from datetime import datetime
import re
import io
from urllib.parse import quote
import qrcode
from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (QDialog, QVBoxLayout, QFormLayout, QLineEdit, QLabel,
    QPushButton, QComboBox, QPlainTextEdit, QListWidget, QMessageBox, QWidget, QScrollArea, QFrame)
from gui_async import start_job

def caption(text):
    item=QLabel(text);item.setTextFormat(Qt.TextFormat.PlainText);item.setWordWrap(True);return item

def notice(parent, text):
    box=QMessageBox(parent);box.setTextFormat(Qt.TextFormat.PlainText);box.setText(text);box.exec()

def secret_field():
    field=QLineEdit();field.setEchoMode(QLineEdit.EchoMode.Password);return field

def authenticator_qr(secret, username):
    if not isinstance(secret,str) or not re.fullmatch(r'[A-Z2-7]{32}',secret):
        raise ValueError('Kunci autentikator dari server tidak valid. Buat ulang setup.')
    uri='otpauth://totp/'+quote('OSIS:'+username,safe='')+'?secret='+secret+'&issuer=OSIS&algorithm=SHA1&digits=6&period=30'
    qr=qrcode.QRCode(box_size=4,border=4,error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(uri);qr.make(fit=True);stream=io.BytesIO();qr.make_image(fill_color='black',back_color='white').save(stream,format='PNG')
    return stream.getvalue()

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
        self.scroll=QScrollArea();self.scroll.setWidgetResizable(True);self.scroll.setFrameShape(QFrame.Shape.NoFrame)
        self.body=QWidget();self.controls=QVBoxLayout(self.body);self.controls.setContentsMargins(0,0,0,0);self.scroll.setWidget(self.body);self.layout.addWidget(self.scroll)
        self.instructions=caption('Langkah 1 dari 2 · Buat kunci autentikator\nIsi kode aktivasi owner dari script Cloudflare dan password saat ini. Kode 6 digit dari HP baru diperlukan pada langkah berikutnya.')
        self.controls.addWidget(self.instructions)
        self.first=QWidget();self.form=QFormLayout(self.first);self.form.setContentsMargins(0,0,0,0);self.current=secret_field();self.code=QLineEdit();self.code.setMaxLength(6);self.next=secret_field();self.confirm=secret_field()
        self.activation=secret_field();self.activation.setMaxLength(64);self.activation.setPlaceholderText('64 karakter dari script atau undangan owner');self.form.addRow('Kode aktivasi owner',self.activation)
        self.form.addRow('Password saat ini',self.current);self.controls.addWidget(self.first)
        self.begin=QPushButton('Buat QR Google Authenticator');self.begin.clicked.connect(self.begin_setup);self.controls.addWidget(self.begin)
        self.qr=QLabel();self.qr.setAlignment(Qt.AlignmentFlag.AlignCenter);self.qr.setAccessibleName('QR aktivasi Google Authenticator');self.controls.addWidget(self.qr);self.qr.hide()
        self.manual=QPushButton('Lihat kunci manual sebagai alternatif');self.manual.clicked.connect(lambda:self.output.setVisible(self.output.isHidden()));self.controls.addWidget(self.manual);self.manual.hide()
        self.output=QPlainTextEdit();self.output.setReadOnly(True);self.output.setMaximumHeight(150);self.controls.addWidget(self.output);self.output.hide()
        self.confirmation=QWidget();confirmation_layout=QFormLayout(self.confirmation);confirmation_layout.setContentsMargins(0,0,0,0)
        self.code.setPlaceholderText('6 digit dari aplikasi authenticator');self.code.setEnabled(False)
        confirmation_layout.addRow('Kode autentikator dari HP',self.code);confirmation_layout.addRow('Password baru (15–128 karakter)',self.next);confirmation_layout.addRow('Ulangi password baru',self.confirm)
        self.controls.addWidget(self.confirmation);self.confirmation.hide()
        self.finish=QPushButton('Konfirmasi autentikator');self.finish.setEnabled(False);self.finish.clicked.connect(self.confirm_setup);self.layout.addWidget(self.finish)
    def begin_setup(self):
        if not re.fullmatch(r'[a-f0-9]{64}',self.activation.text().strip()):
            self.status.setText('Kode aktivasi owner harus 64 karakter dari script authorize-mfa atau undangan owner. Kolom ini bukan password.');self.activation.setFocus();return
        if not self.current.text():self.status.setText('Isi password akun owner saat ini.');self.current.setFocus();return
        self.call('/api/manage/mfa/begin',dict(current=self.current.text(),activation=self.activation.text().strip()),self.started)
    def started(self,result):
        pixmap=QPixmap()
        if not pixmap.loadFromData(authenticator_qr(result['secret'],self.client.user['username'])):raise ValueError('QR tidak dapat ditampilkan. Buat ulang setup.')
        self.qr.setPixmap(pixmap);self.qr.show();self.first.hide();self.begin.hide();self.manual.show();self.output.hide()
        self.instructions.setText('Langkah 2 dari 2 · Scan dengan Google Authenticator\nDi HP, tekan + → Pindai kode QR. Scan QR ini, lalu isi kode 6 digit dari entri OSIS yang baru dibuat. Pilih password baru 15–128 karakter. Selesaikan dalam 10 menit; jam HP harus otomatis.')
        self.output.setPlainText('Kunci pengaturan Google Authenticator: '+result['secret']+'\n\nLabel: OSIS / '+self.client.user['username']+'\nTipe: berbasis waktu (TOTP), 6 digit, 30 detik.\nIni kunci untuk HP, bukan kode aktivasi owner. Jangan bagikan.');self.confirmation.show();self.code.clear();self.code.setEnabled(True);self.code.setFocus();self.finish.setEnabled(True)
        if hasattr(self,'expiry'):self.expiry.stop()
        self.expiry=QTimer(self);self.expiry.setSingleShot(True);self.expiry.timeout.connect(self.expired);self.expiry.start(600_000)
    def expired(self):
        if self.completed:return
        self.qr.clear();self.qr.hide();self.output.clear();self.output.hide();self.manual.hide();self.confirmation.hide();self.code.clear();self.code.setEnabled(False);self.finish.setEnabled(False);self.first.show();self.begin.show()
        self.instructions.setText('QR kedaluwarsa · Buat QR baru\nBuat ulang QR, lalu scan QR terbaru di Google Authenticator. Gunakan kode dari entri yang baru dibuat.')
    def clear_sensitive(self):
        self.qr.clear();self.output.clear()
        for field in (self.activation,self.current,self.code,self.next,self.confirm):field.clear()
        if hasattr(self,'expiry'):self.expiry.stop()
    def reject(self):
        if not self.busy:self.clear_sensitive();super().reject()
    def confirm_setup(self):
        if not re.fullmatch(r'[0-9]{6}',self.code.text().strip()):self.status.setText('Masukkan kode 6 digit dari aplikasi authenticator di HP.');self.code.setFocus();return
        if not 15<=len(self.next.text())<=128 or len(self.next.text().encode('utf-8'))>512:self.status.setText('Password baru harus 15–128 karakter.');self.next.setFocus();return
        if self.next.text()==self.current.text():self.status.setText('Gunakan password baru yang berbeda dari password saat ini.');self.next.setFocus();return
        if self.next.text()!=self.confirm.text():self.status.setText('Ulangi password baru dengan nilai yang sama.');self.confirm.setFocus();return
        data=dict(current=self.current.text(),next=self.next.text(),code=self.code.text().strip(),activation=self.activation.text().strip());self.code.clear()
        def done(result):
            self.completed=True;self.client.token='';self.client.user=None
            self.activation.clear();self.current.clear();self.next.clear();self.confirm.clear()
            self.expiry.stop();self.qr.clear();self.qr.hide();self.manual.hide();self.output.show()
            self.instructions.setText('Autentikator aktif · Simpan kode pemulihan\nSetiap kode pemulihan dapat dipakai sekali. Login berikutnya memakai password baru dan kode autentikator dari HP.')
            self.confirmation.hide()
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
