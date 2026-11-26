from .models import Record, Role, User


def record_json(record: Record) -> dict:
    return {**record.data, 'id': record.id, 'name': record.name, 'slug': record.slug, 'status': record.status, 'ownerId': record.owner_id, 'version': record.version, 'updated': record.updated_at.isoformat(), 'created': record.created_at.isoformat()}


def user_json(user: User, role: Role) -> dict:
    return {'id': user.id, 'email': user.email, 'name': user.name, 'roleId': role.id, 'roleName': role.name, 'surface': role.surface, 'permissions': role.permissions, 'status': '正常' if user.enabled else '已停用', 'profile': user.profile, 'created': user.created_at.isoformat()}
