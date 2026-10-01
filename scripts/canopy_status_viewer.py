"""Offline, read-only canopy status viewer. Never submits or downloads GEE jobs."""
import argparse
from collections import Counter
from datetime import datetime, timedelta, timezone
from html import escape
import json
from pathlib import Path
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
KST = timezone(timedelta(hours=9))
OUTPUT = ROOT / 'output/canopy-admin-progress/status.html'


def timestamp(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace('Z', '+00:00')).astimezone(KST)


def render(now=None):
    now = now or datetime.now(KST)
    state = json.loads((ROOT / '.runtime-logs/canopy-queue.json').read_text(encoding='utf-8'))
    entries = [i for group in state['stages'].values() for i in group]
    audit_path = ROOT / '.runtime-logs/canopy-national-audit.json'
    audit = json.loads(audit_path.read_text(encoding='utf-8')) if audit_path.exists() else None
    updated = timestamp(state.get('updated'))
    stamp = updated.strftime('%Y-%m-%d %H:%M') if updated else '기록 없음'
    days = []
    for offset in range(2, -1, -1):
        day = (now - timedelta(days=offset)).date()
        submitted = sum(bool(i.get('submittedAt')) and timestamp(i['submittedAt']).date() == day for i in entries)
        received = [i for i in entries if i.get('verifiedAt') and timestamp(i['verifiedAt']).date() == day]
        verified = sum(i['status'] == 'VERIFIED' for i in received)
        empty = sum(i['status'] in ('EMPTY_SOURCE', 'EMPTY_BOUNDARY') for i in received)
        volume = sum(i.get('bytes', 0) for i in received) / 1024**2
        note = '사용자 요청 휴식일' if day.isoformat() == '2026-09-30' else '아직 기록 없음' if not submitted and not received else '기록된 실적'
        days.append(f'<tr><td>{day:%m월 %d일}</td><td>{submitted}</td><td>{verified}</td><td>{empty}</td><td>{volume:,.1f} MB</td><td>{note}</td></tr>')

    groups = [('수원', state['stages'].get('suwon', [])), ('인천', state['stages'].get('incheon', []))]
    national = state['stages'].get('national', [])
    groups += [(label, [i for i in national if i.get('priorityGroup', 3) == rank]) for label, rank in [('서울 우선', 1), ('나머지 경기', 2), ('그 외 전국', 3)]]
    group_rows = []
    for label, items in groups:
        c = Counter(i['status'] for i in items)
        errors = sum(c[s] for s in ('FAILED', 'UNKNOWN', 'SUBMITTING', 'EMPTY_SOURCE', 'CANCELLED'))
        group_rows.append(f'<tr><th>{label}</th><td>{len(items)}</td><td>{c["VERIFIED"]}</td><td>{c["EMPTY_BOUNDARY"]}</td><td>{c["RUNNING"]}</td><td>{c["READY"]}</td><td>{c["PENDING"]}</td><td>{errors}</td></tr>')
    c = Counter(i['status'] for i in entries)
    issues = [i for i in entries if i['status'] in ('FAILED', 'UNKNOWN', 'SUBMITTING', 'EMPTY_SOURCE', 'CANCELLED')]
    issue_text = '현재 기록된 오류 작업 없음' if not issues else '<br>'.join(escape(i['name'] + ': ' + i['status']) for i in issues)
    missing = f'{audit["totals"]["missingInside"]:,}픽셀 / 검사 파일 {audit["auditedTiles"]}개' if audit else '검사 기록 없음'
    storage = state.get('storage', {})
    def free(key):
        return f'{storage[key]/1024**3:,.2f} GiB' if key in storage else '기록 없음'
    if now.date().isoformat() <= '2026-09-30':
        schedule = '9월 30일 휴식 · 10월 1일 오전 9시 자동 재개 예정'
    else:
        schedule = '매일 오전 9시 예약 · 서울 → 나머지 경기 → 그 외 전국'
    report = ROOT / 'output/canopy-admin-progress/administrative-progress.md'
    csv = report.with_suffix('.csv')
    admin_path = report.with_suffix('.json')
    admin_rows = []
    if admin_path.exists():
        for r in json.loads(admin_path.read_text(encoding='utf-8')):
            fields = [r.get('우선순위',''), r['시도'], r['행정구역'], r['상태'], r['파일검증'], r['대기'], r['미제출']]
            admin_rows.append('<tr>' + ''.join(f'<td>{escape(str(v))}</td>' for v in fields) + '</tr>')
    page = f'''<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>수관높이 다운로드 현황</title><style>
body{{margin:0;background:#f2f5f8;color:#182b38;font:16px/1.6 'Malgun Gothic',sans-serif}}main{{max-width:1100px;margin:36px auto;padding:0 24px 48px}}h1{{margin:0;font-size:30px}}h2{{font-size:20px;margin-top:0}}p{{margin:8px 0}}.muted{{color:#596c7b;font-size:14px}}.banner{{background:#dcefe8;padding:16px 20px;border-radius:12px;margin:22px 0}}.cards{{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}}.card,section{{background:white;padding:22px;border-radius:12px;margin-bottom:20px;border:1px solid #e0e7ed}}.big{{font-size:32px;font-weight:bold;color:#11664f}}table{{width:100%;border-collapse:collapse;font-size:14px}}th,td{{padding:11px 8px;border-bottom:1px solid #e5ebef;text-align:left;white-space:nowrap}}thead{{background:#edf3f6}}.scroll{{overflow:auto}}a{{color:#096746}}input{{font:inherit;padding:10px;width:min(90%,420px);margin-bottom:14px;border:1px solid #abbfc9;border-radius:6px}}@media(max-width:650px){{.cards{{grid-template-columns:1fr}}main{{padding:0 12px}}}}
</style><main><h1>수관높이 다운로드 현황</h1><p class="muted">마지막 작업 기록: {stamp} KST · 화면 생성: {now:%Y-%m-%d %H:%M} KST</p>
<p class="muted">저장된 기록을 보여주는 화면입니다. GEE 실시간 조회나 다운로드를 실행하지 않습니다. 최신 기록을 다시 읽으려면 바탕화면 아이콘을 다시 실행하세요.</p>
<div class="banner">{schedule}<br><small>이미 제출된 GEE 작업은 휴식일에도 서버에서 처리될 수 있습니다.</small></div>
<div class="cards"><div class="card">로컬 파일 검증 완료<div class="big">{c['VERIFIED']}개</div><small>빈 경계 {c['EMPTY_BOUNDARY']}개 별도</small></div><div class="card">실행 중 / 대기<div class="big">{c['RUNNING']} / {c['READY']}</div><small>마지막 조회 상태 기준</small></div><div class="card">저장 여유<p>D: {free('localFreeBytes')}<br>Drive: {free('driveFreeBytes')}</p></div></div>
<section><h2>최근 3일 실적</h2><div class="scroll"><table><thead><tr><th>날짜</th><th>신규 제출</th><th>파일 검증 완료</th><th>빈 파일·빈 경계</th><th>회수 용량</th><th>메모</th></tr></thead><tbody>{''.join(days)}</tbody></table></div><p class="muted">한국시간 기준 오늘과 이전 2일. 제출·회수 시각으로 계산하며 날짜별 당시 대기 수를 복원한 표는 아닙니다. 취소·재시도 횟수는 별도 이력에 있을 수 있습니다.</p></section>
<section><h2>지역별 현재 상태</h2><div class="scroll"><table><thead><tr><th>대상</th><th>전체</th><th>파일 검증</th><th>빈 경계</th><th>실행 중</th><th>대기</th><th>미제출</th><th>확인 필요</th></tr></thead><tbody>{''.join(group_rows)}</tbody></table></div><p class="muted">서울과 겹치는 타일은 서울 그룹에 포함됩니다. 파일 검증 완료와 행정구역 전체의 경계 검증 완료는 다릅니다.</p></section>
<section><h2>검증 및 저장 위치</h2><p>{issue_text}</p><p>전국 경계 안 결측: <strong>{missing}</strong></p><p class="muted">기존 0058 타일의 결측은 별도 조사 기록으로 추적합니다. 원본 결측을 높이 0으로 바꾸지 않습니다.</p><p>자료 위치: <code>D:\\LivingLabsData\\canopy-height</code></p><p><a href="{csv.as_uri()}">전체 목록 CSV</a> · <a href="{report.as_uri()}">상세 진행표</a></p></section>
<section><h2>행정구역 목록</h2><input id="search" placeholder="서울, 강남구, 완료 등 검색" aria-label="행정구역 검색"><div class="scroll"><table><thead><tr><th>우선순위</th><th>시도</th><th>행정구역</th><th>상태</th><th>파일 검증</th><th>대기</th><th>미제출</th></tr></thead><tbody id="admin">{''.join(admin_rows)}</tbody></table></div><p class="muted">저장된 행정경계 기준. 한 타일이 여러 행정구역에 중복 집계될 수 있습니다.</p></section></main>
<script>document.getElementById('search').addEventListener('input',e=>{{const q=e.target.value.trim();document.querySelectorAll('#admin tr').forEach(r=>r.hidden=!r.textContent.includes(q));}});</script></html>'''
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(page, encoding='utf-8')
    return OUTPUT


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-open', action='store_true')
    args = parser.parse_args()
    try:
        result = render()
        if not args.no_open:
            webbrowser.open(result.as_uri())
    except Exception as exc:
        import ctypes
        ctypes.windll.user32.MessageBoxW(None, f'현황을 열지 못했습니다.\n{exc}', '수관높이 작업 현황', 0x10)
        raise
