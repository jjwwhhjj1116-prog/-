import json
import random

def generate_schedule():
    with open('scheduler-web/src/data/intakeProjects.json', 'r', encoding='utf-8') as f:
        intake_items = json.load(f)

    with open('scheduler-web/src/data/concostUsers.json', 'r', encoding='utf-8') as f:
        users = json.load(f)

    # 1. 기술본부 부서별 인원 분리
    finish_users = [u for u in users if u.get('company') == '컨코스트' and '마감' in u.get('department', '')]
    struct_users = [u for u in users if u.get('company') == '컨코스트' and '구조' in u.get('department', '')]
    civil_users = [u for u in users if u.get('company') == '컨코스트' and ('토목' in u.get('department', '') or '조경' in u.get('department', ''))]

    print(f"마감팀 본사 인원: {len(finish_users)}명: {[u['name'] for u in finish_users]}")
    print(f"구조팀 본사 인원: {len(struct_users)}명: {[u['name'] for u in struct_users]}")
    print(f"토목팀 본사 인원: {len(civil_users)}명: {[u['name'] for u in civil_users]}")

    # 베트남 팀 ID
    # 마감 6개팀: IN1(내부1), IN2(내부2), IN3(내부3), EXT(외부), BRICK(조적), WIN(창호)
    # 구조 2개팀: VERT(수직), HORIZ(수평)
    # 토목 1개팀: CIVIL(토목)

    # 2. 접수목록 30건을 일정표 프로젝트로 변환
    # 상위 12~15개 프로젝트를 실제 일정표에 등록하고, 나머지는 접수목록에서 '대기' 상태로 유지
    projects = []

    # PM 후보:
    # 마감팀: 조한빈 실장(u_12), 양한규 수석(u_15), 성대용 수석(u_14), 송영길 수석(u_17)
    # 구조팀: 김재헌 수석(u_13), 박용진 수석(u_9)
    # 토목팀: 오승균 파트장(u_32)

    status_cycle = ['진행중', '진행중', '착수예정', '진행중', '수정', '진행중', '착수예정', '납품']

    for idx, item in enumerate(intake_items):
        target_depts = item.get('targetDepartments', [])
        if not target_depts:
            target_depts = ['마감팀']

        # 프로젝트 시작/종료일
        start_date = item.get('startDate', '2026-09-15')
        end_date = item.get('endDate', '2026-10-25')
        p_status = status_cycle[idx % len(status_cycle)]
        progress = random.randint(15, 92) if p_status == '진행중' else (85 if p_status == '수정' else (100 if p_status == '납품' else 0))

        for dept in target_depts:
            p_id = f"p_{item['code']}_{'F' if dept == '마감팀' else ('S' if dept == '구조팀' else 'C')}"
            
            # PM 지정
            if dept == '마감팀':
                pm = finish_users[idx % len(finish_users)] if finish_users else {'id': 'u_15', 'name': '양한규'}
                # 공종: PM, 조적, 창호, 외부, 내부, 세대, 가설
                sub_tasks = {
                    'PM': {
                        'roleName': 'PM',
                        'personId': pm['id'],
                        'startDate': start_date,
                        'endDate': end_date,
                        'status': p_status if p_status != '수정' else '진행중',
                        'memo': f"{pm['name']} {pm.get('position', '수석')}: 공정 및 산출물 총괄 관리",
                        'version': 'v1'
                    },
                    '조적': {
                        'roleName': '조적',
                        'personId': 'BRICK', # 베트남 조적팀
                        'startDate': start_date,
                        'endDate': '2026-10-05',
                        'status': '진행중' if progress > 30 else '예정',
                        'memo': '벽체 및 방화구획 조적 수량 산출',
                        'version': 'v1'
                    },
                    '창호': {
                        'roleName': '창호',
                        'personId': 'WIN', # 베트남 창호팀
                        'startDate': '2026-09-20',
                        'endDate': '2026-10-10',
                        'status': '진행중' if progress > 40 else '예정',
                        'memo': '커튼월 및 금속창호 리스트 산출',
                        'version': 'v1'
                    },
                    '외부': {
                        'roleName': '외부',
                        'personId': 'EXT', # 베트남 외부팀
                        'startDate': '2026-09-22',
                        'endDate': '2026-10-15',
                        'status': '예정',
                        'memo': '외부 석재 및 복합판넬 마감',
                        'version': 'v1'
                    },
                    '내부': {
                        'roleName': '내부',
                        'personId': 'IN1', # 베트남 내부1팀
                        'startDate': '2026-09-25',
                        'endDate': '2026-10-18',
                        'status': '예정',
                        'memo': '공용부 및 계단실 내부 마감',
                        'version': 'v1'
                    },
                    '세대': {
                        'roleName': '세대',
                        'personId': 'IN2', # 베트남 내부2팀
                        'startDate': '2026-10-01',
                        'endDate': '2026-10-20',
                        'status': '예정',
                        'memo': '단위세대 전용부 바닥·벽·천장 마감',
                        'version': 'v1'
                    },
                    '가설': {
                        'roleName': '가설',
                        'personId': finish_users[(idx + 2) % len(finish_users)]['id'] if finish_users else 'u_18',
                        'personIds': [finish_users[(idx + 2) % len(finish_users)]['id'] if finish_users else 'u_18'],
                        'startDate': '2026-10-10',
                        'endDate': end_date,
                        'status': '예정',
                        'memo': '외부비계 및 가설울타리 적산',
                        'version': 'v1'
                    },
                    '내역': {
                        'roleName': '내역',
                        'personId': finish_users[(idx + 3) % len(finish_users)]['id'] if finish_users else 'u_14',
                        'personIds': [finish_users[(idx + 3) % len(finish_users)]['id'] if finish_users else 'u_14'],
                        'subType': '공내역' if idx % 3 == 0 else ('설계예가' if idx % 3 == 1 else '실행가'),
                        'startDate': '2026-10-12',
                        'endDate': end_date,
                        'status': '예정',
                        'memo': f"{'공내역' if idx % 3 == 0 else ('설계예가' if idx % 3 == 1 else '실행가')} 산출 및 내역서 취합",
                        'version': 'v1'
                    },
                }
                # 첫번째 프로젝트(TK-2026087 등) 조적 공종에 원종수(u_16) + 성대용(u_14) 다중인원 배정 예시 적용
                if idx == 0 and '조적' in sub_tasks:
                    sub_tasks['조적']['personId'] = 'u_16'
                    sub_tasks['조적']['personIds'] = ['u_16', 'u_14']
                    sub_tasks['조적']['memo'] = '원종수 수석 · 성대용 수석 합동 조적 수량산출'
            elif dept == '구조팀':
                pm = struct_users[idx % len(struct_users)] if struct_users else {'id': 'u_13', 'name': '김재헌'}
                # 공종: PM, 보, 슬라브, 옹벽, 기둥, 기초, 아파트슬라브, 아파트옹벽
                sub_tasks = {
                    'PM': {
                        'roleName': 'PM',
                        'personId': pm['id'],
                        'startDate': start_date,
                        'endDate': end_date,
                        'status': p_status if p_status != '수정' else '진행중',
                        'memo': f"{pm['name']} {pm.get('position', '수석')}: 구조 계산서 및 배근도 검토 총괄",
                        'version': 'v1'
                    },
                    '기초': {
                        'roleName': '기초',
                        'personId': 'VERT', # 베트남 수직팀
                        'startDate': start_date,
                        'endDate': '2026-10-05',
                        'status': '진행중' if progress > 20 else '예정',
                        'memo': 'MAT기초 및 파일캡 배근 산출',
                        'version': 'v1'
                    },
                    '기둥': {
                        'roleName': '기둥',
                        'personId': 'VERT',
                        'startDate': '2026-09-22',
                        'endDate': '2026-10-12',
                        'status': '예정',
                        'memo': '지하~지상 RC기둥 철근 산출',
                        'version': 'v1'
                    },
                    '보': {
                        'roleName': '보',
                        'personId': 'HORIZ', # 베트남 수평팀
                        'startDate': '2026-09-25',
                        'endDate': '2026-10-15',
                        'status': '예정',
                        'memo': '대보 및 작은보 철근 물량 집계',
                        'version': 'v1'
                    },
                    '슬라브': {
                        'roleName': '슬라브',
                        'personId': 'HORIZ',
                        'startDate': '2026-10-01',
                        'endDate': '2026-10-20',
                        'status': '예정',
                        'memo': '기준층 슬라브 및 데크플레이트 산출',
                        'version': 'v1'
                    },
                    '옹벽': {
                        'roleName': '옹벽',
                        'personId': 'VERT',
                        'startDate': '2026-10-05',
                        'endDate': end_date,
                        'status': '예정',
                        'memo': '코어벽체 및 외벽 배근 적산',
                        'version': 'v1'
                    },
                }
            else: # 토목&조경팀
                pm = civil_users[idx % len(civil_users)] if civil_users else {'id': 'u_32', 'name': '오승균'}
                sub_tasks = {
                    'PM': {
                        'roleName': 'PM',
                        'personId': pm['id'],
                        'startDate': start_date,
                        'endDate': end_date,
                        'status': p_status if p_status != '수정' else '진행중',
                        'memo': f"{pm['name']} {pm.get('position', '파트장')}: 토공 및 조경 적산 총괄",
                        'version': 'v1'
                    },
                    '토목': {
                        'roleName': '토목',
                        'personId': 'CIVIL',
                        'startDate': start_date,
                        'endDate': '2026-10-10',
                        'status': '진행중' if progress > 20 else '예정',
                        'memo': '절·성토 토공량 및 흙막이 가시설 적산',
                        'version': 'v1'
                    },
                    '부대토목': {
                        'roleName': '부대토목',
                        'personId': 'CIVIL',
                        'startDate': '2026-09-25',
                        'endDate': '2026-10-15',
                        'status': '예정',
                        'memo': '우오수 배수관로 및 도로포장 산출',
                        'version': 'v1'
                    },
                    '조경': {
                        'roleName': '조경',
                        'personId': pm['id'],
                        'startDate': '2026-10-01',
                        'endDate': end_date,
                        'status': '예정',
                        'memo': '수목 식재 및 조경시설물 적산',
                        'version': 'v1'
                    },
                }

            # 모든 공종에 personIds 보정
            for k, v in sub_tasks.items():
                if 'personIds' not in v:
                    v['personIds'] = [v['personId']] if v.get('personId') else []

            proj_obj = {
                'id': p_id,
                'code': item['code'],
                'name': item['name'],
                'client': item.get('client', ''),
                'startDate': start_date,
                'endDate': end_date,
                'department': dept,
                'pmId': pm['id'],
                'progress': progress,
                'status': p_status,
                'area': item.get('area', ''),
                'usage': item.get('usage', ''),
                'buildings': item.get('buildings', ''),
                'floors': item.get('floors', ''),
                'contacts': item.get('contacts', []),
                'notes': item.get('notes', ''),
                'request': item.get('request', ''),
                'rawTitle': item.get('rawTitle', ''),
                'roles': {k: {'personId': v['personId'], 'startDate': v['startDate'], 'endDate': v['endDate']} for k, v in sub_tasks.items()},
                'subTasks': sub_tasks
            }
            projects.append(proj_obj)

    print(f"총 생성된 프로젝트: {len(projects)}건 (접수목록 30건 기준)")
    with open('scheduler-web/src/data/realProjects.json', 'w', encoding='utf-8') as f:
        json.dump(projects, f, ensure_ascii=False, indent=2)
    print("scheduler-web/src/data/realProjects.json 생성 완료!")

if __name__ == '__main__':
    generate_schedule()
