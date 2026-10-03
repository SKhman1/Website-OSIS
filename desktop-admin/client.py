"""HTTPS-only CMS client. Passwords and session tokens are never written to disk."""
import json
import re
import ssl
import urllib.error
import urllib.request
from urllib.parse import urlsplit

class ApiError(Exception):
    def __init__(self, message, status=0):
        super().__init__(message)
        self.status = status

class Client:
    def __init__(self, base_url):
        parsed = urlsplit(base_url.strip())
        local = parsed.hostname in ("127.0.0.1", "localhost", "::1")
        if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/"):
            raise ValueError("Isi alamat utama website tanpa path, username, atau token.")
        if parsed.scheme != "https" and not (parsed.scheme == "http" and local):
            raise ValueError("API harus HTTPS. HTTP hanya untuk localhost.")
        if not parsed.hostname:
            raise ValueError("Alamat API tidak valid.")
        self.base_url = base_url.strip().rstrip("/")
        self.token = ""
        self.user = None
        # Never follow a redirect that could forward credentials to another server.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, *args, **kwargs):
                return None
        self.opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context()))

    def request(self, method, path, data=None, photo=None):
        headers = {"Accept": "application/json", "User-Agent": "VND-Console/1.0"}
        if self.token:
            headers["Authorization"] = "Bearer " + self.token
        payload = None
        if photo is not None:
            headers["Content-Type"] = "image/webp"
            payload = photo
        elif data is not None:
            headers["Content-Type"] = "application/json"
            payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(self.base_url + path, data=payload, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read(1_000_001)
                if len(raw) > 1_000_000:
                    raise ApiError("Respons API terlalu besar.")
                return json.loads(raw)
        except urllib.error.HTTPError as exc:
            try:
                message = json.loads(exc.read(4096)).get("error", "Permintaan ditolak server.")
            except (ValueError, UnicodeError):
                message = "Permintaan ditolak server."
            raise ApiError(message, exc.code) from None
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise ApiError("Tidak dapat terhubung ke API. Periksa koneksi dan alamat website.") from None

    def login(self, username, password):
        result = self.request("POST", "/api/manage/login", {"username": username, "password": password})
        self.token, self.user = result["token"], result["user"]
        return result

    def photo(self, path):
        if not re.fullmatch(r'(?:/_astro/[a-zA-Z0-9_.-]+\.(?:webp|png|jpe?g)|/api/media/[a-f0-9-]{36}\.webp)', path):
            raise ApiError('Alamat foto tidak valid.')
        headers = {'Accept': 'image/webp,image/png,image/jpeg', 'User-Agent': 'VND-Console/1.0'}
        if self.token and path.startswith('/api/media/'): headers['Authorization'] = 'Bearer ' + self.token
        try:
            with self.opener.open(urllib.request.Request(self.base_url + path, headers=headers), timeout=30) as response:
                data = response.read(1_048_577)
                if len(data) > 1_048_576: raise ApiError('Foto terlalu besar untuk preview.')
                return data
        except (urllib.error.URLError, TimeoutError):
            raise ApiError('Foto belum tersedia. Foto baru perlu disimpan dalam draft sebelum preview.') from None

    def logout(self):
        try:
            if self.token:
                self.request("POST", "/api/manage/logout", {})
        finally:
            self.token, self.user = "", None
