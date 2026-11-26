"""No-key provider adapter using https://github.com/nidhaloff/deep-translator.

Called only by the background worker, never from an HTTP request. No paid API,
model runtime, private credentials, or test evidence are sent to this provider.
"""
import json
import sys
import re

import httpx


def protect(source):
    tokens = {}
    def replace(match):
        token = f'[[KUGNIURL{len(tokens):04d}]]'
        tokens[token] = match[0]
        return token
    text = re.sub(r'https?://[^\s<>"\u3000\u3400-\u9fff，。；！？、（）【】)\]]+|`[^`\n]+`', replace, source)
    return text, tokens


def restore(text, tokens):
    for token, original in tokens.items():
        if token not in text: raise ValueError('Protected source token changed')
        text = text.replace(token, original)
    return text


def translate_text(source, client):
    source, tokens = protect(source)
    chunks = []
    while source:
        end = min(3000, len(source))
        opened = source.rfind('[[', 0, end)
        if opened >= 0 and source.find(']]', opened) >= end: end = opened
        chunks.append(source[:end]); source = source[end:]
    results = []
    for chunk in chunks:
        response = client.get('https://translate.googleapis.com/translate_a/single',
                              params={'client': 'gtx', 'sl': 'zh-CN', 'tl': 'en', 'dt': 't', 'q': chunk})
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, list) or not isinstance(data[0], list): raise ValueError('Translation response invalid')
        value = ''.join(part[0] for part in data[0] if isinstance(part, list) and isinstance(part[0], str))
        if not value.strip(): raise ValueError('Empty translation')
        results.append(value)
    return restore('\n'.join(results), tokens)


def translate_batch(texts, client):
    if len(texts) == 1: return [translate_text(texts[0], client)]
    # Numeric markers are checked strictly; a broken batch is never assigned to
    # the wrong source record. Long single records use the chunked path above.
    source, tokens = protect('\n'.join(f'[[KUGNI{i:04d}]]\n{text}' for i, text in enumerate(texts)))
    response = client.get('https://translate.googleapis.com/translate_a/single',
                          params={'client': 'gtx', 'sl': 'zh-CN', 'tl': 'en', 'dt': 't', 'q': source})
    response.raise_for_status()
    data = response.json()
    translated = restore(''.join(part[0] for part in data[0] if isinstance(part, list) and isinstance(part[0], str)), tokens)
    matches = list(re.finditer(r'\[\[KUGNI(\d{4})\]\]', translated))
    if [int(m[1]) for m in matches] != list(range(len(texts))): raise ValueError('Translation markers changed')
    return [translated[m.end():matches[i + 1].start() if i + 1 < len(matches) else len(translated)].strip() for i, m in enumerate(matches)]


def main():
    from .config import settings
    request = json.loads(sys.stdin.read())
    cfg = settings()
    with httpx.Client(timeout=15, trust_env=False, proxy=cfg.translation_proxy_url or cfg.station_source_proxy_url or None) as client:
        if 'texts' in request:
            print(json.dumps({'translations': translate_batch(request['texts'], client)}, ensure_ascii=True))
        else:
            print(json.dumps({'translation': translate_text(request['text'], client)}, ensure_ascii=True))


if __name__ == '__main__':
    main()
