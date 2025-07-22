/**
 * @description       : 캘린더 뷰 - async/await 일관성 적용
 * @author            : sejin.park@dkbmc.com
 * @group             : 
 * @last modified on  : 2025-07-22
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

    renderedCallback() {
        if (this.fullCalendarInitialized) {
            return;
        }
        
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(async () => {
            await this.loadFullCalendar();
        }, CALENDAR_CONFIG.LOAD_DELAY_MS);
    }

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

    handleEventReceive(info) {
        try {
            if (info && info.event) {
                info.event.remove(); // 중복 등록 방지
            }
        } catch (error) {
            console.error('이벤트 수신 처리 오류:', error);
        }
    }

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
}