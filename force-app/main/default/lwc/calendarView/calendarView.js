/**
 * @description       : 캘린더 뷰 컴포넌트 (호환성 우선 버전)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';
// ✅ 기존 메서드 사용 (안정성 우선)
import getEvents from '@salesforce/apex/CalendarAppController.getEvents';
import updateEventDates from '@salesforce/apex/CalendarAppController.updateEventDates';

// === 상수 ===
const CALENDAR_CONFIG = {
    HEIGHT: 800,
    CONTENT_HEIGHT: 700,
    LOCALE: 'ko',
    INITIAL_VIEW: 'dayGridMonth',
    LOAD_DELAY_MS: 100
};

// === 유틸리티 함수 ===
function toYMD(date) {
    try {
        const offsetMs = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - offsetMs);
        return localDate.toISOString().slice(0, 10);
    } catch (e) {
        return '';
    }
}

export default class CalendarView extends LightningElement {
    fullCalendarInitialized = false;
    calendarApi;

    // === Public API Methods ===
    @api
    refetchEvents() {
        if (this.calendarApi) {
            this.calendarApi.refetchEvents();
        }
    }

    @api
    addEvent(eventData) {
        if (this.calendarApi && !this.calendarApi.getEventById(eventData.id)) {
            this.calendarApi.addEvent(eventData);
        }
    }

    @api
    updateEvent(eventId, eventData) {
        if (this.calendarApi) {
            const existingEvent = this.calendarApi.getEventById(eventId);
            if (existingEvent) {
                existingEvent.setProp('title', eventData.title);
                existingEvent.setStart(eventData.start);
                existingEvent.setEnd(eventData.end);
                // ✅ 색상 정보도 업데이트
                if (eventData.backgroundColor) {
                    existingEvent.setProp('backgroundColor', eventData.backgroundColor);
                }
                if (eventData.borderColor) {
                    existingEvent.setProp('borderColor', eventData.borderColor);
                }
                if (eventData.textColor) {
                    existingEvent.setProp('textColor', eventData.textColor);
                }
            }
        }
    }

    @api
    removeEvent(eventId) {
        if (this.calendarApi) {
            const eventToRemove = this.calendarApi.getEventById(eventId);
            if (eventToRemove) {
                eventToRemove.remove();
            }
        }
    }

    // === 라이프사이클 ===
    renderedCallback() {
        if (this.fullCalendarInitialized) {
            return;
        }
        setTimeout(() => {
            this.loadFullCalendar();
        }, CALENDAR_CONFIG.LOAD_DELAY_MS);
    }

    // === FullCalendar 로드 ===
    loadFullCalendar() {
        if (this.fullCalendarInitialized) {
            return;
        }

        Promise.all([
            loadStyle(this, FullCalendar + '/main.min.css'),
            loadScript(this, FullCalendar + '/main.min.js')
        ])
        .then(() => loadScript(this, FullCalendar + '/locales/ko.js'))
        .then(() => this.initializeCalendar())
        .catch(error => {
            console.warn('FullCalendar 로드 실패:', error.message);
            this.fullCalendarInitialized = false;
        });
    }

    // === 캘린더 초기화 ===
    initializeCalendar() {
        const calendarEl = this.template.querySelector('.calendar-container');
        if (!calendarEl || !window.FullCalendar) {
            return;
        }

        try {
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
                events: this.loadEventsWithColors.bind(this), // ✅ 클라이언트에서 색상 처리
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
            console.warn('캘린더 초기화 실패:', error.message);
        }
    }

    // === ✅ 기존 메서드 사용 + 클라이언트 색상 처리 ===
    loadEventsWithColors(fetchInfo, successCallback, failureCallback) {
        getEvents({
            startStr: toYMD(fetchInfo.start),
            endStr: toYMD(fetchInfo.end)
        })
        .then(result => {
            try {
                const events = this.transformEventsWithColors(result);
                successCallback(events);
            } catch (transformError) {
                console.warn('이벤트 변환 실패:', transformError.message);
                failureCallback(transformError);
            }
        })
        .catch(error => {
            console.warn('이벤트 로드 실패:', error.message);
            failureCallback(error);
        });
    }

    // === ✅ 클라이언트에서 색상 결정 (간단한 방법) ===
    transformEventsWithColors(eventsData) {
        return eventsData.map(event => {
            try {
                // ✅ 이벤트 유형별 색상 결정
                const colors = this.getEventColors(event.Related_Record_Type__c);
                
                // ✅ 시작일과 종료일이 같으면 allDay: true로 설정 (바 형태 표시)
                const startDate = event.Start_Date__c;
                const endDate = event.End_Date__c;
                const isAllDay = startDate === endDate; // 하루짜리 이벤트 판단
                
                return {
                    id: event.Id,
                    title: event.Title__c,
                    start: startDate,
                    end: isAllDay ? this.addOneDay(endDate) : this.addOneDay(endDate), // 동일하게 +1일 처리
                    allDay: true, // ✅ 모든 이벤트를 allDay로 설정하여 바 형태로 표시
                    backgroundColor: colors.backgroundColor,
                    borderColor: colors.borderColor,
                    textColor: colors.textColor
                };
            } catch (e) {
                console.warn('개별 이벤트 변환 실패:', e.message);
                return {
                    id: event.Id || 'unknown',
                    title: event.Title__c || '제목 없음',
                    start: event.Start_Date__c,
                    end: this.addOneDay(event.End_Date__c),
                    allDay: true, // ✅ 기본값도 allDay로 설정
                    backgroundColor: '#0176d3',
                    borderColor: '#005fb2',
                    textColor: '#FFFFFF'
                };
            }
        });
    }

    // ✅ 클라이언트에서 색상 결정 로직
    getEventColors(recordType) {
        if (recordType === 'Personal') {
            // 개인 활동 - 보라색
            return {
                backgroundColor: '#8B5Cf6',
                borderColor: '#7C3AED',
                textColor: '#FFFFFF'
            };
        } else if (['Account', 'Contact', 'Opportunity'].includes(recordType)) {
            // Salesforce 구성요소 - 초록색
            return {
                backgroundColor: '#059669',
                borderColor: '#047857',
                textColor: '#FFFFFF'
            };
        } else {
            // 기본 색상 - 파란색
            return {
                backgroundColor: '#0176d3',
                borderColor: '#005fb2',
                textColor: '#FFFFFF'
            };
        }
    }

    // 날짜 +1일 처리
    addOneDay(dateStr) {
        try {
            const date = new Date(dateStr);
            date.setDate(date.getDate() + 1);
            return date.toISOString().slice(0, 10);
        } catch (e) {
            return dateStr;
        }
    }

    // === 이벤트 핸들러들 ===
    handleDrop(info) {
        info.jsEvent.preventDefault();
        this.dispatchEvent(new CustomEvent('eventdrop', {
            detail: {
                draggedEl: info.draggedEl,
                date: info.date
            }
        }));
    }

    handleEventReceive(info) {
        info.event.remove();
    }

    handleEventClick(info) {
        this.dispatchEvent(new CustomEvent('eventclick', {
            detail: { eventId: info.event.id }
        }));
    }

    handleEventDrop(info) {
        const eventId = info.event.id;
        const newStart = toYMD(info.event.start);
        const newEnd = info.event.end ? toYMD(new Date(info.event.end.getTime() - 86400000)) : newStart;

        updateEventDates({
            eventId: eventId,
            newStartDate: newStart,
            newEndDate: newEnd
        })
        .then(() => {
            this.dispatchEvent(new CustomEvent('eventmoved', {
                detail: {
                    eventId: eventId,
                    message: '일정이 성공적으로 이동되었습니다.'
                }
            }));
        })
        .catch(error => {
            console.warn('이벤트 이동 실패:', error.message);
            this.dispatchEvent(new CustomEvent('eventerror', {
                detail: {
                    message: '일정 이동 중 오류가 발생했습니다.'
                }
            }));
            info.revert();
        });
    }

    handleDatesSet(dateInfo) {
        this.dispatchEvent(new CustomEvent('dateset', {
            detail: {
                start: dateInfo.start.toISOString(),
                end: dateInfo.end.toISOString()
            }
        }));
    }
}