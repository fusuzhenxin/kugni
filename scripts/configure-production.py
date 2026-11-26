"""Generate a deployment secret file; no services or external connections are started."""
import secrets
from pathlib import Path
from cryptography.fernet import Fernet

root = Path(__file__).resolve().parents[1]
target = root / 'production.env'
if target.exists():
    raise SystemExit('production.env already exists; preserved without modification.')
values = {'POSTGRES_PASSWORD': secrets.token_urlsafe(32), 'SECRET_KEY': secrets.token_urlsafe(48), 'ENCRYPTION_KEY': Fernet.generate_key().decode(), 'REVALIDATE_SECRET': secrets.token_urlsafe(48), 'BOOTSTRAP_EMAIL': 'admin@kugni.com', 'BOOTSTRAP_PASSWORD': 'Kg!' + secrets.token_urlsafe(24)}
target.write_text(''.join(k + '=' + v + '\n' for k, v in values.items()), encoding='utf-8')
print('Created production.env. Keep it private and backed up; encryption keys are required to recover stored credentials.')
