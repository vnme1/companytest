/**
 * @description       : 캘린더 뷰 컴포넌트 (간결하게 리팩토링)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';
import getEvents from '@salesforce/apex/CalendarAppController.getEvents';
import updateEventDates from '@salesforce/apex/CalendarAppController.updateEventDates';

// === 상수 및 유틸리티 ===
const CALENDAR_CONFIG = {
    HEIGHT: 800,
    CONTENT_HEIGHT: 700,
    LOCALE: 'ko',
    INITIAL_VIEW: 'dayGridMonth'
};

function toYMD(date) {
    try {
        const offsetMs = date.getTimezoneOffset() * 60000;
        const localDate = new Date(date.getTime() - offsetMs);
        return localDate.toISOString().slice(0, 10);
    } catch (e) {
        return '';
    }
}

function addOneDay(dateStr) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + 1);
    return date.toISOString().slice(0, 10);
}

function subtractOneDay(date) {
    const adjustedEnd = new Date(date);
    adjustedEnd.setDate(adjustedEnd.getDate() - 1);
    return toYMD(adjustedEnd);
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
        }, 100);
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
        .catch(() => {
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
            // 조용히 실패 처리
        }
    }

    // === 이벤트 로드 ===
    loadEvents(fetchInfo, successCallback, failureCallback) {
        getEvents({
            startStr: toYMD(fetchInfo.start),
            endStr: toYMD(fetchInfo.end)
        })
        .then(result => {
            const events = this.transformEvents(result);
            successCallback(events);
        })
        .catch(error => {
            failureCallback(error);
        });
    }

    // === 이벤트 데이터 변환 ===
    transformEvents(eventsData) {
        return eventsData.map(event => ({
            id: event.Id,
            title: event.Title__c,
            start: event.Start_Date__c,
            end: addOneDay(event.End_Date__c),
            allDay: false
        }));
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
        const dropData = this.extractDropData(info);

        updateEventDates(dropData)
            .then(() => this.dispatchSuccessEvent(dropData.eventId))
            .catch(() => this.dispatchErrorEvent(info));
    }

    handleDatesSet(dateInfo) {
        this.dispatchEvent(new CustomEvent('dateset', {
            detail: {
                start: dateInfo.start.toISOString(),
                end: dateInfo.end.toISOString()
            }
        }));
    }

    // === 헬퍼 메서드들 ===
    extractDropData(info) {
        const eventId = info.event.id;
        const newStart = toYMD(info.event.start);
        const newEnd = info.event.end ? subtractOneDay(info.event.end) : newStart;

        return {
            eventId: eventId,
            newStartDate: newStart,
            newEndDate: newEnd
        };
    }

    dispatchSuccessEvent(eventId) {
        this.dispatchEvent(new CustomEvent('eventmoved', {
            detail: {
                eventId: eventId,
                message: '일정이 성공적으로 이동되었습니다.'
            }
        }));
    }

    dispatchErrorEvent(info) {
        this.dispatchEvent(new CustomEvent('eventerror', {
            detail: {
                message: '일정 이동 중 오류가 발생했습니다.'
            }
        }));
        info.revert();
    }
}