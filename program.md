---
marp: true
theme: default
paginate: true
headingDivider: 2
style: |
  .columns {
    display:flex;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
  }
  .column {
  flex: 1;
  word-wrap: break-word;
  overflow-wrap: break-word;
  font-size: 14px;
  }
  .small-text {
    font-size: 0.8em;
  }
  .highlight {
    background-color: #e8f4fd;
    padding: 0.5rem;
    border-radius: 0.25rem;
    border-left: 4px solid #0176d3;
  }
---

# 일정 관리 및 비용 집계 시스템 요구사항 정의서

- 프로젝트명: Salesforce LWC 기반 일정 관리 및 비용 집계 시스템
- 작성일: 2025-07-10
- 작성자: 박세진
- 버전: 0.1 (초안)


## 목차

1. 프로그램 개요
2. 기능 설명
3. 입력 및 출력
4. 내부 처리 로직 설명
5. 사용 오브젝트 및 컴포넌트
6. 코드 일부분
7. 비고 및 특이사항

# 1. 프로그램 개요
### 1.1 프로그램명
### 1.2 작성자
### 1.3 작성일
### 1.4 호출 구조