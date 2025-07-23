/**
 * @description       : 중앙 캘린더 뷰 패널
 * 
 * @Method :
 *  - renderedCallback() : 컴포넌트 렌더링 후 FullCalendar 로드
 *  - loadFullCalendar() : FullCalendar 라이브러리 및 CSS 로드
 *  - initializeCalendar() : FullCalendar 인스턴스 생성 및 설정
 *  - loadEvents(fetchInfo, successCallback, failureCallback) : 이벤트 데이터 조회
 *  - handleDrop(info) : 외부에서 드롭된 요소 처리
 *  - handleEventReceive(info) : 외부 이벤트 등록시 중복 방지
 *  - handleEventClick(info) : 이벤트 클릭시 상위 컴포넌트에 알림
 *  - handleEventDrop(info) : 이벤트 드래그이동처리 및 업데이트
 *  - handleDatesSet(dateInfo) : 날짜 범위 변경시 상위 컴포넌트에 알림
 *  - @api refetchEvents() : 이벤트 목록 새로고침
 *  - @api addEvent(eventData) : 캘린더에 새 이벤트 추가
 *  - @api updateEvent(eventId, eventData) : 기존 이벤트 정보 수정
 *  - @api removeEvent(eventId) : 캘린더에서 이벤트 제거
 *  - addOneDay(dateStr) : 날짜 문자열 +1일
 * 
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-23
 * @last modified by  : sejin.park@dkbmc.com
**/
import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';

// static resource
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';

// apex 메소드
import getEvents from '@salesforce/apex/CalendarAppController.getEvents';
import updateEventDates from '@salesforce/apex/CalendarAppController.updateEventDates';

const CALENDAR_CONFIG = {
    HEIGHT: 800,
    CONTENT_HEIGHT: 700,
    LOCALE: 'ko',
    INITIAL_VIEW: 'dayGridMonth',
    LOAD_DELAY_MS: 100
};

// 전역 함수
// 날짜 YYYY-MM-DD 변환
function toLocalYMD(date) {
    try {
        if (!date) {
            return '';
        }
        const offsetMs = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - offsetMs);
        return localDate.toISOString().slice(0, 10);
    } catch (error) {
        console.error('날짜 변환 오류:', error);
        return '';
    }
}

export default class CalendarView extends LightningElement {
    fullCalendarInitialized = false;
    calendarApi;

    // --컴포넌트 설정--
    // 컴포넌트 렌더링 후 Fullcalendar로드
    renderedCallback() {
        if (this.fullCalendarInitialized) {
            return;
        }
        
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(async () => {
            await this.loadFullCalendar();
        }, CALENDAR_CONFIG.LOAD_DELAY_MS);
    }

    // Fullcalendar 라이브러리 및 css로드
    async loadFullCalendar() {
        if (this.fullCalendarInitialized) {
            return;
        }

        try {
            // Promise.all 대신 순차적 async/await 사용
            await loadStyle(this, FullCalendar + '/main.min.css');
            await loadScript(this, FullCalendar + '/main.min.js');
            await loadScript(this, FullCalendar + '/locales/ko.js');
            await this.initializeCalendar();

        } catch (error) {
            console.error('FullCalendar 로드 실패:', error);
            this.fullCalendarInitialized = false;
        }
    }

    // Fullcalendar 인스턴스 생성 및 설정
    async initializeCalendar() {
        try {
            const calendarEl = this.template.querySelector('.calendar-container');
            if (!calendarEl || !window.FullCalendar) {
                throw new Error('캘린더 요소 또는 FullCalendar 라이브러리를 찾을 수 없습니다.');
            }

            const calendar = new window.FullCalendar.Calendar(calendarEl, {
                headerToolbar: {
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                },
                locale: CALENDAR_CONFIG.LOCALE,
                initialView: CALENDAR_CONFIG.INITIAL_VIEW,
                editable: true,
                droppable: true,
                expandRows: true,
                height: CALENDAR_CONFIG.HEIGHT,
                contentHeight: CALENDAR_CONFIG.CONTENT_HEIGHT,
                // 이벤트 핸들러
                events: this.loadEvents.bind(this),
                drop: this.handleDrop.bind(this),
                eventClick: this.handleEventClick.bind(this),
                eventDrop: this.handleEventDrop.bind(this),
                eventReceive: this.handleEventReceive.bind(this),
                datesSet: this.handleDatesSet.bind(this)
            });

            this.calendarApi = calendar;
            calendar.render();
            this.fullCalendarInitialized = true;

        } catch (error) {
            console.error('캘린더 초기화 실패:', error);
            throw error;
        }
    }

    // --이벤트 데이터 관리--
    // 이벤트 데이터 조회
    async loadEvents(fetchInfo, successCallback, failureCallback) {
        try {
            if (!fetchInfo || !fetchInfo.start || !fetchInfo.end) {
                throw new Error('날짜 정보가 올바르지 않습니다.');
            }

            const result = await getEvents({
                startStr: toLocalYMD(fetchInfo.start),
                endStr: toLocalYMD(fetchInfo.end)
            });

            const events = result.map(event => ({
                id: event.Id,
                title: event.Title__c,
                start: event.Start_Date__c,
                end: this.addOneDay(event.End_Date__c),
                allDay: true
            }));

            successCallback(events);

        } catch (error) {
            console.error('이벤트 로드 실패:', error);
            failureCallback(error);
        }
    } 

    // --이벤트 핸들링--
    // 외부에서 드롭된 요소처리
    handleDrop(info) {
        try {
            if (!info || !info.jsEvent || !info.draggedEl || !info.date) {
                console.warn('드롭 정보가 불완전합니다.');
                return;
            }

            info.jsEvent.preventDefault();
            
            this.dispatchEvent(new CustomEvent('eventdrop', {
                detail: {
                    draggedEl: info.draggedEl,
                    date: info.date
                }
            }));
        } catch (error) {
            console.error('드롭 처리 오류:', error);
        }
    }

    // 외부 이벤트 등록시 중복 방지
    handleEventReceive(info) {
        try {
            if (info && info.event) {
                info.event.remove(); // 중복 등록 방지
            }
        } catch (error) {
            console.error('이벤트 수신 처리 오류:', error);
        }
    }

    // 이벤트 클릭시 상위 컴포넌트에 알림
    handleEventClick(info) {
        try {
            if (!info || !info.event || !info.event.id) {
                console.warn('클릭된 이벤트 정보가 없습니다.');
                return;
            }

            this.dispatchEvent(new CustomEvent('eventclick', {
                detail: { eventId: info.event.id }
            }));
        } catch (error) {
            console.error('이벤트 클릭 처리 오류:', error);
        }
    }

    // 이벤트 드래그이동처리 및 업데이트
    async handleEventDrop(info) {
        try {
            if (!info || !info.event) {
                console.warn('드롭된 이벤트 정보가 없습니다.');
                return;
            }

            const eventId = info.event.id;
            const newStart = toLocalYMD(info.event.start);
            const newEnd = info.event.end ? 
                toLocalYMD(new Date(info.event.end.getTime() - 86400000)) : 
                newStart;

            await updateEventDates({
                eventId: eventId,
                newStartDate: newStart,
                newEndDate: newEnd
            });

            this.dispatchEvent(new CustomEvent('eventmoved', {
                detail: {
                    eventId: eventId,
                    message: '일정이 성공적으로 이동되었습니다.'
                }
            }));

        } catch (error) {
            console.error('이벤트 이동 실패:', error);
            
            this.dispatchEvent(new CustomEvent('eventerror', {
                detail: {
                    message: '일정 이동 중 오류가 발생했습니다.'
                }
            }));

            if (info && info.revert) {
                info.revert();
            }
        }
    }

    // 날짜 범위 변경시 상위 컴포넌트에 알림
    handleDatesSet(dateInfo) {
        try {
            if (!dateInfo || !dateInfo.start || !dateInfo.end) {
                console.warn('날짜 설정 정보가 불완전합니다.');
                return;
            }

            this.dispatchEvent(new CustomEvent('dateset', {
                detail: {
                    start: dateInfo.start.toISOString(),
                    end: dateInfo.end.toISOString()
                }
            }));
        } catch (error) {
            console.error('날짜 설정 처리 오류:', error);
        }
    }

    // --외부 api--
    // 이벤트 목록 새로고침
    @api
    refetchEvents() {
        try {
            if (this.calendarApi) {
                this.calendarApi.refetchEvents();
            }
        } catch (error) {
            console.error('이벤트 다시 가져오기 오류:', error);
        }
    }

    // 캘린더에 새 이벤트 추가
    @api
    addEvent(eventData) {
        try {
            if (this.calendarApi && eventData && !this.calendarApi.getEventById(eventData.id)) {
                this.calendarApi.addEvent(eventData);
            }
        } catch (error) {
            console.error('이벤트 추가 오류:', error);
        }
    }

    // 기존 이벤트 정보 수정
    @api
    updateEvent(eventId, eventData) {
        try {
            if (!this.calendarApi || !eventId || !eventData) {
                return;
            }

            const existingEvent = this.calendarApi.getEventById(eventId);
            if (existingEvent) {
                existingEvent.setProp('title', eventData.title);
                existingEvent.setStart(eventData.start);
                existingEvent.setEnd(eventData.end);
            }
        } catch (error) {
            console.error('이벤트 업데이트 오류:', error);
        }
    }

    // 캘린더에서 이벤트 제거
    @api
    removeEvent(eventId) {
        try {
            if (!this.calendarApi || !eventId) {
                return;
            }

            const eventToRemove = this.calendarApi.getEventById(eventId);
            if (eventToRemove) {
                eventToRemove.remove();
            }
        } catch (error) {
            console.error('이벤트 제거 오류:', error);
        }
    }

    // --유틸리티 메소드--
    // 날짜 문자열 +1
    addOneDay(dateStr) {
        try {
            if (!dateStr) {
                return dateStr;
            }
            const date = new Date(dateStr);
            date.setDate(date.getDate() + 1);
            return date.toISOString().slice(0, 10);
        } catch (error) {
            console.error('날짜 하루 추가 오류:', error);
            return dateStr;
        }
    }
}