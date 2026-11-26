"""Create local-only credentials once; never replace an existing environment."""
import secrets
from pathlib import Path

from cryptography.fernet import Fernet

root = Path(__file__).resolve().parents[1]
env = root / 'api/.env'
if not env.exists():
    password = 'Kg!' + secrets.token_urlsafe(15)
    token = secrets.token_urlsafe(48)
    env.write_text('\n'.join([
        'ENVIRONMENT=development',
        'DATABASE_URL=sqlite:///' + (root / 'api/kugni.db').as_posix(),
        'SECRET_KEY=' + secrets.token_urlsafe(48),
        'ENCRYPTION_KEY=' + Fernet.generate_key().decode(),
        'REVALIDATE_SECRET=' + token,
        'BOOTSTRAP_EMAIL=admin@kugni.com',
        'BOOTSTRAP_PASSWORD=' + password,
        'BROWSER_ORIGIN=http://127.0.0.1:3001',
        'WEB_INTERNAL_URL=http://127.0.0.1:3001',
    ]) + '\n', encoding='utf-8')
    (root / 'web/.env.local').write_text('API_INTERNAL_URL=http://127.0.0.1:8000\nSITE_URL=https://www.kugni.com\nREVALIDATE_SECRET=' + token + '\n', encoding='utf-8')
    (root / 'LOCAL-ACCESS.md').write_text('# 本地访问\n\n前台：http://127.0.0.1:3001/\n\n管理后台：http://127.0.0.1:3001/admin/dashboard/\n\n站长后台：http://127.0.0.1:3001/publisher/dashboard/\n\nAPI：http://127.0.0.1:8000/docs\n\n仅本地开发种子账户（共用初始密码，生产环境不会创建）：\n\n- 管理员：`admin@kugni.com`\n- 审核员：`local-reviewer@kugni.com`\n- 站长：`local-publisher@kugni.com`\n\n初始密码：`' + password + '`\n\n本文件包含本地凭证，请勿公开提交。\n', encoding='utf-8')
    print('Created local environment and LOCAL-ACCESS.md. SQLite is explicitly selected for local execution.')
else:
    print('Existing environment preserved.')
