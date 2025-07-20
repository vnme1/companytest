/**
 * @description       : 캘린더 뷰 컴포넌트 (함수명 통일 버전)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';
import getEvents from '@salesforce/apex/CalendarAppController.getEvents';
import updateEventDates from '@salesforce/apex/CalendarAppController.updateEventDates';

const CALENDAR_CONFIG = {
    HEIGHT: 800,
    CONTENT_HEIGHT: 700,
    LOCALE: 'ko',
    INITIAL_VIEW: 'dayGridMonth',
    LOAD_DELAY_MS: 100
};

// ✅ 함수명 통일: toYMD → toLocalYMD
function toLocalYMD(date) {
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

    renderedCallback() {
        if (this.fullCalendarInitialized) {
            return;
        }
        setTimeout(() => {
            this.loadFullCalendar();
        }, CALENDAR_CONFIG.LOAD_DELAY_MS);
    }

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
            console.warn('캘린더 초기화 실패:', error.message);
        }
    }

    loadEvents(fetchInfo, successCallback, failureCallback) {
        getEvents({
            // ✅ 통일된 함수명 사용
            startStr: toLocalYMD(fetchInfo.start),
            endStr: toLocalYMD(fetchInfo.end)
        })
        .then(result => {
            const events = result.map(event => ({
                id: event.Id,
                title: event.Title__c,
                start: event.Start_Date__c,
                end: this.addOneDay(event.End_Date__c),
                allDay: true
            }));
            successCallback(events);
        })
        .catch(error => {
            console.warn('이벤트 로드 실패:', error.message);
            failureCallback(error);
        });
    }

    addOneDay(dateStr) {
        try {
            const date = new Date(dateStr);
            date.setDate(date.getDate() + 1);
            return date.toISOString().slice(0, 10);
        } catch (e) {
            return dateStr;
        }
    }

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
        // ✅ 통일된 함수명 사용
        const newStart = toLocalYMD(info.event.start);
        const newEnd = info.event.end ? toLocalYMD(new Date(info.event.end.getTime() - 86400000)) : newStart;

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