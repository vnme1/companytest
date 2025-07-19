/**
 * @description       : 캘린더 뷰 컴포넌트 (Promise 방식으로 통일)
 * @author            : sejin.park@dkbmc.com
 */
import { LightningElement, api } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import FullCalendar from '@salesforce/resourceUrl/FullCalendarV5_new';
import getEvents from '@salesforce/apex/CalendarAppController.getEvents';
import updateEventDates from '@salesforce/apex/CalendarAppController.updateEventDates';

// 날짜 유틸리티 함수
const DateUtils = {
    toYMD: (date) => {
        try {
            const offsetMs = date.getTimezoneOffset() * 60000;
            const localDate = new Date(date.getTime() - offsetMs);
            return localDate.toISOString().slice(0, 10);
        } catch (e) {
            return '';
        }
    },

    adjustEndDate: (endDate) => {
        const adjustedEnd = new Date(endDate);
        adjustedEnd.setDate(adjustedEnd.getDate() + 1);
        return adjustedEnd.toISOString().slice(0, 10);
    },

    subtractOneDay: (endDate) => {
        const adjustedEnd = new Date(endDate);
        adjustedEnd.setDate(adjustedEnd.getDate() - 1);
        return DateUtils.toYMD(adjustedEnd);
    }
};

export default class CalendarView extends LightningElement {
    fullCalendarInitialized = false;
    calendarApi;

    // Public API 메서드들
    @api
    refetchEvents() {
        if (this.calendarApi) {
            this.calendarApi.refetchEvents();
        }
    }

    @api
    addEvent(eventData) {
        if (this.calendarApi) {
            const existingEvent = this.calendarApi.getEventById(eventData.id);
            if (!existingEvent) {
                this.calendarApi.addEvent(eventData);
            }
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
        }, 100);
    }

    // Promise 방식으로 통일된 FullCalendar 로드
    loadFullCalendar() {
        if (this.fullCalendarInitialized) {
            return;
        }

        Promise.all([
            loadStyle(this, FullCalendar + '/main.min.css'),
            loadScript(this, FullCalendar + '/main.min.js')
        ])
        .then(() => loadScript(this, FullCalendar + '/locales/ko.js'))
        .then(() => {
            this.fullCalendarInitialized = true;
            this.initializeCalendar();
        })
        .catch(error => {
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
                ...this.getCalendarConfig(),
                events: this.eventSource.bind(this),
                drop: this.handleDrop.bind(this),
                eventClick: this.handleEventClick.bind(this),
                eventDrop: this.handleEventDrop.bind(this),
                eventReceive: this.handleEventReceive.bind(this),
                datesSet: this.handleDatesSet.bind(this)
            });

            this.calendarApi = calendar;
            calendar.render();
        } catch (error) {
            // silent
        }
    }

    // 캘린더 설정을 별도 메서드로 분리
    getCalendarConfig() {
        return {
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,timeGridDay'
            },
            locale: 'ko',
            initialView: 'dayGridMonth',
            editable: true,
            droppable: true,
            expandRows: true,
            height: 800,
            contentHeight: 700
        };
    }

    // Promise 방식으로 통일된 이벤트 소스
    eventSource(fetchInfo, successCallback, failureCallback) {
        getEvents({
            startStr: DateUtils.toYMD(fetchInfo.start),
            endStr: DateUtils.toYMD(fetchInfo.end)
        })
        .then(result => {
            const events = this.transformEventsData(result);
            successCallback(events);
        })
        .catch(error => {
            failureCallback(error);
        });
    }

    // 이벤트 데이터 변환 로직 분리
    transformEventsData(eventsData) {
        return eventsData.map(event => ({
            id: event.Id,
            title: event.Title__c,
            start: event.Start_Date__c,
            end: DateUtils.adjustEndDate(event.End_Date__c),
            allDay: false
        }));
    }

    // 이벤트 핸들러들
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

    // Promise 방식으로 통일된 이벤트 드롭 처리
    handleEventDrop(info) {
        const { eventId, newStart, newEnd } = this.extractEventDropData(info);

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
            this.dispatchEvent(new CustomEvent('eventerror', {
                detail: {
                    message: '일정 이동 중 오류가 발생했습니다.'
                }
            }));
            info.revert();
        });
    }

    // 이벤트 드롭 데이터 추출 로직 분리
    extractEventDropData(info) {
        const eventId = info.event.id;
        const newStart = DateUtils.toYMD(info.event.start);
        
        let newEnd = newStart;
        if (info.event.end) {
            newEnd = DateUtils.subtractOneDay(info.event.end);
        }

        return { eventId, newStart, newEnd };
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