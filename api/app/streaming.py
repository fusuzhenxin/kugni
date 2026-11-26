"""Measure actual SSE text arrival and provider-reported token usage."""
import json
import time

import httpx


def stream_model(base, secret, protocol, model, timeout=30):
    from .testing import endpoint, validate_target
    prompt = '请用约100个字介绍如何选择可靠的API服务。直接输出正文。'
    headers, body = {}, {'model': model, 'stream': True}
    if protocol == 'Anthropic Messages':
        url = endpoint(base, '/messages')
        headers = {'x-api-key': secret, 'anthropic-version': '2023-06-01'}
        body.update(max_tokens=256, messages=[{'role': 'user', 'content': prompt}])
    elif protocol == 'Google Gemini':
        url = endpoint(base, '/models/' + model + ':streamGenerateContent', 'gemini')
        headers = {'x-goog-api-key': secret}
        body = {'contents': [{'parts': [{'text': prompt}]}], 'generationConfig': {'maxOutputTokens': 256}}
    elif protocol == 'OpenAI Responses':
        url = endpoint(base, '/responses')
        headers = {'Authorization': 'Bearer ' + secret}
        body.update(input=prompt, max_output_tokens=256)
    else:
        url = endpoint(base, '/chat/completions')
        headers = {'Authorization': 'Bearer ' + secret}
        body.update(messages=[{'role': 'user', 'content': prompt}], max_tokens=256, stream_options={'include_usage': True})
    parsed, ip = validate_target(url)
    target = httpx.URL(url).copy_with(host=ip)
    if protocol == 'Google Gemini':
        target = target.copy_with(query=b'alt=sse')
    headers['Host'] = parsed.hostname + (':' + str(parsed.port) if parsed.port else '')
    started = time.perf_counter()
    first = last = None
    chunks, text, size, finished, usage = 0, '', 0, False, {}
    reported = model
    with httpx.Client(timeout=timeout, follow_redirects=False, trust_env=False) as client:
        with client.stream('POST', target, json=body, headers=headers, extensions={'sni_hostname': parsed.hostname}) as response:
            response.raise_for_status()
            if 'text/event-stream' not in response.headers.get('content-type', ''):
                raise ValueError('streaming not supported')
            event = []
            for line in response.iter_lines():
                size += len(line.encode())
                if size > 2_000_000 or time.perf_counter() - started > timeout:
                    raise ValueError('stream limit reached')
                if line:
                    if line.startswith('data:'):
                        event.append(line[5:].lstrip())
                    continue
                if not event:
                    continue
                payload, event = '\n'.join(event), []
                if payload == '[DONE]':
                    finished = True
                    continue
                data = json.loads(payload)
                if data.get('error') or data.get('type') in ['error', 'response.failed', 'response.incomplete']:
                    raise ValueError('provider stream error')
                delta = ''
                if protocol == 'Anthropic Messages':
                    kind = data.get('type')
                    if kind == 'message_start':
                        message = data.get('message', {})
                        reported = message.get('model', model)
                        usage.update(message.get('usage', {}))
                    if kind == 'content_block_delta':
                        delta = data.get('delta', {}).get('text', '')
                    if kind == 'message_delta':
                        usage.update(data.get('usage', {}))
                    finished |= kind == 'message_stop'
                elif protocol == 'Google Gemini':
                    for candidate in data.get('candidates', []):
                        delta += ''.join(p.get('text', '') for p in candidate.get('content', {}).get('parts', []) if not p.get('thought'))
                        finished |= bool(candidate.get('finishReason'))
                    usage.update(data.get('usageMetadata', {}))
                    reported = data.get('modelVersion', model)
                elif protocol == 'OpenAI Responses':
                    kind = data.get('type', '')
                    if kind == 'response.output_text.delta':
                        delta = data.get('delta', '')
                    if kind == 'response.completed':
                        result = data.get('response', {})
                        usage.update(result.get('usage', {}))
                        reported, finished = result.get('model', model), True
                else:
                    for choice in data.get('choices', []):
                        delta += choice.get('delta', {}).get('content') or ''
                        finished |= bool(choice.get('finish_reason'))
                    usage.update(data.get('usage') or {})
                    reported = data.get('model', model)
                if delta:
                    arrived = (time.perf_counter() - started) * 1000
                    first = arrived if first is None else first
                    last, chunks = arrived, chunks + 1
                    text = (text + delta)[:4000]
    if not text or not finished:
        raise ValueError('stream ended without completion')
    elapsed = round((time.perf_counter() - started) * 1000)
    output = usage.get('output_tokens', usage.get('completion_tokens', usage.get('candidatesTokenCount')))
    span = last - first if last is not None and first is not None else 0
    speed = round(output / (span / 1000), 2) if isinstance(output, (int, float)) and output > 0 and span > 0 and chunks > 1 else None
    return {'text': text, 'reportedModel': reported, 'elapsedMs': elapsed, 'ttftMs': round(first), 'textChunks': chunks,
            'generationMs': round(span), 'outputTokens': output, 'tokensPerSecond': speed,
            'usage': {k: v for k, v in usage.items() if isinstance(v, (int, float))},
            'measurement': 'TTFT 从发起请求至首个文本片段；速度为服务商报告输出 tokens / 首末文本片段间隔，含分块与网络影响。无 token 用量或仅一块文本时不估算速度。'}
