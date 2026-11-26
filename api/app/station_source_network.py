"""Pinned public destinations with optional, explicitly configured proxy/DoH."""
import ipaddress
import json
import ssl

import httpx
from fastapi import HTTPException

from .config import settings


class StationTLSContext(ssl.SSLContext):
    def __new__(cls, hostname):
        return super().__new__(cls, ssl.PROTOCOL_TLS_CLIENT)

    def __init__(self, hostname):
        self.hostname = hostname
        self.load_default_certs()

    def wrap_socket(self, *args, **kwargs):
        kwargs['server_hostname'] = self.hostname
        return super().wrap_socket(*args, **kwargs)

    def wrap_bio(self, *args, **kwargs):
        kwargs['server_hostname'] = self.hostname
        return super().wrap_bio(*args, **kwargs)


def resolve_source_ip(parsed, system_ip, proxy=None, transport=None):
    resolver = settings().station_source_dns_url if proxy else ''
    if not resolver: return system_ip
    if resolver not in ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']:
        raise HTTPException(409, '采集加密 DNS 地址不在支持范围')
    with httpx.Client(timeout=15, proxy=proxy, trust_env=False, follow_redirects=False, transport=transport) as client:
        with client.stream('GET', resolver, params={'name': parsed.hostname, 'type': 'A'}, headers={'Accept': 'application/dns-json'}) as response:
            response.raise_for_status()
            raw = bytearray()
            for chunk in response.iter_bytes():
                raw.extend(chunk)
                if len(raw) > 65536: raise ValueError('DNS 响应超过大小限制')
            data = json.loads(raw)
    addresses = [str(ipaddress.ip_address(a['data'])) for a in data.get('Answer', []) if a.get('type') == 1]
    if data.get('Status') != 0 or not addresses or any(not ipaddress.ip_address(ip).is_global for ip in addresses):
        raise HTTPException(422, '采集加密 DNS 没有返回有效公开地址')
    return sorted(addresses)[0]
