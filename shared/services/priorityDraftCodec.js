// Preserve the complete snapshot without making Postgres parse millions of JSON numbers.
const ENCODING = 'gzip-base64-v1';
const THRESHOLD = 256 * 1024;
const MAX_BYTES = 128 * 1024 * 1024;

function base64(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(chunks.join(''));
}

export async function encodePriorityDraft(payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.length < THRESHOLD) return payload;
  if (bytes.length > MAX_BYTES) throw new Error('저장할 분석 데이터가 128MB를 초과했습니다. 대안을 나누어 저장하세요.');
  if (typeof CompressionStream !== 'function') throw new Error('이 브라우저는 대용량 저장을 지원하지 않습니다. 최신 브라우저를 사용하세요.');
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  return { __priorityDraftEncoding: ENCODING, byteLength: bytes.length, data: base64(compressed) };
}

export async function decodePriorityDraft(payload) {
  if (!payload?.__priorityDraftEncoding) return payload;
  if (payload.__priorityDraftEncoding !== ENCODING || !Number.isInteger(payload.byteLength)
      || payload.byteLength < 1 || payload.byteLength > MAX_BYTES || typeof payload.data !== 'string'
      || payload.data.length > Math.ceil(MAX_BYTES * 4 / 3) + 1024) throw new Error('저장 데이터 형식 또는 크기가 올바르지 않습니다.');
  if (typeof DecompressionStream !== 'function') throw new Error('저장본을 읽으려면 최신 브라우저를 사용하세요.');
  try {
    const bytes = Uint8Array.from(atob(payload.data), value => value.charCodeAt(0));
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.length;
        if (size > payload.byteLength) { await reader.cancel(); throw new Error('압축 해제 크기 초과'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    if (size !== payload.byteLength) throw new Error('압축 해제 크기 불일치');
    const restored = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { restored.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(restored));
  } catch {
    throw new Error('저장 데이터가 손상되었거나 완전히 전달되지 않았습니다. 다시 불러와 주세요.');
  }
}

export async function decodePriorityDraftRow(row) {
  const payload = row?.analysis_conditions?.draftPayload;
  if (!payload?.__priorityDraftEncoding) return row;
  return {...row, analysis_conditions:{...row.analysis_conditions, draftPayload:await decodePriorityDraft(payload)}};
}
